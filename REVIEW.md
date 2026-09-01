# Project Service — Code Review

**Scope reviewed:** the inherited, AI-generated Project Service as first committed in
`da79821` (`src/projects/project.service.ts`, `src/projects/project.model.ts`, and its test
file `tests/project.service.test.ts`) — the code flagged in
[.github/copilot-instructions.md](.github/copilot-instructions.md) as _"inherited, AI-assisted,
unreviewed code"_ that the Notification & Audit Service will depend on.

**Reviewer process:** static reading of the original commit, a line-by-line diff against the
layered rewrite that ships today at [src/projects](src/projects), tracing every write path back to
where `tenantId` and authorization originate, and checking the original test suite for whether it
could have caught each issue. Copilot was used to scaffold the diff summary and first-pass
observations; every finding below was independently re-verified against the source before being
recorded, and severity/impact judgments are my own — Copilot does not have context on this
product's threat model or contractual/compliance exposure.

---

## Findings

### 1. Tenant ID accepted from client input (cross-tenant data spoofing)

- **Where:** `src/projects/project.model.ts` (`CreateProjectInputSchema = ProjectSchema.pick({ tenantId: true, ... })`), consumed by `src/projects/project.service.ts#create(input)`.
- **Severity:** Critical.
- **Impact in a multi-tenant B2B context:** `tenantId` was a field on the _create_ request contract instead of being derived from the verified JWT. Any component that later wires this service to an HTTP controller (exactly the work the current sprint is doing) would naturally do `CreateProjectInputSchema.parse(req.body)` and hand the result to `service.create(...)`. That lets any authenticated user of _any_ tenant create — and, through the audit/notification pipeline that will be built on top of these rows — indirectly leak data into or read data attributed to a tenant they do not belong to. This is the single most damaging class of bug a B2B SaaS platform can ship: it breaks the tenant-isolation guarantee the whole product is sold on.
- **How I detected it:** this is not something you find by running the existing tests — `tests/project.service.test.ts` always passed the correct `tenantId` in through the same argument that carried it into storage, so the tests exercise the _read-path_ isolation (query filters) but never the _write-path_ trust boundary. I found it by re-reading `.github/copilot-instructions.md`'s rule ("derive `tenantId` only from the verified JWT... never from request bodies") and then checking, field by field, where each schema's values were sourced from. Copilot's diff summary flagged that `CreateProjectInputSchema` included `tenantId`, but recognizing _why_ that is dangerous — that it is a trust-boundary violation, not just a stylistic inconsistency — required applying the project's security rules myself.
- **Fix applied (in the current, shipped implementation):** `CreateProjectInputSchema` no longer includes `tenantId` at all. The service signature is `create(actor: ProjectActorContext, input: CreateProjectInput)`, and `actor.tenantId` (sourced exclusively from `req.auth`, itself populated by `authenticate` after JWT verification) is the only value ever written to the `tenantId` column. See [src/projects/project.model.ts](src/projects/project.model.ts) and [src/projects/project.service.ts](src/projects/project.service.ts).

### 2. No repository layer — business logic coupled directly to the SQL driver

- **Where:** original `project.service.ts` held `better-sqlite3` `Database.Database` and issued `prepare(...).run(...)` calls directly from business-logic methods.
- **Severity:** High (architecture/maintainability, compounding security risk).
- **Impact:** violates the mandated `controller → service → repository → database` flow. Persistence concerns (SQL text, driver types) leak into the service, so every future change to storage (e.g., adding audit hooks, switching drivers, adding transactions for the outbox pattern the Notification & Audit Service needs) requires touching business logic. It also makes the service very hard to unit test without a real SQLite file/handle, and makes it easy to reintroduce string-built SQL later as the schema grows (raw drivers make ad-hoc query construction "easy" in a way ORMs actively discourage).
- **How I detected it:** structural read of the file against the architecture rules in `.github/copilot-instructions.md`; confirmed by checking there was no `project.repository.ts` in that commit.
- **Fix applied:** introduced `ProjectRepository` ([src/projects/project.repository.ts](src/projects/project.repository.ts)) as the only module that touches the ORM query builder. `ProjectService` now depends on the repository's interface only. Persistence uses Drizzle ORM (`drizzle-orm/better-sqlite3`) exclusively — no raw SQL strings anywhere in the projects module.

### 3. Schema migration (DDL) executed from inside the service constructor

- **Where:** original `constructor(db) { this.db.exec(\`CREATE TABLE IF NOT EXISTS...\`) }`.
- **Severity:** Medium.
- **Impact:** every `new ProjectService(db)` call re-runs DDL, business logic owns schema management, and there is no single place to audit/version migrations as more tables are added (the service now also needs milestones and membership tables). In production this pattern risks concurrent migration races and makes it impossible to run schema changes independently of application startup/deploys.
- **How I detected it:** same structural read; confirmed there was no dedicated database/migration module in the original commit.
- **Fix applied:** DDL now lives only in [src/projects/project.database.ts](src/projects/project.database.ts) (`migrateProjectsSchema`, and equivalents for milestones/outbox/membership), invoked once from `createProjectsDb`. Repository and service modules never issue DDL.

### 4. No controller/HTTP layer, no route wiring, no authorization enforcement

- **Where:** the entire original commit — no `project.controller.ts`, no `project.routes.ts`, no permission checks anywhere near project mutations.
- **Severity:** High.
- **Impact:** the service was unreachable via HTTP, so request validation, `AuthenticatedRequest` typing, and RBAC (`projects:create`, `projects:update`, `projects:delete`) did not exist yet for this resource. Had a controller been bolted on quickly without re-deriving these controls (a realistic shortcut under sprint pressure), any authenticated user — regardless of tenant role — could create, update, or delete any project.
- **How I detected it:** absence of files plus absence of any reference to `authenticate`/`requirePermission` in the reviewed commit.
- **Fix applied:** [src/projects/project.controller.ts](src/projects/project.controller.ts) validates every request with Zod (`CreateProjectInputSchema`, `ProjectIdParamSchema`, `TeamIdParamSchema`, `UpdateProjectStatusInputSchema`), derives the actor strictly from `req.auth` (throwing `AuthenticationError` if absent), and [src/projects/project.routes.ts](src/projects/project.routes.ts) applies `authenticate` plus `requirePermission(PROJECT_PERMISSIONS.*)` per route, backed by the role→permission map in [src/shared/permissions.ts](src/shared/permissions.ts).

### 5. No structured logging / audit trail for mutations

- **Where:** `create`, `updateStatus`, `delete` in the original service performed no logging at all.
- **Severity:** Medium (compliance/observability risk in a service other systems will depend on).
- **Impact:** no way to trace who created, changed, or deleted a project, no correlation with the future audit trail, and no operational visibility into failures. For a platform whose adjacent service is explicitly an _audit_ service, the absence of any log trail on the system of record is a material gap.
- **How I detected it:** grep for `logger`/`winston` usage in the original file returned nothing, contradicting the "use the shared Winston logger... structured logs with correlation ID, tenant ID... operation, and outcome" rule.
- **Fix applied:** every mutation in `project.service.ts` logs via the shared Winston `logger` with `tenantId`, `userId`, `operation`, `projectId`, and `outcome`, without ever logging request bodies or secrets.

### 6. Inconsistent / weak error semantics

- **Where:** original `updateStatus` returned `Project | undefined`, `delete` returned `boolean` — no exceptions, no distinction between "not found" and other failure modes.
- **Severity:** Medium.
- **Impact:** a future controller would have to reinvent not-found handling per endpoint (easy to get wrong, e.g. returning `200` with an empty body instead of `404`), and there was no way to distinguish a tenant-mismatch "not found" from a genuinely absent ID — which matters for not leaking existence information across tenants.
- **How I detected it:** direct inspection of return types and comparison with the explicit error taxonomy already defined in `src/shared/errors.ts` (unused by the original file).
- **Fix applied:** service methods now throw `NotFoundError` (from `src/shared/errors.ts`) on a zero-row update/delete or a missing row, letting the global error middleware translate it to the standard `{ success: false, error: { code: "NOT_FOUND", ... } }` response — the same shape whether the row never existed or belongs to another tenant, so no cross-tenant existence is leaked.

### 7. Untrimmed string input

- **Where:** original `ProjectSchema`/`CreateProjectInputSchema` used `z.string().min(1).max(200)` without `.trim()`.
- **Severity:** Low.
- **Impact:** a name of `"   "` would pass `min(1)` validation and be persisted as whitespace-only, and leading/trailing whitespace would be stored and later displayed/exported inconsistently.
- **How I detected it:** manual review of each Zod chain against the "validate and trim all inputs" rule.
- **Fix applied:** all string fields use `z.string().trim().min(1)...` so whitespace-only input is rejected and stored values are normalized.

### 8. Test suite could not have caught the tenant-spoofing defect

- **Where:** `tests/project.service.test.ts` (original).
- **Severity:** informational, but important — see the closing section.
- **Impact:** the tests gave a false sense of safety: "isolation" tests passed because they called `service.getByTeam(otherTenantId, ...)` directly with a trusted argument, never modeling what an HTTP caller actually controls (the JSON body). Coverage percentage alone would not have flagged finding #1.
- **How I detected it:** re-read the tests specifically asking "what does the _attacker-controlled_ input surface look like here?" rather than "do these tests pass?".
- **Fix applied:** the current test suite (`tests/project.service.test.ts`, `tests/milestone.service.test.ts`, `tests/authorize.middleware.test.ts`) drives calls through an `actor: ProjectActorContext` that is separate from the request body/input type, and repository-level query construction makes it structurally impossible to pass a client-supplied `tenantId` into a write.

---

## Architectural & Security Issues Copilot Introduced That Required Human Judgment

- **Tenant ID as a client-suppliable field (Finding #1).** This is the clearest example: the code was internally consistent, type-safe, and passed its own tests, yet it embedded a trust-boundary violation. Copilot-style generation optimizes for "a schema that models the entity," and `tenantId` _is_ a real field on the entity — but only a developer applying this product's specific rule ("tenant identity must never come from the client") recognizes that including it on the _input_ schema, rather than deriving it from `actor`/JWT context, turns a data field into an authorization bypass. This is exactly the kind of issue that is invisible to a generic linter, type checker, or even a superficial code review, and is the most dangerous kind of defect to inherit into a service that a downstream Notification & Audit Service will trust for tenant scoping.
- **Tests that validate behavior but not the threat model.** The generated test suite achieved good line coverage and correctly asserted tenant isolation _as invoked_, but never modeled the actual HTTP attack surface (client-controlled request body). A team that treats "tests are green" as sufficient sign-off would ship the vulnerability in Finding #1 unchanged. Recognizing that a passing test suite can still validate the wrong contract requires a human deliberately asking "what can the caller actually control here?"
- **Migration-in-constructor and driver-coupled business logic.** Individually plausible ("just make the table if it's missing"), but risky specifically because this service is meant to be a dependency of other services: ad-hoc, repeated DDL execution and SQL embedded in business logic make it much harder to safely evolve the schema (e.g., adding the outbox table the audit service needs) without downtime or migration races. An AI assistant optimizing for "a working single file" has no visibility into the multi-service evolution this codebase is heading toward; a developer does.
- **Missing authorization entirely, rather than a subtly wrong policy.** It's easier to notice "there is no RBAC" than "the RBAC is slightly wrong," and a naive follow-on implementer could close that gap by wiring a controller directly to the service without re-deriving tenant scope and permissions — reintroducing Finding #1 and adding a fresh authorization gap at the same time. The absence of any authorization layer in code that other services will treat as a trusted source of tenant/team/project truth is a systemic risk multiplier: every consumer (e.g., the Notification & Audit Service's recipient-resolution and audit-event pipeline) inherits whatever tenant-isolation guarantee this service actually enforces, so a gap here silently weakens every downstream service's isolation story, not just this one's.

---

## Remediated Project Service

The layered rewrite is implemented in the following files (already applied in this repository;
JSDoc added on every public method as part of this review):

- [src/projects/project.model.ts](src/projects/project.model.ts) — Zod schemas / typed contracts (persisted shape, request bodies, route params). No raw types cross a layer boundary without validation.
- [src/projects/project.database.ts](src/projects/project.database.ts) — ORM wiring (`drizzle-orm/better-sqlite3`) and DDL-only migrations, isolated from business logic.
- [src/projects/project.repository.ts](src/projects/project.repository.ts) — the only module that talks to the ORM; every query is tenant-scoped in the `WHERE` clause (never "fetch then filter in memory").
- [src/projects/project.service.ts](src/projects/project.service.ts) — business rules; tenant scope always flows from `ProjectActorContext` (JWT-derived), never from request payloads; throws the shared `NotFoundError`/`ConflictError` taxonomy; emits structured Winston logs with `tenantId`, `userId`, `operation`, `outcome`.
- [src/projects/project.controller.ts](src/projects/project.controller.ts) — HTTP boundary; Zod-validates every request, derives the actor from verified auth context only, maps results through the shared `{ success, data }` / `{ success, error }` response envelope.
- [src/projects/project.routes.ts](src/projects/project.routes.ts) — wires `authenticate` + `requirePermission(PROJECT_PERMISSIONS.*)` per route before any controller code runs.

Key production-standard properties satisfied:

| Requirement                                               | Where                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Layered `model → repository → service → controller/route` | Files listed above                                                                                                  |
| ORM-based data access, no raw driver calls                | `project.repository.ts` (Drizzle query builder only)                                                                |
| Input validation & typed request/response contracts       | `project.model.ts` Zod schemas, inferred TS types                                                                   |
| Specific error handling                                   | `NotFoundError` from `src/shared/errors.ts`, mapped by the global error middleware                                  |
| Structured logging                                        | `logger.info(...)` calls in `project.service.ts` with correlation fields                                            |
| Multi-tenant isolation                                    | `tenantId` sourced only from `ProjectActorContext` (JWT); every repository query filters by `tenantId` in SQL       |
| RBAC                                                      | `requirePermission(PROJECT_PERMISSIONS.CREATE/READ/UPDATE/DELETE)` per route, backed by `src/shared/permissions.ts` |
| Documentation on public methods                           | JSDoc added to every exported schema, repository method, service method, and controller handler                     |

No behavioral changes were made to the currently shipped implementation beyond adding
documentation comments; the analysis above traces how this implementation already remediates every
finding raised against the original inherited commit (`da79821`).
