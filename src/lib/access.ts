import { forbidden, notFound } from "@/lib/http";

/**
 * Authorization rules — the single source of truth for "who can do what".
 * Pure functions (no DB, no Next.js) so every rule is unit tested.
 *
 *   Action        Owner  Editor  Viewer  No access
 *   view           ✅      ✅      ✅       404
 *   edit/rename    ✅      ✅      403      404
 *   share          ✅      403     403      404
 *   delete         ✅      403     403      404
 *
 * Users with no access get 404 (not 403) so private documents' existence isn't revealed.
 */

export type Role = "OWNER" | "EDITOR" | "VIEWER";
export type Action = "view" | "edit" | "share" | "delete";

const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  OWNER: new Set<Action>(["view", "edit", "share", "delete"]),
  EDITOR: new Set<Action>(["view", "edit"]),
  VIEWER: new Set<Action>(["view"]),
};

export function can(role: Role | null, action: Action): boolean {
  return role !== null && PERMISSIONS[role].has(action);
}

/** Derive a user's role on a document from its owner and share records. */
export function getRole(
  doc: { ownerId: string; shares: { userId: string; role: "VIEWER" | "EDITOR" }[] },
  userId: string,
): Role | null {
  if (doc.ownerId === userId) return "OWNER";
  return doc.shares.find((share) => share.userId === userId)?.role ?? null;
}

const DENIED_MESSAGES: Record<Exclude<Action, "view">, string> = {
  edit: "You have view-only access to this document.",
  share: "Only the owner can share this document.",
  delete: "Only the owner can delete this document.",
};

/** Throws 404 for no access, 403 for insufficient role. */
export function assertCan(role: Role | null, action: Action): asserts role is Role {
  if (role === null) throw notFound("Document not found.");
  if (!can(role, action)) throw forbidden(DENIED_MESSAGES[action as Exclude<Action, "view">]);
}
