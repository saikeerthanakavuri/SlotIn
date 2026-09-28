# Recommended Implementation Choices

Status: recommendation for the first implementation. These tools are not installed or configured yet.

## Application

- **Next.js App Router + TypeScript** for the student/admin UI and same-origin backend routes. Keep one application deployment while the product is small; split services only if measured workload or team ownership requires it.
- **Tailwind CSS** for styling.
- **Zod** for validating route input and environment configuration at runtime.

## Authentication and Google Calendar

- **Auth.js with the Google provider** for app sign-in and session management.
- Use a separate server-side Google OAuth authorization-code flow to request Calendar consent and offline access. Keep Calendar refresh tokens encrypted in PostgreSQL; never return them to the browser.
- Use Google's official **`googleapis` Node.js client** for Calendar operations.
- Create each student's calendar event only after team assignment is published. Keep one provider event ID per assigned user/event. On SlotIn event removal, queue deletion and retain a soft-delete tombstone until provider cleanup finishes.

Separating sign-in from Calendar authorization lets students use SlotIn without Calendar access and makes the extra permission request clear.

## Database

- **Neon PostgreSQL** as the managed database.
- **Prisma ORM** for schema, typed queries, and migrations.
- Use PostgreSQL transactions and uniqueness constraints for registration, team publication, and outbox records.

Neon is recommended because the app needs relational constraints and managed PostgreSQL, and this avoids adopting a second authentication system from a database platform.

## Background work

- **Inngest** for deadline triggers, team assignment, Calendar create/update/delete, and notifications. Its Next.js integration supports durable background functions and retries.
- Keep a PostgreSQL **outbox** as the source of truth for pending external work. Dispatch outbox records idempotently to Inngest so committing a registration/assignment cannot lose a job if event dispatch fails.
- Use deterministic job keys and provider event IDs where possible; record attempts and final sync state in PostgreSQL.

## Team assignment

- Start with a deterministic **bounded backtracking solver with pruning** and a separate assignment verifier, since event sizes are not yet known.
- Benchmark against a stated maximum expected registration count before release. If solving exceeds the time budget, run **Google OR-Tools CP-SAT** in a dedicated Python worker rather than making the Next.js request wait.
- Preserve the constraints independently of the solver: team size >= 3 and <= admin-configured maximum, no prior teammate pair, all registrants assigned, balanced sizes where possible.

## Hosting and tests

- **Vercel** for the Next.js application and Inngest endpoint.
- **Vitest** for unit/integration tests; **Playwright** for end-to-end browser tests.
- Use separate local, staging, and production databases and Google OAuth clients.

## Decisions to confirm before implementation

- Maximum supported admin-configured team size.
- Expected peak registrations per event and assignment time limit.
- Calendar token encryption/key rotation mechanism and retention policy.
- Exact Auth.js session strategy and whether app access is limited to an email-domain allowlist.
