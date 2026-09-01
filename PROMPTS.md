Scaffold a repository named `taskbridge-api` with this structure:

taskbridge-api/
├── .github/
│ └── copilot-instructions.md
├── src/
│ ├── projects/
│ │ ├── project.model.ts
│ │ └── project.service.ts
│ └── notifications/
├── tests/
├── README.md
└── package.json

Requirements:

- Use Node.js 20+, TypeScript strict mode, Express, SQLLite, Zod, Winston, JWT, and Jest.
- Add the required TypeScript, Jest, linting, and formatting configuration files.
- Treat files under `src/projects/` as inherited, AI-generated, and intentionally unreviewed code requiring a future architecture and security review.
- Keep `src/notifications/` and `tests/` empty except for optional placeholder files required by Git.
- Add repository scripts for development, build, type checking, linting, formatting, unit tests, and integration tests.
- In `README.md`, clearly declare the technology stack, repository purpose, directory structure, setup commands, and required environment variables.
- Place the supplied custom instructions in `.github/copilot-instructions.md`.
- Create `.env.example` without real credentials and a suitable `.gitignore`.
- Do not implement the Notification & Audit Service yet.
- Do not review, improve, or silently correct the inherited Project Service during scaffolding.
- Install dependencies and verify that type checking and the build pass.

Use kebab-case filenames and TypeScript for all application code.

---

## Prompt Chain

### 2. Update repository Copilot instructions for TaskBridge case study

**Exact prompt text**

```text
Create/update `.github/copilot-instructions.md` file for the TaskBridge API based on the case study below.

Put these sections first:
1. Technology stack
2. Architecture conventions
3. Coding standards, including naming, type safety, and logging
4. Security and multi-tenant isolation rules
5. Testing expectations

Assume Node.js 20+, TypeScript strict mode, Express, SQLLite, Zod, JWT authentication, Winston, .HTTP and Jest.

Include rules for:
- Multi-service architecture using controllers -> services -> repositories -> database.
- Service modules under `src/<service-name>/` and shared code under `src/shared/`.
- Token-derived `tenantId` on protected endpoints. Never trust client-provided tenant identity.
- Tenant-scoped database queries, RBAC, resource authorization, input validation, rate limiting, CORS, and secure secret handling.
- Structured logging with tenant and correlation IDs, without sensitive data.
- At least 80% test coverage and 100% coverage for security-critical paths.
- Immutable, append-only audit records.
- Idempotent milestone-event processing, retries, and duplicate-event protection.
- Audit-history filtering by project, event type, and date range.
- Versioned REST APIs and consistent response/error formats.
- Reviewing inherited code under `src/projects/` for architecture, security, performance, reliability, and maintainability.
- Producing an impact analysis before implementing mid-sprint change requests.
- OpenAPI documentation, ADRs, migration notes, and definition-of-done checks.

Keep the instructions concise, actionable, internally consistent, and optimized for GitHub Copilot. Do not invent legal retention periods or trust tenant IDs from headers.

Case Study: TaskBridge — Notification & Audit Service
Background
You are a software engineer at TaskBridge, a B2B SaaS company building a project collaboration platform for distributed engineering teams. The platform exposes a set of microservices that teams integrate into their internal tooling. The product team has approved a new Notification & Audit Service for the upcoming sprint. This service will sit alongside the existing
Project Service and handle real-time notifications when project milestones are updated, as well as maintain an immutable audit log of all state changes for compliance purposes.
You've been assigned this feature. Your tech lead has given you the following brief, a piece ofexisting code to work with, and a set of expectations for delivery.
Part 1 — Tech Lead's Brief
"Here's what we need this sprint. The product team wants a Notification & Audit Service that sits between our Project Service and the clients. When a project milestone changes — created,updated, or closed — the service needs to: (a) emit a notification to the relevant team members,and (b) write an immutable audit entry capturing who changed what and when. Clients should be able to query audit history for a given project, filtered by date range or event type.
Before you build anything new, I need you to deal with some inherited code. A contractor usedCopilot to build the Project Service last sprint. It was committed quickly and has never been reviewed. It's sitting in src/projects/. I want a proper review — architectural, security, the lot —before we wire the new service on top of it.
One more thing — midway through the sprint, the product team may drop a change request on us.If that happens, I need a quick impact analysis before anyone touches code. Document it properly.
Use GitHub Copilot throughout. Set up the custom instructions file if it doesn't exist. I want cleanmulti-service design, documented decisions, good tests, and a PR I can review by end of sprint."
```

**Copilot feature**: Agent mode, custom instructions

**Prompting technique**: specificity, decomposition, constraint, role-based

**Rationale**: Agent mode is appropriate because the request requires editing repo files and maintaining the prompt log. The prompt decomposes required instruction sections and uses constraints to keep security, tenancy, and documentation rules precise.

## Post-Generation Corrections

- Generated updated `.github/copilot-instructions.md` and appended this prompt entry to `PROMPTS.md`. No post-generation corrections were needed.

---

## Project Service Persistence

**Exact prompt text**

```text
Generate a Project model and a Project service with create, update status, get by team, and delete functions. Use a database.
```

**Copilot feature**: Agent mode

**Prompting technique**: concise task specification

**Rationale**: The prompt defines the required domain operations while allowing the agent to follow the repository's SQLite, Zod, TypeScript, and tenant-isolation conventions.

## Post-Generation Corrections

- Added tenant and team scoping to all database reads and mutations, constrained project statuses, and added SQLite unit coverage. Adjusted the database driver calls because the installed typings do not support generic `get` or `all` method arguments.

---

## Project Service Production Rewrite

**Exact prompt text**

```text
As a senior softwae engineer with distributed systems knowledge, rewrite the Project Service to production standards. make sure Apply proper layered architecture: Model → Repository → Service → Controller/Route. Use ORM for queries not plain sql
Add input validation, error handling, type annotations, structured logging, authorisation
```

**Copilot feature**: Agent mode

**Prompting technique**: role assignment (senior engineer persona) plus an explicit constraint checklist (layering, ORM, validation, error handling, typing, logging, authorization)

**Rationale**: The persona and checklist steered the agent toward a full architectural rewrite rather than an incremental patch, and matched the repository's explicit allowance to review/rewrite `src/projects/` when a task asks for it directly.

## Post-Generation Corrections

- Added `drizzle-orm` and replaced raw `better-sqlite3` SQL in the service with an ORM-backed repository layer, keeping the CREATE TABLE/index DDL as an explicit migration function rather than a query.
- Split the single service file into `project.model.ts` (Drizzle schema + Zod), `project.database.ts` (connection/migration), `project.repository.ts` (ORM queries), `project.service.ts` (business rules + logging), `project.controller.ts`, and `project.routes.ts`, matching the `controllers -> services -> repositories -> database` convention.
- Removed `tenantId` from the client-supplied `CreateProjectInput` schema; it is now derived only from the verified JWT/auth context, fixing a tenant-spoofing gap in the inherited code.
- Extended `auth.middleware.ts` to validate and expose `tenantId` and `role` from the JWT payload (previously only `userId` was extracted), and added `authorize.middleware.ts` implementing RBAC permission checks (`projects:create/read/update/delete`) per role.
- Added `shared/errors.ts` (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`), `shared/http-response.ts`, and a global `error.middleware.ts` so failures map to the established response format instead of leaking stack details.
- Rewired `app.ts` to mount the versioned `/api/v1/projects` router ahead of the global error handler.
- Rewrote `tests/project.service.test.ts` for the new repository-backed service and added `tests/authorize.middleware.test.ts` for RBAC coverage; added `tests/setup-env.ts` (wired into `jest.config.js`) to satisfy `env.ts` Zod validation during test runs, since structured logging now triggers env parsing at import time.
- Verified `npm run typecheck`, `npm run lint`, and `npm test` all pass; ran `npx prettier --write` on only the files touched by this change.

---

## Notification & Audit Service Technical Specification

**Exact prompt text**

```text
generate SPEC.md for the Notification & Audit Service that translates the product requirements into a clear technicalspecification. Include: data models with field types, API contracts (request/response shapes),integration points with the Project Service, and constraints (immutability, authorisation,validation rules). Note in the document where Copilot helped draft or refine the spec, and whereyou had to apply your own judgment to correct or complete it.
```

**Copilot feature**: Agent mode

**Prompting technique**: specification-driven decomposition with explicit required sections

**Rationale**: The prompt constrained the deliverable to a technical specification and called out the critical integration, security, data-contract, and authorship-disclosure dimensions.

## Post-Generation Corrections

- Cross-checked the draft against the current Project Service. It has no milestone model or event contract, so the specification records a transactional-outbox integration requirement instead of implying an existing integration.
- Applied engineering judgment for idempotency hashing, workload-authenticated event intake, recipient resolution, cursor pagination, snapshot sizing, and open product/security decisions.

---

## Local SQLite Database Initialization Script

**Exact prompt text**

```text
add npm script to generate initial sqllite db for local
```

**Copilot feature**: Agent mode

**Prompting technique**: concise task specification

**Rationale**: The prompt requested an npm script to initialize the local SQLite database. Creating an idempotent script (`src/scripts/init-db.ts`), adding `"db:init": "tsx src/scripts/init-db.ts"` to `package.json`, and updating `README.md` satisfies the request cleanly within existing project conventions.

## Post-Generation Corrections

- Created `src/scripts/init-db.ts` to ensure parent directory creation, SQLite pragma setup, and execution of `migrateProjectsSchema`.
- Added unit tests in `tests/init-db.test.ts` to maintain test coverage and verified `npm run typecheck`, `npm run lint`, and `npm test` pass.



---

## Notification & Audit Service Impact Analysis

**Exact prompt text**

```text
Review this repo's .github/copilot-instructions.md and the existing src/projects/ milestone code. Give me a brief impact analysis for adding the Notification & Audit Service.

Cover: APIs, data model, tenant isolation, RBAC/security, tests, docs, rollout risk, and schedule impact. Do not change files yet.
```

**Copilot feature**: Agent mode (read-only analysis)

**Prompting technique**: scoped review with an explicit output checklist and a no-edit constraint

**Rationale**: The repository requires an impact analysis before mid-sprint scope is implemented. Enumerating the required dimensions kept the response comparable to the definition-of-done checklist, and the no-edit constraint separated analysis from implementation.

## Post-Generation Corrections

- No files were changed by this prompt, so no `PROMPTS.md` entry was required at the time; it is recorded here alongside the implementation prompt it produced.

---

## Notification & Audit Service - Audit Store and Outbox Relay

**Exact prompt text**

```text
Using the impact analysis, implement the first slice of the Notification & Audit Service: the audit store and outbox relay skeleton.

Focus only on:
- src/notifications/ audit event model/schema
- audit repository/database table
- immutable audit_events storage
- relay code that reads existing milestone_outbox_events and writes audit_events
- idempotency using eventId
- tests for audit creation, idempotent replay, tenant scoping, and audit immutability

Important:
- Reuse eventId from milestone_outbox_events as the audit event primary key.
- Do not change existing milestone endpoints.
- Do not duplicate event capture logic; milestone events already exist in the outbox.
- Add SQLite immutability protection for audit_events if practical.
- Keep every query tenant-scoped.
- Use parameterized database access consistent with this repo.
- Append this prompt to PROMPTS.md when done.
```

**Copilot feature**: Agent mode

**Prompting technique**: vertical-slice scoping with an explicit in-scope file list, negative constraints (do not change/duplicate), and named acceptance tests

**Rationale**: Following the approved impact analysis, the prompt narrows work to one shippable slice. The negative constraints protect the inherited Project Service from unrequested edits, and naming the required test cases makes the security-critical paths (idempotency, tenant scoping, immutability) verifiable rather than assumed.

## Post-Generation Corrections

- Added `src/notifications/audit-event.model.ts` (Drizzle table + Zod schemas), `notification.database.ts` (DDL, indexes, and `BEFORE UPDATE`/`BEFORE DELETE` triggers raising `ABORT`), `audit-event.repository.ts` (append-only, tenant-scoped reads, `onConflictDoNothing` on `eventId`), `milestone-outbox.reader.ts`, and `audit-relay.ts`.
- Kept event capture untouched: the relay consumes the existing `milestone_outbox_events` rows and marks `publishedAt` in the same transaction as the audit insert.
- Added an attempt cap so a malformed outbox row increments `attemptCount` and stops being retried instead of looping forever.
- Wired `migrateAuditEventsSchema` into `src/scripts/init-db.ts`; no milestone routes, controllers, or services were modified.
- Added `tests/audit-relay.test.ts` covering audit creation, `eventId` reuse, idempotent replay, already-published skip, tenant scoping, update/delete rejection, malformed-row failure, and the attempt cap. `npm run typecheck`, `npm run lint`, and `npm test` pass.
- Note: `npm run format:check` fails for all 52 tracked files because the working tree uses CRLF while Prettier expects LF. This is pre-existing and was left unchanged rather than reformatting the entire repository in this slice.

---

## Notification & Audit Service - Tenant-Scoped Audit Read APIs

**Exact prompt text**

```text
Add tenant-scoped audit read APIs using the audit_events table and repository already created in src/notifications/.

Create:
- GET /api/v1/audit-events
- GET /api/v1/audit-events/:eventId

Support:
- projectId filter
- eventType filter
- entityId filter
- from/to date filters
- pagination

Security requirements:
- Add audit:read permission if missing.
- Allow audit reads only for authorized roles.
- Enforce tenant isolation in repository queries.
- Do not expose cross-tenant metadata through filters, IDs, counts, or pagination.
- Validate all params/query values with Zod.
- Use shared response and error helpers.
- Do not recreate the audit model, audit table, audit relay, or milestone outbox logic from the previous slice.

Add tests for:
- successful audit list
- filter behavior
- fetch by eventId
- forbidden member access
- cross-tenant access denial
- invalid query validation

Append this prompt to PROMPTS.md when done.
```

**Copilot feature**: Agent mode

**Prompting technique**: incremental slice building on prior context, with an explicit endpoint/filter contract, a security requirement checklist, a reuse constraint, and named test cases

**Rationale**: The slice depends on artefacts from the previous prompt, so the reuse constraint prevented the agent from regenerating the audit table, model, or relay. Separating "support" (functional filters) from "security requirements" kept tenant isolation and validation as first-class acceptance criteria rather than implementation details.

## Post-Generation Corrections

- Added `AUDIT_PERMISSIONS.READ` (`audit:read`) to `src/shared/permissions.ts`, granted to `admin` and `manager` only, and removed the stale comment saying the permission belonged to a future service.
- Added `AuditEventQuerySchema` (`.strict()`, so unknown query params are rejected), `AuditEventIdParamSchema`, `AuditEventTypeFilterSchema`, and `AuditCursorSchema` to the existing `audit-event.model.ts` rather than creating a second model file.
- Extended the existing repository with `findPage`, where `eq(tenantId)` is always the first predicate so filters and cursors can only narrow the caller's own partition.
- Chose keyset pagination over offset/count: the response returns `{ items, pagination: { limit, hasMore, nextCursor } }` with no total count, so no cross-tenant cardinality is observable. The cursor is an opaque base64url `(occurredAt, eventId)` pair, re-validated with Zod on decode and only ever applied as a bound inside the tenant-scoped query.
- Added `audit-event.service.ts`, `audit-event.controller.ts`, and `audit-event.routes.ts`, and mounted `/api/v1/audit-events` in `app.ts` behind `authenticate` + `requirePermission(audit:read)`.
- Added `tests/audit-event.read.test.ts` covering listing, each filter, date-range filtering, cursor pagination, fetch by id, member denial vs. manager/admin allow, cross-tenant denial by id/filter/crafted cursor, and nine invalid-query cases. `npm run typecheck`, `npm run lint`, and `npm test` (36 tests) pass.
- Outstanding gap: OpenAPI documentation for the two new endpoints is not included, because the repository still has no OpenAPI tooling configured.

---

## Notification & Audit Service - In-App Notifications

**Exact prompt text**

```text
Implement in-app notifications for audited milestone events.

Context:
- audit_events already exists.
- Audit read APIs already exist; do not modify them unless required for notification integration.
- The audit relay marks milestone_outbox_events.publishedAt after writing audit_events, so notification processing must not depend only on unpublished outbox rows.

Use either:
- audit_events as the notification source, or
- a separate notification processing marker/table/status independent of milestone_outbox_events.publishedAt.

Create:
- notification model/schema
- notification repository/database table
- service logic that creates notifications for project members from audited milestone events
- GET /api/v1/notifications
- POST /api/v1/notifications/:id/read

Requirements:
- Focus only on in-app notifications, not email.
- Use existing project_members as the recipient source.
- Recipient lookup must be scoped by tenantId and projectId.
- Prevent duplicates with a DB unique constraint on eventId + recipientUserId + channel.
- Users can only list/read/mark their own notifications unless explicitly authorized.
- Keep tenantId derived from authenticated context for APIs and from audit_events/outbox data for background processing.
- Add notifications:read permission if needed.
- Do not recreate or rewrite audit_events, audit read APIs, audit relay, or milestone outbox logic.
- Do not modify existing milestone endpoint behavior.

Add tests for:
- notification creation from an audited event
- duplicate prevention on replay
- own-notification listing
- mark-as-read
- cross-tenant denial
- unauthorized read/update denial
- no missed notifications for already-audited events

Append this prompt to PROMPTS.md when done.
```

**Copilot feature**: Agent mode

**Prompting technique**: context-priming with a known failure mode (the `publishedAt` trap), an explicit choice of permitted designs, reuse constraints, and named test cases including a negative reliability case

**Rationale**: Naming the `publishedAt` hazard up front prevented the obvious-but-wrong design of reusing the outbox cursor, which would have silently skipped every event the audit relay had already published. Offering two acceptable sources rather than dictating one left the design decision open while bounding it.

## Post-Generation Corrections

- Chose `audit_events` as the source with a dedicated `notification_dispatch_state` marker table. Pending work is an anti-join (`audit_events LEFT JOIN notification_dispatch_state WHERE eventId IS NULL`), so events audited before this feature existed are still dispatched exactly once and `milestone_outbox_events.publishedAt` is never consulted.
- Added `notification.model.ts` with a `UNIQUE (eventId, recipientUserId, channel)` index as the duplicate guard, `notification.repository.ts`, `notification-dispatch.repository.ts`, `notification-dispatcher.ts`, `notification.service.ts`, `notification.controller.ts`, and `notification.routes.ts`; `migrateNotificationsSchema` was added to `notification.database.ts` and wired into `init-db.ts`.
- Corrected the recipient lookup mid-implementation: the first version queried `project_members` directly from the notifications repository. `ProjectMemberService.resolveRecipients(tenantId, projectId)` already exists as the documented recipient-resolution boundary, so the dispatcher now depends on a narrow `RecipientDirectory` port satisfied by that service, and the direct table query and its schema import were removed.
- Applied engineering judgment: the actor is excluded from notifications about their own change, and only members whose channels include `in_app` receive one.
- Ownership is enforced in SQL, not in memory: `findPage`, `findOwned`, and `markRead` all include `tenantId` and `recipientUserId` in the predicate. Another user's or another tenant's notification surfaces as `NotFoundError` rather than a 403, so notification existence is not disclosed. `markRead` is idempotent.
- Added `NOTIFICATION_PERMISSIONS.READ` (`notifications:read`) for all three tenant roles, while `audit:read` stays restricted to admin and manager.
- Added `tests/notification.test.ts` with 9 cases covering fan-out from an audited event, actor exclusion, replay with the dispatch marker deleted (duplicates counted, no new rows), already-audited backlog pickup with zero unpublished outbox rows, own-notification listing, mark-as-read idempotency, other-user denial, cross-tenant denial, dispatch tenant scoping, RBAC, and invalid query rejection. `npm run typecheck`, `npm run lint`, and `npm test` (46 tests) pass.
- Outstanding gap: OpenAPI documentation is still missing for the notification endpoints as well, pending OpenAPI tooling in the repository.

---

## Notification & Audit Service - Hardening Pass

**Exact prompt text**

```text
Finish the Notification & Audit Service hardening pass.

Context:
- Audit store, audit relay, and audit read APIs already exist.
- In-app notifications already exist.
- Notifications are dispatched from audit_events using notification_dispatch_state, not milestone_outbox_events.publishedAt.
- Relay and dispatcher expose runOnce(), but no scheduler invokes them yet.
- OpenAPI tooling is not configured in this repo.

Please:
- Add safe runtime wiring for the audit relay and notification dispatcher if appropriate, or document why scheduler wiring should be deferred.
- Ensure relay and dispatcher startup/shutdown behavior is clean and testable.
- Review the full flow for missed events, duplicate audit rows, duplicate notifications, and crash/replay safety.
- Confirm notification_dispatch_state cannot mark an event complete before all in-app notifications are safely created.
- Add resource-level authorization for audit reads if still missing: managers should only see audit events for projects they are authorized to read, while admins keep tenant-scoped visibility.
- Confirm notification APIs enforce ownership and tenant isolation in SQL.
- Confirm secrets are redacted from audit metadata, snapshots, notification errors, and stored failure details.
- Confirm audit snapshots over 1 MiB are rejected.
- Update or add tests for scheduler/wiring if added, crash/replay behavior, resource-level audit authorization, notification ownership, tenant isolation, redaction, and snapshot-size rejection.
- Update README with the audit and notification endpoints, local usage notes, and how relay/dispatcher processing works.
- Add migration notes for audit_events, notifications, and notification_dispatch_state.
- Document the OpenAPI tooling gap instead of creating disconnected hand-written OpenAPI files.
- Run tests, typecheck, lint, and format check.
- If format check only fails because of the existing repo-wide CRLF-vs-LF issue, document it and do not reformat unrelated files.
- Fix issues caused by this work.
- Append this prompt and final corrections to PROMPTS.md.
```

**Copilot feature**: Agent mode

**Prompting technique**: definition-of-done sweep combining verification asks ("confirm X") with implementation asks ("add Y"), an explicit escape hatch ("or document why it should be deferred"), and a pre-declared known-failure exclusion for the CRLF issue

**Rationale**: Mixing "confirm" and "add" items forces the agent to audit existing behaviour instead of assuming prior slices were correct, and each confirmation is cheap to convert into a regression test. Pre-declaring the CRLF failure prevented a spurious repo-wide reformat that would have buried the real diff.

## Post-Generation Corrections

- Added `NotificationProcessor` (`notification-processor.ts`) composing the relay and dispatcher, with a non-overlapping tick guard, an `unref()`'d timer so it never holds the event loop or a test runner open, and idempotent `start()`/`stop()`. `createNotificationProcessor` is the background composition root and shares the caller's SQLite connection.
- Rewrote `src/index.ts` to own the SQLite connection, pass it to `createApp`, start the processor when `NOTIFICATION_PROCESSING_ENABLED` is true, and stop the processor before closing the server and database on `SIGINT`/`SIGTERM`. Added `NOTIFICATION_PROCESSING_ENABLED`, `NOTIFICATION_POLL_INTERVAL_MS`, and `NOTIFICATION_BATCH_SIZE` to `config/env.ts` and `.env.example`.
- Flow review found and fixed two real redaction leaks: audit `metadata` was written to `audit_events` without passing through `redactSensitive` or `assertSnapshotSize` (only `before`/`after` were covered), and both the relay and the dispatcher logged `error.message`, which for a `SyntaxError` from `JSON.parse` echoes a fragment of the raw stored payload. Both now redact metadata and log only the error class.
- Verified rather than assumed the remaining invariants: audit inserts and outbox `publishedAt` share one transaction; notification inserts and the `notification_dispatch_state` marker share one transaction, so an event cannot be marked complete with notifications missing; the dispatcher's anti-join against `audit_events` means no already-audited event is missed.
- Added resource-level audit authorization. `AuditActorContext` now carries `role`; admins stay tenant-scoped, and every other permitted role is narrowed to projects they are a member of via a new `ProjectAccessDirectory` port and an `inArray` predicate in `findPage`. An out-of-scope event returns `NotFoundError`, not `403`, so audit existence is not disclosed across projects.
- This required two additive methods on inherited code (`ProjectMemberRepository.findProjectIdsByUser`, `ProjectMemberService.listAuthorizedProjectIds`). Prettier incidentally rewrapped unrelated lines in those two files; that reformatting was reverted so the `src/projects/` diff stays purely additive (16 insertions, 0 deletions).
- Added `tests/notification-processor.test.ts` (11 cases): single-tick audit+dispatch, idempotent start/stop, fake-timer scheduled ticks, crash between auditing and dispatching, failed notification insert leaving no dispatch marker and later delivering exactly once, manager restricted to their projects, manager with no memberships seeing nothing, secret redaction in snapshots *and* metadata verified against the raw stored row, >1 MiB snapshot rejection leaving the outbox unpublished with `attemptCount` 1, no payload fragments in failure logs, and notification ownership/tenant scoping. Updated `tests/audit-event.read.test.ts` for the new service signature.
- Documented the OpenAPI gap in the README rather than committing hand-written specs, and added `docs/MIGRATIONS.md` with per-table notes and backfill guidance for `audit_events`, `notifications`, and `notification_dispatch_state` — including the warning that enabling the dispatcher against an existing database will drain the entire audit backlog unless marker rows are pre-inserted.
- `npm run typecheck`, `npm run lint`, and `npm test` (57 tests, 10 suites) pass. `npm run format:check` still fails repo-wide because the working tree is CRLF and Prettier expects LF; running a content-only check (`--end-of-line auto`) leaves 6 failures, all pre-existing inherited files (`src/projects/milestone.repository.ts`, `milestone.service.ts`, `project-member.repository.ts`, `project-member.service.ts`, `project.routes.ts`, `tests/milestone.service.test.ts`). Every file authored in this work is format-clean; nothing unrelated was reformatted.

---

## PR Description Authoring

**Exact prompt text**

```text
Act as the author of this PR. Analyze the repository and the changes on this branch, then write a complete PR description in Markdown, ready to paste into GitHub.

Grounding — before writing, actually inspect:
- `git diff main...HEAD --stat` and the full diff for changed files
- `git log main..HEAD` for commit messages
- `PROMPTS.md` for the real record of prompts, Copilot features, and prompting techniques used
- `.github/copilot-instructions.md` for the standards this PR must satisfy
- `src/notifications/`, `src/projects/`, `src/shared/`, and `tests/` for what was built and what is tested
Do not invent facts. If evidence for a claim is missing, write "Not verified" and say what you'd need to confirm it.

Produce exactly these sections:

## Summary
3–5 sentences: what was built, why it was needed, and the user/business outcome. Name the concrete endpoints, services, and data model changes.

## AI Tool Disclosure
Answer each as its own bullet, using `PROMPTS.md` and commit history as evidence:
- Which Copilot features were used (name specific ones: Ask Mode, Edit Mode, Agent Mode, /explain, /fix, /tests, /doc, #file, @workspace, @terminal, `.github/copilot-instructions.md`, inline ghost-text suggestions, Copilot-generated commit messages).
- Which mode was used most, and for which types of tasks.
- Where Copilot output was accepted as-is vs. where it was overridden or rewritten, with at least two concrete file-level examples.
- Estimated AI-generated vs. hand-written code percentage, with a one-line explanation of how the estimate was derived (e.g., diff line counts vs. manually edited regions).
- Whether `.github/copilot-instructions.md` improved quality/consistency, with a specific example of a convention it enforced (e.g., tenant scoping in repositories, Zod validation, Winston structured logging).

## Testing
List the test files that exist, what each covers (happy path, tenant isolation, RBAC, duplicate-event/idempotency, audit immutability, redaction, validation errors), the commands run (`npm run test:unit`, `npm run test:integration`, `npm run lint`, `npm run typecheck`), their results, and known coverage gaps stated honestly.

## Risks & Trade-offs
At least one genuine technical trade-off or limitation from this codebase (not a generic platitude). State the decision, the alternative rejected, why, and the conditions under which it would need to be revisited.

## Self-Review Checklist
Markdown checkboxes, each with a one-line evidence note (file/test reference), and leave unchecked anything not actually verified:
- [ ] No hardcoded secrets or PII in code
- [ ] All inputs validated
- [ ] Error handling uses specific exceptions
- [ ] Code follows `.github/copilot-instructions.md` standards
- [ ] All Copilot suggestions reviewed before accepting
- [ ] Tests cover happy path, edge cases, and error scenarios
- [ ] Used /explain on any code block I didn't fully understand

Tone: factual, concise, reviewer-oriented. No marketing language. Output the Markdown only.

Also update prompt and commit the change
```

**Copilot feature**: Agent mode, `@terminal`, repository custom instructions

**Prompting technique**: evidence-grounded role assignment with a fixed output schema and explicit non-invention constraint

**Rationale**: The request requires a reviewer-oriented PR description backed by the branch diff, history, prompt log, repository standards, implementation, and tests. The fixed sections make unverified evidence and residual risks explicit.

## Post-Generation Corrections

- `git diff main...HEAD --stat`, the full `git diff main...HEAD`, and `git log main..HEAD` returned no output because `HEAD` is on `main` with no branch commits. The PR description therefore identifies branch-change and commit-history claims as not verified rather than inventing them.
- Ran `npm run test:unit` (57 passed, 10 suites), `npm run test:integration` (no tests found; exited 0), `npm run lint` (passed), and `npm run typecheck` (passed).
- Appended this prompt record and committed it as required by `.github/copilot-instructions.md`.