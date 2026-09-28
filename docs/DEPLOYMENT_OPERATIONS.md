# Deployment and Operations

Proposed hosting: Next.js app on Vercel and managed PostgreSQL on Neon or Supabase. Reassess providers after estimating traffic, cost, background-job needs, and data-region requirements.

## Environments

Maintain separate local, staging, and production environments with separate databases and Google OAuth credentials. Do not use real student data in local/staging without authorization.

## Configuration

Store secrets in the hosting provider's secret manager, never in source control. Expected configuration includes:

- `DATABASE_URL` and (if required by provider/ORM) a direct migration connection URL.
- Google OAuth client ID, client secret, and allowed redirect URLs.
- Session/JWT signing secret.
- Encryption key for Calendar refresh tokens, managed and rotated using a documented process.
- App base URL, environment name, and any notification provider credentials.
- Background worker/queue configuration if using an external job service.

## Database and release process

1. Review schema changes and generate migrations.
2. Apply migrations to staging and verify compatibility.
3. Back up production before risky migrations; prefer additive migrations and a separate cleanup release.
4. Deploy the app and background worker/cron handler together with compatible schema.
5. Confirm health check, database connectivity, OAuth callback, scheduler, and job processing.

## Background work

Deadline closure, team assignment, post-assignment Calendar creation/deletion, calendar updates, and notifications must be retryable and idempotent. **Recommendation: use Inngest** for scheduled and durable background functions alongside Next.js, while retaining the database outbox as the source of pending integration work. Scheduler should enqueue due work; it should not rely on a student keeping a browser open. Protect scheduled endpoints with a secret and prevent overlapping duplicate runs.

## Observability

- Structured logs with request/job IDs, event IDs, and registration IDs; never log access/refresh tokens.
- Metrics for registration errors, deadline-job lateness, assignment duration/failures, queue depth, Calendar sync success/failure, and retries.
- Alerts for stuck jobs, recurring Calendar auth failures, assignment failures, and database availability.
- Admin-visible audit trail for event changes, assignment reruns, and exceptions.

## Backups and recovery

- Enable managed database backups and define retention and recovery-point objectives.
- Periodically verify restore procedure in a non-production environment.
- Keep team rosters and assignment audit records; do not rely solely on derived caches for teammate history.
- Document handling for Google API outage, token-key rotation, and failed migration rollback.

## Privacy and access

- Apply role checks on every server mutation and data read.
- Minimize stored student data and define account deletion/retention behavior.
- Restrict admin exports and record access where appropriate.
- Ensure production TLS, secure cookies, CSRF/state protection, and dependency/security update process.
