import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

/** An error that maps directly to an HTTP status and a user-safe message. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "You need to sign in.");
export const forbidden = (msg = "You don't have permission to do that.") => new HttpError(403, msg);
export const notFound = (msg = "Not found.") => new HttpError(404, msg);
export const badRequest = (msg: string) => new HttpError(400, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * CSRF defense for cookie-authenticated, state-changing requests.
 * Browsers always send `Origin` on cross-site POST/PATCH/DELETE; if it doesn't
 * match our host, reject. Requests without Origin (curl, server-to-server)
 * can't carry a victim's cookies via a malicious site, so they are allowed.
 */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Invalid request origin.");
  }
  if (originHost !== host) throw forbidden("Cross-site request blocked.");
}

/**
 * Wraps a route handler: converts thrown HttpError / ZodError into clean JSON
 * responses and hides unexpected errors behind a generic 500.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return jsonError(err.status, err.message);
      if (err instanceof ZodError) {
        return jsonError(400, err.issues[0]?.message ?? "Invalid request.");
      }
      console.error(err);
      return jsonError(500, "Something went wrong. Please try again.");
    }
  };
}
