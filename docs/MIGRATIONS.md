# Migration notes

Schema is applied idempotently (`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`) by
`npm run db:init` and on application startup. There is no down-migration path: the audit store is
append-only, so rollbacks are handled by leaving the tables in place.

Order matters. The Project Service migrations (`migrateAllSchemas`) must run before the
notification migrations, because the audit relay reads `milestone_outbox_events` and the dispatcher
resolves recipients from `project_members`.

| Migration function           | Module                                       | Creates                                                                |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `migrateAllSchemas`          | `src/projects/project.database.ts`           | `projects`, `milestones`, `milestone_outbox_events`, `project_members` |
| `migrateAuditEventsSchema`   | `src/notifications/notification.database.ts` | `audit_events` (+ immutability triggers)                               |
| `migrateNotificationsSchema` | `src/notifications/notification.database.ts` | `notifications`, `notification_dispatch_state`                         |

## `audit_events`

Append-only compliance history. One row per audited domain event.

- Primary key is `eventId`, **reused from `milestone_outbox_events.eventId`**. This is the
  idempotency mechanism: replaying a relay batch collides on the primary key instead of inserting a
  duplicate.
- Snapshots are stored as JSON text in `beforeState` / `afterState`, with `changedFields` and
  `metadata` alongside. All three are redacted before write and rejected above 1 MiB.
- Immutability is enforced in the database by two triggers, `audit_events_block_update` and
  `audit_events_block_delete`, which `RAISE(ABORT, ...)`. The repository intentionally exposes no
  update or delete method. Correct a business event by appending a compensating event.
- Indexes: `(tenantId, occurredAt)`, `(tenantId, entityId)`, `(tenantId, projectId, occurredAt)` —
  sized for tenant-scoped history queries and the resource-level project filter.
- Retention is seven years. Tenant deletion must archive this table offline rather than delete it;
  no archival job exists yet.

### Backfill

None required. The relay picks up any `milestone_outbox_events` row whose `publishedAt` is null, so
outbox rows written before this table existed are audited on the first run.

## `notifications`

One row per recipient per delivered event.

- `UNIQUE (eventId, recipientUserId, channel)` is the duplicate guard and is required, not
  advisory. Dispatch relies on the database rejecting the second insert rather than on an
  application-side existence check.
- Index `(tenantId, recipientUserId, createdAt)` backs the owner-scoped keyset list query.
- `channel` currently only ever holds `in_app`. The column is deliberately not an enum so adding
  `email` later does not require a table rebuild in SQLite.
- `status` is `unread` | `read`; `readAt` is null until the owner marks it read.

## `notification_dispatch_state`

Fan-out progress marker, one row per audit event.

- Primary key `eventId`. Written **inside the same transaction** as the notification inserts for that
  event, so an event can never be marked complete while any of its notifications are missing. A
  crash mid-fan-out rolls back both, and the event is retried on the next tick.
- Pending work is an anti-join: `audit_events LEFT JOIN notification_dispatch_state ... WHERE
notification_dispatch_state.eventId IS NULL`. This is deliberately independent of
  `milestone_outbox_events.publishedAt`, which the audit relay already consumes — keying off
  `publishedAt` would silently skip every event audited before the dispatcher existed.
- `recipientCount` is recorded for observability only; it is not used for control flow.

### Backfill

None required. Every existing `audit_events` row is treated as pending until it has a marker, so
enabling the dispatcher against an existing database drains the whole audit backlog on first run.
Operators who do **not** want that backlog delivered should insert marker rows for the historical
events before enabling `NOTIFICATION_PROCESSING_ENABLED`.
