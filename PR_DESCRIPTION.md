# Notification & Audit Service PR Description

## Summary

This PR adds the Notification & Audit Service for TaskBridge so milestone changes produce durable audit records and in-app notifications for authorized project members. It introduces audit, notification, dispatch-state, milestone, and outbox persistence around `audit_events`, `notifications`, `notification_dispatch_state`, `milestones`, and `milestone_outbox_events`, plus background processing through `NotificationProcessor`, `MilestoneAuditRelay`, and `NotificationDispatcher`. The API surface now includes `GET /api/v1/audit-events`, `GET /api/v1/audit-events/:eventId`, `GET /api/v1/notifications`, and `POST /api/v1/notifications/:id/read`, alongside milestone mutation endpoints that create outbox events transactionally. The outcome is a tenant-scoped compliance history and user-visible notification flow that can replay safely after crashes without duplicating audit rows or notifications.

## AI Tool Disclosure

- Copilot features used: Agent Mode was the primary feature. The repository also uses `.github/copilot-instructions.md` as custom instructions, and prior prompt records reference Agent Mode plus terminal-backed validation. `PROMPTS.md` does not verify use of Ask Mode, Edit Mode, `/explain`, `/fix`, `/tests`, `/doc`, `#file`, `@workspace`, inline ghost-text suggestions, or Copilot-generated commit messages.
- Mode used most: Agent Mode, mainly for scaffolding the repository, rewriting the Project Service, drafting `SPEC.md`, implementing the audit store/outbox relay, adding audit read APIs, implementing notifications, and completing the hardening pass.
- Accepted AI output vs. overridden output: accepted the broad service structure under `src/notifications/` after review, including the controller-service-repository-database layering and processor composition. Overrode or corrected generated output in concrete places: `src/notifications/notification-dispatcher.ts` was changed to use a narrow recipient-directory port backed by `ProjectMemberService` instead of directly querying `project_members`, and `src/notifications/audit-relay.ts` was corrected to redact audit metadata and avoid logging parser messages that could echo sensitive payload fragments.
- Estimated AI-generated vs. hand-written code: roughly 70% AI-assisted and 30% hand-written/review corrections. This estimate is based on `PROMPTS.md` showing Agent Mode produced the initial slices while post-generation corrections repeatedly changed security, tenant isolation, redaction, dispatch, and documentation details.
- Custom-instruction impact: `.github/copilot-instructions.md` improved consistency by enforcing tenant-derived `tenantId`, Zod validation, Winston structured logging, layered service boundaries, append-only audit storage, and idempotent milestone-event processing. A concrete example is the tenant-scoped audit read path in `src/notifications/audit-event.service.ts` and `src/notifications/audit-event.repository.ts`, where client filters only narrow the token-derived tenant scope.

## Service Integration and Contracts

- Milestone mutations in `src/projects/milestone.service.ts` write milestone changes and matching `milestone_outbox_events` rows inside one SQLite transaction. The outbox event is the Project Service to Notification & Audit Service contract.
- The outbox event contract carries `eventId`, `eventType`, `occurredAt`, `tenantId`, `projectId`, `milestoneId`, `actorId`, `before`, `after`, `changedFields`, and `metadata`.
- `MilestoneAuditRelay` reads unpublished outbox rows, validates/redacts snapshots and metadata, rejects oversized snapshots, and inserts immutable audit rows using the same `eventId` as the audit primary key for idempotency.
- `NotificationDispatcher` treats `audit_events` as the source of truth and uses `notification_dispatch_state` as its independent completion marker, so notification processing does not depend on `milestone_outbox_events.publishedAt`.
- Recipient resolution is an inter-service port: the notification dispatcher depends on `RecipientDirectory`, currently satisfied by `ProjectMemberService.resolveRecipients(tenantId, projectId)`. This keeps recipient lookup tenant-scoped and avoids importing Project Service persistence details into notification dispatch logic.
- API contracts are tenant-scoped through authenticated context. Audit reads require `audit:read`; notification reads and mark-read operations require `notifications:read` and are constrained to the authenticated user's own notifications in repository predicates.

## Testing Coverage and Known Gaps

- `tests/audit-relay.test.ts`: covers audit creation from outbox events, replay/idempotency via `eventId`, already-published skip behavior, tenant scoping, append-only immutability triggers, malformed-row failure handling, and attempt-cap behavior.
- `tests/audit-event.read.test.ts`: covers audit listing, filtering by project/event/entity/date, keyset pagination, fetching by ID, role restrictions, cross-tenant denial, crafted cursor isolation, and invalid query validation.
- `tests/notification.test.ts`: covers notification creation from audited events, actor exclusion, duplicate prevention on replay, backlog pickup for already-audited events, own-notification listing, mark-as-read idempotency, cross-user and cross-tenant denial, RBAC, and invalid query validation.
- `tests/notification-processor.test.ts`: covers processor wiring, start/stop idempotency, scheduled ticks, crash/replay safety between audit and dispatch, failure behavior before dispatch-state marking, resource-level audit authorization, no-membership audit denial, redaction, snapshot-size rejection, failure-log redaction, and SQL-level notification ownership.
- Additional related coverage exists in `tests/milestone.service.test.ts`, `tests/project.service.test.ts`, `tests/project-member.service.test.ts`, `tests/authorize.middleware.test.ts`, `tests/redaction.test.ts`, and `tests/init-db.test.ts`.
- Validation commands recorded in `PROMPTS.md`: `npm run typecheck`, `npm run lint`, and `npm test` passed after implementation slices; the hardening pass recorded 57 passing tests across 10 suites.
- Integration-test gap: `npm run test:integration` was recorded as exiting successfully with no tests found, so there is no true HTTP/database integration suite yet.
- Documentation gap: OpenAPI tooling is not configured, so endpoint documentation is present in README/migration notes rather than generated OpenAPI output.
- Formatting gap: `npm run format:check` is known to fail repo-wide because of the existing CRLF-vs-LF issue; a narrower content-only check still identified several pre-existing inherited files as not format-clean.

## Risks & Trade-offs

- Trade-off: notifications are dispatched from `audit_events` with `notification_dispatch_state` instead of directly from the Project Service outbox. This was chosen because the audit relay marks outbox rows published after audit insertion, and a notification worker tied only to unpublished outbox rows would miss already-audited events. The alternative was a single pipeline from milestone outbox to audit plus notifications, but that couples notification delivery to audit publication status and makes replay boundaries less clear. Revisit this if audit volume grows enough that anti-joining `audit_events` against dispatch state becomes a bottleneck; at that point, a dedicated durable queue or partitioned dispatch table would be safer.
- Risk: the background processor is polling-based. It is simple and testable for local SQLite, but it may introduce dispatch latency and uneven load under bursty milestone activity. Revisit when moving beyond single-process SQLite or when product requires near-real-time notification guarantees.
- Risk: recipient resolution depends on current project membership at dispatch time, not membership at event occurrence time. This avoids storing recipient snapshots in the audit event, but a membership change between milestone mutation and dispatch can affect who receives a notification. Revisit if compliance or product requirements need historical recipient accuracy.

## Self-Review Checklist

- [x] No hardcoded secrets or PII in code. Evidence: redaction helpers and regression coverage in `tests/redaction.test.ts` and `tests/notification-processor.test.ts`; `.env.example` uses placeholders.
- [x] All inputs validated. Evidence: Zod schemas in notification/audit models and route params/query validation in the controllers.
- [x] Error handling uses specific exceptions. Evidence: services/controllers use shared `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, and `ConflictError` paths.
- [x] Code follows `.github/copilot-instructions.md` standards. Evidence: layered modules, tenant-scoped repositories, append-only audit storage, structured Winston logging, and versioned API routes.
- [x] All Copilot suggestions reviewed before accepting. Evidence: `PROMPTS.md` records post-generation corrections for recipient lookup, metadata redaction, dispatch-state safety, and audit authorization.
- [x] Tests cover happy path, edge cases, and error scenarios. Evidence: audit relay/read, notification, processor, RBAC, redaction, project, and milestone test suites cover success, validation, tenant isolation, duplicate replay, and failure paths.
- [ ] Used `/explain` on any code block I didn't fully understand. Evidence: not verified in `PROMPTS.md`; no prompt entry records `/explain` usage.

## Peer Review Simulation

1. `src/notifications/audit-relay.ts`, `parseMetadata` and `parseSnapshot`: please add a regression test that malformed JSON containing a secret substring does not appear in logs. AI-generated code often focuses on redacting successfully parsed objects and misses parser-error messages, which can echo raw payload fragments before redaction runs.

2. `src/notifications/notification-dispatcher.ts`, `dispatchEvent`: please keep the dispatch-state marker write inside the same transaction as notification inserts, and add a test that an insert failure leaves the event pending. Marking an event dispatched before all recipient rows are durable would create silent missed notifications on retry.

3. `src/notifications/audit-event.repository.ts`, paginated audit query: please ensure every filter and cursor predicate is applied inside a `tenantId`-scoped query and that managers are further narrowed by authorized project IDs. This prevents crafted filters or cursors from revealing cross-tenant or cross-project existence through result counts or pagination behavior.
