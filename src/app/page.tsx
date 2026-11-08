import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { DocumentLists } from "@/components/DocumentLists";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Same queries as GET /api/documents, run directly on the server for a fast first render.
  const [owned, shares] = await Promise.all([
    prisma.document.findMany({
      where: { ownerId: user.id },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.documentShare.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        document: {
          select: { id: true, title: true, updatedAt: true, owner: { select: { name: true } } },
        },
      },
      orderBy: { document: { updatedAt: "desc" } },
    }),
  ]);

  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <DocumentLists
          owned={owned.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() }))}
          shared={shares.map(({ role, document }) => ({
            id: document.id,
            title: document.title,
            updatedAt: document.updatedAt.toISOString(),
            ownerName: document.owner.name,
            role,
          }))}
        />
      </main>
    </>
  );
}
