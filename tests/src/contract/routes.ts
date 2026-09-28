import type { ErrorCode } from "./errors.js";

/**
 * Every route in docs/Backend-Doc.md section 10, with the role requirement and
 * the failure codes docs/API_CONTRACT.md declares for it.
 *
 * `role: "undecided"` marks an authorization rule the docs have not settled.
 * `contract.spec.ts` fails while any `undecided` entry remains, so the gap
 * cannot be quietly shipped (see BE-109 and the open decision in TEST_PLAN.md).
 */
export type Role = "public" | "student" | "admin" | "any" | "undecided";

export type RouteSpec = {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  role: Role;
  success: number;
  /** 401/403/404 are added automatically for non-public routes. */
  errors: ErrorCode[];
  /** Notes an open product/API decision attached to this route. */
  note?: string;
};

export const ROUTES: RouteSpec[] = [
  // ---- Authentication ----
  { method: "GET", path: "/api/auth/google", role: "public", success: 302, errors: [] },
  { method: "GET", path: "/api/auth/google/callback", role: "public", success: 302, errors: [] },
  { method: "POST", path: "/api/auth/logout", role: "any", success: 204, errors: [] },
  { method: "GET", path: "/api/auth/me", role: "any", success: 200, errors: [] },

  // ---- Activities ----
  {
    method: "POST",
    path: "/api/activities",
    role: "admin",
    success: 201,
    errors: ["invalid_input"],
  },
  { method: "GET", path: "/api/activities", role: "any", success: 200, errors: [] },
  { method: "GET", path: "/api/activities/:id", role: "any", success: 200, errors: [] },
  {
    method: "PUT",
    path: "/api/activities/:id",
    role: "admin",
    success: 200,
    errors: ["invalid_input", "assignment_already_published"],
  },
  { method: "DELETE", path: "/api/activities/:id", role: "admin", success: 204, errors: [] },
  {
    method: "POST",
    path: "/api/activities/:id/publish",
    role: "admin",
    success: 200,
    errors: ["invalid_status_transition"],
  },

  // ---- Registrations ----
  {
    method: "POST",
    path: "/api/activities/:id/registrations",
    role: "student",
    success: 201,
    errors: [
      "already_registered",
      "registration_closed",
      "event_cancelled",
    ],
  },
  {
    method: "DELETE",
    path: "/api/activities/:id/registrations/me",
    role: "student",
    success: 204,
    errors: ["withdrawal_closed", "not_found"],
  },
  {
    method: "GET",
    path: "/api/activities/:id/registrations",
    role: "admin",
    success: 200,
    errors: [],
  },

  // ---- Group allocation ----
  {
    method: "POST",
    path: "/api/activities/:id/generate-groups",
    role: "admin",
    success: 202,
    errors: ["insufficient_participants", "already_assigned"],
  },
  { method: "GET", path: "/api/activities/:id/groups", role: "admin", success: 200, errors: [] },
  {
    method: "GET",
    path: "/api/groups/:groupId",
    role: "undecided",
    success: 200,
    errors: [],
    note: "TEST_PLAN.md: authorization for group detail is an open decision. BE-109 requires a documented rule before this is testable.",
  },
  {
    method: "GET",
    path: "/api/users/me/group/:activityId",
    role: "student",
    success: 200,
    errors: ["not_assigned"],
  },

  // ---- Assignment review ----
  { method: "GET", path: "/api/activities/:id/assignment", role: "admin", success: 200, errors: [] },
  {
    method: "POST",
    path: "/api/activities/:id/assignment/retry",
    role: "admin",
    success: 202,
    errors: [],
    note: "API_CONTRACT.md declares no error codes for retry; BE-116/117 require 403/404 and a not-allowed response.",
  },
  {
    method: "POST",
    path: "/api/activities/:id/assignment/exceptions",
    role: "admin",
    success: 201,
    errors: ["invalid_input", "not_found"],
  },

  // ---- Submissions ----
  {
    method: "POST",
    path: "/api/activities/:id/submit",
    role: "student",
    success: 201,
    errors: ["submission_deadline_passed", "not_assigned"],
  },
  { method: "GET", path: "/api/activities/:id/submissions", role: "admin", success: 200, errors: [] },
  { method: "GET", path: "/api/submissions/:id", role: "admin", success: 200, errors: [] },

  // ---- Calendar ----
  { method: "GET", path: "/api/me/calendar-connection", role: "student", success: 200, errors: [] },
  { method: "POST", path: "/api/me/calendar-connection", role: "student", success: 200, errors: [] },
  { method: "DELETE", path: "/api/me/calendar-connection", role: "student", success: 204, errors: [] },
  { method: "GET", path: "/api/me/calendar-syncs", role: "student", success: 200, errors: [] },

  // ---- Suggestions ----
  {
    method: "POST",
    path: "/api/suggestions",
    role: "student",
    success: 201,
    errors: ["invalid_input"],
  },
  { method: "GET", path: "/api/admin/suggestions", role: "admin", success: 200, errors: [] },
  {
    method: "PATCH",
    path: "/api/admin/suggestions/:id",
    role: "admin",
    success: 200,
    errors: ["invalid_input", "not_found"],
  },
];

/** Every code a non-public route may return, including the automatic 401/403/404. */
export function codesFor(route: RouteSpec): ErrorCode[] {
  const base: ErrorCode[] =
    route.role === "public" ? [] : ["unauthenticated", "forbidden", "not_found"];
  return [...new Set([...base, ...route.errors])];
}
