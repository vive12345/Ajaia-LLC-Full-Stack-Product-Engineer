"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { editorExtensions } from "@/lib/editor-extensions";
import { AlertTriangle, ArrowLeft, Check, CloudOff, Eye, Loader2, Share2, Trash2 } from "lucide-react";
import { EditorToolbar } from "@/components/EditorToolbar";
import { ShareDialog, type Collaborator } from "@/components/ShareDialog";

type Role = "OWNER" | "EDITOR" | "VIEWER";
type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export type EditorDocument = {
  id: string;
  title: string;
  content: JSONContent;
  version: number;
  owner: { id: string; name: string; email: string };
  shares: Collaborator[];
};

const AUTOSAVE_DELAY_MS = 800;

export function DocumentEditor({ document: doc, role }: { document: EditorDocument; role: Role }) {
  const router = useRouter();
  const canEdit = role !== "VIEWER";
  const isOwner = role === "OWNER";

  const [title, setTitle] = useState(doc.title);
  const [savedTitle, setSavedTitle] = useState(doc.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shares, setShares] = useState<Collaborator[]>(doc.shares);

  // Refs hold autosave bookkeeping without re-rendering on every keystroke.
  const versionRef = useRef(doc.version);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const stoppedRef = useRef(false); // set after a conflict or lost access
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const editor = useEditor({
    extensions: editorExtensions,
    content: doc.content,
    editable: canEdit,
    immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
    editorProps: {
      attributes: {
        class: "doc-content min-h-[60vh] px-6 py-6 sm:px-12 sm:py-10 focus:outline-none",
        "aria-label": "Document content",
      },
    },
    onUpdate: () => {
      if (stoppedRef.current) return;
      setStatus("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveRef.current(), AUTOSAVE_DELAY_MS);
    },
  });

  /**
   * Save the full document with the version we last saw.
   * One request at a time: edits made during a save trigger one follow-up save.
   */
  const save = useCallback(async () => {
    if (!editor || stoppedRef.current) return;
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setStatus("saving");
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editor.getJSON(), version: versionRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        versionRef.current = data.document.version;
        setErrorMessage(null);
        setStatus(pendingRef.current ? "dirty" : "saved");
      } else if (res.status === 409) {
        stoppedRef.current = true;
        setStatus("conflict");
        setErrorMessage(data.error ?? "Someone else changed this document.");
      } else if (res.status === 403 || res.status === 404) {
        stoppedRef.current = true;
        setStatus("error");
        setErrorMessage(data.error ?? "You no longer have edit access.");
      } else {
        setStatus("error");
        setErrorMessage(data.error ?? "Save failed.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("You're offline or the server is unreachable. Your changes are kept here.");
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current && !stoppedRef.current) {
        pendingRef.current = false;
        void saveRef.current();
      }
    }
  }, [editor, doc.id]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (status === "dirty" || status === "saving" || status === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  async function saveTitle() {
    const next = title.trim();
    if (!next) {
      setTitle(savedTitle);
      return;
    }
    if (next === savedTitle) return;
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSavedTitle(data.document.title);
      setTitle(data.document.title);
    } else {
      setTitle(savedTitle);
      setErrorMessage(data.error ?? "Rename failed.");
    }
  }

  async function deleteDocument() {
    if (!confirm(`Delete "${savedTitle}"? This can't be undone.`)) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErrorMessage(data.error ?? "Delete failed.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back to documents">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          readOnly={!canEdit}
          maxLength={200}
          aria-label="Document title"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-semibold hover:border-slate-200 focus:border-blue-400 focus:outline-none read-only:hover:border-transparent"
        />
        <SaveIndicator status={status} canEdit={canEdit} />
        {isOwner && (
          <>
            <button
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              onClick={deleteDocument}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete document"
              title="Delete document"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <p className="mt-1 pl-11 text-xs text-slate-500">
        {isOwner ? "You own this document" : `Owned by ${doc.owner.name}`}
        {shares.length > 0 && ` · Shared with ${shares.length} ${shares.length === 1 ? "person" : "people"}`}
      </p>

      {!canEdit && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">
          <Eye className="h-4 w-4" /> View only — you can read this document but not edit it.
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <span className="flex-1">{errorMessage}</span>
          {status === "conflict" && (
            <button onClick={() => window.location.reload()} className="font-medium underline">
              Reload latest version
            </button>
          )}
          {status === "error" && !stoppedRef.current && (
            <button onClick={() => void save()} className="font-medium underline">
              Retry
            </button>
          )}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {editor && canEdit && <EditorToolbar editor={editor} />}
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      {isOwner && shareOpen && (
        <ShareDialog
          documentId={doc.id}
          shares={shares}
          onChange={setShares}
          onClose={() => setShareOpen(false)}
        />
      )}
    </main>
  );
}

function SaveIndicator({ status, canEdit }: { status: SaveStatus; canEdit: boolean }) {
  if (!canEdit) return null;
  const map: Record<SaveStatus, { icon: React.ReactNode; text: string; className: string }> = {
    saved: { icon: <Check className="h-4 w-4" />, text: "Saved", className: "text-emerald-700" },
    dirty: { icon: <Loader2 className="h-4 w-4" />, text: "Unsaved changes", className: "text-slate-500" },
    saving: { icon: <Loader2 className="h-4 w-4 animate-spin" />, text: "Saving…", className: "text-slate-500" },
    error: { icon: <CloudOff className="h-4 w-4" />, text: "Not saved", className: "text-red-600" },
    conflict: { icon: <AlertTriangle className="h-4 w-4" />, text: "Conflict", className: "text-amber-700" },
  };
  const { icon, text, className } = map[status];
  return (
    <span aria-live="polite" className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
      {icon} {text}
    </span>
  );
}
