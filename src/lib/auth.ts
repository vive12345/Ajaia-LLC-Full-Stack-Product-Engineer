import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { unauthorized } from "@/lib/http";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  getSessionSecret,
  verifySessionToken,
} from "@/lib/session";

/**
 * Demo authentication: users pick a seeded account; we issue a signed,
 * HttpOnly session cookie. Swapping in real auth (Auth.js/SSO) only
 * requires changing this file.
 */

export type CurrentUser = { id: string; email: string; name: string };

/** The signed-in user, or null. Verifies the signature AND that the user still exists. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value, getSessionSecret());
  if (!payload) return null;
  return prisma.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, email: true, name: true },
  });
}

/** Use in API routes: returns the user or throws 401. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function startSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(userId, getSessionSecret()), {
    httpOnly: true, // not readable by page JavaScript (limits XSS impact)
    sameSite: "lax", // not sent on cross-site POSTs (CSRF defense)
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
