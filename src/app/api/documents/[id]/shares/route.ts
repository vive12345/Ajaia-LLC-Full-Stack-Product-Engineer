import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/access";
import { getDocumentRole } from "@/lib/documents";
import { assertSameOrigin, badRequest, readJson, route } from "@/lib/http";
import { shareSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/documents/:id/shares { email, role } — owner grants access.
 * Re-sharing with the same person updates their role (upsert on the unique pair).
 */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const user = await requireUser();
  const { email, role } = shareSchema.parse(await readJson(req));

  assertCan(await getDocumentRole(id, user.id), "share");

  if (email === user.email.toLowerCase()) throw badRequest("You already own this document.");
  const recipient = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  if (!recipient) throw badRequest(`No user found with email ${email}.`);

  const share = await prisma.documentShare.upsert({
    where: { documentId_userId: { documentId: id, userId: recipient.id } },
    update: { role },
    create: { documentId: id, userId: recipient.id, role },
    select: { role: true },
  });

  return NextResponse.json({ share: { role: share.role, user: recipient } }, { status: 201 });
});
