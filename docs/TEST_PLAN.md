# Test Plan

Tests verify user-visible rules, database constraints, external API failure handling, and role enforcement. Use a fake Google Calendar client in automated tests; keep a separate manual integration checklist for a test Google account.

## Recommended tools

- Vitest for unit and integration tests.
- Playwright for browser-level student/admin flows.
- PostgreSQL test database for transaction, uniqueness, and concurrency behavior.

## Unit tests

- Event validation: deadline before start, invalid time zone, end before start, minimum team size 3, and admin maximum >= 3.
- Teammate conflict graph derives pairs only from shared completed teams.
- Solver/verifier: valid groupings, no repeat pairs, size boundaries, impossible counts, deterministic tie-breaks, and resource-limit distinct from proven infeasibility.
- Calendar payload contains correct summary, dates, time zone, and assigned team details.
- Error mapping hides provider secrets and internal exceptions.

## Integration tests

- Registration is unique per student/event under concurrent requests.
- Closed/deadline-passed/removed events reject registration.
- Assignment transaction and Calendar outbox jobs are atomic.
- Calendar API is not called before a successful assignment is published.
- Failed Calendar API call does not roll back assignment and remains retryable.
- Calendar job retry does not create duplicates after timeout/uncertain success.
- Removing an event enqueues deletion for every synced assigned user's calendar event; deletion retry is safe.
- OAuth callback rejects invalid state and stores credentials encrypted.
- Revoked credentials mark sync for reauthorization without repeated retries.
- Assignment persistence publishes all teams atomically or none.
- Admin-only routes reject student sessions; student endpoints do not leak other students' private data.

## End-to-end scenarios

1. Student registers; no Google Calendar event is created while assignment is pending.
2. A valid assignment publishes; exactly one event is created on each connected assigned student's primary calendar.
3. Student without Calendar connection is assigned successfully; UI shows not connected, and connecting later syncs the assigned event.
4. Concurrent duplicate registration creates one registration; assignment later creates one calendar event.
5. Calendar is unavailable after assignment; assignment remains published, sync is pending/failed, then retry syncs once.
6. Registration deadline passes; late registration is blocked and team assignment starts once.
7. For a compatible roster, teams have at least 3 members, do not exceed the admin maximum, and contain no past teammate pair.
8. For impossible constraints, no assignment is published and admin gets actionable diagnostics.
9. Event details change after assignment; connected students' calendar entries update.
10. Admin removes an event; matching Google Calendar entries are deleted, retrying if Google is unavailable.

## Manual release checklist

- Test OAuth consent with fresh and previously authorized accounts.
- Verify production redirect URI and Google API configuration.
- Confirm event times and time zones display correctly in Google Calendar.
- Verify admin review, retry, disconnect, and event removal UX.
