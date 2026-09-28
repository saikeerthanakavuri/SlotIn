# Proposed API Contract

All routes are under `/api/v1`. JSON examples are illustrative. Require an authenticated session except for explicitly public event listings. Enforce roles and ownership on the server.

## Student routes

### `GET /events`

Returns published events with registration state for the signed-in student.

### `GET /events/:eventId`

Returns event details, deadline, team size rules, current user's registration, and (if assigned/published) the current user's team only.

### `POST /events/:eventId/registrations`

Creates a registration if event is open and current time is before deadline.

Request: `{}`

Response `201`: `{ "registrationId": "...", "status": "registered" }`. Calendar sync does not start until assignment is published.

Errors: `401 unauthenticated`, `403 forbidden`, `404 event_not_found`, `409 already_registered|registration_closed|event_cancelled`.

### `DELETE /events/:eventId/registrations/me`

Withdraws before deadline under proposed MVP policy. Errors include `409 withdrawal_closed`.

### `POST /events/:eventId/submissions`

Creates or updates the signed-in student's submission for their assigned team, if the event accepts submissions and the submission deadline has not passed. The exact request fields and whether late work is rejected or recorded as late must be finalized before implementation.

### Admin submission routes

- `GET /admin/events/:eventId/submissions` lists submissions and status for an event. Admin only.

### `GET /me/calendar-connection`

Returns `{ "connected": true|false }`; never returns credentials.

### `POST /me/calendar-connection`

Starts the Google OAuth authorization flow; return a redirect URL or perform server redirect.

### `DELETE /me/calendar-connection`

Disconnects Calendar access, removes/revokes stored credentials where supported, and prevents future sync jobs.

### `GET /me/calendar-syncs`

Returns the student's sync state per registered event, without provider tokens or sensitive error text.

## Admin routes

- `POST /admin/events` create event.
- `PATCH /admin/events/:eventId` edit event with policy checks.
- `POST /admin/events/:eventId/publish` publish a draft.
- `DELETE /admin/events/:eventId` soft-remove event, block registration, and enqueue notifications plus deletion of corresponding Google Calendar entries. Retain a tombstone until cleanup jobs finish.
- `GET /admin/events/:eventId/registrations` list registrants.
- `GET /admin/events/:eventId/assignment` inspect assignment status and diagnostics.
- `POST /admin/events/:eventId/assignment/retry` retry assignment.
- `POST /admin/events/:eventId/assignment/exceptions` record an explicit approved repeat-pair exception.

## Reliability and errors

- Use database transactions for registration creation and outbox job creation.
- Support an `Idempotency-Key` on mutation routes that can create external effects.
- Return stable machine-readable error codes and user-safe messages.
- Never expose OAuth tokens, internal stack traces, or another student's private profile fields.
- Use pagination for admin registration lists.
- Submission routes use the event naming and `/api/v1` version prefix above; submissions are associated with the authenticated student and their assigned team, not an arbitrary user ID supplied by the client.
