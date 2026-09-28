/**
 * Integration suites need a running server and a PostgreSQL instance. Neither
 * is present in every environment, so the suites self-skip with a reason
 * instead of failing or silently passing (BE-215).
 */
export const BASE_URL = process.env.SLOTIN_BASE_URL;
export const DATABASE_URL = process.env.DATABASE_URL;

export const integrationSkip = !BASE_URL
  ? "SLOTIN_BASE_URL is not set; start the app and point this at it to run integration tests"
  : !DATABASE_URL
    ? "DATABASE_URL is not set; integration tests require an isolated PostgreSQL instance"
    : false;

export function requireIntegration(): void {
  if (integrationSkip) throw new Error(String(integrationSkip));
}

export function api(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const { cookie, headers, ...rest } = init;
  return fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(headers ?? {}),
    },
  });
}
