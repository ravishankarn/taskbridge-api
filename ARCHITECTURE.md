# Architecture

Project Service owns project and milestone state; Notification & Audit Service reacts to milestone lifecycle events.
Their integration contract is the durable `milestone_outbox_events` stream with stable `eventId`, tenant ID, actor ID, entity IDs, event type, timestamp, and before/after snapshots.
The Project Service writes milestone state changes and outbox events transactionally; Notification & Audit consumes those events idempotently.
Inbound REST requests enter Express routes, pass JWT authentication and RBAC middleware, then reach controllers for HTTP concerns.
Controllers validate request shapes and delegate business rules to services, which use token-derived tenant context only.
Services call repositories for tenant-scoped persistence; repositories own Drizzle/SQLite access and parameterized queries.
Milestone mutations persist project data first, append an outbox event, then the relay writes immutable audit rows and queued notifications.
Audit records are append-only and keyed for tenant, entity, event type, timestamp, and event ID replay protection.
Notification dispatches are persisted separately so retries can resume without duplicating user-visible notifications.
This architecture fits multi-tenant B2B SaaS because tenancy and authorization are enforced before business logic and again in repository queries.
The outbox boundary favors reliability and compliance traceability over lower-latency in-process coupling, which is the central trade-off.
The main trade-off is eventual consistency for notifications and audit projection, accepted to gain idempotency, retry safety, and service separation.
