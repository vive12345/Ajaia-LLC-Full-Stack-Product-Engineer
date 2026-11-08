/**
 * Seed data for local development and reviewer demos.
 * Idempotent: safe to run multiple times (uses upserts with fixed IDs).
 *
 *   Alice — owns "Welcome to Ajaia Docs"
 *   Bob   — EDITOR on that document
 *   Carol — VIEWER on that document
 */
import { PrismaClient, ShareRole } from "@prisma/client";

const prisma = new PrismaClient();

const USERS = [
  { id: "00000000-0000-4000-8000-000000000001", email: "alice@ajaia.dev", name: "Alice Johnson" },
  { id: "00000000-0000-4000-8000-000000000002", email: "bob@ajaia.dev", name: "Bob Smith" },
  { id: "00000000-0000-4000-8000-000000000003", email: "carol@ajaia.dev", name: "Carol Lee" },
] as const;

const SAMPLE_DOC_ID = "00000000-0000-4000-8000-0000000000d1";

const text = (value: string, marks?: { type: string }[]) =>
  marks ? { type: "text", text: value, marks } : { type: "text", text: value };

const sampleContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Welcome to Ajaia Docs")] },
    {
      type: "paragraph",
      content: [
        text("This document is owned by "),
        text("Alice", [{ type: "bold" }]),
        text(", shared with Bob as an "),
        text("editor", [{ type: "italic" }]),
        text(" and with Carol as a "),
        text("viewer", [{ type: "underline" }]),
        text("."),
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [text("Try it out")] },
    {
      type: "bulletList",
      content: [
        "Sign in as Bob and edit this document",
        "Sign in as Carol and notice it is read-only",
        "Import a .txt, .md or .docx file from the home page",
      ].map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [text(item)] }],
      })),
    },
  ],
};

async function main() {
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { email: user.email, name: user.name },
      create: user,
    });
  }

  const [alice, bob, carol] = USERS;

  await prisma.document.upsert({
    where: { id: SAMPLE_DOC_ID },
    update: {},
    create: {
      id: SAMPLE_DOC_ID,
      ownerId: alice.id,
      title: "Welcome to Ajaia Docs",
      content: sampleContent,
    },
  });

  const shares: { userId: string; role: ShareRole }[] = [
    { userId: bob.id, role: ShareRole.EDITOR },
    { userId: carol.id, role: ShareRole.VIEWER },
  ];
  for (const share of shares) {
    await prisma.documentShare.upsert({
      where: { documentId_userId: { documentId: SAMPLE_DOC_ID, userId: share.userId } },
      update: { role: share.role },
      create: { documentId: SAMPLE_DOC_ID, ...share },
    });
  }

  console.log(`Seeded ${USERS.length} users and 1 shared document.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
