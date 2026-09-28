import { describe, expect, it } from "vitest";
import {
  ERROR_STATUS,
  assertNoSecretLeak,
  errorEnvelope,
  isErrorCode,
} from "../contract/errors.js";

describe("error contract helpers", () => {
  it("recognizes every canonical error code", () => {
    for (const code of Object.keys(ERROR_STATUS)) {
      expect(isErrorCode(code), code).toBe(true);
    }
  });

  it.each(["", "UNKNOWN", "already-registered", 401, null, undefined, {}, []])(
    "rejects non-codes (%s)",
    (value) => {
      expect(isErrorCode(value)).toBe(false);
    },
  );

  it("does not mistake inherited object properties for error codes", () => {
    expect(isErrorCode("toString")).toBe(false);
    expect(isErrorCode("constructor")).toBe(false);
  });

  it("builds the documented error envelope without changing the message", () => {
    expect(errorEnvelope("registration_closed", "Registration is closed")).toEqual({
      error: { code: "registration_closed", message: "Registration is closed" },
    });
  });

  it("allows ordinary messages and structured payloads through the leak guard", () => {
    expect(() => assertNoSecretLeak("Calendar sync is pending")).not.toThrow();
    expect(() => assertNoSecretLeak({ error: { code: "invalid_input", message: "Bad date" } })).not.toThrow();
  });

  it.each([
    "access token ya29.sample-token",
    "refresh token 1//abcdefghijklmnopqrstuv",
    "Authorization: Bearer opaque-value",
    "-----BEGIN PRIVATE KEY-----",
    "refresh_token",
    "postgresql://user:password@localhost/db",
  ])("rejects sensitive provider or infrastructure material", (payload) => {
    expect(() => assertNoSecretLeak(payload)).toThrow(/secret material leaked/);
  });

  it("checks nested structured values for secret material", () => {
    expect(() =>
      assertNoSecretLeak({
        error: { message: "request failed" },
        debug: { authorization: "Bearer hidden-value" },
      }),
    ).toThrow(/secret material leaked/);
  });

  it("handles values that cannot be JSON serialized", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => assertNoSecretLeak(cyclic)).not.toThrow();
  });
});
