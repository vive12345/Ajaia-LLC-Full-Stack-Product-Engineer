import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/access";
import { getDocumentRole } from "@/lib/documents";
import { assertSameOrigin, route } from "@/lib/http";
import { idSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** DELETE /api/documents/:id/shares/:userId — owner revokes someone's access. */
export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id, userId } = await params;
  const user = await requireUser();
  assertCan(await getDocumentRole(id, user.id), "share");

  if (idSchema.safeParse(userId).success) {
    await prisma.documentShare.deleteMany({ where: { documentId: id, userId } });
  }
  return new NextResponse(null, { status: 204 });
});
