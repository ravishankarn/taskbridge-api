# Copilot Instructions — taskbridge-api

## Project context

- TaskBridge is a B2B SaaS project-collaboration platform for distributed engineering teams that integrates with clients' internal tooling.
- `src/projects/` owns project management and milestone state. The upcoming Notification & Audit Service reacts to milestone events, notifies authorized team members, and records immutable compliance history.

## Technology stack

- Use Node.js 20+, TypeScript in strict mode, Express, SQLite with better-sqlite3, Zod, JWT authentication, Winston, Jest, and `.http` request files.
- Keep runtime configuration explicit and validated. Load environment variables through the shared config layer and validate them with Zod before use.
- Treat this repository as a multi-service backend. Prefer small modules with clear boundaries over cross-service coupling.

## Architecture conventions

- Use the flow `controllers -> services -> repositories -> database` for REST work. Controllers handle HTTP concerns, services own business rules, repositories own persistence, and database modules own connection/migration details.
- Place service modules under `src/<service-name>/`, for example `src/notifications/`, with co-located controller, service, repository, schema, and route files as needed.
- Put cross-service utilities, types, middleware, response helpers, and database helpers under `src/shared/`. Do not duplicate shared behavior inside service folders.
- Expose versioned REST APIs such as `/api/v1/...` and use consistent success, pagination, and error response formats across services.
- Keep audit records immutable and append-only. Never update or delete audit-history rows to correct business events; append compensating records when needed.
- Process milestone events idempotently. Add retry handling, stable event IDs, and duplicate-event protection before emitting notifications or writing audit entries.

## Coding standards, including naming, type safety, and logging

- Use kebab-case filenames for new files, PascalCase for classes/types, camelCase for variables/functions, and clear domain names over abbreviations.
- Keep TypeScript strictness enabled. Do not use `any`, non-null assertions, unchecked casts, or broad `unknown` narrowing unless there is a documented boundary reason.
- Validate all external input with Zod, including HTTP bodies, params, query strings, event payloads, and environment variables.
- Use the shared Winston logger instead of `console.log`. Emit structured logs with correlation ID, tenant ID when available, service, operation, and outcome.
- Never log secrets, tokens, passwords, PII, raw authorization headers, or full request bodies. Redact sensitive fields before logging errors or payloads.
- Keep generated code simple and reviewable. Prefer explicit errors, narrow interfaces, and dependency injection over hidden globals.

## Security and multi-tenant isolation rules

- JWT access tokens expire after five minutes and are kept in client memory. Refresh tokens expire after seven days and use secure, HTTP-only, `SameSite` cookies; rotate and invalidate them on use where refresh authentication is implemented.
- JWT claims must include `userId`, `tenantId`, `role`, `iat`, and `exp`. Verify every protected request before setting its authenticated context.
- On protected endpoints, derive `tenantId` only from the verified JWT/session context. Never trust tenant identity from request headers, request bodies, query strings, path params, or client-controlled event payloads.
- Every tenant-owned database query must include tenant scope in the repository layer. Do not fetch first and filter in memory.
- Enforce RBAC and resource-level authorization before reads, writes, notifications, exports, or audit-history access.
- Use the tenant roles `admin`, `manager`, and `member`. Model permissions explicitly with stable names such as `projects:create`, `projects:delete`, and `audit:read`; only tenant admins may manage users, roles, or other sensitive tenant settings, and clients cannot self-elevate privileges.
- Use parameterized SQL for all database access. Do not concatenate untrusted input into SQL, order clauses, filters, or pagination.
- Configure Helmet secure headers, a configured CORS origin allowlist, request-size limits, and rate limiting for public HTTP surfaces. Permit only required CORS methods, use credentials only when required, and cache preflight responses for up to 86,400 seconds.
- Rate-limit unauthenticated requests to 100 per IP per 15 minutes and authenticated requests to 1,000 per tenant per 15 minutes; apply stricter limits to login and token-refresh endpoints.
- Validate and trim all inputs with Zod, validate payload structure independently of `Content-Type`, and sanitize HTML with an approved sanitizer when rich text is accepted. Hash passwords with bcrypt using at least 12 rounds and never retain plaintext passwords.
- Store secrets only in environment variables or approved secret stores. Keep `.env.example` placeholder-only and never commit real credentials.
- Audit-history APIs must support tenant-scoped filtering by project, event type, and date range without exposing cross-tenant metadata.

## Error handling

- Use explicit `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, and `ConflictError` types for expected failures; reserve internal errors for unexpected faults.
- Register global error middleware that logs redacted context through Winston and returns the established error response format without leaking implementation details.

## Testing expectations

- Maintain at least 80% overall test coverage for changed code and 100% coverage for security-critical paths, including tenant isolation, RBAC, authorization failures, audit immutability, duplicate-event handling, and secret redaction.
- Place unit tests in `tests/**/*.test.ts` and integration tests in `tests/**/*.integration.test.ts`. Run `npm run test:unit` and `npm run test:integration` when relevant.
- Add tests for controllers, services, repositories, validation schemas, error responses, and idempotent milestone-event processing.
- Include negative tests for invalid input, unauthorized access, forbidden cross-tenant access, duplicate events, retry failures, and audit-history filters.
- Do not claim behavior is complete until type checking, linting, and relevant tests pass or the blocker is documented.

## Inherited Project Service review

- `src/projects/` is inherited, AI-assisted, unreviewed code. Do not copy its patterns into new services.
- Before wiring new Notification & Audit behavior to Project Service code, review `src/projects/` for architecture, security, performance, reliability, and maintainability.
- Do not refactor, optimize, or silently correct `src/projects/` unless the task explicitly asks for that review or fix. Report discovered issues and proposed remediation separately.

## Notification & Audit Service rules

- `src/notifications/` may remain empty until a task explicitly asks to implement the Notification & Audit Service.
- When implemented, milestone-created, milestone-updated, and milestone-closed events must emit notifications to authorized team members and append audit entries capturing actor, project, event type, timestamp, and changed fields.
- Notification delivery must be retryable and must not create duplicate audit entries or duplicate user-visible notifications for the same event ID.
- Audit entries must capture event type, entity type and ID, actor ID, token-derived tenant ID, UTC timestamp, before/after state, and necessary metadata. Never store passwords, tokens, or other sensitive values in snapshots or metadata.
- Reject audit snapshots larger than 1 MB. Do not expose audit update or delete operations; use a compensating entry when a business event must be corrected.
- Retain audit history for seven years. Tenant deletion archives its audit history offline rather than deleting it, and tenant-scoped audit export must be authorized and supported where required.
- Index audit storage by tenant ID, timestamp, and entity ID to support scoped history queries.

## Mid-sprint change requests

- Before implementing mid-sprint change requests, produce an impact analysis covering affected APIs, data model/migrations, tenant isolation, security, tests, documentation, rollout risk, and schedule impact.
- Wait for explicit approval or task direction after the impact analysis before changing code for the new scope.

## Documentation and definition of done

- Keep OpenAPI documentation current for every versioned endpoint, including auth requirements, request/response schemas, error formats, and audit-history filters; generate it with the approved OpenAPI tooling rather than maintaining disconnected hand-written copies.
- Add ADRs for consequential architectural decisions and migration notes for database or contract changes.
- Add concise JSDoc to public exports when their contract, side effects, or usage is not clear from TypeScript types and names alone.
- Keep the README current with local setup, environment variables, main authenticated endpoints, and database/migration instructions.
- Definition of done includes reviewed tenant isolation, RBAC/resource authorization, Zod validation, structured logging, tests and coverage, OpenAPI updates, migration notes when needed, and a concise PR summary.

## Operations and development workflow

- Provide a lightweight health-check endpoint. Use compression, caching, and connection pooling only where the selected dependency or deployment environment supports them; document configuration and invalidation behavior.
- Log slow database queries without logging SQL values or sensitive fields. Instrument production services with approved metrics, alerting, and APM tooling when available.
- Organize imports as external packages, shared modules, then local modules. Keep each group alphabetized when practical.
- Before committing, run `npm run test`, `npm run lint`, `npm run format:check`, and `npm run typecheck`; run `npm run dev` to exercise changed HTTP behavior when relevant.
- Use commit messages in the format `[type]: description`, using `feat`, `fix`, `refactor`, `test`, `docs`, or `style`; prefix breaking changes with `BREAKING:` and reference related issues when available.

## Always maintain `PROMPTS.md`

- On every request that changes files in this repo, append to `PROMPTS.md` at the repo root before ending the turn. Create the file if it does not exist.
- Append only; never rewrite or delete earlier entries. Log only prompts actually submitted in this repo.
- Include the exact prompt text, Copilot feature, prompting technique, rationale, and post-generation corrections. If coverage gaps remain for distinct Copilot features or prompting techniques, note the gap instead of inventing prompts.
- `PROMPTS.md` is documentation, not code; it is exempt from the kebab-case filename convention.

- git commit with detailed message after each prompt completion
