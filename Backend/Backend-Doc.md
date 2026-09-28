# Backend Module Documentation

The backend is the central layer of SlotIn. It receives requests from the frontend, validates them, performs the required operation, runs the smart group allocation algorithm where needed, updates the database, and returns the appropriate response.

---

## 1. Responsibilities

1. Google OAuth authentication and session management
2. Role-based access control (Admin / Student)
3. Activity CRUD
4. Participant management
5. Automatic smart group generation
6. Balanced group-size allocation
7. Previous teammate tracking via completed team rosters
8. Minimization of repeated teammate combinations (hard constraint)
9. Assignment versioning and audit history
10. Admin-approved repeat-pair exceptions
11. Activity submission and deadline validation
12. Submission status tracking
13. Google Calendar sync (post-assignment)
14. Reliable background job dispatch via outbox pattern
15. Input validation and error handling
16. REST API communication with the frontend

---

## 2. Authentication and Authorization

Authentication is handled exclusively through **Google OAuth**. There are no passwords.

### Roles

| Role    | Assigned by                                      |
|---------|--------------------------------------------------|
| Admin   | Email-domain allowlist or manual admin approval  |
| Student | Default on first sign-in                         |

### Role capabilities

```
Admin  → Create/Edit/Delete Activity       ✓
Student → Create/Edit/Delete Activity      ✗

Admin  → Generate Groups                   ✓
Student → Generate Groups                  ✗

Student → Register for Activity            ✓
Admin   → Register for Activity            ✗
```

### OAuth credential storage

- Store Google `refreshToken` encrypted at rest in the database.
- Never return tokens to the frontend or include them in logs.
- Keep a separate `CalendarConnection` record per user for Calendar-scoped tokens.

---

## 3. Activity Management

### Activity fields

```
activity_id
activity_name
description
date (UTC instant)
duration
time_zone (IANA)
registration_deadline (UTC instant)
min_group_size (fixed: 3)
max_group_size (admin configured, >= 3)
submission_deadline (UTC instant)
expected_output
created_by (user_id)
status
assignment_version
created_at
updated_at
```

### Status lifecycle

```
draft → registration_open → registration_closed → assigning
      → assigned | needs_admin_review
      → cancelled | removed (soft delete) | archived
```

### Operations

- **Create** — admin provides name, date, duration, group size, deadlines, expected output.
- **Edit** — allowed before assignment is published; if calendar events exist, queue updates.
- **Delete** — soft delete only; retain tombstone until all calendar deletion jobs complete.
- **Retrieve** — all activities, individual detail, open, completed, available for registration.

---

## 4. Participant Management

Records the relationship between a user and an activity.

Rules:
- One registration per user per activity (enforced by unique constraint).
- Registration accepted only while status is `registration_open` and before `registration_deadline`.
- Withdrawal allowed only before `registration_deadline` (MVP policy).
- Re-validate eligibility on the server at registration time; do not rely on the frontend.

---

## 5. Smart Group Allocation

### 5.1 Balanced group formation

```
participants = N
max_group_size = G

num_groups = ceil(N / G)
base_size  = floor(N / num_groups)
remainder  = N % num_groups

First `remainder` groups → base_size + 1
Remaining groups         → base_size
```

Maximum size difference between any two groups is 1.

Example: 23 participants, max size 5 → groups of 5, 5, 5, 4, 4.

### 5.2 Previous teammate tracking

Source of truth is completed team rosters. Two users are previous teammates if they appear together in any completed team. Do not infer pairings from registrations alone.

A `PairHistory` materialized table may be maintained for query performance but must be fully rebuildable from rosters.

### 5.3 Allocation algorithm

**Primary:** Deterministic bounded backtracking with pruning and a separate constraint verifier.

**Fallback:** Google OR-Tools CP-SAT in a dedicated worker if backtracking exceeds the configured time/resource limit.

Hard constraints (never relaxed automatically):
1. Every registrant assigned exactly once.
2. Group size between `min_group_size` and `max_group_size`.
3. No pair in a group has shared a group at any prior completed activity, unless covered by a recorded admin exception.
4. Never publish a partial assignment.

Balancing objective: prefer group sizes as even as possible among valid assignments.

### 5.4 Algorithm steps

1. Retrieve all active registrations for the activity.
2. Calculate balanced group capacities.
3. Load pair history from completed rosters.
4. Load any admin-approved exceptions for this activity.
5. Run solver (backtracking → OR-Tools fallback).
6. Verify: every registrant assigned once, no group over capacity, no forbidden pair without exception.
7. If valid → save groups, update pair history, publish assignment atomically.
8. If infeasible → save diagnostics, set status to `needs_admin_review`, do not publish.
9. If solver limit reached → set status to `needs_admin_review` with reason `solver_limit`; do not assume no solution exists.

### 5.5 Assignment versioning

Each run produces a new `assignment_version`. Prior versions are retained for audit. Only one version is published at a time. Rerunning does not overwrite a published assignment without explicit admin action.

### 5.6 Admin-approved exceptions

When no valid assignment exists, the admin may approve specific repeat pairs. Each exception records: actor, pair(s), reason, timestamp. The solver uses approved exceptions on the next run.

---

## 6. Group Information

Each group exposes:

```json
{
  "groupId": 3,
  "activityId": 15,
  "capacity": 5,
  "currentMembers": 4,
  "remainingSeats": 1,
  "status": "OPEN",
  "members": [...]
}
```

Status is `OPEN` when seats remain, `FULL` when at capacity.

---

## 7. Activity Submission

### Submission fields

```
submission_id
activity_id
group_id
user_id
description
output
submitted_at
status (PENDING | SUBMITTED | LATE)
```

### Deadline validation (server-side)

```
submitted_at <= submission_deadline  →  SUBMITTED
submitted_at >  submission_deadline  →  rejected (or LATE if policy allows)
```

Frontend deadline display is informational only; the backend enforces it.

### Admin submission view

Admin can retrieve all submissions, filter by activity, view status, associated group/user, submission time, and output.

---

## 8. Google Calendar Sync

- Calendar sync starts only after assignment is published.
- One `CalendarSync` record per assigned user per activity.
- Use a stable idempotency key (derived from user + activity) when creating provider events to prevent duplicates on retry.
- If an activity is removed from SlotIn, queue deletion of corresponding calendar events for all connected students.
- Sync failures do not block or invalidate the assignment; show sync status and retry via outbox.
- If activity details change post-assignment, queue calendar event updates.

---

## 9. Database Schema

### Users
```
user_id         PK
google_subject  UNIQUE
name
email
photo_url
role            (admin | student)
created_at
updated_at
```

### OAuthCredentials
```
user_id         FK → Users, UNIQUE
encrypted_refresh_token
granted_scopes
connected_at
last_refreshed_at
revoked_at
```

### Activities
```
activity_id         PK
activity_name
description
starts_at           UTC
ends_at             UTC
time_zone           IANA
registration_deadline UTC
min_group_size      default 3
max_group_size      admin configured >= 3
submission_deadline UTC
expected_output
created_by          FK → Users
status
assignment_version
created_at
updated_at
```

### Registrations
```
registration_id   PK
activity_id       FK → Activities
user_id           FK → Users
status            (registered | withdrawn)
registered_at
withdrawn_at
UNIQUE (activity_id, user_id)
```

### Groups
```
group_id          PK
activity_id       FK → Activities
assignment_version
group_number
capacity
status            (OPEN | FULL)
created_at
```

### GroupMembers
```
group_member_id   PK
group_id          FK → Groups
user_id           FK → Users
UNIQUE (group_id, user_id)
```

### PairHistory
```
pair_id               PK
user1_id              FK → Users
user2_id              FK → Users
times_worked_together
last_activity_id      FK → Activities
UNIQUE (user1_id, user2_id)
```
> Rebuildable from GroupMembers + completed activity rosters. Used for query performance only.

### AssignmentExceptions
```
exception_id    PK
activity_id     FK → Activities
user1_id        FK → Users
user2_id        FK → Users
approved_by     FK → Users (admin)
reason
created_at
```

### Submissions
```
submission_id   PK
activity_id     FK → Activities
group_id        FK → Groups
user_id         FK → Users
description
output
submitted_at
status          (PENDING | SUBMITTED | LATE)
```

### CalendarConnections
```
user_id                 FK → Users, UNIQUE
encrypted_refresh_token
granted_scopes
connected_at
last_refreshed_at
revoked_at
```

### CalendarSyncs
```
sync_id           PK
user_id           FK → Users
activity_id       FK → Activities
provider          (google)
provider_event_id
status            (pending | synced | failed | delete_pending | deleted | needs_reauthorization)
attempt_count
last_attempt_at
last_error_code
synced_at
UNIQUE (user_id, activity_id)
```

### OutboxJobs
```
job_id          PK
type
aggregate_id
payload         JSON
status          (pending | processing | done | failed)
attempt_count
available_at
locked_at
last_error_code
created_at
updated_at
```

### EventSuggestions
```
suggestion_id       PK
suggested_by        FK → Users
activity_name
description
preferred_date
status              (pending | approved | rejected)
reviewed_by         FK → Users (admin)
created_at
updated_at
```

---

## 10. REST API Endpoints

### Authentication
```
GET  /api/auth/google           Start Google OAuth flow
GET  /api/auth/google/callback  OAuth callback
POST /api/auth/logout
GET  /api/auth/me               Current session user
```

### Activities
```
POST   /api/activities                          Admin: create
GET    /api/activities                          List published activities
GET    /api/activities/:id                      Activity detail + current user's registration
PUT    /api/activities/:id                      Admin: edit
DELETE /api/activities/:id                      Admin: soft delete
POST   /api/activities/:id/publish             Admin: publish draft
```

### Registrations
```
POST   /api/activities/:id/registrations        Student: register
DELETE /api/activities/:id/registrations/me     Student: withdraw
GET    /api/activities/:id/registrations        Admin: list registrants
```

### Group Allocation
```
POST /api/activities/:id/generate-groups        Admin: trigger allocation
GET  /api/activities/:id/groups                 List groups for activity
GET  /api/groups/:groupId                       Group detail + members
GET  /api/users/me/group/:activityId            Student: my assigned group
```

### Assignment Review
```
GET  /api/activities/:id/assignment             Admin: assignment status + diagnostics
POST /api/activities/:id/assignment/retry       Admin: rerun solver
POST /api/activities/:id/assignment/exceptions  Admin: approve repeat-pair exception
```

### Submissions
```
POST /api/activities/:id/submit                 Student/group: submit
GET  /api/activities/:id/submissions            Admin: all submissions for activity
GET  /api/submissions/:id                       Submission detail
```

### Calendar
```
GET    /api/me/calendar-connection              Student: connection status
POST   /api/me/calendar-connection              Student: start Calendar OAuth flow
DELETE /api/me/calendar-connection              Student: disconnect
GET    /api/me/calendar-syncs                   Student: sync status per activity
```

### Event Suggestions
```
POST /api/suggestions                           Student: suggest activity
GET  /api/admin/suggestions                     Admin: list suggestions
PATCH /api/admin/suggestions/:id                Admin: approve or reject
```

---

## 11. Error Handling

| Scenario                    | Status |
|-----------------------------|--------|
| Unauthenticated             | 401    |
| Forbidden (wrong role)      | 403    |
| Resource not found          | 404    |
| Duplicate registration      | 409    |
| Registration closed         | 409    |
| Activity cancelled          | 409    |
| Invalid input               | 400    |
| Submission past deadline    | 409    |

Return stable machine-readable error codes alongside user-safe messages. Never expose stack traces, OAuth tokens, or another student's private data.

---

## 12. Security

- Google OAuth only; no passwords stored.
- Refresh tokens encrypted at rest; never sent to the browser.
- Role verified server-side on every protected route.
- Unique constraints enforce one registration per user per activity.
- Server-side deadline validation for registrations and submissions.
- Outbox + idempotency keys prevent duplicate external effects on retry.
- Soft deletes retain tombstones until all cleanup jobs complete.

---

## 13. Background Jobs (Outbox + Inngest)

All external side effects (team assignment trigger, calendar create/update/delete, notifications) are written to the `OutboxJobs` table inside the same database transaction as the triggering operation. A worker dispatches outbox records to Inngest idempotently.

Job types:
- `assignment.run` — triggered when registration deadline passes
- `calendar.create` — after assignment published, per connected student
- `calendar.update` — after activity details change post-assignment
- `calendar.delete` — after activity soft-deleted, per connected student
- `notification.send` — assignment published, event changed, event cancelled

---

## 14. MVP Priority Order

1. Google OAuth + role assignment
2. Activity CRUD + status lifecycle
3. Participant registration + withdrawal
4. Balanced group generation
5. Previous teammate tracking (from rosters)
6. Bounded backtracking solver + verifier
7. Assignment versioning + admin review flow
8. Group retrieval (admin + student)
9. Activity submission + deadline validation
10. Submission status tracking
11. Outbox + Inngest job dispatch
12. Google Calendar sync
13. Event suggestions
14. REST API + error handling
