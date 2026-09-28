# User Flows

These flows describe the proposed MVP behavior.

## Student registration

1. Student signs in and opens an event that is accepting registrations.
2. Event page shows date, time zone, registration deadline, team size range, and that teams are assigned after the deadline.
3. Student selects **Register** and confirms.
4. Backend creates one registration. Duplicate attempts return the existing registration state rather than creating another row.
5. UI displays registration confirmation. Calendar sync does not happen yet because teams are not assigned.
6. Before the deadline, student may withdraw under the proposed MVP policy.
7. At the deadline, registration closes and assignment starts. Student sees assignment pending until the result is published.
8. Once published, student sees their team. A background sync creates the event on each assigned student's primary calendar if they connected Calendar; otherwise the UI asks them to connect.
9. UI shows Calendar sync state: not connected, pending, synced, or needs attention.

## Google Calendar connection

1. Student chooses **Connect Google Calendar** from profile or after registration.
2. Backend starts OAuth authorization with state/CSRF protection and requests the Calendar event scope.
3. Google returns the authorization response to the backend.
4. Backend validates state, exchanges the code, and stores the refresh token encrypted.
5. UI shows Calendar connected. Student can disconnect; disconnect revokes/deletes stored credentials where supported and stops future sync.

## Admin creates event

1. Admin opens the event form.
2. Admin enters title, description, start/end date-time and time zone, registration deadline, and permitted team size range.
3. Backend validates times, team size bounds, and duplicate event policy.
4. Admin publishes. Event becomes registration_open and is visible to students.

## Deadline and team assignment

1. Scheduler identifies events whose deadline has passed.
2. Backend closes registration and creates an assignment job idempotently.
3. Assignment service reads eligible registrations and completed past team rosters.
4. It computes teams satisfying team size and no-repeat constraints.
5. If a full assignment succeeds, teams are saved atomically and event becomes assigned. Calendar-sync jobs are enqueued for assigned students.
6. If no valid assignment is found within configured limits, no teams are published; event becomes needs-admin-review with diagnostic reasons.
7. Admin changes permitted settings or records an explicit exception and reruns assignment.

## Event edit or cancellation

- Before registrations: edits update the published event.
- After registrations: changing date/time or team limits requires a clear impact summary and confirmation; assignment is invalidated/recomputed if needed.
- Removing an event from SlotIn blocks registration, notifies affected students, and enqueues deletion of that event from connected students' calendars.
