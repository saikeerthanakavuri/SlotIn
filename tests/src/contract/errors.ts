/**
 * Canonical error vocabulary from docs/API_CONTRACT.md "Reliability and errors".
 *
 * This table is the single source of truth for error codes. `routes.ts` declares
 * the codes each endpoint can return, and `contract.spec.ts` asserts that every
 * declared code exists here. Adding a code to a route without adding it here
 * fails the suite (see BE-144).
 */

export const ERROR_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  already_registered: 409,
  registration_closed: 409,
  event_cancelled: 409,
  withdrawal_closed: 409,
  submission_deadline_passed: 409,
  assignment_already_published: 409,
  not_assigned: 409,
  insufficient_participants: 409,
  already_assigned: 409,
  invalid_status_transition: 409,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Codes the contract documents but that are missing from the table above. */
export const UNDOCUMENTED_CODES = [
  "not_assigned",
  "insufficient_participants",
  "already_assigned",
  "invalid_status_transition",
] as const;

export type ErrorEnvelope = {
  error: { code: ErrorCode; message: string };
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_STATUS, value);
}

export function errorEnvelope(code: ErrorCode, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

const SECRET_PATTERNS: RegExp[] = [
  /\bya29\.[\w-]+/g, // Google OAuth access token
  /\b1\/\/[\w-]{20,}/g, // Google refresh token
  /\bBearer\s+\S+/gi,
  /-----BEGIN[A-Z ]*PRIVATE KEY-----/g,
  /\b(refresh|access|id)_token\b/gi,
  /postgres(?:ql)?:\/\/\S+/gi, // connection string
];

/**
 * Guards every user-facing error message. BE-078/BE-138 require that no token,
 * stack frame, SQL text, or connection string reaches a response or a log line.
 */
export function assertNoSecretLeak(payload: unknown): void {
  const text =
    typeof payload === "string" ? payload : safeStringify(payload);

  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    const hit = pattern.exec(text);
    if (hit) {
      throw new Error(`secret material leaked: matched ${pattern} -> "${hit[0]}"`);
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
