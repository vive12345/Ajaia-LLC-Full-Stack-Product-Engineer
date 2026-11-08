import { describe, expect, it } from "vitest";
import {
  MAX_CONTENT_BYTES,
  shareSchema,
  titleSchema,
  updateDocumentSchema,
} from "@/lib/validation";

const doc = { type: "doc", content: [{ type: "paragraph" }] };

describe("titleSchema", () => {
  it("trims whitespace", () => expect(titleSchema.parse("  Plan  ")).toBe("Plan"));
  it("rejects blank titles", () => expect(titleSchema.safeParse("   ").success).toBe(false));
  it("rejects titles over 200 characters", () =>
    expect(titleSchema.safeParse("x".repeat(201)).success).toBe(false));
});

describe("updateDocumentSchema", () => {
  it("accepts a rename without a version", () => {
    expect(updateDocumentSchema.safeParse({ title: "New" }).success).toBe(true);
  });

  it("accepts a content save with a version", () => {
    expect(updateDocumentSchema.safeParse({ content: doc, version: 3 }).success).toBe(true);
  });

  it("requires a version when saving content (optimistic concurrency)", () => {
    const result = updateDocumentSchema.safeParse({ content: doc });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/version/);
  });

  it("rejects an empty update", () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(false);
  });

  it("rejects content that is not an editor document", () => {
    expect(updateDocumentSchema.safeParse({ content: { type: "html" }, version: 1 }).success).toBe(
      false,
    );
    expect(updateDocumentSchema.safeParse({ content: "<p>hi</p>", version: 1 }).success).toBe(
      false,
    );
  });

  it("rejects oversized content", () => {
    const huge = {
      type: "doc",
      content: [{ type: "paragraph", text: "x".repeat(MAX_CONTENT_BYTES) }],
    };
    expect(updateDocumentSchema.safeParse({ content: huge, version: 1 }).success).toBe(false);
  });
});

describe("shareSchema", () => {
  it("normalizes email and defaults role to VIEWER", () => {
    expect(shareSchema.parse({ email: "  Bob@Ajaia.dev " })).toEqual({
      email: "bob@ajaia.dev",
      role: "VIEWER",
    });
  });

  it("rejects invalid emails and unknown roles", () => {
    expect(shareSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(shareSchema.safeParse({ email: "bob@ajaia.dev", role: "ADMIN" }).success).toBe(false);
  });
});
