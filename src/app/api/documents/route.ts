import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, readJson, route } from "@/lib/http";
import { EMPTY_DOCUMENT, createDocumentSchema } from "@/lib/validation";

/** GET /api/documents — documents I own and documents shared with me. */
export const GET = route(async () => {
  const user = await requireUser();

  const [owned, shares] = await Promise.all([
    prisma.document.findMany({
      where: { ownerId: user.id },
      select: { id: true, title: true, updatedAt: true }, // no content: lists don't need it
      orderBy: { updatedAt: "desc" },
    }),
    prisma.documentShare.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        document: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            owner: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { document: { updatedAt: "desc" } },
    }),
  ]);

  return NextResponse.json({
    owned,
    shared: shares.map(({ role, document }) => ({ ...document, role })),
  });
});

/** POST /api/documents { title?, content? } — create a document owned by me. */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = createDocumentSchema.parse(await readJson(req));

  const document = await prisma.document.create({
    data: {
      ownerId: user.id, // always from the session, never from the request body
      title: body.title ?? "Untitled document",
      content: (body.content ?? EMPTY_DOCUMENT) as Prisma.InputJsonValue,
    },
    select: { id: true, title: true, version: true, updatedAt: true },
  });

  return NextResponse.json({ document }, { status: 201 });
});
