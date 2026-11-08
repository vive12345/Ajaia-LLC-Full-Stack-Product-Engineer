import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

// Placeholder home page — replaced by the document list in the editor step.
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ajaia Docs</h1>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            Signed in as <strong className="text-slate-900">{user.name}</strong>
          </span>
          <SignOutButton />
        </div>
      </header>
      <p className="mt-8 text-slate-600">Your documents will appear here.</p>
    </main>
  );
}
