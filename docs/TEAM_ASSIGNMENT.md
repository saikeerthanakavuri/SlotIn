# Team Assignment Rules

## Inputs

- Active registrations for an event after its deadline.
- Event's minimum team size (3) and admin-configured maximum (3 or greater).
- Completed team rosters from earlier events.
- Optional admin-approved exception records.

## Hard constraints

1. Every eligible registrant is assigned exactly once for a successful complete assignment.
2. Team sizes stay within the event's configured minimum and maximum.
3. No pair in a team has shared a team at an earlier completed event, unless there is a specific recorded admin exception.
4. Never publish a partial assignment as final.

## Balancing objective

Among valid assignments, prefer team sizes that are as even as possible. For example, 21 registrants with maximum size 4 can be assigned to three teams of 4 and three teams of 3. Six teams of 3 plus one team of 4 would require 22 registrants.

## Proposed solver behavior

Model each student as a vertex and each forbidden repeat pairing as an edge. A team is a group with no forbidden edge between any pair. Partition students into groups of at least 3 and at most the admin-configured maximum; optimize for balanced team sizes. Recommended first implementation: deterministic bounded backtracking with pruning and a separate verifier. If expected event sizes make this too slow, move solving to a dedicated OR-Tools CP-SAT worker. Persist the algorithm version and seed for reproducibility.

If the solver reaches its configured time/resource limit without proving success or impossibility, keep the event in `needs_admin_review` with reason `solver_limit`; do not assume no solution exists. A later retry can use a higher limit or updated settings.

## Impossible or uncertain assignment

- On proven infeasibility, save diagnostics such as the number of registrations, size constraints, and highly connected conflict groups.
- Leave registration data intact and do not publish teams.
- Admin may adjust the size range and rerun, or approve an exception for specified pairs. Record actor, reason, timestamp, and pair(s).
- Re-run using a new assignment version; retain audit history of prior attempts.

## Correctness checks before publish

- Every active registration occurs exactly once.
- Every team size is in range.
- No forbidden pair exists unless covered by a recorded exception.
- Assignment rows and event status are committed atomically.
- Rerunning the same job does not create duplicate teams or change an already published assignment without an explicit admin action.

## Open technical choice

Benchmark the recommended backtracking solver against expected event sizes before launch. Keep the constraint model and verifier independent of the solver so it can be replaced without changing product rules.
