import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_BYTES,
  getExtension,
  importFile,
  textToHtml,
  titleFromFilename,
} from "@/lib/import";

type Node = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[]; content?: Node[] };

const nodesOfType = (node: Node, type: string): Node[] => [
  ...(node.type === type ? [node] : []),
  ...(node.content ?? []).flatMap((child) => nodesOfType(child, type)),
];
const allText = (node: Node): string =>
  (node.text ?? "") + (node.content ?? []).map(allText).join(" ");
const hasMark = (node: Node, mark: string): boolean =>
  nodesOfType(node, "text").some((t) => t.marks?.some((m) => m.type === mark));

/** Builds a minimal but valid .docx in memory. */
async function makeDocx(bodyXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("helpers", () => {
  it("extracts lowercase extensions", () => {
    expect(getExtension("Notes.MD")).toBe(".md");
    expect(getExtension("no-extension")).toBe("");
  });

  it("derives a readable title from the file name", () => {
    expect(titleFromFilename("q4_project-plan.docx")).toBe("q4 project plan");
    expect(titleFromFilename(".md")).toBe("Imported document");
  });

  it("escapes HTML in plain text so it can't inject markup", () => {
    expect(textToHtml("<b>hi</b>")).toBe("<p>&lt;b&gt;hi&lt;/b&gt;</p>");
  });
});

describe("importFile", () => {
  it("imports .txt: blank lines become paragraphs", async () => {
    const doc = await importFile("notes.txt", Buffer.from("First paragraph\n\nSecond paragraph"));
    expect(doc.title).toBe("notes");
    const paragraphs = nodesOfType(doc.content as Node, "paragraph");
    expect(paragraphs).toHaveLength(2);
    expect(allText(doc.content as Node)).toContain("Second paragraph");
  });

  it("imports .md: headings, bold, italic and lists are preserved", async () => {
    const md = "# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n1. first\n2. second";
    const doc = (await importFile("readme.md", Buffer.from(md))).content as Node;
    expect(nodesOfType(doc, "heading")[0].attrs?.level).toBe(1);
    expect(hasMark(doc, "bold")).toBe(true);
    expect(hasMark(doc, "italic")).toBe(true);
    expect(nodesOfType(doc, "bulletList")).toHaveLength(1);
    expect(nodesOfType(doc, "orderedList")).toHaveLength(1);
  });

  it("drops unsupported or dangerous HTML from markdown (e.g. <script>)", async () => {
    const md = "Hello\n\n<script>alert('x')</script>\n\n<img src=x onerror=alert(1)>";
    const doc = (await importFile("evil.md", Buffer.from(md))).content as Node;
    const json = JSON.stringify(doc);
    expect(json).not.toContain("script");
    expect(json).not.toContain("onerror");
    expect(allText(doc)).toContain("Hello");
  });

  it("imports .docx: headings and bold text are preserved", async () => {
    const docx = await makeDocx(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly Plan</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Important</w:t></w:r><w:r><w:t xml:space="preserve"> details here.</w:t></w:r></w:p>`,
    );
    const doc = (await importFile("plan.docx", docx)).content as Node;
    expect(nodesOfType(doc, "heading")[0]?.attrs?.level).toBe(1);
    expect(hasMark(doc, "bold")).toBe(true);
    expect(allText(doc)).toContain("details here.");
  });

  it("rejects a corrupted .docx with a clear message", async () => {
    await expect(importFile("broken.docx", Buffer.from("not a zip"))).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/couldn't be read/),
    });
  });

  it.each([
    ["photo.png", Buffer.from("x"), /Unsupported file type/],
    ["empty.txt", Buffer.alloc(0), /empty/],
    ["huge.txt", Buffer.alloc(MAX_IMPORT_BYTES + 1, "a"), /too large/],
    ["blank.txt", Buffer.from("   \n\n   "), /readable text/],
  ])("rejects %s", async (name, bytes, message) => {
    await expect(importFile(name, bytes)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(message),
    });
  });
});
