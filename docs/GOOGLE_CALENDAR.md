# Google Calendar Integration

## Intended behavior

After team assignment is successfully published, create the event on each assigned student's primary Google Calendar. Calendar access is optional; lack of permission must not undo or block registration or team assignment. If an event is removed from SlotIn, remove its corresponding calendar event too.

## Authorization setup

1. Enable Google Calendar API in the Google Cloud project and configure OAuth consent and redirect URIs.
2. Use Google OAuth for sign-in and request Calendar event access as a separate consent step.
3. Request the narrow `https://www.googleapis.com/auth/calendar.events` scope needed to create, update, and delete events.
4. Request offline access so backend jobs can act after the student leaves the site.
5. Validate OAuth `state`, redirect URI, issuer, audience, and account identity on the backend.

## Assignment-to-calendar sequence

1. In the transaction that publishes the complete team assignment, enqueue a Calendar sync job for each assigned student with an active Calendar connection.
2. Worker reads each job and creates a timed event on calendar ID `primary`, using the event's start/end instant and IANA time zone. Include assigned team details in the description so the calendar item reflects the student's assignment.
3. Store the provider event ID and `synced` state. Use a stable event ID/idempotency strategy so retries after uncertain network results do not create duplicates.
4. If a student has no Calendar connection, record `not_connected` and offer a connect action. When they connect later, enqueue sync for their assigned events.
5. If Google returns a retryable error, retry with backoff. If permission is revoked or invalid, mark `needs_reauthorization` and prompt the student to reconnect.
6. On event time/detail edits, enqueue updates for all affected synced calendar events.
7. If an event is removed from SlotIn, soft-remove it, enqueue deletion of its corresponding Google Calendar event for every assigned student, and retain a tombstone until deletion jobs finish. Retry deletion safely if Google is temporarily unavailable.

## Data and security

- Store refresh tokens encrypted at rest, restrict decryption to the Calendar worker, and never include token material in logs or API responses.
- Store granted scopes and connection state. Handle token revocation and deletion requests.
- Store provider event ID and sync status per assigned user/event. Keep event details and team assignment in SlotIn as the source of truth.
- Use least privilege, HTTPS, secret manager/environment secrets, access logging, and retention limits.
- Calendar descriptions should include only information the student is allowed to see (their team and event details); do not include sensitive profile data.

## User experience and limitations

- Explain the requested permission before sending the student to Google.
- Registration confirmation explains that Calendar sync occurs after teams are assigned.
- After assignment, show per-event sync state: `pending`, `synced`, `not_connected`, or `needs_reauthorization`.
- Provide retry/reconnect and an `.ics` or Google Calendar link fallback if permission is declined.
- A successful API call confirms the event was created in the user's calendar.

## Failure cases

- No Calendar connection: registration and assignment succeed; sync is `not_connected` until connected.
- Network/API timeout: assignment remains published; sync remains retryable.
- Invalid/revoked refresh token: stop automatic retries and request reauthorization.
- Event deleted by user: a later update may return not found; recreate only if the user still has an active assignment and the event has not been removed.
- Registration withdrawn before assignment: no calendar event is created for that student.
- SlotIn event removed: delete matching Google Calendar event; retry deletion safely if Google is unavailable.
