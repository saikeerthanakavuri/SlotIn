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

## Project Documentation

The documents below describe the proposed product and implementation. The repository currently contains the project overview; these documents are design specifications, not evidence that the features are implemented.

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [User flows](docs/USER_FLOWS.md)
- [Data model](docs/DATA_MODEL.md)
- [Team assignment rules](docs/TEAM_ASSIGNMENT.md)
- [API contract](docs/API_CONTRACT.md)
- [Google Calendar integration](docs/GOOGLE_CALENDAR.md)
- [Test plan](docs/TEST_PLAN.md)
- [Deployment and operations](docs/DEPLOYMENT_OPERATIONS.md)
- [Recommended implementation choices](docs/IMPLEMENTATION_CHOICES.md)

---

## Proposed Technology Stack

This is the proposed stack for the application; it has not been implemented yet.

Recommended concrete choices: use Auth.js for application sign-in, a separate Google OAuth consent flow for Calendar access, Neon PostgreSQL with Prisma, and Inngest for durable background jobs. Use Vitest and Playwright for tests. Keep an outbox table in PostgreSQL as the reliable record of jobs to enqueue/process.

### Frontend

- **TypeScript and React** for the student and admin interfaces
- **Next.js App Router** for pages, routing, and server-rendered UI
- **Tailwind CSS** for responsive styling
- Registration screens show event details, Google Calendar permission status, and calendar-sync result

### Backend

- **Next.js Route Handlers (TypeScript)** for authentication callbacks and event/registration APIs
- **PostgreSQL** for users, events, registrations, teams, and teammate history
- **Prisma ORM** for schema, migrations, and typed database access
- **Auth.js plus Google OAuth** for sign-in; use a separate consent flow to request Calendar access
- **Google Calendar API** with Google's Node.js `googleapis` client to add each student's event after teams are assigned and remove it if the event is removed
- **Inngest** for retryable background work: deadline processing, team assignment, Calendar sync, and notifications
- **Hosting:** Vercel for the Next.js app and Neon for managed PostgreSQL
- **Tests:** Vitest for unit/integration tests and Playwright for browser flows

Keep Google OAuth client secrets and refresh tokens on the server. Request the narrow `calendar.events` scope, encrypt refresh tokens at rest, and never send tokens to the browser. Registration and team assignment should be saved before calendar creation; Calendar sync should be retried safely if Google is temporarily unavailable. Store the resulting Google event ID and sync status so retries do not create duplicate events.

---

## Event and Team Workflow

1. An admin creates an event with its registration deadline and maximum team size. The minimum team size is 3; the admin specifies a maximum of 3 or more.
2. Students register individually before the deadline. They do not choose teammates or teams.
3. Registration closes at the deadline. The system forms teams from all eligible registrants, avoiding any pair of students who have already shared a team at a previous event.
4. The system publishes team assignments. Students can view their teammates from the event page and their profile.
5. If the constraints make a complete assignment impossible, the event is flagged for admin review. The system must not silently create a repeat pairing.
6. After teams are assigned, the system creates the event on each connected student's Google Calendar. If the event is removed from SlotIn, it is also removed from connected students' calendars.

Team sizes should be balanced between 3 and the admin-configured maximum. For example, with 21 registrants and a maximum of 4, the system can form three teams of 4 and three teams of 3. Six teams of 3 plus one team of 4 would require 22 students.

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

## Backend Module

The backend is the application layer between the student/admin interfaces and the database. It authenticates requests, checks permissions and business rules, persists event and registration data, runs team assignment, and returns consistent API responses. The backend described here is proposed; this section documents intended behavior rather than claiming these features are implemented.

### Responsibilities

- Authenticate students and admins and enforce role-based access on the server.
- Create, edit, delete, list, and retrieve events; validate event dates, deadlines, and team-size limits.
- Record student registrations and prevent duplicates or registration after the deadline or cancellation.
- Generate balanced teams when registration closes, using completed team rosters to check prior teammate pairings.
- Persist team membership and assignment status, and provide event, team, participant, and user-history views.
- Accept activity submissions, enforce submission deadlines, track status, and provide admin review endpoints.
- Validate all input and return predictable errors for invalid, unauthorized, missing, or conflicting requests.

### Authentication and authorization

SlotIn uses Google OAuth for sign-in. The server resolves the user's **Admin** or **Student** role using the configured role-assignment policy and checks it for every protected operation. Admin-only actions include event management, viewing all registrations and submissions, and triggering or resolving team assignment. Students can register for eligible events, view their own team and history, and submit work when submissions are enabled. A student's browser must never be trusted to establish its role or eligibility.

Keep OAuth secrets and tokens on the server. Calendar access, if enabled, uses a separate consent flow and narrow Calendar scope; refresh tokens should be encrypted at rest and never returned to the browser.

### Event participation and team assignment

Students register individually; they do not select or join a team. At the deadline, the assignment process uses all eligible registrations and the event's minimum and maximum team sizes. It balances team sizes as evenly as possible: for 23 registrants with a maximum of 5, capacities are `5, 5, 5, 4, 4`.

Prior completed team rosters are the source of teammate history. Every pair in a prior team contributes to the history count. Assignment should avoid all previously paired students as a hard constraint, consistent with the No-Repeat Teammate Rule above. Where multiple valid allocations exist, prefer the allocation with fewer repeated pairings if an explicitly recorded exception is permitted; never silently create a repeat pairing. If no valid assignment exists, save an admin-review state and explain the constraint conflict. Assignment requests and deadline jobs must be safe to retry without creating duplicate teams or incrementing history twice.

Before saving an allocation, validate that each eligible registrant appears exactly once, no team exceeds its configured capacity, and all teams meet the event's size rules. Save rosters as the durable source of future teammate history. Group availability (`OPEN` or `FULL`) can be derived from capacity and current membership; assigned teams are not open groups that students can join.

### Submissions

If activity submissions are enabled, store the activity, submitting user and/or assigned team, description, output or evidence link, submission time, and status. Enforce the deadline on the server. Suggested states are `PENDING`, `SUBMITTED`, and `LATE`; the event's submission policy must define whether late submissions are rejected or recorded as late. Admins can view submissions and status by event.

### Suggested data entities

The database should preserve the relationships and constraints represented by these entities:

| Entity | Purpose |
|---|---|
| `User` | Profile and role; identity comes from Google OAuth. |
| `Event` | Event details, registration and submission deadlines, team-size limits, status, and creator. |
| `Registration` | One user's participation state and registration time for an event. Enforce a unique `(eventId, userId)` pair. |
| `Team` / `TeamMember` | Persisted assignment and event roster; enforce unique membership per event. |
| `Submission` | User or team output, submission time, and review/status data. |
| `EventSuggestion` | Optional student proposals for admin review. |

Prior teammate counts can be derived from completed team rosters or maintained as a rebuildable index. If counts are stored, update them in the same transaction as finalizing an assignment, and ensure retries cannot double-count. Use foreign keys and database uniqueness constraints as well as application-level validation.

### REST API surface

The proposed API uses the existing event and registration model:

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/v1/events` | Signed in | List published events and the current student's registration state. |
| `GET /api/v1/events/{eventId}` | Signed in | Retrieve event details and the current student's team, if published. |
| `POST /api/v1/events/{eventId}/registrations` | Student | Register for an eligible event. |
| `DELETE /api/v1/events/{eventId}/registrations/me` | Student | Withdraw before the deadline under the MVP policy. |
| `POST /api/v1/admin/events` | Admin | Create an event. |
| `PATCH /api/v1/admin/events/{eventId}` | Admin | Edit an event according to lifecycle rules. |
| `POST /api/v1/admin/events/{eventId}/publish` | Admin | Publish an event. |
| `DELETE /api/v1/admin/events/{eventId}` | Admin | Soft-remove an event and enqueue related cleanup. |
| `GET /api/v1/admin/events/{eventId}/registrations` | Admin | View event participants. |
| `GET /api/v1/admin/events/{eventId}/assignment` | Admin | View assignment status and diagnostics. |
| `POST /api/v1/admin/events/{eventId}/assignment/retry` | Admin | Retry team assignment. |
| `POST /api/v1/admin/events/{eventId}/assignment/exceptions` | Admin | Record an explicitly approved repeat-pair exception. |
| `POST /api/v1/events/{eventId}/submissions` | Student | Submit work before the configured deadline. |
| `GET /api/v1/admin/events/{eventId}/submissions` | Admin | Review submissions and status for an event. |

The API should return `400` for invalid input, `401` for unauthenticated requests, `403` for disallowed roles, `404` for missing resources, and `409` for conflicts such as duplicate registration or an invalid lifecycle transition. Responses should include a stable error code and a user-readable message. The route list is proposed; finalize request and response details in `docs/API_CONTRACT.md` before implementation.

### Core guarantees

- Enforce role, registration, capacity, and deadline rules on the server.
- Persist registration separately from team assignment.
- Assign every eligible registrant exactly once, or mark the event for admin review.
- Keep teams within configured size limits and balance their sizes.
- Do not silently repeat a teammate pairing; use prior finalized rosters as history.
- Make assignment and its history updates transactional and safe to retry.
- Track submission state and validate its deadline server-side.

---

## Gaps & Issues to Resolve

### Logic gaps

- [ ] Define the supported upper bound for the admin-configured maximum team size.
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
- [ ] Store each event's registration deadline and admin-configured maximum team size (minimum is 3).
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
  - minTeamSize: 3
  - maxTeamSize: admin configured (>= 3)
  - status: registration_open | registration_closed | assigning |
            assigned | needs_admin_review | cancelled | removed | archived
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
