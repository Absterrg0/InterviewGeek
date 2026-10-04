/**
 * Parser for the small markdown subset used in authored prose:
 * paragraphs, `- ` and `1. ` lists, `> ` quotes, fenced code, `inline code`,
 * **bold**, *emphasis*, and [[concept-id]] / [[concept-id|label]] references.
 * Deliberately tiny: content is authored by us, so it only has to handle what
 * we write, and anything unrecognized falls through as plain text.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "concept"; id: string; label: string | null };

export type Block =
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; blocks: Block[] }
  | { type: "code"; language: string | null; text: string }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const INLINE = /(`[^`]+`)|(\*\*(?:[^*]|\*(?!\*))+\*\*)|(\*[^*\s][^*]*\*)|(\[\[[a-z0-9-]+(?:\|[^\]]+)?\]\])/g;

export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) result.push({ type: "text", text: text.slice(last, index) });
    const [token] = match;
    if (match[1]) {
      result.push({ type: "code", text: token.slice(1, -1) });
    } else if (match[2]) {
      result.push({ type: "strong", children: parseInline(token.slice(2, -2)) });
    } else if (match[3]) {
      result.push({ type: "em", children: parseInline(token.slice(1, -1)) });
    } else {
      const inner = token.slice(2, -2);
      const bar = inner.indexOf("|");
      result.push(
        bar < 0
          ? { type: "concept", id: inner, label: null }
          : { type: "concept", id: inner.slice(0, bar), label: inner.slice(bar + 1) },
      );
    }
    last = index + token.length;
  }
  if (last < text.length) result.push({ type: "text", text: text.slice(last) });
  return result;
}

const UNORDERED = /^- /;
const ORDERED = /^\d+\. /;

function isBlockStart(line: string): boolean {
  return (
    line.startsWith("```") || UNORDERED.test(line) || ORDERED.test(line) || line.startsWith(">") || line.startsWith("|")
  );
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim() || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] as string).startsWith("```")) body.push(lines[i++] as string);
      i++; // closing fence
      blocks.push({ type: "code", language, text: body.join("\n") });
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] as string).startsWith(">")) {
        body.push((lines[i] as string).replace(/^> ?/, ""));
        i++;
      }
      blocks.push({ type: "quote", blocks: parseBlocks(body.join("\n")) });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] as string).startsWith("|")) rows.push(tableCells(lines[i++] as string));
      const [header = [], , ...body] = rows;
      blocks.push({
        type: "table",
        header: header.map(parseInline),
        rows: body.map((row) => row.map(parseInline)),
      });
      continue;
    }
    const listMarker = UNORDERED.test(line) ? UNORDERED : ORDERED.test(line) ? ORDERED : null;
    if (listMarker) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i] as string;
        if (listMarker.test(current)) {
          items.push(current.replace(listMarker, ""));
        } else if (current.startsWith("  ") && current.trim() !== "" && items.length > 0) {
          items[items.length - 1] += ` ${current.trim()}`;
        } else {
          break;
        }
        i++;
      }
      blocks.push({ type: "list", ordered: listMarker === ORDERED, items: items.map(parseInline) });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && (lines[i] as string).trim() !== "" && !isBlockStart(lines[i] as string)) {
      body.push((lines[i] as string).trim());
      i++;
    }
    blocks.push({ type: "paragraph", content: parseInline(body.join(" ")) });
  }
  return blocks;
}

/** Plain text of a prose string, for metadata and summaries. */
export function proseToPlainText(text: string): string {
  const flatten = (inlines: Inline[]): string =>
    inlines
      .map((n) =>
        n.type === "text" || n.type === "code"
          ? n.text
          : n.type === "concept"
            ? (n.label ?? n.id)
            : flatten(n.children),
      )
      .join("");
  return parseBlocks(text)
    .map((b) => (b.type === "paragraph" ? flatten(b.content) : b.type === "list" ? b.items.map(flatten).join(" ") : ""))
    .join(" ")
    .trim();
}
