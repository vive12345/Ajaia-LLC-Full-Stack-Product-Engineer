import { notFound, redirect } from "next/navigation";
import type { JSONContent } from "@tiptap/react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentRole } from "@/lib/documents";
import { AppHeader } from "@/components/AppHeader";
import { DocumentEditor } from "@/components/DocumentEditor";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getDocumentRole(id, user.id);
  if (!role) notFound(); // same 404 for "doesn't exist" and "no access"

  const doc = await prisma.document.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      version: true,
      owner: { select: { id: true, name: true, email: true } },
      shares: {
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <>
      <AppHeader userName={user.name} />
      <DocumentEditor
        document={{ ...doc, content: doc.content as JSONContent }}
        role={role}
      />
    </>
  );
}
