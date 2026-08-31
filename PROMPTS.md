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
