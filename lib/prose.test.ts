import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline, proseToPlainText } from "./prose";

describe("parseInline", () => {
  it("parses code, emphasis and concept references", () => {
    expect(parseInline("Use `SKIP LOCKED` with **care** and *intent*; see [[leases-and-fencing|leases]].")).toEqual([
      { type: "text", text: "Use " },
      { type: "code", text: "SKIP LOCKED" },
      { type: "text", text: " with " },
      { type: "strong", children: [{ type: "text", text: "care" }] },
      { type: "text", text: " and " },
      { type: "em", children: [{ type: "text", text: "intent" }] },
      { type: "text", text: "; see " },
      { type: "concept", id: "leases-and-fencing", label: "leases" },
      { type: "text", text: "." },
    ]);
  });

  it("nests references inside bold", () => {
    expect(parseInline("**see [[idempotency]]**")).toEqual([
      {
        type: "strong",
        children: [
          { type: "text", text: "see " },
          { type: "concept", id: "idempotency", label: null },
        ],
      },
    ]);
  });

  it("does not treat a lone multiplication sign as emphasis", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ type: "text", text: "2 * 3 = 6" }]);
  });
});

describe("parseBlocks", () => {
  it("parses paragraphs, lists, quotes, code and tables", () => {
    const blocks = parseBlocks(
      [
        "First line",
        "continues here.",
        "",
        "- one",
        "  wrapped",
        "- two",
        "",
        "1. first",
        "2. second",
        "",
        "> quoted",
        "",
        "```sql",
        "SELECT 1;",
        "```",
        "",
        "| | A | B |",
        "|-|-|-|",
        "| row | x | y |",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "list", "quote", "code", "table"]);
    expect(blocks[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "First line continues here." }] });
    expect(blocks[1]).toMatchObject({ ordered: false, items: [[{ text: "one wrapped" }], [{ text: "two" }]] });
    expect(blocks[2]).toMatchObject({ ordered: true });
    expect(blocks[4]).toEqual({ type: "code", language: "sql", text: "SELECT 1;" });
    expect(blocks[5]).toMatchObject({ header: [[], [{ text: "A" }], [{ text: "B" }]], rows: [[[{ text: "row" }], [{ text: "x" }], [{ text: "y" }]]] });
  });

  it("flattens to plain text", () => {
    expect(proseToPlainText("A **bold** [[x|link]].\n\n- item")).toBe("A bold link. item");
  });
});
