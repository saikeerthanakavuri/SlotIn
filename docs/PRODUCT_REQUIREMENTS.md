# Product Requirements

Status: proposed MVP specification. Update this document when product decisions change.

## Product goal

SlotIn lets admins publish events, lets students register individually, and assigns students to teams after registration closes. Team assignment must avoid pairing students who have already shared a team at a prior completed event.

## Roles

### Student

- Sign in with Google.
- Browse open and past events.
- Register or withdraw before the registration deadline.
- Connect Google Calendar so assigned events are written directly to their primary calendar.
- View registration status, assigned team, event history, and past teammates.
- Suggest an event for admin review.

### Admin

- Create, edit, publish, close, cancel, and remove events.
- View registrations and assignment status.
- Review assignment failures and record approved exceptions.
- Review student event suggestions.

## Event rules

- Registration is individual; students do not pick teammates or teams.
- Registration closes at the event's configured deadline.
- Team assignment starts after registration closes.
- Minimum team size is 3. Admin specifies the maximum team size per event; it must be 3 or greater. The platform still needs to define a practical upper bound.
- Avoid all repeat teammate pairs as a hard assignment constraint. Do not silently weaken it.
- If a complete valid assignment cannot be made, set the event to needs-admin-review and explain the reason.
- Event date/time must include a time zone.
- A student may register only once per event. Withdrawal is allowed only before registration closes in the proposed MVP.

## Calendar behavior

- Calendar sync happens only after teams have been assigned and published; it is not a prerequisite for registration.
- Create the event in each assigned student's primary Google Calendar if they have granted Calendar permission.
- Assignment remains successful if Calendar is disconnected or temporarily unavailable; show sync status and retry.
- If an event is removed from SlotIn, delete its corresponding calendar events for connected students.
- Removal is a soft delete at first: keep a tombstone until calendar deletion jobs finish, then apply the data-retention policy.
- If event time/details change after assignment, update corresponding calendar events.

## MVP scope

Include authentication and roles, admin event management, individual registration, deadline closure, no-repeat team assignment, assignment review, student team views, Google Calendar sync, and basic notifications/status messages.

Defer payments, chat, attendance tracking, external calendar providers, and advanced waitlist behavior.

## Success criteria

- Every accepted registration is persisted once.
- The assignment process is repeatable and every assigned team satisfies the configured size limits and no-repeat rule.
- Assignment failures are visible to admins and do not create partial or misleading published assignments.
- Calendar sync failures do not lose registrations and can be retried without duplicate calendar events.

## Open decisions

- Define the supported upper bound for the admin-configured maximum team size before implementation; reject larger values in event validation.
- Decide whether a student may withdraw after the deadline; proposed MVP disallows it.
- Define role assignment policy (email-domain allowlist, admin approval, or both).
