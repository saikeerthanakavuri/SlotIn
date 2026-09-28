# Proposed Data Model

PostgreSQL is the proposed source of truth. Names are conceptual and can be adapted to the chosen ORM conventions.

## Entities

### User

- `id` (primary key)
- `googleSubject` (unique stable Google account identifier)
- `name`, `email`, `photoUrl`
- `role` (`admin` or `student`)
- `createdAt`, `updatedAt`

Do not use email as the permanent identity key; email can change. Keep OAuth credentials in a separate protected record.

### Event

- `id`, `activityName`, `description`
- `startsAt`, `endsAt` (UTC instants)
- `timeZone` (IANA zone used to display event time)
- `registrationDeadline` (UTC instant)
- `minTeamSize` (fixed at 3), `maxTeamSize` (admin configured; must be >= 3)
- `status` (`draft`, `registration_open`, `registration_closed`, `assigning`, `assigned`, `needs_admin_review`, `cancelled`, `removed`, `archived`)
- `createdByUserId`, `createdAt`, `updatedAt`
- Optional `assignmentVersion` for tracking reruns

### Registration

- `id`, `userId`, `eventId`
- `status` (`registered`, `withdrawn`)
- `registeredAt`, `withdrawnAt`
- Unique constraint on `(userId, eventId)`

### Team

- `id`, `eventId`, `assignmentVersion`, `createdAt`
- `members` represented by TeamMember rows

### TeamMember

- `teamId`, `userId`
- Unique constraint on `(teamId, userId)`
- A user belongs to at most one team per event assignment version.

### CalendarConnection

- `userId` (unique), encrypted `refreshToken`, granted `scopes`, `connectedAt`, `lastRefreshedAt`, `revokedAt`
- Never expose token fields in API responses or logs.

### CalendarSync

- `id`, `userId`, `eventId` (unique pair for each assigned user's calendar sync), `provider` (`google`)
- `providerEventId`, `status` (`not_connected`, `pending`, `synced`, `needs_reauthorization`, `delete_pending`, `deleted`, `failed`)
- `attemptCount`, `lastAttemptAt`, `lastErrorCode`, `syncedAt`
- Use a stable idempotency key derived from registration/event identity when creating the provider event.

### OutboxJob (or equivalent queue record)

- `id`, `type`, `aggregateId`, JSON payload, `status`, `attemptCount`, `availableAt`, `lockedAt`, `lastErrorCode`, timestamps
- Used to retry team assignment, post-assignment Calendar sync/deletion, and notifications without losing work between a database commit and an external API call.

### EventSuggestion

- `id`, `suggestedByUserId`, `activityName`, `description`, `preferredDate`, `status`, `reviewedByUserId`, timestamps

## Teammate history

Completed team rosters are the source of truth. Two users count as previous teammates if they both appear in the same team for a completed event. Do not infer a pairing from event registrations alone. A materialized pair table may be added later for performance, but it must be rebuildable from rosters.

## Important constraints

- Unique registration per user/event.
- Team membership only references valid users and teams.
- Team belongs to exactly one event assignment version.
- Published assignment is all-or-nothing for an event version.
- Keep a removed-event tombstone until all provider deletion jobs complete; do not hard-delete data needed for cleanup/audit.
- Keep UTC instants and the IANA time zone; avoid storing ambiguous local timestamps.
