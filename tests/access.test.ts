import { describe, expect, it } from "vitest";
import { assertCan, can, getRole, type Action, type Role } from "@/lib/access";
import { HttpError } from "@/lib/http";

const ALICE = "alice";
const BOB = "bob";
const CAROL = "carol";
const DAVE = "dave";

// Alice owns; Bob edits; Carol views; Dave has no access.
const doc = {
  ownerId: ALICE,
  shares: [
    { userId: BOB, role: "EDITOR" as const },
    { userId: CAROL, role: "VIEWER" as const },
  ],
};

describe("getRole", () => {
  it.each([
    [ALICE, "OWNER"],
    [BOB, "EDITOR"],
    [CAROL, "VIEWER"],
    [DAVE, null],
  ])("%s has role %s", (userId, expected) => {
    expect(getRole(doc, userId)).toBe(expected);
  });

  it("treats the owner as OWNER even if a share row also exists", () => {
    expect(getRole({ ownerId: ALICE, shares: [{ userId: ALICE, role: "VIEWER" }] }, ALICE)).toBe(
      "OWNER",
    );
  });
});

// The full permission matrix from the design doc.
const MATRIX: [Role | null, Action, boolean][] = [
  ["OWNER", "view", true],
  ["OWNER", "edit", true],
  ["OWNER", "share", true],
  ["OWNER", "delete", true],
  ["EDITOR", "view", true],
  ["EDITOR", "edit", true],
  ["EDITOR", "share", false],
  ["EDITOR", "delete", false],
  ["VIEWER", "view", true],
  ["VIEWER", "edit", false],
  ["VIEWER", "share", false],
  ["VIEWER", "delete", false],
  [null, "view", false],
  [null, "edit", false],
  [null, "share", false],
  [null, "delete", false],
];

describe("can", () => {
  it.each(MATRIX)("%s → %s = %s", (role, action, allowed) => {
    expect(can(role, action)).toBe(allowed);
  });
});

describe("assertCan", () => {
  const statusOf = (role: Role | null, action: Action) => {
    try {
      assertCan(role, action);
      return 200;
    } catch (err) {
      return (err as HttpError).status;
    }
  };

  it("returns 404 (not 403) for users with no access, hiding the document's existence", () => {
    expect(statusOf(null, "view")).toBe(404);
    expect(statusOf(null, "delete")).toBe(404);
  });

  it("returns 403 when the role is insufficient", () => {
    expect(statusOf("VIEWER", "edit")).toBe(403);
    expect(statusOf("EDITOR", "share")).toBe(403);
    expect(statusOf("EDITOR", "delete")).toBe(403);
  });

  it("passes when the action is allowed", () => {
    expect(statusOf("OWNER", "delete")).toBe(200);
    expect(statusOf("EDITOR", "edit")).toBe(200);
    expect(statusOf("VIEWER", "view")).toBe(200);
  });

  it("gives a helpful message for view-only users", () => {
    expect(() => assertCan("VIEWER", "edit")).toThrow(/view-only/);
  });
});
