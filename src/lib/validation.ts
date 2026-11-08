import { z } from "zod";

/** Request validation rules. The database enforces structure; these give clear 400 messages. */

export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_BYTES = 500_000; // ~500 KB of editor JSON

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Title can't be empty.")
  .max(MAX_TITLE_LENGTH, `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);

/** A TipTap document: root node of type "doc" with an array of child nodes, size-capped. */
export const editorContentSchema = z
  .object({
    type: z.literal("doc", { error: "Content must be an editor document." }),
    content: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .loose()
  .refine((doc) => JSON.stringify(doc).length <= MAX_CONTENT_BYTES, {
    message: "Document is too large to save.",
  });

export const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };

export const createDocumentSchema = z.object({
  title: titleSchema.optional(),
  content: editorContentSchema.optional(),
});

/**
 * Content saves must send the version the client loaded (optimistic concurrency).
 * Title-only renames don't need a version.
 */
export const updateDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    content: editorContentSchema.optional(),
    version: z.number().int().positive().optional(),
  })
  .refine((body) => body.title !== undefined || body.content !== undefined, {
    message: "Nothing to update.",
  })
  .refine((body) => body.content === undefined || body.version !== undefined, {
    message: "A version is required when saving content.",
  });

export const shareSchema = z.object({
  // Normalize first, then validate — so " Bob@Ajaia.dev " is accepted as bob@ajaia.dev.
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.enum(["VIEWER", "EDITOR"]).default("VIEWER"),
});

export const idSchema = z.uuid();
