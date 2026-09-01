# taskbridge-api

## Purpose

TaskBridge API is a backend service for managing projects and for notifying teams about milestone
changes while keeping an immutable audit trail for compliance. The Project domain contains
inherited, unreviewed code; the Notification & Audit Service is implemented under
`src/notifications/`.

## Technology stack

- Node.js 20+
- TypeScript (strict mode)
- Express
- SQLite via `better-sqlite3`
- Zod (runtime validation)
- Winston (logging)
- JSON Web Tokens (`jsonwebtoken`)
- Jest (unit & integration testing)
- ESLint + Prettier (linting & formatting)

## Directory structure

```
taskbridge-api/
├── .github/
│   └── copilot-instructions.md   # Repo-specific AI agent instructions
├── src/
│   ├── config/                   # Env validation (Zod) and Winston logger
│   ├── middleware/                # Express middleware (JWT auth, etc.)
│   ├── projects/                  # INHERITED, UNREVIEWED — see note below
│   │   ├── project.model.ts
│   │   └── project.service.ts
│   ├── notifications/             # Notification & Audit Service (audit store, relay, notifications)
│   ├── shared/                    # Errors, response helpers, permissions, redaction
│   ├── app.ts                     # Express app factory
│   └── index.ts                   # Process entrypoint (HTTP server + background processor)
├── docs/
│   └── MIGRATIONS.md              # Schema/migration notes
├── tests/                         # Unit (*.test.ts) and integration (*.integration.test.ts) tests
├── .env.example
├── package.json
└── README.md
```

> **Note:** `src/projects/` was inherited from an upstream AI-assisted contribution and has not
> undergone architecture or security review. It is scaffolded as-is and is pending a future
> review — see [.github/copilot-instructions.md](.github/copilot-instructions.md).

## Setup

```bash
npm install
cp .env.example .env   # then fill in real values
npm run db:init         # generate initial SQLite database
npm run dev             # start the dev server with hot reload
```

Other useful scripts:

```bash
npm run build            # compile TypeScript to dist/
npm start                 # run the compiled build
npm run db:init           # initialize local SQLite database
npm run typecheck         # tsc --noEmit
npm run lint              # ESLint
npm run format             # Prettier write
npm run test:unit          # Jest unit tests (tests/**/*.test.ts)
npm run test:integration    # Jest integration tests (tests/**/*.integration.test.ts)
```

## Environment variables

See [.env.example](.env.example) for the full list with defaults:

| Variable                          | Description                                                               |
| --------------------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`                        | `development` \| `test` \| `production`                                   |
| `PORT`                            | HTTP port the server listens on                                           |
| `JWT_SECRET`                      | Secret used to sign/verify JWTs (required, no default)                    |
| `JWT_EXPIRES_IN`                  | JWT expiration duration (e.g. `1h`)                                       |
| `DATABASE_FILE`                   | Path to the SQLite database file                                          |
| `LOG_LEVEL`                       | Winston log level (`error`, `warn`, `info`, `http`, `debug`)              |
| `NOTIFICATION_PROCESSING_ENABLED` | `true`/`false`; runs the audit relay + notification dispatcher in-process |
| `NOTIFICATION_POLL_INTERVAL_MS`   | Poll interval for background processing (default `5000`)                  |
| `NOTIFICATION_BATCH_SIZE`         | Rows drained per stage per tick (default `100`)                           |

## Authenticated endpoints

All endpoints require a bearer JWT whose claims include `userId`, `tenantId`, and `role`. Tenant
scope is always derived from the token, never from the request.

| Method & path                                                    | Permission                | Notes                                                                          |
| ---------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `GET /health`                                                    | none                      | Liveness probe                                                                 |
| `POST /api/v1/projects`                                          | `projects:create`         |                                                                                |
| `GET /api/v1/projects/team/:teamId`                              | `projects:read`           |                                                                                |
| `GET /api/v1/projects/:id`                                       | `projects:read`           |                                                                                |
| `PATCH /api/v1/projects/:id/status`                              | `projects:update`         |                                                                                |
| `DELETE /api/v1/projects/:id`                                    | `projects:delete`         |                                                                                |
| `POST /api/v1/projects/:projectId/milestones`                    | `milestones:create`       | Also writes an outbox event                                                    |
| `GET /api/v1/projects/:projectId/milestones`                     | `milestones:read`         |                                                                                |
| `GET /api/v1/projects/:projectId/milestones/:milestoneId`        | `milestones:read`         |                                                                                |
| `PATCH /api/v1/projects/:projectId/milestones/:milestoneId`      | `milestones:update`       |                                                                                |
| `POST /api/v1/projects/:projectId/milestones/:milestoneId/close` | `milestones:close`        |                                                                                |
| `POST /api/v1/projects/:projectId/members`                       | `projects:members:manage` |                                                                                |
| `GET /api/v1/projects/:projectId/members`                        | `projects:members:read`   |                                                                                |
| `DELETE /api/v1/projects/:projectId/members/:userId`             | `projects:members:manage` |                                                                                |
| `GET /api/v1/audit-events`                                       | `audit:read`              | Filters: `projectId`, `entityId`, `eventType`, `from`, `to`, `limit`, `cursor` |
| `GET /api/v1/audit-events/:eventId`                              | `audit:read`              |                                                                                |
| `GET /api/v1/notifications`                                      | `notifications:read`      | Caller's own notifications; filters: `status`, `projectId`, `limit`, `cursor`  |
| `POST /api/v1/notifications/:id/read`                            | `notifications:read`      | Idempotent; owner only                                                         |

Audit reads are additionally constrained at the resource level: admins see the whole tenant, while
managers only see audit events for projects they are a member of. Notification reads and writes are
scoped to the calling user in SQL, so another user's or tenant's notification is reported as not
found rather than forbidden.

Responses use the shared envelope `{ "success": true, "data": ... }`, and errors use
`{ "success": false, "error": { "code", "message" } }`. List endpoints return keyset pagination
(`{ items, pagination: { limit, hasMore, nextCursor } }`) with no total count.

## How relay and dispatcher processing works

Milestone changes are never published inline. Each mutation writes the milestone row and a
`milestone_outbox_events` row in one transaction, and two background stages drain that work:

1. **Audit relay** reads unpublished outbox rows, redacts and size-checks the snapshots and
   metadata, writes an `audit_events` row keyed by the outbox `eventId`, and marks the outbox row
   published — all in one transaction.
2. **Notification dispatcher** finds `audit_events` rows with no `notification_dispatch_state` row,
   resolves recipients from `project_members` for that tenant and project, inserts one `notifications`
   row per recipient, and writes the dispatch marker — all in one transaction.

Both stages are idempotent and safe to replay: the audit primary key is the outbox `eventId`, and
`notifications` has a unique index on `(eventId, recipientUserId, channel)`. Because the dispatcher
keys off `audit_events` rather than `publishedAt`, events audited before the dispatcher existed are
still delivered exactly once.

`NotificationProcessor` runs both stages on a poll interval with non-overlapping ticks, an unref'd
timer, and idempotent `start()`/`stop()`. It is started from `src/index.ts` when
`NOTIFICATION_PROCESSING_ENABLED` is `true`, and stopped on `SIGINT`/`SIGTERM` before the HTTP
server and database connection close. Set the flag to `false` to run the API without workers (for
example when running multiple instances against one SQLite file), and drive `runOnce()` manually.

## API documentation gap

OpenAPI documents are **not** committed. The repository has no OpenAPI tooling configured, and the
project convention is to generate specs from the code rather than maintain hand-written copies that
silently drift. The endpoint table above is the interim contract reference. Adding generated
OpenAPI output is tracked as follow-up work and should land with the tooling, not before it.

## Database and migrations

Schema is created idempotently at startup and by `npm run db:init`. See
[docs/MIGRATIONS.md](docs/MIGRATIONS.md) for table-by-table notes on `audit_events`,
`notifications`, and `notification_dispatch_state`.
