# Backend Test Cases

These test cases verify API responses, authorization, business rules, database effects, solver invariants, and background-job reliability. Implement with Vitest and an isolated PostgreSQL test database. Use a fake Google OAuth/Calendar provider for automated tests; reserve real test-account consent checks for a manual release checklist.

## Shared setup and conventions

- Seed Student A, Student B, Admin A, and an unrelated Student C. Exercise real session and role checks through test fixtures; never trust a role supplied in request JSON.
- Seed activities in `draft`, `registration_open`, `registration_closed`, `assigned`, `cancelled`, and `removed` states as needed.
- Use a controllable UTC clock. `T` denotes a deadline. Assert behavior at `T - 1 ms`, exactly `T`, and `T + 1 ms` where relevant.
- Seed completed team rosters for pair-history cases; registrations alone must not create teammate history.
- Assert HTTP status, `{ error: { code, message } }` where applicable, database state, emitted outbox jobs, and provider calls.
- Each test starts from isolated data and rolls back or truncates its test records. Never point test configuration at production.

## Authentication, sessions, and authorization

| ID | Priority | Request/setup | Expected result |
|---|---|---|---|
| BE-001 | P0 | `GET /api/auth/google` | Redirect/authorization flow starts with configured client and callback; no secret is returned in response body. |
| BE-002 | P0 | OAuth callback with valid state/code and student profile | User is created/updated, student role assigned by default, session established, then redirected. Credentials remain server-side. |
| BE-003 | P0 | OAuth callback with allowlisted admin email | Session role is admin; role assignment is server-controlled. |
| BE-004 | P0 | OAuth callback with invalid/missing state, invalid code, or provider error | Callback rejects safely; no session or credential record is created; response/logs reveal no secret. |
| BE-005 | P0 | `POST /api/auth/logout` with active session | Returns `204`; session is invalidated and subsequent protected request returns `401 unauthenticated`. |
| BE-006 | P0 | `GET /api/auth/me` signed out / signed in | Signed out returns `401`; signed in returns the contract fields and correct role, with no OAuth tokens. |
| BE-007 | P0 | Call every admin route as Student A; call student registration/submission routes as Admin A where student-only role applies | Return `403 forbidden`; no protected data or mutation occurs. |
| BE-008 | P0 | Call each protected route without a session | Return `401 unauthenticated`; no database or outbox mutation occurs. |
| BE-009 | P0 | Send forged `role: admin`, another user's ID, or altered ownership fields in request body | Server ignores/rejects client role/ownership; caller cannot gain access or act for another user. |

## Activity API and lifecycle

| ID | Priority | Request/setup | Expected result |
|---|---|---|---|
| BE-010 | P0 | Admin `POST /api/activities` with valid fields | `201`; activity is stored as draft with creator and UTC timestamps. |
| BE-011 | P0 | Create activity with missing/blank name, end before start, invalid IANA timezone, registration deadline after start, max group size below 3, or invalid timestamp | `400 invalid_input`; no activity or outbox row is created. |
| BE-012 | P0 | Student attempts `POST /api/activities` | `403 forbidden`; no activity is created. |
| BE-013 | P0 | `GET /api/activities` and `GET /api/activities/:id` as student | List contains only published activities; detail includes dates/deadlines/limits and only caller's registration/group. Draft, removed, and another student's private data are not leaked. |
| BE-014 | P0 | `PUT /api/activities/:id` as admin before assignment publication | `200`; allowed fields update and unchanged fields remain intact. |
| BE-015 | P0 | `PUT` unknown activity / as student / after assignment published | `404`, `403`, and `409 assignment_already_published` respectively; state remains unchanged on rejection. |
| BE-016 | P1 | Edit activity after Calendar event exists | `200`; update persists and one idempotent Calendar update job is enqueued per affected sync. |
| BE-017 | P0 | Publish a draft using `POST /api/activities/:id/publish` | `200` with `registration_open`; only one valid lifecycle transition occurs. |
| BE-018 | P0 | Publish unknown activity, as student, or publish an already-published/invalid state | `404`, `403`, or `409 invalid_status_transition`; no unintended transition. |
| BE-019 | P0 | `DELETE /api/activities/:id` as admin | `204`; activity is soft-deleted/tombstoned, future registration is blocked, and cleanup jobs are enqueued for synced students. |
| BE-020 | P0 | Delete unknown activity or as student | `404` or `403`; no cleanup jobs are enqueued. |
| BE-021 | P1 | Query list endpoint with pagination boundaries/invalid page and limit | Stable pagination and total count; invalid values return `400 invalid_input` and no records are skipped/duplicated. |

## Registration and participant rules

| ID | Priority | Request/setup | Expected result |
|---|---|---|---|
| BE-022 | P0 | Student registers for open activity before deadline: `POST /api/activities/:id/registrations` with `{}` | `201`; exactly one registration row with registered status/time; response includes registrationId/status/registeredAt. No Calendar job is created yet. |
| BE-023 | P0 | Register at exactly deadline `T` and at `T + 1 ms` | Both requests return `409 registration_closed` because acceptance requires current time to be before `T`. |
| BE-024 | P0 | Register at `T - 1 ms` | Accepted if activity remains open. |
| BE-025 | P0 | Register twice sequentially or concurrently as same student/activity | One request succeeds; duplicate returns `409 already_registered`; unique DB constraint leaves one row. |
| BE-026 | P0 | Register with no session, as admin, for missing, draft, cancelled, or removed activity | Return `401`, `403`, `404`, or `409` with contract code; no registration row. |
| BE-027 | P0 | Two users register concurrently near deadline while activity is transitioned closed | Transaction/locking ensures each result agrees with committed status; no registration after closure. |
| BE-028 | P1 | `DELETE /api/activities/:id/registrations/me` before deadline | `204`; registration becomes withdrawn (or is removed per chosen persistence rule) and no duplicate record is created on re-register if policy permits. |
| BE-029 | P0 | Withdraw at/after deadline or without existing registration | At/after deadline returns `409 withdrawal_closed`; missing registration returns documented safe not-found/conflict behavior; state is unchanged. |
| BE-030 | P0 | Admin `GET /api/activities/:id/registrations` with pagination | `200`; total and page contents match registrations; status and fields are correct; student access is `403`. |

## Group assignment and history

| ID | Priority | Request/setup | Expected result |
|---|---|---|---|
| BE-031 | P0 | Unit: calculate balanced capacities for 23 participants/max 5 | `[5,5,5,4,4]`; sum is 23, each size is within min/max, size spread is at most 1. |
| BE-032 | P0 | Unit: build pair history from completed teams | Every unordered pair in each completed team contributes once per shared completed team; incomplete/unpublished assignments and registrations contribute nothing. |
| BE-033 | P0 | Unit: verifier receives valid allocation | Accepts only when every registrant appears exactly once, group min/max holds, and each repeated pair is covered by an approved exception. |
| BE-034 | P0 | Unit: verifier receives missing/duplicate student, oversized/undersized team, or forbidden repeated pair | Rejects allocation with actionable diagnostics; no publishable result. |
| BE-035 | P0 | Unit: solver finds compatible roster with no repeat pairs | Returns valid, balanced groups; deterministic tie-break returns same result for same input/config. |
| BE-036 | P0 | Unit: roster has no valid grouping under min/max and hard history constraints | Reports proven `infeasible`; does not silently relax no-repeat or publish partial teams. |
| BE-037 | P0 | Unit: solver hits time/resource limit without proving infeasibility | Reports `solver_limit`, distinct from `infeasible`; does not claim no solution exists. |
| BE-038 | P0 | Unit/property: generate many valid roster/history combinations | For every successful result, every registrant appears once, size constraints hold, no unapproved repeat pair exists, and group size spread is minimal under contract. |
| BE-039 | P0 | Admin `POST /api/activities/:id/generate-groups` with valid eligible participants | `202`; creates assignment version/work item; no partial assignment is visible before atomic publish. |
| BE-040 | P0 | Generate with insufficient participants, already-assigned activity, unknown activity, or student session | Return `409 insufficient_participants`, `409 already_assigned`, `404`, or `403`; no duplicate/partial groups. |
| BE-041 | P0 | Assignment of a mathematically impossible roster | Assignment status becomes `needs_admin_review`, reason `infeasible`, diagnostics are stored; no groups are published and no Calendar jobs are created. |
| BE-042 | P0 | Assignment exceeds solver limit; fallback also unavailable/limited | Status is `needs_admin_review`, reason `solver_limit`; no false infeasible claim, no partial publish. |
| BE-043 | P0 | Force database failure during assignment persistence | Transaction publishes all groups/members/history/outbox together or none; rollback leaves no partial assignment or inflated pair counts. |
| BE-044 | P0 | Retry assignment request/job with same idempotency key or duplicate delivery | No duplicate published teams, members, history increments, or Calendar jobs. |
| BE-045 | P0 | Run two assignment requests concurrently for same activity | Lock/idempotency allows one authoritative version; no overlapping or multiple published assignments. |
| BE-046 | P0 | Retry an activity with a previously published assignment | Existing published version remains unchanged unless explicit supported admin action; retry produces safe status/version behavior. |
| BE-047 | P1 | Record valid admin-approved pair exception then retry assignment | `201`; actor/pairs/reason/time are audited; only listed pairs are exempted in the next solve. |
| BE-048 | P0 | Attempt exception with malformed/self/duplicate pair, missing reason, unknown user, or as student | `400 invalid_input`, `404`, or `403`; no exception persisted. |
| BE-049 | P0 | `GET /api/activities/:id/assignment` for success/infeasible/solver-limit | `200`; status, assignment versions, reason, and diagnostics match persisted state; non-admin is forbidden. |
| BE-050 | P0 | `GET /api/activities/:id/groups` and `/api/groups/:groupId` | Correct group counts/capacity/remaining/status/members; missing resources return `404`; access follows admin-only contract. |
| BE-051 | P0 | `GET /api/users/me/group/:activityId` as assigned, unassigned, and unrelated student | Assigned student sees only own group; unassigned gets `404 not_assigned`; another student's group cannot be fetched via ID manipulation. |
| BE-052 | P1 | Group status calculation for below-capacity, exactly-at-capacity, and over-capacity stored data | OPEN if seats remain, FULL at capacity; invariant check flags/rejects over-capacity data rather than returning negative seats. |

## Submission API

| ID | Priority | Request/setup | Expected result |
|---|---|---|---|
| BE-053 | P0 | Assigned student submits valid description/output before deadline | `201`; submission is associated with caller and assigned group; status `SUBMITTED`, timestamp is server-generated UTC. |
| BE-054 | P0 | Submit exactly at deadline and just after it | Exact deadline is accepted per `submittedAt <= submissionDeadline`; after deadline returns `409 submission_deadline_passed`. |
| BE-055 | P0 | Submit as unassigned student, unauthenticated user, admin, or for unknown activity | Return `409 not_assigned`, `401`, `403`, or `404`; no submission is created. |
| BE-056 | P0 | Submit malformed/missing/oversized fields or client-supplied user/group/time values | `400 invalid_input` (or documented validation code); ownership/time come from server, not client payload. |
| BE-057 | P1 | Submit again for same group/activity | Behavior follows submission policy; it must not create accidental duplicate submissions. Verify response and DB against the finalized create-vs-update rule. |
| BE-058 | P0 | Admin `GET /api/activities/:id/submissions` and `GET /api/submissions/:id` | Correct submission/group/user/status/output returned; student access to admin listings is `403`; missing IDs return `404`. |

## Google OAuth and Calendar

| ID | Priority | Request/setup | Expected result |
|---|---|---|---|
| BE-059 | P0 | `GET /api/me/calendar-connection` connected and disconnected states | `200` with boolean only; response never contains access/refresh tokens or credential fields. |
| BE-060 | P0 | `POST /api/me/calendar-connection` | Starts Calendar consent and returns/redirects to configured redirect URL; requests only approved Calendar scope. |
| BE-061 | P0 | Calendar OAuth callback with invalid state/provider denial | Rejects safely and creates no connection/token update. |
| BE-062 | P0 | Successful Calendar consent callback | Stores encrypted refresh token and granted scopes server-side; browser response/session/logs contain no token. |
| BE-063 | P0 | Assignment pending while user is Calendar-connected | No Calendar create call or create outbox job occurs before assignment is published. |
| BE-064 | P0 | Successful assignment with connected assigned users | One create job/event per assigned connected user; payload has correct summary, UTC dates/timezone, and team details. |
| BE-065 | P0 | Assignment with users not connected to Calendar | Assignment succeeds; unconnected users have no provider call and can connect later to enqueue their assigned event. |
| BE-066 | P0 | Calendar provider fails before/after successful assignment | Assignment remains published; sync becomes retryable failed/pending state and outbox job is retained. |
| BE-067 | P0 | Provider creates event but response times out; retry job | Stable idempotency/provider event key prevents duplicate event; sync eventually records one event ID. |
| BE-068 | P0 | `GET /api/me/calendar-syncs` across statuses | Returns allowed status enum and safe user-facing error info; never provider token or sensitive raw error. |
| BE-069 | P0 | `DELETE /api/me/calendar-connection` while jobs are queued | `204`; credentials are revoked/deleted where supported; future jobs do not create events; queued jobs become safely cancelled/blocked. |
| BE-070 | P0 | Provider reports revoked credentials during sync | Sync becomes `needs_reauthorization`; no infinite retry loop; user can reconnect. |
| BE-071 | P0 | Soft-delete activity with synced events | Delete jobs enqueued for every synced user's event; activity tombstone retained until cleanup; retries safely delete without harming unrelated events. |
| BE-072 | P1 | Edit event after calendar sync | One idempotent update job per affected event; retry updates same provider event rather than duplicating. |

## Suggestions, errors, and reliability

| ID | Priority | Request/setup | Expected result |
|---|---|---|---|
| BE-073 | P1 | Student `POST /api/suggestions` with valid fields | `201`, status pending, caller recorded as suggester. |
| BE-074 | P1 | Suggestion missing/invalid fields, unauthenticated, or submitted by disallowed role | `400 invalid_input`, `401`, or `403`; no suggestion row. |
| BE-075 | P1 | Admin lists suggestions and approves/rejects one | List response is correct; PATCH persists only approved/rejected status and audit data. Invalid status returns `400`; student gets `403`. |
| BE-076 | P0 | Force database failure between registration write and required outbox write | Transaction rolls both back; no orphan registration or orphan job. |
| BE-077 | P0 | Send same mutation with same `Idempotency-Key` repeatedly | Same logical result returned; external side effect and database mutation occur once. Different key follows normal conflict/business rules. |
| BE-078 | P0 | Trigger provider/database/internal exceptions | Stable error envelope and correct HTTP status; no stack trace, token, SQL text, or internal secret exposed. |
| BE-079 | P1 | Send invalid JSON, wrong content type, unknown fields, malformed IDs, and oversized values | Safe `400 invalid_input`/documented validation response; process remains healthy and no partial mutation occurs. |
| BE-080 | P0 | Verify event/activity data isolation across users and admins | Student responses expose only their own private data; admin endpoints expose only authorized activity data; no cross-tenant/IDOR leakage. |

## Completion criteria

- Every P0 case is implemented and green before MVP release.
- P1 cases are green before the related feature is considered complete.
- Concurrency, solver property, and provider retry cases run against isolated test infrastructure.
- Test failures preserve logs/traces sufficient to diagnose the failing case without leaking secrets.
- Manual real-Google consent, production redirect URI, and production API configuration checks remain outside automated CI.
