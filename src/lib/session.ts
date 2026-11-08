import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless, signed session tokens.
 *
 * Token format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 *
 * The payload is readable but cannot be modified without the secret:
 * changing the user id invalidates the signature.
 * Pure functions (no Next.js / DB imports) so they are easy to unit test.
 */

export { SESSION_COOKIE } from "@/lib/session-cookie";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  uid: string; // user id
  exp: number; // expiry, seconds since epoch
};

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(
  userId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const payload: SessionPayload = { uid: userId, exp: nowSeconds + SESSION_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

/** Returns the payload if the token is authentic and unexpired, otherwise null. */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  // Constant-time comparison prevents timing attacks that guess the signature byte by byte.
  const expected = Buffer.from(sign(encoded, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload?.uid !== "string" || typeof payload?.exp !== "number") return null;
    if (payload.exp <= nowSeconds) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Reads SESSION_SECRET and fails loudly if it is missing or weak. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return secret;
}
