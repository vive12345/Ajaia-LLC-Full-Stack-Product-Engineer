import { prisma } from "@/lib/db";
import { getRole, type Role } from "@/lib/access";
import { idSchema } from "@/lib/validation";

/** Loads only what's needed to decide the caller's role. Returns null for unknown/invalid ids. */
export async function getDocumentRole(documentId: string, userId: string): Promise<Role | null> {
  if (!idSchema.safeParse(documentId).success) return null;
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true, shares: { where: { userId }, select: { userId: true, role: true } } },
  });
  return doc ? getRole(doc, userId) : null;
}

/**
 * Prisma filter matching documents the user may edit (owner or EDITOR share).
 * Used inside UPDATE statements so permission is re-checked at the moment of writing,
 * closing the race where access is revoked between the check and the write.
 */
export function editableBy(userId: string) {
  return {
    OR: [{ ownerId: userId }, { shares: { some: { userId, role: "EDITOR" as const } } }],
  };
}
