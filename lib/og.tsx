import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { ImageResponse } from "next/og";
import { PIXEL_MARK_GRID } from "@/components/icons";
import type { ArchitectureFlow, PlacedComponent } from "@/lib/domain/content";
import { proseToPlainText } from "@/lib/prose";
import { SITE_HOST } from "@/lib/site";

/** Social cards: 1200x630 PNGs rendered at build time for link previews. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const C = {
  paper: "#0a0a0a",
  raised: "#141414",
  ink: "#ffffff",
  ink2: "#a3a3a3",
  ink3: "#858585",
  rule: "#262626",
  accent: "#00bbff",
  gap: "#ff7b7f",
  partial: "#f2bd52",
  strong: "#5fd28e",
};

export type Tone = "accent" | "gap" | "partial" | "strong";
const TONE: Record<Tone, string> = { accent: C.accent, gap: C.gap, partial: C.partial, strong: C.strong };

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const fonts = Promise.all([
  font("FunnelDisplay-SemiBold.woff"),
  font("FunnelSans-Regular.woff"),
  font("GeistMono-Medium.woff"),
  font("GeistPixel-Regular.woff"),
]).then(([display, sans, mono, pixel]) => [
  { name: "Display", data: display, weight: 600 as const, style: "normal" as const },
  { name: "Sans", data: sans, weight: 400 as const, style: "normal" as const },
  { name: "Mono", data: mono, weight: 500 as const, style: "normal" as const },
  { name: "Pixel", data: pixel, weight: 400 as const, style: "normal" as const },
]);

/** Strip inline markdown, then cut at a word boundary so the text fits a fixed number of lines. */
export function clip(markdown: string, max: number): string {
  const text = proseToPlainText(markdown);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.;:]+$/, "")}…`;
}

export function Mark({ size }: { size: number }) {
  const cell = size / 8;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: size, height: size, background: "#000", borderRadius: size / 5, overflow: "hidden" }}>
      {PIXEL_MARK_GRID.flatMap((row, y) =>
        [...row].map((v, x) => (
          <div key={`${x}-${y}`} style={{ display: "flex", width: cell, height: cell, padding: cell * 0.08 }}>
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: cell * 0.12,
                background: v === "0" ? "rgba(255,255,255,0.07)" : v === "2" ? "rgba(0,187,255,0.55)" : C.accent,
              }}
            />
          </div>
        )),
      )}
    </div>
  );
}

/**
 * An architecture's silhouette, drawn like the site's investigation tiles:
 * parts the scenario gives are solid, parts the learner designs are outlined.
 */
export function Diagram({
  components,
  flows,
  given,
  width,
  height,
}: {
  components: PlacedComponent[];
  flows: ArchitectureFlow[];
  given: ReadonlySet<string>;
  width: number;
  height: number;
}) {
  const cols = components.map((c) => c.position.col);
  const rows = components.map((c) => c.position.row);
  const origin = { col: Math.min(...cols), row: Math.min(...rows) };
  const nCols = Math.max(...cols) - origin.col + 1;
  const nRows = Math.max(...rows) - origin.row + 1;
  const cell = Math.min(width / nCols, (height / nRows) * 1.6);
  const cellH = cell / 1.6;
  const boxW = cell * 0.66;
  const boxH = cellH * 0.5;
  const offX = (width - cell * nCols) / 2;
  const offY = (height - cellH * nRows) / 2;
  const at = new Map(
    components.map((c) => [
      c.id,
      {
        x: offX + (c.position.col - origin.col + 0.5) * cell,
        y: offY + (c.position.row - origin.row + 0.5) * cellH,
      },
    ]),
  );

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {flows.map((f) => {
        const a = at.get(f.from);
        const b = at.get(f.to);
        if (!a || !b) return null;
        return (
          <line
            key={f.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={C.ink3}
            strokeOpacity={0.6}
            strokeWidth={2.5}
            strokeDasharray={f.kind === "async" ? "8 6" : undefined}
          />
        );
      })}
      {components.map((c) => {
        const p = at.get(c.id);
        if (!p) return null;
        const solid = given.has(c.id);
        return (
          <rect
            key={c.id}
            x={p.x - boxW / 2}
            y={p.y - boxH / 2}
            width={boxW}
            height={boxH}
            rx={c.kind === "client" ? boxH / 2 : 9}
            fill={solid ? "#e5e5e5" : C.raised}
            stroke={solid ? "none" : C.accent}
            strokeWidth={2.5}
            strokeDasharray={solid ? undefined : "8 6"}
          />
        );
      })}
    </svg>
  );
}

/**
 * The shared card layout: brand and a label across the top, the page's own
 * content in the middle, and a line of facts with the site's host at the bottom.
 */
export async function card({
  label,
  tone = "accent",
  title,
  body,
  aside,
  facts = [],
}: {
  label: string;
  tone?: Tone;
  title: string;
  body?: string;
  /** Right-hand column, e.g. a diagram. */
  aside?: ReactNode;
  facts?: string[];
}) {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "56px 64px",
          background: C.paper,
          color: C.ink,
          fontFamily: "Sans",
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Mark size={48} />
            <div style={{ display: "flex", fontFamily: "Pixel", fontSize: 34 }}>
              <span>sys</span>
              <span style={{ color: C.ink3 }}>geeks</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 18px",
              borderRadius: 999,
              border: `2px solid ${C.rule}`,
              background: C.raised,
              fontFamily: "Mono",
              fontSize: 18,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: C.ink2,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 999, background: TONE[tone] }} />
            {label}
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 22 }}>
            <div style={{ display: "flex", fontFamily: "Display", fontSize: aside ? 58 : 72, lineHeight: 1.05, letterSpacing: -1 }}>
              {title}
            </div>
            {body && (
              <div style={{ display: "flex", fontSize: 26, lineHeight: 1.4, color: C.ink2 }}>{body}</div>
            )}
          </div>
          {aside && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 440,
                height: 300,
                borderRadius: 20,
                border: `2px solid ${C.rule}`,
                background: "rgba(20,20,20,0.85)",
              }}
            >
              {aside}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "Mono",
            fontSize: 20,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: C.ink3,
          }}
        >
          <div style={{ display: "flex", gap: 28 }}>
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
          <span style={{ color: C.ink2 }}>{SITE_HOST}</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts },
  );
}
