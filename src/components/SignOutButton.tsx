"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
    >
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}
