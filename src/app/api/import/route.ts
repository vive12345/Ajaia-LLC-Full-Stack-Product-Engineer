import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, badRequest, route } from "@/lib/http";
import { importFile } from "@/lib/import";
import { editorContentSchema } from "@/lib/validation";

export const runtime = "nodejs"; // mammoth and happy-dom need Node APIs

/** POST /api/import (multipart, field "file") — create a new document from a file. */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();

  const form = await req.formData().catch(() => {
    throw badRequest("Upload a file using multipart/form-data.");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file was uploaded.");

  const { title, content } = await importFile(file.name, Buffer.from(await file.arrayBuffer()));
  // Same structure and size rules as content saved from the editor.
  const validContent = editorContentSchema.parse(content);

  const document = await prisma.document.create({
    data: { ownerId: user.id, title, content: validContent as Prisma.InputJsonValue },
    select: { id: true, title: true, version: true, updatedAt: true },
  });

  return NextResponse.json({ document }, { status: 201 });
});
