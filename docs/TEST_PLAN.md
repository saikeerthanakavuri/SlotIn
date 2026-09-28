# Test Plan

Tests verify user-visible rules, database constraints, external API failure handling, and role enforcement. Use a fake Google Calendar client in automated tests; keep a separate manual integration checklist for a test Google account.

Detailed acceptance cases are organized here:

- [Frontend browser test cases](../testcases/frontendtestcases/FRONTEND_TEST_CASES.md)
- [Backend API and logic test cases](../testcases/backendtestcases/BACKEND_TEST_CASES.md)

These files are test specifications, not executable automated tests. Implement them with Playwright/Vitest as the corresponding application features are built.

## Decisions needed for deterministic tests

The contract defines many expected outcomes, but some product and API choices still need a single, consistent answer. Confirm these before treating affected cases as final pass/fail requirements.

### Participation and dropouts

- What should happen when a student drops out after registration closes or after teams are published: may they self-withdraw, must an admin remove them, can the team be regenerated, and until what cutoff?
- If a roster changes after publication, should the system attempt a new complete assignment, keep the remaining roster as-is, or flag admin review? Define version/audit behavior and whether all affected Calendar events are updated or deleted.
- May a student register again after withdrawing before the deadline? Define the unique-registration and withdrawn-row behavior.
- What happens to registrations when an event is cancelled or removed, and can a student see or export their past registration?

### Assignment and teammate history

- Confirm which rosters count as teammate history: only completed activities, or any published assignment, including cancelled/removed activities and participants who dropped out.
- Define how deadline closure triggers assignment, its exact status transitions, and how duplicate/simultaneous scheduler deliveries are serialized.
- Define the supported maximum team size and maximum participant count per activity, solver time/resource budget, fallback behavior, and retry limits.
- Confirm the partition rule when minimum and maximum sizes make a balanced partition impossible (for example, 10 participants with min 3/max 3).
- Define whether admins can change team limits after registration closes or assignment publishes, what confirmation is required, and how previous assignment versions remain auditable.
- Specify repeat-pair exception approval permissions, pair/activity scope, expiry, and whether exceptions can be revoked.

### Submissions and activity lifecycle

- Decide whether a team may submit once, replace a prior submission, or create submission versions; define duplicate and concurrent submission behavior.
- The API says late submissions are rejected, while other docs mention a possible `LATE` state. Choose one behavior and align statuses, response codes, and admin views.
- Define whether submission is open before assignment, after activity removal/cancellation, or for a withdrawn participant.
- Reconcile edit rules: the API contract blocks edits after assignment publication, while user-flow documentation discusses edits after registrations and recomputation. Define allowed fields/stages and calendar/assignment effects.
- Define whether cancelled, removed, and completed activities retain registrations, submissions, rosters, and teammate history, and the retention period.

### Authorization, privacy, and validation

- Confirm admin provisioning (domain allowlist, manual approval, or both), email verification requirements, and how role changes affect existing sessions.
- Define authorization for `GET /api/groups/:groupId`; specify which member fields students and admins may see. Ensure this matches the group-detail API and UI.
- Specify maximum lengths/formats for names, descriptions, outputs, URLs, timestamps, and IDs, plus validation for unknown fields.
- Define session lifetime, logout/revocation behavior, CSRF protection if cookie sessions are used, and account-linking rules for OAuth identities.

### Calendar, jobs, and notifications

- Align Calendar sync status vocabulary: `docs/API_CONTRACT.md` omits `not_connected`, while `docs/GOOGLE_CALENDAR.md` uses it. Define the response state and transitions for disconnected users, reconnects, revoked credentials, retries, and deletion.
- Define what happens when a student manually deletes an event in Google Calendar and a later sync/update runs.
- Specify idempotency-key requirements, key retention, replay behavior, and response for the same key with a different payload.
- Define job retry/backoff, maximum attempts, terminal/dead-letter handling, worker lease recovery, and operational visibility.
- Decide which notifications are in MVP, their channels, recipients, timing, and duplicate-delivery behavior.

### API consistency and operations

- Define pagination ordering and consistency when data changes between pages; specify maximum page size.
- Make route role requirements, status codes, error codes, and request/response schemas explicit for every endpoint, including not-found and conflict cases.
- Define event capacity/waitlist behavior, or explicitly exclude capacity limits from the MVP.
- Set performance targets for API latency, assignment completion, and supported concurrent registrations so load tests have measurable pass criteria.

These are product/API decisions, not test-runner details. Several cases are marked as conditional or unresolved until the relevant decisions are made; don’t encode guesses as expected behavior.

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
