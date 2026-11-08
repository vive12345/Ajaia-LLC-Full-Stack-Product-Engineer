"use client";

import { useEffect, useState } from "react";
import { Loader2, UserMinus, X } from "lucide-react";

export type Collaborator = {
  role: "VIEWER" | "EDITOR";
  user: { id: string; name: string; email: string };
};

export function ShareDialog({
  documentId,
  shares,
  onChange,
  onClose,
}: {
  documentId: string;
  shares: Collaborator[];
  onChange: (shares: Collaborator[]) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function share(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not share.");
      const next = shares.filter((s) => s.user.id !== data.share.user.id);
      onChange([...next, data.share]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    setError(null);
    const res = await fetch(`/api/documents/${documentId}/shares/${userId}`, { method: "DELETE" });
    if (res.ok) onChange(shares.filter((s) => s.user.id !== userId));
    else setError("Could not remove access.");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="share-title" className="text-lg font-semibold">Share document</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={share} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@ajaia.dev"
            aria-label="Email address"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "VIEWER" | "EDITOR")}
            aria-label="Permission"
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="VIEWER">Can view</option>
            <option value="EDITOR">Can edit</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Share
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Demo accounts: alice@ajaia.dev, bob@ajaia.dev, carol@ajaia.dev
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <h3 className="mt-6 text-sm font-medium text-slate-700">People with access</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {shares.length === 0 && <li className="py-3 text-sm text-slate-500">Only you.</li>}
          {shares.map((s) => (
            <li key={s.user.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.user.name}</span>
                <span className="block truncate text-xs text-slate-500">{s.user.email}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-slate-600">{s.role === "EDITOR" ? "Can edit" : "Can view"}</span>
                <button
                  onClick={() => revoke(s.user.id)}
                  aria-label={`Remove ${s.user.name}`}
                  title="Remove access"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
