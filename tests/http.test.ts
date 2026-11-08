import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { assertSameOrigin, notFound, readJson, route } from "@/lib/http";

const req = (headers: Record<string, string>) => new Request("http://localhost:3000/api/x", { headers });

describe("assertSameOrigin (CSRF defense)", () => {
  it("allows same-origin requests", () => {
    expect(() =>
      assertSameOrigin(req({ origin: "http://localhost:3000", host: "localhost:3000" })),
    ).not.toThrow();
  });

  it("blocks cross-site requests with 403", () => {
    expect(() =>
      assertSameOrigin(req({ origin: "https://evil.example", host: "localhost:3000" })),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("uses x-forwarded-host behind a proxy (e.g. Vercel)", () => {
    expect(() =>
      assertSameOrigin(
        req({ origin: "https://app.vercel.app", host: "internal", "x-forwarded-host": "app.vercel.app" }),
      ),
    ).not.toThrow();
  });

  it("allows requests without an Origin header (non-browser clients)", () => {
    expect(() => assertSameOrigin(req({ host: "localhost:3000" }))).not.toThrow();
  });

  it("rejects a malformed Origin header", () => {
    expect(() => assertSameOrigin(req({ origin: "not a url", host: "localhost:3000" }))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
});

describe("route() error handling", () => {
  it("maps HttpError to its status and message", async () => {
    const res = await route(async () => {
      throw notFound("Document not found.");
    })();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Document not found." });
  });

  it("maps validation errors to 400 with the first message", async () => {
    const res = await route(async () => {
      z.object({ title: z.string().min(1, "Title can't be empty.") }).parse({ title: "" });
      return new Response();
    })();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title can't be empty." });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await route(async () => {
      throw new Error("connection string leaked here");
    })();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("leaked");
    spy.mockRestore();
  });
});

describe("readJson", () => {
  it("returns 400 for malformed JSON", async () => {
    const bad = new Request("http://x", { method: "POST", body: "{not json" });
    await expect(readJson(bad)).rejects.toMatchObject({ status: 400 });
  });
});
