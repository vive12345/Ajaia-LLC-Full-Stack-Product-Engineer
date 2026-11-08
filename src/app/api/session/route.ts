import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { endSession, getCurrentUser, startSession } from "@/lib/auth";
import { assertSameOrigin, badRequest, route, unauthorized } from "@/lib/http";

const signInSchema = z.object({ userId: z.uuid("Invalid user id.") });

/** GET /api/session — who am I? */
export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return NextResponse.json({ user });
});

/** POST /api/session { userId } — sign in as a seeded demo user. */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const body = await req.json().catch(() => {
    throw badRequest("Request body must be JSON.");
  });
  const { userId } = signInSchema.parse(body);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw badRequest("Unknown user.");

  await startSession(user.id);
  return NextResponse.json({ user });
});

/** DELETE /api/session — sign out. */
export const DELETE = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await endSession();
  return new NextResponse(null, { status: 204 });
});
