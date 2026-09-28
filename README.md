# SlotIn

A smart event and team management platform. Admins post events; students register individually, and the system assigns teams after registration closes while avoiding repeat teammate pairings.

---

## Authentication

- Google OAuth for students and admins
- Role-based access: **Admin** and **Student**
- On first login, role is assigned by email domain or an admin whitelist
- Sessions use Google OAuth tokens and JWT

---

## User Roles

| Role | Capabilities |
|---|---|
| Admin | Post, edit, and delete events · View registrations · Manage event status · Cancel events · Review team assignment issues |
| Student | View events · Register individually · View assigned team · Suggest events · View profile and history |

Students can suggest events, but only admins can officially post them.

---

## Proposed Technology Stack

This is the proposed stack for the application; it has not been implemented yet.

### Frontend

- **TypeScript and React** for the student and admin interfaces
- **Next.js App Router** for pages, routing, and server-rendered UI
- **Tailwind CSS** for responsive styling
- Registration screens show event details, Google Calendar permission status, and calendar-sync result

### Backend

- **Next.js Route Handlers (TypeScript)** for authentication callbacks, event and registration APIs, team assignment, and Calendar API requests
- **PostgreSQL** for users, events, registrations, teams, and teammate history
- **Prisma ORM** for schema, migrations, and typed database access
- **Google OAuth** for sign-in and Calendar authorization; request `calendar.events` when the student connects Calendar
- **Google Calendar API** with Google's Node.js `googleapis` client to add the event to the registering student's primary calendar after registration succeeds
- **Hosting:** Vercel for the Next.js app and a managed PostgreSQL service such as Neon or Supabase

Keep Google OAuth client secrets and refresh tokens on the server. Request the narrow `calendar.events` scope, encrypt refresh tokens at rest, and never send tokens to the browser. Registration should be saved first; calendar creation should be retried safely if Google Calendar is temporarily unavailable. Store the resulting Google event ID and sync status with the registration so retries do not create duplicate events.

---

## Event and Team Workflow

1. An admin creates an event with its registration deadline and team size limits. The maximum team size is four.
2. Students register individually before the deadline. They do not choose teammates or teams.
3. Registration closes at the deadline. The system forms teams from all eligible registrants, avoiding any pair of students who have already shared a team at a previous event.
4. The system publishes team assignments. Students can view their teammates from the event page and their profile.
5. If the constraints make a complete assignment impossible, the event is flagged for admin review. The system must not silently create a repeat pairing.

Team sizes should be balanced within the event's configured limits. For example, with 21 registrants and team sizes of 3–4, the system can form three teams of 4 and three teams of 3. Six teams of 3 plus one team of 4 would require 22 students.

### Registration rules

- One registration per student per event.
- Registration is accepted only while registration is open and before its deadline.
- A student can withdraw before the deadline, subject to the event's policy.
- Recheck eligibility on the server when registering; do not rely only on the UI.
- Team assignment is not final until the assignment process succeeds or an admin resolves a flagged case.

---

## No-Repeat Teammate Rule

The system must not place two students on the same team if they have shared a team in any earlier event. This is a hard constraint for automatic assignment.

1. Use completed event team rosters as the source of truth for prior teammate history.
2. For each past team, treat every pair of members as having worked together.
3. When building a team, validate every pair of its members against that history—not just the student currently being assigned.
4. Save the final team roster for each event so future assignments can use it.

If no valid arrangement exists, flag the event and show the admin why students could not all be assigned. Admin resolution could include changing the permitted team sizes or explicitly approving an exception; any exception should be recorded. Do not automatically fall back to repeat pairings.

---

## Event Status Lifecycle

```text
Created by admin
      │
      ▼
Registration open
      │
      ├── Deadline reached ──▶ Registration closed / assignment pending
      │                                │
      │                                ├── Valid teams formed ──▶ Teams assigned
      │                                └── No valid arrangement ─▶ Admin review
      ├── Admin cancels ──────▶ Cancelled
      └── Event date passes ──▶ Completed / archived
```

---

## Gaps & Issues to Resolve

### Logic gaps

- [ ] Define whether events have a minimum team size as well as the maximum of four.
- [ ] Choose the assignment algorithm and how it handles large registration sets efficiently.
- [ ] Define assignment behavior when no valid grouping exists: admin changes team size limits or records an exception.
- [ ] Define whether students may withdraw after registration closes and how that affects assigned teams.
- [ ] Enforce one registration per student per event in both frontend and backend.
- [ ] Block registration after the deadline or after cancellation with a clear message.
- [ ] Prevent duplicate events with the same name and date; return a specific error.
- [ ] Make deadline-triggered team assignment reliable and safe to retry without creating duplicate teams.

### UX gaps

- [ ] Show registration deadline and registration status on event cards and detail pages.
- [ ] Explain that teammates will be assigned after registration closes.
- [ ] Show a clear confirmation after individual registration.
- [ ] Notify students when assignments are published or an event is changed or cancelled.
- [ ] Add loading, empty, and user-friendly error states, including for OAuth and registration failures.
- [ ] Add event search and filters for date, activity type, and status.
- [ ] Ensure all pages work on mobile.
- [ ] Let students view their assigned team and its members.

### Data gaps

- [ ] Choose the role assignment rule: email-domain whitelist, manual admin approval, or a database setup flag.
- [ ] Store each event's registration deadline and team size limits.
- [ ] Store registrations separately from team assignments, since students register before teams exist.
- [ ] Store final team membership per event and retain completed rosters for teammate-history checks.
- [ ] Define what happens to registrations and assignments when an admin edits or deletes an event.

### Missing features (worth adding)

- [ ] Student event suggestions for admin review.
- [ ] Admin cancellation notifications.
- [ ] Admin view of registrations, assignment status, and teams.
- [ ] Export registrations and team assignments as CSV.
- [ ] Activity type tags such as hackathon, sports, and workshop.
- [ ] Waitlist if event registration has a capacity limit.

---

## Data Models (High Level)

```text
User
  - id
  - name, email, photo                 ← from Google OAuth
  - role: admin | student

Event
  - id
  - activityName, description
  - date, duration, registrationDeadline
  - minTeamSize?                       ← to be decided
  - maxTeamSize (at most 4)
  - status: registration_open | registration_closed | assigning |
            assigned | needs_admin_review | cancelled | archived
  - createdBy: userId (admin)

Registration
  - id
  - userId, eventId
  - registeredAt
  - status: registered | withdrawn

Team
  - id
  - eventId
  - members: [userId]
  - assignedAt

EventSuggestion (future)
  - id
  - suggestedBy: userId
  - activityName, description, preferredDate
  - status: pending | approved | rejected
```

---

## Out of Scope (for now)

- Payment or event fees
- External calendar integration (Google Calendar sync)
- Direct chat between teammates
- Event attendance tracking
