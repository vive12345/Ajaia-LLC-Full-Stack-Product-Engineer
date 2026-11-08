import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/access";
import { editableBy, getDocumentRole } from "@/lib/documents";
import { assertSameOrigin, conflict, readJson, route } from "@/lib/http";
import { updateDocumentSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/documents/:id — full document + my role + collaborators. */
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const role = await getDocumentRole(id, user.id);
  assertCan(role, "view");

  const document = await prisma.document.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      version: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      shares: {
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ document, role });
});

/**
 * PATCH /api/documents/:id { title?, content?, version? }
 * Content saves use optimistic concurrency: the UPDATE only matches if the version
 * is unchanged AND the caller can still edit. Stale saves get 409.
 */
export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const user = await requireUser();
  const body = updateDocumentSchema.parse(await readJson(req));

  assertCan(await getDocumentRole(id, user.id), "edit");

  const data: Prisma.DocumentUpdateManyMutationInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.content !== undefined) {
    data.content = body.content as Prisma.InputJsonValue;
    data.version = { increment: 1 };
  }

  // Permission is checked again inside the write itself (race-safe).
  const where: Prisma.DocumentWhereInput = { id, ...editableBy(user.id) };
  if (body.content !== undefined) where.version = body.version;

  const { count } = await prisma.document.updateMany({ where, data });

  if (count === 0) {
    // Work out why: access revoked/deleted (403/404) or someone saved first (409).
    assertCan(await getDocumentRole(id, user.id), "edit");
    throw conflict("This document was changed by someone else. Reload to see the latest version.");
  }

  const document = await prisma.document.findUniqueOrThrow({
    where: { id },
    select: { id: true, title: true, version: true, updatedAt: true },
  });
  return NextResponse.json({ document });
});

/** DELETE /api/documents/:id — owner only; shares are removed by ON DELETE CASCADE. */
export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const user = await requireUser();
  assertCan(await getDocumentRole(id, user.id), "delete");

  await prisma.document.deleteMany({ where: { id, ownerId: user.id } });
  return new NextResponse(null, { status: 204 });
});
