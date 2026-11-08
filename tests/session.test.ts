import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  getSessionSecret,
  verifySessionToken,
} from "@/lib/session";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOW = 1_700_000_000;

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken(USER_ID, SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW + 60)).toEqual({
      uid: USER_ID,
      exp: NOW + SESSION_TTL_SECONDS,
    });
  });

  it("rejects a token whose payload was tampered with (identity swap)", () => {
    const token = createSessionToken(USER_ID, SECRET, NOW);
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ uid: "00000000-0000-4000-8000-000000000002", exp: NOW + 999 }),
    ).toString("base64url");
    expect(verifySessionToken(`${forgedPayload}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken(USER_ID, "another-secret-that-is-also-32-chars-long!", NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createSessionToken(USER_ID, SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW + SESSION_TTL_SECONDS)).toBeNull();
  });

  it.each([undefined, null, "", "garbage", "a.b.c", "only-one-part."])(
    "rejects malformed token %p",
    (token) => {
      expect(verifySessionToken(token, SECRET, NOW)).toBeNull();
    },
  );

  it("rejects a correctly signed token with an invalid payload shape", () => {
    // Signed with the real secret, but the payload is missing required fields.
    const badPayload = Buffer.from(JSON.stringify({ user: "x" })).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(badPayload).digest("base64url");
    expect(verifySessionToken(`${badPayload}.${sig}`, SECRET, NOW)).toBeNull();
  });
});

describe("getSessionSecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the secret when it is long enough", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(getSessionSecret()).toBe(SECRET);
  });

  it.each([undefined, "too-short"])("throws when the secret is %p", (value) => {
    vi.stubEnv("SESSION_SECRET", value as string);
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/);
  });
});
