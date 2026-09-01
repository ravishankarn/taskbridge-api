# Copilot Tool Strategy

## Feature Usage Log

| Feature                                       | What I used it for                                                                                                                    | Why this feature                                                                                                                                             | What happened                                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copilot Agent mode                            | Rewrote the inherited Project Service into model, repository, service, controller, and route layers.                                  | This involved coordinated changes across source, tests, middleware, and configuration; a multi-file agent was more suitable than a single inline completion. | It produced the layered baseline, then the implementation was corrected to derive tenant identity from JWT claims and enforce RBAC.                                                          |
| Repository custom instructions                | Set the architecture, strict TypeScript, tenant-isolation, logging, testing, and audit-immutability constraints for subsequent work.  | The rules needed to persist across implementation prompts and files instead of being restated in every completion request.                                   | The instructions drove repository tenant scoping, Zod validation, Winston logging, append-only audit storage, and the required prompt log.                                                   |
| Copilot Agent mode                            | Drafted `SPEC.md` for the Notification & Audit Service.                                                                               | The work required a connected technical specification covering models, API contracts, integration, and constraints, rather than a narrow code change.        | The draft exposed that the existing Project Service had no milestone event contract; the specification was revised to require a transactional outbox integration.                            |
| Copilot Agent mode with `@terminal` grounding | Authored the PR description after inspecting the diff, history, prompt log, tests, and repository instructions.                       | The `@terminal` context could verify commands and Git state instead of allowing the description to make unsupported claims.                                  | The branch and history commands had no relevant output, so the PR description marked those claims as not verified and recorded the actual test results.                                      |
| Copilot `@workspace` context                  | Located related milestone, outbox, audit, notification, migration, and test modules while preparing the scope-change impact analysis. | The change crossed service boundaries; workspace context was more appropriate than manually supplying isolated files that could omit a dependency.           | The analysis identified both required nullable IP-address migrations and the asynchronous outbox path that must preserve the original request context.                                       |
| Copilot Agent mode                            | Implemented the audit-store and outbox-relay slice with idempotency and immutability tests.                                           | This was a vertical slice spanning schemas, persistence, a worker path, and security-critical tests, which benefits from coordinated edits.                  | It added tenant-scoped append-only audit persistence, duplicate-event protection, relay processing, and focused tests; implementation details were reviewed and corrected before acceptance. |

## Scenario Responses

### Understanding a complex 600-line legacy service

Use Copilot Chat in Ask mode with `@workspace` and targeted `#file` references. Ask mode is best for a read-only walkthrough of control flow, dependencies, assumptions, and risks before an integration is designed. Keeping the request non-editing preserves the legacy baseline while producing questions and review findings for human validation.

### Generating request-validation middleware across 10 routes

Use Copilot Agent mode with repository custom instructions and the existing route/schema files in context. Agent mode can apply a consistent pattern across the handlers, while the instructions enforce Zod validation, error types, input trimming, and the shared response format. Require focused negative tests so the generated changes are checked against malformed bodies, params, and queries.

### Verifying JWT expiry and signature-tampering behavior

Use Copilot Chat with `@terminal` to inspect the implementation and run focused Jest tests. This needs executable evidence, not a prose explanation: generate or review tests for expired tokens, invalid signatures, malformed tokens, and missing claims, then run them against the real middleware. The terminal-grounded result can distinguish a correct-looking implementation from one that actually accepts a tampered token.

### Enforcing lint and coverage on every commit to main

Use GitHub Actions with branch protection rules, generated with Copilot Agent mode if the workflow does not exist. Copilot can scaffold the workflow and explain required checks, but GitHub Actions and branch protection are the feature that performs enforcement with no human intervention. Configure the workflow to run lint, tests with coverage thresholds, and type checking; require those checks before merging to `main`.

### Reviewing an AI-generated contractor service for security issues

Use Copilot code review on the pull request, supplemented by Ask mode for deeper threat-model questions. Code review is appropriate because it presents findings inline against the contractor's diff, where authorization, tenant scoping, input validation, secret handling, SQL parameterization, and logging problems can be actioned. Treat its comments as leads and verify each one with tests and repository conventions before merging.

### Keeping multi-tenant isolation rules consistent across people and sessions

Use repository custom instructions in `.github/copilot-instructions.md`. They provide a durable, shared policy that tells Copilot to derive tenant identity only from verified authentication and to scope every tenant-owned repository query. Back the instructions with tests and code review because instructions guide generation but do not enforce behavior at runtime.

## Limitations Encountered

### Initial Project Service generation omitted tenant-safe persistence

**Prompt:** “Generate a Project model and a Project service with create, update status, get by team, and delete functions. Use a database.”

**What went wrong:** The initial output needed tenant and team scoping added to database reads and mutations, and project statuses needed to be constrained. The prompt was too broad to make the multi-tenant threat boundary and allowed status transitions explicit.

**Detection and fix:** The generated implementation was reviewed against the repository instructions and covered with SQLite unit tests. The service and repository were corrected to scope operations and validate status values; database-driver calls were also adjusted to match the installed typings.

**Different approach:** State that tenant ID must be token-derived, every repository query must include tenant scope, the permitted statuses must be enumerated, and cross-tenant negative tests are acceptance criteria.

### Specification draft assumed an integration that did not exist

**Prompt:** Request a Notification & Audit Service specification with data models, API contracts, Project Service integration points, and constraints.

**What went wrong:** A generic draft could imply that milestones already had an event contract. In the real workspace, the required milestone model and event integration were absent at that point.

**Detection and fix:** The implementation surface was inspected before accepting the draft. The specification was corrected to describe a required transactional-outbox integration instead of pretending an existing integration point was available.

**Different approach:** Include a mandatory evidence step: inspect the named producer module and identify the exact event table, schema, or missing dependency before proposing an integration contract.

### Scope-change analysis could have adopted the product labels and IP storage too literally

**Prompt:** Analyze adding `MILESTONE_REOPENED`, notifications, and actor IP capture before touching code.

**What went wrong:** The product label was uppercase while existing stored events used lower-dot names, and a superficial implementation could put actor IP into arbitrary metadata or attempt to backfill immutable audit rows. Either choice risks a breaking contract or misleading compliance history.

**Detection and fix:** Existing event schemas, the asynchronous outbox relay, and append-only audit triggers were inspected. The analysis recommends the additive `milestone.reopened` value, nullable first-class IP columns through the outbox and audit tables, and no historical backfill.

**Different approach:** Ask Copilot to compare every proposed enum, field, and migration with the live schema; require explicit compatibility, privacy, and immutability decisions before output is accepted.
