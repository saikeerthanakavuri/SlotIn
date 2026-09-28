# API Contract

All routes are under `/api`. Requests and responses use JSON. All timestamps are UTC ISO 8601 strings. Every protected route verifies the session and role server-side. Enforce roles and ownership on the server; never trust client-supplied role claims.

---

## Authentication

### `GET /api/auth/google`

Starts the Google OAuth flow. Redirects the user to Google's consent screen.

### `GET /api/auth/google/callback`

OAuth callback. Exchanges the authorization code for tokens, creates or updates the user record, sets the session, and redirects to the frontend.

### `POST /api/auth/logout`

Invalidates the current session.

Response `204`.

### `GET /api/auth/me`

Returns the current session user.

Response `200`: `{ "userId", "name", "email", "photoUrl", "role" }`.

Errors: `401 unauthenticated`.

---

## Student routes

### `GET /api/activities`

Returns published activities. Each item includes the activity name, dates, registration deadline, status, and group size limits.

### `GET /api/activities/:id`

Returns full activity detail including deadlines, group size rules, and the current user's registration status. If the assignment is published, also returns the current user's assigned group only — never another student's group.

### `POST /api/activities/:id/registrations`

Creates a registration if the activity status is `registration_open` and the current time is before the registration deadline. Re-validates eligibility server-side; do not rely on the frontend.

Request: `{}`.

Response `201`: `{ "registrationId", "status": "registered", "registeredAt" }`.

Errors: `401 unauthenticated`, `403 forbidden`, `404 activity_not_found`, `409 already_registered | registration_closed | event_cancelled`.

### `DELETE /api/activities/:id/registrations/me`

Withdraws the current user's registration. Allowed only before the registration deadline under the MVP policy.

Response `204`.

Errors: `401`, `403`, `404`, `409 withdrawal_closed`.

### `GET /api/users/me/group/:activityId`

Returns the calling student's assigned group and its members. Does not expose other groups.

Response `200`: group object with `groupId`, `groupNumber`, `capacity`, `currentMembers`, `remainingSeats`, `status`, and a `members` array of `{ userId, name, email, photoUrl }`.

Errors: `401`, `404 not_assigned`.

### `POST /api/activities/:id/submit`

Submits on behalf of the student's assigned group. The server validates `submittedAt <= submissionDeadline` and rejects late submissions. Frontend deadline display is informational only.

Request: `{ "description", "output" }`.

Response `201`: `{ "submissionId", "status": "SUBMITTED", "submittedAt" }`.

Errors: `401`, `403`, `404`, `409 submission_deadline_passed | not_assigned`.

### `GET /api/me/calendar-connection`

Returns `{ "connected": true | false }`; never returns credentials or tokens.

### `POST /api/me/calendar-connection`

Starts the Google Calendar OAuth authorization flow.

Response `200`: `{ "redirectUrl" }`.

### `DELETE /api/me/calendar-connection`

Disconnects Calendar access, revokes stored credentials where supported, and prevents future sync jobs.

Response `204`.

### `GET /api/me/calendar-syncs`

Returns the student's sync state per registered activity. Does not include provider tokens or sensitive error text.

Response `200`: array of `{ "activityId", "activityName", "status", "syncedAt", "lastError" }`.

`status` is one of: `pending | synced | failed | delete_pending | deleted | needs_reauthorization`.

### `POST /api/suggestions`

Submits an activity suggestion for admin review.

Request: `{ "activityName", "description", "preferredDate" }`.

Response `201`: `{ "suggestionId", "status": "pending" }`.

Errors: `401`, `400 invalid_input`.

---

## Admin routes

### `POST /api/activities`

Creates a new activity in `draft` status.

Request: `{ "activityName", "description", "startsAt", "endsAt", "timeZone", "registrationDeadline", "maxGroupSize", "submissionDeadline", "expectedOutput" }`.

Response `201`: `{ "activityId", "status": "draft" }`.

Errors: `400 invalid_input`, `401`, `403`.

### `PUT /api/activities/:id`

Edits an activity. Allowed before the assignment is published. If calendar events already exist for this activity, queues calendar update jobs.

Response `200`: updated activity object.

Errors: `400`, `403`, `404`, `409 assignment_already_published`.

### `DELETE /api/activities/:id`

Soft-deletes the activity. Blocks new registrations, enqueues calendar deletion jobs for all connected students, and retains a tombstone until all cleanup jobs complete.

Response `204`.

Errors: `403`, `404`.

### `POST /api/activities/:id/publish`

Transitions the activity from `draft` to `registration_open`.

Response `200`: `{ "status": "registration_open" }`.

Errors: `403`, `404`, `409 invalid_status_transition`.

### `GET /api/activities/:id/registrations`

Lists all registrants for an activity. Supports pagination via `?page` and `?limit`.

Response `200`: `{ "total", "registrations": [{ "registrationId", "userId", "name", "email", "status", "registeredAt" }] }`.

Errors: `401`, `403`, `404`.

### `POST /api/activities/:id/generate-groups`

Triggers the smart group allocation algorithm. Runs the backtracking solver (with OR-Tools fallback). Does not publish a partial assignment.

Request: `{}`.

Response `202`: `{ "message", "assignmentVersion" }`.

Errors: `401`, `403`, `404`, `409 insufficient_participants | already_assigned`.

### `GET /api/activities/:id/groups`

Lists all groups for an activity with capacity and member counts.

Response `200`: array of `{ "groupId", "groupNumber", "capacity", "currentMembers", "remainingSeats", "status", "assignmentVersion" }`.

Errors: `401`, `403`, `404`.

### `GET /api/groups/:groupId`

Returns full group detail including the members array.

Response `200`: group object with `members: [{ userId, name, email, photoUrl }]`.

Errors: `401`, `403`, `404`.

### `GET /api/activities/:id/assignment`

Returns the current assignment status and diagnostics. Use this to inspect `needs_admin_review` failures.

Response `200`: `{ "status", "assignmentVersion", "publishedVersion", "reason", "diagnostics" }`.

`reason` is one of: `infeasible | solver_limit | null`.

Errors: `401`, `403`, `404`.

### `POST /api/activities/:id/assignment/retry`

Reruns the solver. Does not overwrite a published assignment without explicit admin action.

Request: `{}`.

Response `202`: `{ "message", "assignmentVersion" }`.

Errors: `401`, `403`, `404`.

### `POST /api/activities/:id/assignment/exceptions`

Records an admin-approved repeat-pair exception. The solver uses approved exceptions on the next run.

Request: `{ "pairs": [{ "user1Id", "user2Id" }], "reason" }`.

Response `201`: `{ "exceptionId", "activityId", "pairs", "approvedBy", "reason", "createdAt" }`.

Errors: `400`, `401`, `403`, `404`.

### `GET /api/activities/:id/submissions`

Returns all submissions for an activity with status, group, user, submission time, and output.

Response `200`: array of submission objects.

Errors: `401`, `403`, `404`.

### `GET /api/submissions/:id`

Returns a single submission detail.

Errors: `401`, `403`, `404`.

### `GET /api/admin/suggestions`

Lists all student activity suggestions.

Response `200`: array of `{ "suggestionId", "suggestedBy", "activityName", "description", "preferredDate", "status", "createdAt" }`.

### `PATCH /api/admin/suggestions/:id`

Approves or rejects a suggestion.

Request: `{ "status": "approved" | "rejected" }`.

Response `200`: updated suggestion object.

Errors: `400`, `401`, `403`, `404`.

---

## Reliability and errors

- Use database transactions for registration creation and outbox job creation together.
- Support an `Idempotency-Key` header on mutation routes that produce external effects (calendar, notifications).
- Return stable machine-readable error codes alongside user-safe messages: `{ "error": { "code", "message" } }`.
- Never expose OAuth tokens, internal stack traces, or another student's private profile fields in error responses.
- Use pagination for admin list endpoints.

| Scenario | Status | Code |
|---|---|---|
| Unauthenticated | 401 | `unauthenticated` |
| Forbidden (wrong role) | 403 | `forbidden` |
| Resource not found | 404 | `not_found` |
| Duplicate registration | 409 | `already_registered` |
| Registration closed | 409 | `registration_closed` |
| Activity cancelled | 409 | `event_cancelled` |
| Withdrawal closed | 409 | `withdrawal_closed` |
| Invalid input | 400 | `invalid_input` |
| Submission past deadline | 409 | `submission_deadline_passed` |
| Assignment already published | 409 | `assignment_already_published` |
