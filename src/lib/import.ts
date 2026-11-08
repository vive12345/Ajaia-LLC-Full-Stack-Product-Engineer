import { generateJSON } from "@tiptap/html/server";
import mammoth from "mammoth";
import { marked } from "marked";
import { editorExtensions } from "@/lib/editor-extensions";
import { badRequest } from "@/lib/http";
import { MAX_TITLE_LENGTH } from "@/lib/validation";

/**
 * File import: .txt / .md / .docx → a new editable document.
 *
 * Every format is converted to HTML first, then to TipTap JSON using the
 * editor's own schema. That last step drops anything the editor can't
 * represent (scripts, styles, images, tables), so imported content is safe
 * and always opens in the editor.
 */

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
// Vercel serverless functions accept request bodies up to ~4.5 MB.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

type Extension = (typeof SUPPORTED_EXTENSIONS)[number];
export type ImportedDocument = { title: string; content: Record<string, unknown> };

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return (base || "Imported document").slice(0, MAX_TITLE_LENGTH);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text: blank lines separate paragraphs; single line breaks are kept. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function toHtml(ext: Extension, bytes: Buffer): Promise<string> {
  switch (ext) {
    case ".txt":
      return textToHtml(bytes.toString("utf8"));
    case ".md":
    case ".markdown":
      return marked.parse(bytes.toString("utf8"), { async: false });
    case ".docx": {
      try {
        const { value } = await mammoth.convertToHtml({ buffer: bytes });
        return value;
      } catch {
        throw badRequest("This .docx file couldn't be read. It may be corrupted.");
      }
    }
  }
}

function hasText(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string" && n.text.trim()) return true;
  return Array.isArray(n.content) && n.content.some(hasText);
}

export async function importFile(filename: string, bytes: Buffer): Promise<ImportedDocument> {
  const ext = getExtension(filename);
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw badRequest("Unsupported file type. Please upload a .txt, .md or .docx file.");
  }
  if (bytes.length === 0) throw badRequest("The file is empty.");
  if (bytes.length > MAX_IMPORT_BYTES) throw badRequest("The file is too large (max 4 MB).");

  const html = await toHtml(ext as Extension, bytes);
  const content = generateJSON(html, editorExtensions) as Record<string, unknown>;
  if (!hasText(content)) throw badRequest("The file doesn't contain any readable text.");

  return { title: titleFromFilename(filename), content };
}
