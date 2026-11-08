import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LoginPicker } from "@/components/LoginPicker";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { email: "asc" },
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Ajaia Docs</h1>
        <p className="mt-1 text-sm text-slate-600">Choose a demo account to continue.</p>

        <LoginPicker users={users} />

        <p className="mt-6 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Demo authentication: accounts are seeded and no password is required. Sign in as
          different users to test sharing (Alice owns the sample document, Bob can edit it,
          Carol can only view it).
        </p>
      </div>
    </main>
  );
}
