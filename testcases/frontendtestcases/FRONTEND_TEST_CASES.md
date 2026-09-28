# Frontend Test Cases

These are browser-level acceptance cases for the student and admin interfaces. They describe expected behavior, not current implementation. Implement with Playwright once the app exists. Use isolated seeded users and activities, a test database, and mocked Google OAuth/Calendar responses; never use production accounts or calendars.

## Shared setup and conventions

- `Student A` and `Student B` are regular student accounts; `Admin A` is an allowlisted admin.
- Seed activities in the statuses needed by each case, with fixed UTC timestamps and explicit IANA time zones.
- Seed registrations, completed teams, assignment versions, submissions, and Calendar sync rows as needed.
- Sign in through a test authentication fixture backed by the same session/role behavior as production. Do not add a production authentication bypass.
- `T` means the registration or submission deadline. For exact boundary cases, use a controllable test clock.
- Assert visible outcomes and relevant network responses. Verify sensitive data is not rendered or embedded in page state.
- UI labels below describe user intent. They may be adapted to the final design while preserving the expected behavior.

## Student flows

| ID | Priority | Scenario and steps | Expected result |
|---|---|---|---|
| FE-001 | P0 | Open the app signed out; start Google sign-in using the mocked OAuth provider; complete callback. | Student lands in the app with their name/profile and student capabilities. No password registration or login is presented. |
| FE-002 | P0 | Sign in as an allowlisted admin. | Admin interface and admin actions are available; role is sourced from the server session. |
| FE-003 | P0 | Sign in as Student A and directly navigate to an admin page or invoke an admin action. | Admin content/action is denied and a safe access message is shown; no admin data is rendered. |
| FE-004 | P0 | Open the event list with published, draft, removed, and past activities seeded. | Only activities permitted by the listing contract appear; status, dates, registration deadline, and group-size information are accurate. |
| FE-005 | P0 | Open an activity detail page while unregistered, then as a registered student before and after assignment. | Correct details and own registration state appear. Before publication no team is shown; after publication only the signed-in student's team is shown. |
| FE-006 | P0 | Register for an open activity before its deadline. | One confirmation is shown and the UI reflects registered state. No Calendar event is shown as synced while assignment is pending. |
| FE-007 | P0 | Attempt registration for a closed, cancelled/removed, missing, or deadline-passed activity (including by replaying the request after the UI hides the button). | Registration is not shown as successful. The UI presents a useful message based on the API error; no duplicate or invalid registration appears. |
| FE-008 | P0 | Double-click Register or submit the same request twice. | UI settles to one registered state; duplicate response is handled as already registered, without duplicate rows or confusing success state. |
| FE-009 | P1 | Withdraw before the deadline, then try again after the deadline. | Before deadline, registration becomes withdrawn. After deadline, withdrawal is rejected and the existing state remains visible. |
| FE-010 | P0 | Open the assigned-group view as a student after assignment. | Group number, members, capacity, current count, remaining seats, and OPEN/FULL status match API data; no unrelated group is exposed. |
| FE-011 | P0 | View a student's group before assignment or for an activity they did not join. | No fabricated group is shown; the page gives a clear not-assigned/empty state. |
| FE-012 | P0 | Open Calendar connection settings while disconnected. | UI says disconnected and offers a connect action. No token, credential, or sensitive provider error is displayed. |
| FE-013 | P1 | Start Calendar connection with mocked consent success, cancel, and OAuth failure in separate runs. | Success updates connection state; cancellation/failure leaves it disconnected and shows a recoverable message. |
| FE-014 | P1 | Inspect Calendar sync states for pending, synced, failed, deleted, and needs-reauthorization records. | Each state is presented accurately with an appropriate next action; raw provider secrets/errors are never shown. |
| FE-015 | P0 | Submit description/output as an assigned student before the submission deadline. | Submission confirmation and returned status/time are displayed; submitted output is associated with the student's assigned group. |
| FE-016 | P0 | Submit after the deadline by replaying the UI request even if the UI still displays an enabled control. | API rejection is shown clearly; UI does not claim success or alter the submission state. |
| FE-017 | P1 | Submit as a student who is not assigned to a group. | Submission is rejected with a clear not-assigned message; no submission is displayed as created. |
| FE-018 | P1 | Sign out, then use browser back or revisit a protected page. | Protected content is not available; the UI returns to sign-in or shows an unauthenticated state. |
| FE-019 | P1 | Load event list, event detail, group, Calendar state, or submissions while the API returns a server/network error. | Loading state ends, no stale success is implied, and the page displays a recoverable error with retry where appropriate. |
| FE-020 | P1 | View the student experience at narrow mobile viewport and keyboard-only navigation. | Core tasks remain usable without horizontal overflow; interactive controls have accessible names, visible focus, and logical keyboard order. |

## Admin flows

| ID | Priority | Scenario and steps | Expected result |
|---|---|---|---|
| FE-021 | P0 | Open create-activity form and submit valid details. | Activity is created in draft state and appears in admin activity management. |
| FE-022 | P0 | Submit activity form with missing name, invalid/end-before-start dates, invalid timezone, deadline after start, or max group size below 3. | Invalid values are identified; no activity is created. Server validation errors are displayed if client validation is bypassed. |
| FE-023 | P0 | Edit an unpublished activity; separately try editing after assignment publication. | Pre-publication edits persist. Post-publication edit is blocked according to contract, with a clear explanation. |
| FE-024 | P0 | Publish a draft activity, then attempt to publish it again or perform an invalid lifecycle action. | First publish opens registration. Invalid repeated transition is rejected and status remains consistent. |
| FE-025 | P0 | Open admin registration list with multiple pages and seeded withdrawn/registered users. | Pagination and counts are correct; statuses and fields match API data; no rows are duplicated across pages. |
| FE-026 | P0 | Trigger group generation for a valid activity and wait for completion. | Progress/pending state is shown; on success the admin sees the published assignment, balanced sizes, and version. Repeated click does not suggest multiple published assignments. |
| FE-027 | P0 | Trigger group generation for insufficient participants or impossible no-repeat constraints. | No partial teams are shown as published. Admin sees needs-review state and actionable diagnostics/reason. |
| FE-028 | P1 | Open assignment status and retry after a solver limit or infeasible result. | Current reason/diagnostics are visible; retry reflects the new version/status and does not overwrite a published version silently. |
| FE-029 | P1 | Record an approved repeat-pair exception with pairs and a reason, then retry assignment. | Confirmation identifies the recorded exception/reason; next assignment uses only approved exceptions and shows the resulting version. |
| FE-030 | P0 | View group list/detail as admin. | Every group has correct capacity, counts, remaining seats, status, and members for the selected activity. |
| FE-031 | P0 | View submissions for an activity and open one submission. | Admin sees status, group/user association, submitted time, description, and output as provided by the API. |
| FE-032 | P1 | Review student suggestions; approve one and reject another. | Status updates to approved/rejected and is reflected in the list; a student cannot access these admin controls. |
| FE-033 | P0 | Soft-delete an activity that has connected students with synced Calendar events. | Activity becomes unavailable for registration; UI communicates removal and cleanup state without claiming external deletion completed prematurely. |
| FE-034 | P1 | Edit activity details after Calendar events exist. | Admin sees update accepted/queued; sync status communicates pending update and eventual result. |
| FE-035 | P1 | Simulate assignment/calendar worker delay, Calendar outage, and retry. | Assignment stays published when Calendar fails; admin sees retryable sync state, not a failed assignment. |
| FE-036 | P1 | Open admin pages as a student by direct URL and by modifying activity/group/submission IDs. | Access is denied; no admin-only participant, submission, assignment diagnostics, or unrelated group data is exposed. |

## Additional Calendar and boundary cases

| ID | Priority | Scenario and steps | Expected result |
|---|---|---|---|
| FE-037 | P1 | Calendar access token expires; the backend successfully refreshes it during sync. | Student continues to see the event as synced; no unnecessary reconnect prompt appears. |
| FE-038 | P0 | Calendar authorization is revoked or refresh fails. | Sync displays needs-reauthorization with a reconnect action; it does not claim success or expose provider error details. |
| FE-039 | P1 | Calendar provider is unavailable or rate-limits requests after team assignment. | Team assignment remains visible and published; Calendar UI indicates pending/retrying or failed sync separately from assignment status. |
| FE-040 | P1 | Some teammates' Calendar sync succeeds while another teammate's fails. | Each student's own sync status is accurate; one person's failure does not make the whole team or assignment appear failed. |
| FE-041 | P1 | User disconnects Calendar while a sync is queued, then reconnects later. | Disconnected state is immediate; after reconnect only eligible assigned event syncs are shown, without duplicate entries. |
| FE-042 | P1 | Activity is removed while Calendar deletion is pending; provider reports the event already deleted. | UI eventually shows deleted/complete state; it does not revert to synced or show a permanent error. |
| FE-043 | P1 | Event starts near midnight or during a daylight-saving transition in its configured timezone. | Event date/time and deadline display match the configured local timezone and remain consistent with the server's UTC timestamps. |
| FE-044 | P1 | Registration or submission is attempted at the exact deadline using a controllable test clock. | UI reflects the API result and never shows success when the server rejects the boundary request. |
| FE-045 | P1 | Team assignment is infeasible, solver limit is reached, or admin retry is running. | Admin sees distinct actionable states (infeasible vs still unresolved/resource limit vs processing); no partial assignment is presented as final. |

## Frontend release checks

- Run the suite against a clean test database and deterministic test clock.
- Capture browser traces/screenshots on failure; do not store real OAuth credentials in artifacts.
- Verify the suite passes in desktop and supported mobile viewport configurations.
- Manual OAuth consent and production redirect URI checks remain separate from automated tests using mocked OAuth.
