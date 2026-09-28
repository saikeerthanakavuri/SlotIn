import { describe, expect, it } from "vitest";
import { ERROR_STATUS, UNDOCUMENTED_CODES, isErrorCode } from "../contract/errors.js";
import { ROUTES, codesFor } from "../contract/routes.js";

/**
 * Contract self-consistency for docs/API_CONTRACT.md.
 *
 * This suite needs no running application. It checks that the contract is
 * complete and internally coherent before any endpoint is implemented against
 * it, which is the one class of test that is useful before the app exists.
 *
 * Two known defects are pinned with `it.fails`. That keeps the suite green while
 * making the gap impossible to overlook. When a defect is fixed, the `it.fails`
 * case starts failing and must be promoted to a plain `it`.
 */

/** Mirrors the documented role split in Backend-Doc.md section 2. */
function allows(caller: "student" | "admin" | null, required: string): boolean {
  switch (required) {
    case "public":
      return true;
    case "any":
      return caller !== null;
    case "student":
      return caller === "student";
    case "admin":
      return caller === "admin";
    default:
      throw new Error(`unknown role requirement: ${required}`);
  }
}

describe("route table", () => {
  it("covers every route documented in Backend-Doc.md section 10", () => {
    expect(ROUTES).toHaveLength(30);
    expect(new Set(ROUTES.map((r) => `${r.method} ${r.path}`)).size).toBe(ROUTES.length);
  });

  it("declares a success status and a role for every route", () => {
    for (const route of ROUTES) {
      expect(route.success, `${route.method} ${route.path}`).toBeGreaterThanOrEqual(200);
      expect(route.success, `${route.method} ${route.path}`).toBeLessThan(400);
      expect(route.role, `${route.method} ${route.path}`).toBeTruthy();
    }
  });

  it("uses only supported HTTP methods", () => {
    const supported = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
    for (const route of ROUTES) {
      expect(supported.has(route.method), `${route.method} ${route.path}`).toBe(true);
    }
  });

  it("uses absolute API paths without trailing slashes", () => {
    for (const route of ROUTES) {
      expect(route.path, `${route.method} path`).toMatch(/^\/api\//);
      expect(route.path, `${route.method} ${route.path}`).not.toMatch(/\/$/);
      expect(route.path, `${route.method} ${route.path}`).not.toContain("//");
    }
  });

  it("uses unique error codes on each route", () => {
    for (const route of ROUTES) {
      expect(new Set(route.errors).size, `${route.method} ${route.path}`).toBe(route.errors.length);
    }
  });

  it("uses redirect status only for OAuth entry and callback", () => {
    const redirects = ROUTES.filter((route) => route.success >= 300 && route.success < 400);
    expect(redirects.map((route) => route.path)).toEqual([
      "/api/auth/google",
      "/api/auth/google/callback",
    ]);
  });

  it("uses 204 for endpoints documented as no-content operations", () => {
    const noContent = ROUTES.filter((route) => route.success === 204);
    expect(noContent.map((route) => `${route.method} ${route.path}`)).toEqual([
      "POST /api/auth/logout",
      "DELETE /api/activities/:id",
      "DELETE /api/activities/:id/registrations/me",
      "DELETE /api/me/calendar-connection",
    ]);
  });

  it("protects every non-public route with 401 and 403", () => {
    // An unauthenticated caller must never receive a role error that reveals
    // whether the resource exists (BE-008).
    for (const route of ROUTES) {
      if (route.role === "public") continue;
      const codes = codesFor(route);
      expect(codes, route.path).toContain("unauthenticated");
      expect(codes, route.path).toContain("forbidden");
    }
  });
});

describe("error code vocabulary", () => {
  it("resolves each documented code to a stable HTTP status", () => {
    expect(ERROR_STATUS.unauthenticated).toBe(401);
    expect(ERROR_STATUS.forbidden).toBe(403);
    expect(ERROR_STATUS.not_found).toBe(404);
    expect(ERROR_STATUS.invalid_input).toBe(400);
  });

  it("uses 409 for every conflict code", () => {
    const nonConflict = new Set(["unauthenticated", "forbidden", "not_found", "invalid_input"]);
    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      if (nonConflict.has(code)) continue;
      expect(status, code).toBe(409);
    }
  });

  it("knows every code a route can return", () => {
    const unknown = ROUTES.flatMap((route) =>
      route.errors
        .filter((code) => !isErrorCode(code))
        .map((code) => `${route.method} ${route.path} -> ${code}`),
    );
    // PINNED DEFECT: these codes appear in route docs but are missing from the
    // canonical table in API_CONTRACT.md. Promote to a plain `it` once fixed.
    expect(unknown).toEqual([]);
  });

  it.fails("has no undocumented error codes (pinned defect)", () => {
    expect([...UNDOCUMENTED_CODES]).toEqual([]);
  });
});

describe("authorization matrix", () => {
  it("denies students every admin route", () => {
    const adminRoutes = ROUTES.filter((r) => r.role === "admin");
    expect(adminRoutes.length).toBeGreaterThan(0);
    for (const route of adminRoutes) {
      expect(allows("student", route.role), `${route.method} ${route.path}`).toBe(false);
      expect(allows("admin", route.role), `${route.method} ${route.path}`).toBe(true);
    }
  });

  it("denies admins every student-only route", () => {
    // Backend-Doc.md: an admin may not register for an activity.
    for (const route of ROUTES.filter((r) => r.role === "student")) {
      expect(allows("admin", route.role), `${route.method} ${route.path}`).toBe(false);
    }
  });

  it("treats an absent session as unauthenticated on every non-public route", () => {
    // `undecided` is excluded; it has no defined answer and is pinned below.
    for (const route of ROUTES.filter((r) => r.role !== "undecided")) {
      expect(allows(null, route.role), route.path).toBe(route.role === "public");
    }
  });

  it.fails("has no route with an undecided authorization rule (pinned defect)", () => {
    // GET /api/groups/:groupId is still an open decision in TEST_PLAN.md.
    expect(ROUTES.filter((r) => r.role === "undecided")).toEqual([]);
  });
});
