# Impact Analysis: MILESTONE_REOPENED and Actor IP Audit Capture

## Change Request

Product requested a new milestone event type, `MILESTONE_REOPENED`, that triggers audit logging and notifications. Audit entries must also capture the actor's IP address.

This analysis is intentionally documentation-only. No implementation code has been changed.

## Current Flow Summary

Milestone mutations in `src/projects/milestone.service.ts` write a milestone row and a `milestone_outbox_events` row in one transaction. The Notification & Audit Service then relays unpublished outbox rows into immutable `audit_events`, and the notification dispatcher fans out pending audit events to project members.

The code currently recognizes these milestone event values: `milestone.created`, `milestone.updated`, and `milestone.closed`. The product name `MILESTONE_REOPENED` should be mapped to the repository's existing lower-dot event naming convention as `milestone.reopened`, unless the public contract is intentionally changed to uppercase enum values.

## Affected Files, Modules, and Data Models

| Area                              | File or module                                                                                                                                                                                               | Nature of change                                                                                                        | Migration required                                                      | Notes                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone event contract          | `src/projects/milestone-outbox.model.ts`                                                                                                                                                                     | Additive for event type; breaking if public/stored event names are changed from lower-dot values to uppercase           | No for enum-only addition; yes if actor IP is added to the outbox table | Add `milestone.reopened` to `MilestoneEventTypeSchema`. Add `actorIpAddress` to `MilestoneEventSchema` if IP capture is propagated through the outbox rather than only metadata.                                                                                                   |
| Project migration DDL             | `src/projects/project.database.ts`                                                                                                                                                                           | Additive schema change                                                                                                  | Yes                                                                     | Add `actorIpAddress TEXT` or equivalent to `milestone_outbox_events`. Existing rows need nullable/default handling. Current idempotent `CREATE TABLE IF NOT EXISTS` does not alter existing tables, so an explicit `ALTER TABLE` migration path is needed.                         |
| Outbox repository                 | `src/projects/milestone-outbox.repository.ts`                                                                                                                                                                | Additive persistence change                                                                                             | Depends on table migration                                              | Persist the actor IP column with every new event. Avoid putting IP only in generic metadata if audit entries must expose it as a first-class field.                                                                                                                                |
| Milestone HTTP boundary           | `src/projects/milestone.controller.ts`                                                                                                                                                                       | Additive request-context change                                                                                         | No                                                                      | Derive and normalize actor IP from Express request metadata before calling the service. Do not trust a raw client-controlled header directly.                                                                                                                                      |
| Milestone business logic          | `src/projects/milestone.service.ts`                                                                                                                                                                          | Additive feature behavior                                                                                               | No direct table migration beyond outbox                                 | Add a reopen operation that changes status from `closed` to `open`, writes `milestone.reopened`, captures before/after snapshots, and includes actor IP in the outbox event. Existing update rule that blocks closed milestones remains compatible if reopen is a separate method. |
| Milestone routes/RBAC             | `src/projects/project.routes.ts` and `src/shared/permissions.ts`                                                                                                                                             | Additive API and permission change; potentially breaking if existing roles are not granted the new permission           | No                                                                      | Add a `POST /api/v1/projects/:projectId/milestones/:milestoneId/reopen` route or equivalent, plus a stable permission such as `milestones:reopen`. Decide whether `manager` inherits it from `milestones:close` or needs explicit approval.                                        |
| Audit model                       | `src/notifications/audit-event.model.ts`                                                                                                                                                                     | Additive event filter change; additive data-field change; breaking for consumers if response shape is considered strict | Yes for actor IP column                                                 | Add actor IP to `AuditEventSchema` and `auditEventsTable`. Add `milestone.reopened` to `AuditEventTypeFilterSchema` so reads can filter for reopened events.                                                                                                                       |
| Audit migration DDL               | `src/notifications/notification.database.ts`                                                                                                                                                                 | Additive schema change                                                                                                  | Yes                                                                     | Add nullable `actorIpAddress TEXT` to `audit_events` for existing databases. Keep append-only update/delete triggers intact. Migration sequencing must add the column without modifying historical rows.                                                                           |
| Audit repository                  | `src/notifications/audit-event.repository.ts`                                                                                                                                                                | Additive persistence/read mapping change                                                                                | Depends on audit table migration                                        | Insert and hydrate the actor IP field. Ensure list and get responses consistently include it, or intentionally omit/mask it for unauthorized views.                                                                                                                                |
| Audit relay                       | `src/notifications/audit-relay.ts`                                                                                                                                                                           | Additive transform/validation change                                                                                    | Depends on outbox and audit migrations                                  | Copy actor IP from outbox row into audit row. Redact and size-check metadata as today, but do not redact the first-class IP field unless policy requires masking.                                                                                                                  |
| Outbox reader                     | `src/notifications/milestone-outbox.reader.ts`                                                                                                                                                               | Additive read/validation change                                                                                         | Depends on outbox migration                                             | Select and validate `actorIpAddress`. During rollout, tolerate null for historical rows.                                                                                                                                                                                           |
| Notification dispatcher           | `src/notifications/notification-dispatcher.ts`                                                                                                                                                               | Mostly no change for new event type; possible additive copy/text change                                                 | No                                                                      | Dispatcher is already event-type agnostic after audit insertion. It should fan out `milestone.reopened` automatically unless product requires event-specific notification text later.                                                                                              |
| Notification dispatch query       | `src/notifications/notification-dispatch.repository.ts`                                                                                                                                                      | No required change for IP; additive only if notification templates need actor IP                                        | No                                                                      | Current pending-event shape does not need IP for fanout. Avoid placing IP in notifications unless there is an approved user-facing need.                                                                                                                                           |
| Notification model/repository/API | `src/notifications/notification.model.ts`, `notification.repository.ts`, `notification.service.ts`, `notification.controller.ts`, `notification.routes.ts`                                                   | No required change for this scope                                                                                       | No                                                                      | Notifications store `eventType`; adding a new value does not require a table change.                                                                                                                                                                                               |
| Auth/request context              | `src/middleware/auth.middleware.ts` or a new shared request-context helper                                                                                                                                   | Additive infrastructure change                                                                                          | No                                                                      | JWT remains the source of identity and tenant. IP should come from trusted proxy configuration/request socket, not JWT or request body. Consider centralizing normalization so every future audited action captures it consistently.                                               |
| Redaction/logging utilities       | `src/shared/redaction.ts`, `src/config/logger.ts`, `src/middleware/error.middleware.ts`                                                                                                                      | Additive policy/test updates                                                                                            | No                                                                      | Treat IP as personal data. Keep it out of routine logs unless explicitly required, and redact it from raw metadata/error payloads if duplicated there.                                                                                                                             |
| App composition                   | `src/app.ts`, `src/index.ts`                                                                                                                                                                                 | Usually no change                                                                                                       | No                                                                      | Only affected if trusted proxy configuration is introduced at Express app level for `req.ip` correctness.                                                                                                                                                                          |
| DB initialization                 | `src/scripts/init-db.ts`                                                                                                                                                                                     | Indirect additive change                                                                                                | Yes, via migration functions                                            | `db:init` should apply the new columns for fresh and existing local databases.                                                                                                                                                                                                     |
| Migration notes                   | `docs/MIGRATIONS.md`                                                                                                                                                                                         | Additive documentation                                                                                                  | No                                                                      | Document the `milestone_outbox_events` and `audit_events` IP columns, nullability/backfill policy, and append-only implications.                                                                                                                                                   |
| README/API docs                   | `README.md` and generated OpenAPI source/tooling when available                                                                                                                                              | Additive documentation; potentially breaking docs if response schemas are strict                                        | No                                                                      | Add the reopen endpoint, event filter value, actor IP field, and privacy notes. Current repo notes that generated OpenAPI tooling is not configured.                                                                                                                               |
| Tests                             | `tests/milestone.service.test.ts`, `tests/audit-relay.test.ts`, `tests/audit-event.read.test.ts`, `tests/notification.test.ts`, `tests/notification-processor.test.ts`, plus route/controller tests if added | Additive test coverage                                                                                                  | No                                                                      | Add coverage for reopen state transitions, outbox event creation, relay copy of IP, audit read shape/filtering, notification dispatch, duplicate replay, tenant isolation, RBAC denial, and logging/redaction of IP.                                                               |

## Data Model Impact

### `milestone_outbox_events`

Recommended additive column:

```text
actorIpAddress TEXT NULL
```

Rationale: the audit relay runs asynchronously and outside request context, so the outbox must carry actor IP if the eventual audit entry is expected to reflect the original actor/request rather than the relay worker.

Historical outbox rows should be allowed to keep `NULL`. If product requires actor IP on every future event only, no backfill is needed. If non-null is required for new rows, enforce it in the service/schema after the database migration has landed and old rows have drained or been handled.

### `audit_events`

Recommended additive column:

```text
actorIpAddress TEXT NULL
```

Rationale: actor IP is now a required audit attribute and should not be hidden inside arbitrary metadata. `NULL` preserves compatibility with existing immutable rows and with historical outbox rows that predate the field.

Do not update historical audit rows to synthesize IP values; that would violate the audit store's append-only intent and produce misleading compliance data.

### Event Type

Recommended internal event value:

```text
milestone.reopened
```

Rationale: existing persisted values are lower-dot domain events. The uppercase product label `MILESTONE_REOPENED` can be exposed in product documentation if needed, but changing stored values to uppercase would be a breaking event-contract migration.

## Security and Compliance Risks

Capturing IP addresses introduces personal-data handling concerns. IP addresses can identify or help identify a user, household, office, VPN endpoint, or geography. Treat the field as personal data for privacy review, access control, export, retention, and deletion/archival policy.

Retention risk increases because audit history is retained for seven years and tenant deletion archives audit history offline rather than deleting it. The privacy basis for retaining IP for the full audit-retention period should be documented, and privacy notices/data-processing agreements may need updates.

Logging exposure risk increases if actor IP is copied into metadata or error messages. Existing relay and dispatcher logging intentionally avoid raw payload fragments; keep that pattern. Do not log raw request bodies, raw headers, full forwarded-chain headers, or raw audit metadata containing IP addresses.

Trust-boundary risk exists around `X-Forwarded-For` and similar headers. A client can spoof these unless Express is configured with a trusted proxy policy that matches deployment. Capture the normalized client IP from a trusted source, and store only the selected client IP, not the full proxy chain.

Access-control risk increases for audit read APIs. `audit:read` already requires tenant and resource-level authorization; actor IP should remain behind that same authorization and should not be exposed through notification APIs unless product explicitly requires it.

Data-minimization risk exists if the system stores IP in both first-class columns and metadata/snapshots. Store it once as `actorIpAddress`, avoid including it in snapshots, and redact duplicate IP-like fields from metadata unless a specific compliance requirement says otherwise.

Operational risk includes inconsistent IP formats between IPv4, IPv6, loopback, private ranges, and proxied requests. Validate a bounded string format, normalize obvious Express forms such as IPv4-mapped IPv6 if desired, and set a conservative max length.

## Recommended Implementation Approach and Sequencing

1. Confirm product/API contract details before implementation: whether the persisted value should be `milestone.reopened` or uppercase `MILESTONE_REOPENED`, whether actor IP is visible in audit API responses, and which roles may reopen milestones.
2. Add database migrations first. Add nullable `actorIpAddress` columns to `milestone_outbox_events` and `audit_events`, and update `docs/MIGRATIONS.md` with rollout and historical-null behavior.
3. Add typed schema support. Extend the outbox and audit Drizzle/Zod models, relay row validation, repository insert/read mapping, and audit event filter enum for the new event type.
4. Add a shared request-IP extraction helper or controller-level function that uses Express trusted proxy configuration. Keep tenant/user identity from JWT only; IP is request metadata, not authorization input.
5. Add the milestone reopen operation as a separate service method and route. Enforce `closed -> open`, reject reopening an already-open milestone with `ConflictError`, write before/after snapshots, `changedFields: ['status']`, and a `milestone.reopened` outbox event with actor IP.
6. Confirm notification fanout requires no event-specific branch. The dispatcher should pick up the new audit event automatically; add tests proving reopened events produce notifications and replay does not duplicate them.
7. Update audit read tests for the actor IP field and `eventType=milestone.reopened` filtering. Add negative tests for unauthorized audit access and cross-tenant attempts to infer IP-bearing records.
8. Update README and generated OpenAPI source when tooling exists. Until OpenAPI tooling is added, update the interim endpoint table and document the OpenAPI gap honestly.
9. Validate with `npm run typecheck`, `npm run lint`, `npm test`, and targeted formatting checks. If the known CRLF-vs-LF formatting issue still appears, avoid repo-wide reformatting and document it separately.

## Rollout Notes

The schema change should be deployed before application code that writes actor IP. Because both new columns are nullable, old workers can continue reading/writing during migration, and historical rows remain valid.

If multiple app versions run concurrently, the relay should tolerate outbox rows with `actorIpAddress: null` until all writers are upgraded. The audit API should document that older events can return `null` for actor IP.

No audit backfill is recommended. Existing immutable audit entries should remain unchanged, and existing notification rows do not need modification.

## Open Questions

- Should the externally documented event type be uppercase `MILESTONE_REOPENED`, lower-dot `milestone.reopened`, or both with a mapping layer?
- Should actor IP be returned in all audit read responses, only to admins, or stored but hidden from API responses by default?
- Which roles receive `milestones:reopen`, and is it semantically tied to `milestones:close`?
- What trusted proxy configuration will production use, and which header/source is authoritative for client IP?
- Does the seven-year audit retention policy explicitly cover IP addresses under the applicable privacy regime?

## How Copilot Assisted This Analysis

Prompt submitted to Copilot:

```text
Scope Change — Impact Analysis:
Midway through the sprint, the product team issuesthe following change request:
"Add a new milestone event type:
MILESTONE_REOPENED
. Thisshould trigger audit logging and notifications. Audit entries must now also capture theactor's IP address."
Before touching any code, document your impact analysis in
IMPACT_ANALYSIS.md
:
Every file, module, and data model affected, and the nature of each change (additive,breaking, migration required)
Security and compliance risks introduced by capturing IP addresses (privacy, dataretention, logging exposure)
Recommended implementation approach and sequencing
A section:
"How Copilot Assisted This Analysis"
— what you prompted, what itproduced, and where you had to validate or override its output
```

Copilot inspected the local milestone, outbox, audit, notification, migration, README, and prompt-log files, then produced this impact-analysis document.

Validation performed by the agent:

- Verified the current event-type schema in `src/projects/milestone-outbox.model.ts` and `src/notifications/audit-event.model.ts` before naming the required enum/filter changes.
- Verified the relay path in `src/notifications/audit-relay.ts` and outbox reader in `src/notifications/milestone-outbox.reader.ts` before concluding that actor IP must be carried through the outbox for asynchronous audit logging.
- Verified notification dispatch is sourced from `audit_events` in `src/notifications/notification-dispatch.repository.ts`, so the new event type should fan out without a dispatcher branch once it reaches the audit store.
- Verified controllers currently construct actor context only from authenticated JWT fields, so request-IP capture needs new HTTP-boundary logic and must not affect tenant identity.

Agent judgment applied or overridden:

- Interpreted the product's uppercase `MILESTONE_REOPENED` label as likely mapping to the repo's existing lower-dot event naming convention, rather than recommending a breaking rename of existing event values.
- Recommended first-class nullable `actorIpAddress` columns instead of hiding IP inside metadata, because audit entries now require a specific actor IP attribute and historical rows must remain valid.
- Recommended not backfilling or mutating historical audit rows, preserving the existing append-only audit guarantee.
