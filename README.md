# taskbridge-api

## Purpose
TaskBridge API is a backend service for managing projects and (eventually) sending
notifications/audit events related to task and project activity. This repository is currently
a scaffold: the Project domain has inherited, unreviewed code, and the Notification & Audit
Service has not been implemented yet.

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
│   ├── notifications/             # Intentionally empty — not yet implemented
│   ├── app.ts                     # Express app factory
│   └── index.ts                   # Process entrypoint
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
npm run dev             # start the dev server with hot reload
```

Other useful scripts:
```bash
npm run build            # compile TypeScript to dist/
npm start                 # run the compiled build
npm run typecheck         # tsc --noEmit
npm run lint              # ESLint
npm run format             # Prettier write
npm run test:unit          # Jest unit tests (tests/**/*.test.ts)
npm run test:integration    # Jest integration tests (tests/**/*.integration.test.ts)
```

## Environment variables
See [.env.example](.env.example) for the full list with defaults:

| Variable | Description |
| --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | HTTP port the server listens on |
| `JWT_SECRET` | Secret used to sign/verify JWTs (required, no default) |
| `JWT_EXPIRES_IN` | JWT expiration duration (e.g. `1h`) |
| `DATABASE_FILE` | Path to the SQLite database file |
| `LOG_LEVEL` | Winston log level (`error`, `warn`, `info`, `http`, `debug`) |