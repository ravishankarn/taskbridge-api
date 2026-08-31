# Notification & Audit Service Specification

## 1. Purpose and Scope

The Notification & Audit Service consumes trusted project-milestone events, creates one immutable audit entry per business event, and delivers one notification per authorized recipient. It supports tenant-scoped audit-history queries by project, event type, and UTC date range.

This specification defines the service to be introduced under `src/notifications/`. It does not change the inherited Project Service. The current Project Service has project create and status-update operations only; it has no milestone model, membership lookup, outbox, or event contract. Those capabilities are required integration work before the services can be connected.

## 2. Architecture

The REST path is `controller -> service -> repository -> database`. Event intake uses the same service and repository layer, not a controller shortcut. Shared authentication, error responses, logging, validation, and permission types remain in `src/shared/`.

The Project Service is the authoritative owner of milestone state. It commits its milestone mutation and an event-outbox record in one database transaction. A relay publishes each outbox record to this service and retries until it receives a successful acknowledgement. The audit service stores the event receipt, audit record, and notification jobs transactionally; delivery occurs asynchronously and is retried separately.

## 3. Data Models

All identifiers are UUID strings. All timestamps are ISO 8601 UTC strings. In SQLite, UUIDs, timestamps, JSON values, and enums are stored as `TEXT`; boolean values are stored as `INTEGER` (`0` or `1`). JSON is serialized before persistence and validated before use.

### Milestone Event (integration payload)

| Field           | Type                                                               | Rules                                                                              |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `eventId`       | `string` (UUID)                                                    | Stable producer-assigned idempotency key.                                          |
| `eventType`     | `'milestone.created' \| 'milestone.updated' \| 'milestone.closed'` | Immutable business-event name.                                                     |
| `occurredAt`    | `string` (ISO 8601 UTC datetime)                                   | Time the Project Service committed the change.                                     |
| `tenantId`      | `string` (UUID)                                                    | Derived by the producer from its authenticated actor; never from a client request. |
| `projectId`     | `string` (UUID)                                                    | Must belong to `tenantId`.                                                         |
| `milestoneId`   | `string` (UUID)                                                    | Must belong to `projectId`.                                                        |
| `actorId`       | `string` (UUID)                                                    | Authenticated user that caused the change.                                         |
| `before`        | `Record<string, JSON value> \| null`                               | `null` for creation; redacted milestone state before the mutation.                 |
| `after`         | `Record<string, JSON value> \| null`                               | Redacted milestone state after the mutation.                                       |
| `changedFields` | `string[]`                                                         | Unique, non-empty field paths for update/close events; empty only for creation.    |
| `metadata`      | `Record<string, JSON value>`                                       | Optional non-sensitive context such as correlation ID.                             |

### Event Receipt

| Field         | Type                             | Rules                                                                         |
| ------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `eventId`     | `string` (UUID)                  | Primary key; exactly one receipt per source event.                            |
| `tenantId`    | `string` (UUID)                  | Indexed with receipt timestamp.                                               |
| `payloadHash` | `string`                         | SHA-256 hash of canonical validated payload, excluding transport credentials. |
| `receivedAt`  | `string` (ISO 8601 UTC datetime) | Set by this service.                                                          |

A repeated `eventId` with the same `payloadHash` is acknowledged without new writes. The same `eventId` with a different hash is rejected with `409 EVENT_ID_PAYLOAD_MISMATCH` and logged without its payload.

### Audit Entry

| Field           | Type                             | Rules                                                    |
| --------------- | -------------------------------- | -------------------------------------------------------- |
| `id`            | `string` (UUID)                  | Server-generated primary key.                            |
| `eventId`       | `string` (UUID)                  | Unique; references the event receipt.                    |
| `tenantId`      | `string` (UUID)                  | Token-derived producer tenant; indexed.                  |
| `projectId`     | `string` (UUID)                  | Indexed with `tenantId`.                                 |
| `entityType`    | literal `'milestone'`            | The audited entity kind.                                 |
| `entityId`      | `string` (UUID)                  | Milestone ID; indexed with `tenantId`.                   |
| `eventType`     | milestone-event enum             | Indexed with `tenantId`.                                 |
| `actorId`       | `string` (UUID)                  | User responsible for the change.                         |
| `occurredAt`    | `string` (ISO 8601 UTC datetime) | Producer event time, indexed descending with `tenantId`. |
| `recordedAt`    | `string` (ISO 8601 UTC datetime) | Time this service persisted the entry.                   |
| `beforeState`   | `JSON object \| null`            | Validated/redacted snapshot.                             |
| `afterState`    | `JSON object \| null`            | Validated/redacted snapshot.                             |
| `changedFields` | `JSON string[]`                  | Validated changed field paths.                           |
| `metadata`      | `JSON object`                    | Non-sensitive operational context only.                  |

There are no update or delete repository methods, REST routes, or database permissions for audit entries. Corrections append a separately authorized compensating business event that identifies the original `eventId` in metadata. Audit rows are retained seven years; tenant deletion archives tenant-scoped audit data offline rather than deleting it.

### Notification Job

| Field             | Type                                     | Rules                                                        |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `id`              | `string` (UUID)                          | Server-generated primary key.                                |
| `eventId`         | `string` (UUID)                          | Source event.                                                |
| `tenantId`        | `string` (UUID)                          | Tenant scope.                                                |
| `recipientId`     | `string` (UUID)                          | Authorized recipient resolved for the event.                 |
| `channel`         | `'in_app' \| 'email'`                    | Delivery channel; future channels require an enum migration. |
| `payload`         | `JSON object`                            | Minimal notification content; no tokens or full snapshots.   |
| `status`          | `'pending' \| 'delivered' \| 'failed'`   | Delivery state.                                              |
| `attemptCount`    | `integer`                                | Starts at zero; incremented on each attempted delivery.      |
| `nextAttemptAt`   | `string` (ISO 8601 UTC datetime)         | Retry schedule.                                              |
| `deliveredAt`     | `string \| null` (ISO 8601 UTC datetime) | Set only on success.                                         |
| `lastFailureCode` | `string \| null`                         | Sanitized provider/error category.                           |
| `createdAt`       | `string` (ISO 8601 UTC datetime)         | Job creation time.                                           |

The unique key `(eventId, recipientId, channel)` prevents duplicate user-visible notifications. Delivery retries use bounded exponential backoff; a terminal failure remains auditable as `failed` and does not create a second audit entry.

## 4. API Contracts

All successful REST responses use `{ "success": true, "data": ... }`. Expected errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`. Errors are `400 VALIDATION_ERROR`, `401 AUTHENTICATION_ERROR`, `403 AUTHORIZATION_ERROR`, `404 NOT_FOUND`, or `409 CONFLICT` unless stated otherwise.

### `POST /api/v1/internal/milestone-events`

This is an internal, service-to-service endpoint, not a browser or public-client API. It authenticates the Project Service workload identity. Its tenant scope is established from that identity and must equal the validated payload `tenantId`; a mismatch is rejected with `403 AUTHORIZATION_ERROR`.

Request body is a `Milestone Event` object from section 3.

New event response (`202`):

```json
{
  "success": true,
  "data": {
    "eventId": "d0fd3e49-1dca-4c9b-ae3a-5078ab14daaf",
    "auditEntryId": "f3ce49a8-68b5-48d1-a459-8b0dd1995523",
    "notificationJobsCreated": 4,
    "duplicate": false
  }
}
```

Duplicate response (`200`) has the same shape with `duplicate: true` and the original `auditEntryId`; it creates no audit row or notification job.

### `GET /api/v1/audit-history`

Requires a verified user JWT and the `audit:read` permission. The repository query always filters on `req.auth.tenantId`; clients cannot pass a tenant ID.

Query parameters:

| Parameter   | Type                  | Rules                                             |
| ----------- | --------------------- | ------------------------------------------------- |
| `projectId` | UUID string           | Required; tenant-scoped.                          |
| `eventType` | milestone-event enum  | Optional.                                         |
| `from`      | ISO 8601 UTC datetime | Optional, inclusive; requires `to` when supplied. |
| `to`        | ISO 8601 UTC datetime | Optional, exclusive; must be later than `from`.   |
| `limit`     | integer               | Optional, `1..100`; default `50`.                 |
| `cursor`    | opaque string         | Optional cursor from a previous response.         |

Response (`200`):

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "f3ce49a8-68b5-48d1-a459-8b0dd1995523",
        "eventId": "d0fd3e49-1dca-4c9b-ae3a-5078ab14daaf",
        "projectId": "b42b2d9a-16e1-4ce7-92c2-32f5fa1b8a9a",
        "entityType": "milestone",
        "entityId": "57a7fc4c-3d6f-4978-b723-bf111c9a01aa",
        "eventType": "milestone.updated",
        "actorId": "5206496b-221e-4c2d-b60d-57c2ddb29e78",
        "occurredAt": "2026-08-31T12:00:00.000Z",
        "recordedAt": "2026-08-31T12:00:01.000Z",
        "beforeState": { "status": "planned" },
        "afterState": { "status": "active" },
        "changedFields": ["status"],
        "metadata": { "correlationId": "f9f521f2-6d7d-498b-a5a2-91c0c0fec1f8" }
      }
    ],
    "nextCursor": null
  }
}
```

The endpoint returns `404 NOT_FOUND` when the project is absent in the caller's tenant, preventing cross-tenant existence disclosure.

### `GET /api/v1/notifications`

Requires a verified user JWT. Returns the caller's own notification jobs only; no tenant ID or recipient ID query parameter is accepted. This endpoint is optional for the first delivery channel but its response model is the stable client contract.

Query parameters are `status` (`pending|delivered|failed`, optional), `limit` (`1..100`, default `50`), and `cursor` (optional). The response is the standard success envelope with `{ "items": [Notification Job], "nextCursor": "string|null" }`, excluding `lastFailureCode` and provider-specific metadata.

## 5. Project Service Integration Points

1. Add a tenant-scoped milestone aggregate and persistence model to the Project Service. Milestone mutations must authorize the actor before the mutation and use the verified JWT tenant ID.
2. In the same transaction as each created, updated, or closed milestone, write an outbox event matching `Milestone Event`. Do not make a synchronous network request from the mutation path.
3. The relay authenticates as the Project Service workload, sends the stable `eventId`, and retries network or `5xx` failures. A `200` duplicate response is successful acknowledgement; `4xx` validation/authentication failures are quarantined for operator remediation.
4. Provide an authorized, tenant-scoped recipient-resolution interface returning user IDs and permitted channels for the project team. The audit service must not query Project Service tables directly or infer membership from client payloads.
5. Project Service validates that `projectId` and `milestoneId` belong to the event tenant before publishing. The audit service repeats structural and identity/tenant checks at its boundary.

Before implementing this connection, perform the required review of `src/projects/` for architecture, security, performance, reliability, and maintainability. The present absence of milestones and an outbox makes direct wiring impossible and intentionally out of scope for this specification.

## 6. Constraints and Validation

- Zod validates every HTTP body, query parameter, path parameter, event payload, and environment value. Strings are trimmed where meaningful; UUIDs and UTC datetimes are strict.
- `before`, `after`, and metadata reject passwords, access/refresh tokens, authorization headers, credentials, and other configured sensitive keys recursively. Each serialized audit snapshot must be at most 1 MiB before persistence.
- Audit-history filters and notification queries are tenant-scoped in SQL using parameterized queries. Authorization occurs before reads, writes, notification creation, export, and history access.
- Define `audit:read` as an explicit permission. Tenant administrators receive it; managers and members require an explicit product authorization decision before grant. Resource membership checks are required in addition to role permission checks.
- Internal event intake applies stricter rate limits and workload authentication. Public surfaces use the configured CORS allowlist, Helmet, request-size limits, and rate limits from repository policy.
- Logs include service, operation, outcome, correlation ID, and tenant ID when available. They never include raw event payloads, snapshots, tokens, recipient contact data, or provider responses containing PII.
- Index audit storage on `(tenantId, occurredAt)`, `(tenantId, projectId, occurredAt)`, and `(tenantId, entityId, occurredAt)`. Index notification jobs on `(status, nextAttemptAt)` and their uniqueness key.
- Required tests cover tenant isolation, RBAC and resource authorization, invalid filters/payloads, immutable repository surface, duplicate events (same and conflicting payload), transaction rollback, retry behavior, no duplicate notifications, sensitive-data redaction, and snapshot-size rejection.

## 7. Copilot Contribution and Engineering Judgment

Copilot assisted with drafting the structure, converting the provided product requirements into typed models and request/response examples, and aligning the API envelopes and JWT concepts with the repository's existing conventions.

The following decisions are explicit engineering judgment applied to complete or correct ambiguities in the product brief:

- Use a transactional outbox and separate delivery jobs so a successful milestone mutation cannot be lost between audit persistence and notification delivery.
- Treat `eventId` plus a payload hash as the idempotency contract; event ID alone cannot detect a producer bug that reuses an ID for different content.
- Make event intake internal and workload-authenticated, while preserving JWT-derived tenant scope for user-facing audit reads. A client-submitted tenant ID is never authoritative.
- Require a recipient-resolution integration instead of assuming that project ownership or team membership alone defines notification eligibility.
- Specify cursor pagination, exclusive `to` ranges, and project-not-found behavior to make history querying stable and avoid cross-tenant metadata disclosure.
- Define the database representation, indexes, snapshot-size enforcement point, retry state, and explicit `audit:read` permission because the brief states the outcomes but not these implementation contracts.

Open decisions for product/security approval before implementation: notification channels and templates, exact recipient eligibility rules, whether actors receive their own notifications, manager/member grants for `audit:read`, workload-identity mechanism, and the operator workflow for permanently failed deliveries.
