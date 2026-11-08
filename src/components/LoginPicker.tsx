"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRound } from "lucide-react";

type DemoUser = { id: string; name: string; email: string };

export function LoginPicker({ users }: { users: DemoUser[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(userId: string) {
    setPendingId(userId);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Sign-in failed.");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setPendingId(null);
    }
  }

  if (users.length === 0) {
    return (
      <p className="mt-6 text-sm text-red-600">
        No demo users found. Run <code>npm run db:seed</code>.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-2">
      {users.map((user) => (
        <button
          key={user.id}
          onClick={() => signIn(user.id)}
          disabled={pendingId !== null}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:opacity-60"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            {pendingId === user.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserRound className="h-4 w-4" />
            )}
          </span>
          <span>
            <span className="block font-medium">Continue as {user.name}</span>
            <span className="block text-xs text-slate-500">{user.email}</span>
          </span>
        </button>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
