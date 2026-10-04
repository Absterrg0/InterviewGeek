import Link from "next/link";
import type { ReactNode } from "react";
import { parseBlocks, parseInline, type Block, type Inline } from "@/lib/prose";

export type ConceptResolver = (id: string) => { title: string; summary: string } | undefined;

function renderInline(nodes: Inline[], resolve: ConceptResolver): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "code":
        return <code key={i}>{node.text}</code>;
      case "strong":
        return <strong key={i}>{renderInline(node.children, resolve)}</strong>;
      case "em":
        return <em key={i}>{renderInline(node.children, resolve)}</em>;
      case "concept": {
        const concept = resolve(node.id);
        return (
          <Link key={i} href={`/concepts/${node.id}`} className="concept-link" title={concept?.summary}>
            {node.label ?? concept?.title ?? node.id}
          </Link>
        );
      }
    }
  });
}

function renderBlock(block: Block, key: number, resolve: ConceptResolver): ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={key}>{renderInline(block.content, resolve)}</p>;
    case "list": {
      const items = block.items.map((item, i) => <li key={i}>{renderInline(item, resolve)}</li>);
      return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case "quote":
      return <blockquote key={key}>{block.blocks.map((b, i) => renderBlock(b, i, resolve))}</blockquote>;
    case "code":
      return (
        <pre key={key} data-language={block.language ?? undefined}>
          <code>{block.text}</code>
        </pre>
      );
    case "table":
      return (
        <div key={key} className="table-wrap">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} scope="col">
                    {renderInline(cell, resolve)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row">
                        {renderInline(cell, resolve)}
                      </th>
                    ) : (
                      <td key={c}>{renderInline(cell, resolve)}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * Renders authored prose. Usable on server and client; the caller decides how
 * concept references resolve so client bundles never pull in the library.
 */
export function ProseView({
  text,
  resolve,
  className = "",
}: {
  text: string;
  resolve: ConceptResolver;
  className?: string;
}) {
  return <div className={`prose ${className}`}>{parseBlocks(text).map((b, i) => renderBlock(b, i, resolve))}</div>;
}

export const noConcepts: ConceptResolver = () => undefined;

/** Inline markdown only (code, emphasis, concept references) for short fields such as labels. */
export function InlineText({ text, resolve = noConcepts }: { text: string; resolve?: ConceptResolver }) {
  return <>{renderInline(parseInline(text), resolve)}</>;
}
