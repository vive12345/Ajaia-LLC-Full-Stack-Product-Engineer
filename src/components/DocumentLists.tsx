"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Upload, Users } from "lucide-react";

const ACCEPTED = ".txt,.md,.markdown,.docx";
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

type OwnedDoc = { id: string; title: string; updatedAt: string };
type SharedDoc = OwnedDoc & { ownerName: string; role: "VIEWER" | "EDITOR" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function DocumentLists({ owned, shared }: { owned: OwnedDoc[]; shared: SharedDoc[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"owned" | "shared">("owned");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function importDocument(file: File) {
    setError(null);
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED.split(",").includes(ext)) {
      setError("Unsupported file type. Please upload a .txt, .md or .docx file.");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setError("The file is too large (max 4 MB).");
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      router.push(`/docs/${data.document.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setImporting(false);
    } finally {
      if (fileInput.current) fileInput.current.value = ""; // allow re-selecting the same file
    }
  }

  async function createDocument() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create document.");
      router.push(`/docs/${data.document.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create document.");
      setCreating(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 border-b-2 px-1 pb-2 text-sm font-medium ${
      active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <div className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            aria-label="Import file"
            onChange={(e) => e.target.files?.[0] && importDocument(e.target.files[0])}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            title="Supports .txt, .md and .docx (max 4 MB)"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import file
          </button>
          <button
            onClick={createDocument}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New document
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Import turns a <strong>.txt</strong>, <strong>.md</strong> or <strong>.docx</strong> file (max
        4 MB) into a new editable document. Headings, lists, bold, italic and underline are kept;
        images, tables and other formatting are not.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-6 border-b border-slate-200">
        <button className={tabClass(tab === "owned")} onClick={() => setTab("owned")}>
          <FileText className="h-4 w-4" /> My documents ({owned.length})
        </button>
        <button className={tabClass(tab === "shared")} onClick={() => setTab("shared")}>
          <Users className="h-4 w-4" /> Shared with me ({shared.length})
        </button>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {tab === "owned" &&
          (owned.length === 0 ? (
            <Empty text="You don't own any documents yet. Create one to get started." />
          ) : (
            owned.map((doc) => (
              <Row key={doc.id} id={doc.id} title={doc.title} meta={`Edited ${formatDate(doc.updatedAt)}`} badge="Owner" />
            ))
          ))}
        {tab === "shared" &&
          (shared.length === 0 ? (
            <Empty text="Nothing has been shared with you yet." />
          ) : (
            shared.map((doc) => (
              <Row
                key={doc.id}
                id={doc.id}
                title={doc.title}
                meta={`Shared by ${doc.ownerName} · Edited ${formatDate(doc.updatedAt)}`}
                badge={doc.role === "EDITOR" ? "Can edit" : "View only"}
              />
            ))
          ))}
      </ul>
    </div>
  );
}

function Row({ id, title, meta, badge }: { id: string; title: string; meta: string; badge: string }) {
  return (
    <li>
      <Link href={`/docs/${id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50">
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{title}</span>
          <span className="block truncate text-xs text-slate-500">{meta}</span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{badge}</span>
      </Link>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <li className="px-4 py-10 text-center text-sm text-slate-500">{text}</li>;
}
