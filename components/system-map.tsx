"use client";

import { useState } from "react";
import type { ArchitectureFlow, ComponentKind, FlowKind, PlacedComponent } from "@/lib/domain/content";

const CELL_W = 186;
const CELL_H = 104;
const BOX_W = 128;
const BOX_H = 62;
const PAD = 12;

const KIND_LABEL: Record<ComponentKind, string> = {
  client: "client",
  edge: "edge",
  service: "service",
  worker: "worker",
  database: "database",
  queue: "queue",
  "object-store": "object store",
  cache: "cache",
  stream: "log / stream",
  external: "external",
};

const FLOW_STYLE: Record<FlowKind, { dash?: string; width: number; label: string }> = {
  request: { width: 1.4, label: "Request / response" },
  async: { dash: "6 4", width: 1.4, label: "Asynchronous" },
  data: { width: 3, label: "Bulk data" },
  push: { dash: "1.5 3.5", width: 1.8, label: "Server push" },
};

type Point = { x: number; y: number };

function center(c: PlacedComponent, origin: { col: number; row: number }): Point {
  return {
    x: PAD + (c.position.col - origin.col) * CELL_W + CELL_W / 2,
    y: PAD + (c.position.row - origin.row) * CELL_H + CELL_H / 2,
  };
}

/** Where the segment from a box's center towards `d` leaves the box. */
function exitDistance(d: Point): number {
  const tx = d.x === 0 ? Infinity : BOX_W / 2 / Math.abs(d.x);
  const ty = d.y === 0 ? Infinity : BOX_H / 2 / Math.abs(d.y);
  return Math.min(tx, ty);
}

function splitLabel(label: string): string[] {
  if (label.length <= 16) return [label];
  const words = label.split(" ");
  let best: [string, string] = [label, ""];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      best = [a, b];
      bestDiff = diff;
    }
  }
  return best[1] ? best : [label];
}

type Geometry = {
  flow: ArchitectureFlow;
  path: string;
  mid: Point;
  number: number;
  extent: { min: number; max: number };
  /** Point at parameter t along the drawn path, used to move labels apart. */
  at: (t: number) => Point;
};

/** Moves a flow's number badge along its own path when it would cover another badge. */
function separateBadges(geometry: Geometry[]): Geometry[] {
  const placed: Point[] = [];
  return geometry.map((g) => {
    const spot = [0.5, 0.36, 0.64, 0.26, 0.74].map(g.at).find((p) => placed.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 20)) ?? g.mid;
    placed.push(spot);
    return { ...g, mid: spot };
  });
}

/** Does the segment p→q pass through any of the given box centers' rectangles? */
function blocked(p: Point, q: Point, obstacles: Point[]): boolean {
  const steps = 24;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = p.x + (q.x - p.x) * t;
    const y = p.y + (q.y - p.y) * t;
    if (obstacles.some((o) => Math.abs(x - o.x) < BOX_W / 2 + 4 && Math.abs(y - o.y) < BOX_H / 2 + 4)) return true;
  }
  return false;
}

/** Points along a quadratic curve, for obstacle checks. */
function curveBlocked(p: Point, c: Point, q: Point, obstacles: Point[]): boolean {
  const at = (t: number) => ({
    x: (1 - t) ** 2 * p.x + 2 * (1 - t) * t * c.x + t ** 2 * q.x,
    y: (1 - t) ** 2 * p.y + 2 * (1 - t) * t * c.y + t ** 2 * q.y,
  });
  for (let i = 1; i < 12; i++) if (blocked(at((i - 1) / 12), at(i / 12), obstacles)) return true;
  return false;
}

function flowGeometry(
  flows: ArchitectureFlow[],
  byId: Map<string, PlacedComponent>,
  origin: { col: number; row: number },
): Geometry[] {
  // Flows between the same pair of components are drawn side by side.
  const pairCount = new Map<string, number>();
  const pairIndex = new Map<string, number>();
  const pairKey = (f: ArchitectureFlow) => [f.from, f.to].sort().join("|");
  for (const f of flows) pairCount.set(pairKey(f), (pairCount.get(pairKey(f)) ?? 0) + 1);
  const centers = new Map([...byId].map(([id, c]) => [id, center(c, origin)]));

  return flows.flatMap((flow, i) => {
    const ca = centers.get(flow.from);
    const cb = centers.get(flow.to);
    if (!ca || !cb) return [];
    const d = { x: cb.x - ca.x, y: cb.y - ca.y };
    const length = Math.hypot(d.x, d.y) || 1;
    const unit = { x: d.x / length, y: d.y / length };
    const key = pairKey(flow);
    const count = pairCount.get(key) ?? 1;
    const index = pairIndex.get(key) ?? 0;
    pairIndex.set(key, index + 1);
    // Offset perpendicular to a canonical direction so opposite flows separate too.
    const canonical = flow.from < flow.to ? 1 : -1;
    const offset = (index - (count - 1) / 2) * 9 * canonical;
    const perp = { x: -unit.y, y: unit.x };
    const obstacles = [...centers].filter(([id]) => id !== flow.from && id !== flow.to).map(([, p]) => p);

    if (!blocked(ca, cb, obstacles)) {
      const t = exitDistance(d);
      const from = { x: ca.x + d.x * t + perp.x * offset, y: ca.y + d.y * t + perp.y * offset };
      const to = { x: cb.x - d.x * t + perp.x * offset - unit.x * 3, y: cb.y - d.y * t + perp.y * offset - unit.y * 3 };
      return [
        {
          flow,
          path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
          mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
          number: i + 1,
          extent: { min: Math.min(from.y, to.y), max: Math.max(from.y, to.y) },
          at: (t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
        },
      ];
    }

    // Bend around whatever sits in the way, on whichever side is clear.
    const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
    const bends = [0.55, -0.55, 0.9, -0.9].map((k) => k * CELL_H + offset);
    const bend = bends.find((b) => !curveBlocked(ca, { x: mid.x + perp.x * b, y: mid.y + perp.y * b }, cb, obstacles)) ?? bends[0] ?? 0;
    const c = { x: mid.x + perp.x * bend, y: mid.y + perp.y * bend };
    const out = { x: c.x - ca.x, y: c.y - ca.y };
    const back = { x: c.x - cb.x, y: c.y - cb.y };
    const backLength = Math.hypot(back.x, back.y) || 1;
    const from = { x: ca.x + out.x * exitDistance(out), y: ca.y + out.y * exitDistance(out) };
    const to = {
      x: cb.x + back.x * exitDistance(back) + (back.x / backLength) * 3,
      y: cb.y + back.y * exitDistance(back) + (back.y / backLength) * 3,
    };
    return [
      {
        flow,
        path: `M ${from.x} ${from.y} Q ${c.x} ${c.y} ${to.x} ${to.y}`,
        mid: { x: (from.x + 2 * c.x + to.x) / 4, y: (from.y + 2 * c.y + to.y) / 4 },
        number: i + 1,
        // A quadratic curve stays inside the triangle of its control points.
        extent: { min: Math.min(from.y, c.y, to.y), max: Math.max(from.y, c.y, to.y) },
        at: (t: number) => ({
          x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * c.x + t ** 2 * to.x,
          y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * c.y + t ** 2 * to.y,
        }),
      },
    ];
  });
}

function ComponentShape({ kind, highlighted }: { kind: ComponentKind; highlighted: boolean }) {
  const stroke = highlighted ? "var(--accent)" : "var(--rule-strong)";
  const x = -BOX_W / 2;
  const y = -BOX_H / 2;
  const common = {
    x,
    y,
    width: BOX_W,
    height: BOX_H,
    fill: highlighted ? "var(--accent-soft)" : "var(--raised)",
    stroke,
    strokeWidth: highlighted ? 1.6 : 1.2,
  };
  switch (kind) {
    case "database":
    case "object-store":
    case "cache":
      return (
        <>
          <rect {...common} rx={5} />
          <line x1={x} x2={x + BOX_W} y1={y + 6} y2={y + 6} stroke={stroke} strokeWidth={1} />
        </>
      );
    case "queue":
    case "stream":
      return (
        <>
          <rect {...common} rx={5} />
          {[10, 16, 22].map((dx) => (
            <line key={dx} x1={x + BOX_W - dx} x2={x + BOX_W - dx} y1={y + 8} y2={y + 18} stroke={stroke} strokeWidth={1} />
          ))}
        </>
      );
    case "external":
      return <rect {...common} rx={5} strokeDasharray="4 3" />;
    case "client":
      return <rect {...common} rx={12} />;
    default:
      return <rect {...common} rx={5} />;
  }
}

export type SystemMapProps = {
  components: PlacedComponent[];
  flows: ArchitectureFlow[];
  /** Ids to draw; defaults to everything. */
  visibleComponents?: string[];
  visibleFlows?: string[];
  /** Ids to emphasise, e.g. what the current stage just added. */
  highlightComponents?: string[];
  highlightFlows?: string[];
  label: string;
};

export function SystemMap({
  components,
  flows,
  visibleComponents,
  visibleFlows,
  highlightComponents = [],
  highlightFlows = [],
  label,
}: SystemMapProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const shownComponents = visibleComponents
    ? components.filter((c) => visibleComponents.includes(c.id))
    : components;
  const shownFlows = (visibleFlows ? flows.filter((f) => visibleFlows.includes(f.id)) : flows).filter(
    (f) => shownComponents.some((c) => c.id === f.from) && shownComponents.some((c) => c.id === f.to),
  );

  // Bounds come from every component, so the map does not jump as parts appear.
  const cols = components.map((c) => c.position.col);
  const rows = components.map((c) => c.position.row);
  const origin = { col: Math.min(...cols), row: Math.min(...rows) };
  const width = (Math.max(...cols) - origin.col + 1) * CELL_W + PAD * 2;
  const height = (Math.max(...rows) - origin.row + 1) * CELL_H + PAD * 2;

  const byId = new Map(shownComponents.map((c) => [c.id, c]));
  const geometry = separateBadges(flowGeometry(shownFlows, byId, origin));
  const selectedComponent = selected ? byId.get(selected) : undefined;
  const selectedFlowIds = new Set(
    selected ? shownFlows.filter((f) => f.from === selected || f.to === selected).map((f) => f.id) : [],
  );
  const highlightC = new Set(highlightComponents);
  const highlightF = new Set(highlightFlows);
  const usedKinds = [...new Set(shownFlows.map((f) => f.kind))];
  const nameOf = (id: string) => byId.get(id)?.label ?? id;
  // Curves that bend around obstacles may leave the grid; grow the canvas to fit them.
  const top = Math.min(0, ...geometry.map((g) => g.extent.min - 14));
  const bottom = Math.max(height, ...geometry.map((g) => g.extent.max + 14));

  return (
    <figure>
      <div className="overflow-x-auto -mx-1 px-1">
        <svg
          viewBox={`0 ${top} ${width} ${bottom - top}`}
          className="w-full min-w-[540px] h-auto select-none"
          role="group"
          aria-label={label}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--ink-3)" />
            </marker>
            <marker id="arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent)" />
            </marker>
          </defs>
          {geometry.map(({ flow, path }) => {
            const style = FLOW_STYLE[flow.kind];
            const active = selectedFlowIds.has(flow.id) || (!selected && highlightF.has(flow.id));
            const dimmed = selected !== null && !selectedFlowIds.has(flow.id);
            return (
              <path
                key={flow.id}
                d={path}
                fill="none"
                stroke={active ? "var(--accent)" : "var(--ink-3)"}
                strokeOpacity={dimmed ? 0.25 : flow.kind === "data" && !active ? 0.55 : 1}
                strokeWidth={style.width}
                strokeDasharray={style.dash}
                markerEnd={active ? "url(#arrow-accent)" : "url(#arrow)"}
              />
            );
          })}
          {geometry.map(({ flow, mid, number }) => {
            const active = selectedFlowIds.has(flow.id) || (!selected && highlightF.has(flow.id));
            const dimmed = selected !== null && !selectedFlowIds.has(flow.id);
            return (
              <g key={flow.id} transform={`translate(${mid.x} ${mid.y})`} opacity={dimmed ? 0.3 : 1}>
                <circle r={8.5} fill="var(--paper)" stroke={active ? "var(--accent)" : "var(--rule-strong)"} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9.5}
                  fontFamily="var(--font-mono)"
                  fill={active ? "var(--accent)" : "var(--ink-2)"}
                >
                  {number}
                </text>
              </g>
            );
          })}
          {shownComponents.map((c) => {
            const p = center(c, origin);
            const isSelected = selected === c.id;
            const highlighted = isSelected || (!selected && highlightC.has(c.id));
            const dimmed = selected !== null && !isSelected && !shownFlows.some(
              (f) => selectedFlowIds.has(f.id) && (f.from === c.id || f.to === c.id),
            );
            const lines = splitLabel(c.label);
            return (
              <g
                key={c.id}
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`${c.label}, ${KIND_LABEL[c.kind]}`}
                className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-[var(--accent)]"
                opacity={dimmed ? 0.4 : 1}
                onClick={() => setSelected(isSelected ? null : c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(isSelected ? null : c.id);
                  }
                }}
              >
                <ComponentShape kind={c.kind} highlighted={highlighted} />
                <text
                  y={lines.length === 1 ? -6 : -12}
                  textAnchor="middle"
                  fontSize={8.5}
                  letterSpacing={0.6}
                  fontFamily="var(--font-mono)"
                  fill="var(--ink-3)"
                >
                  {KIND_LABEL[c.kind].toUpperCase()}
                </text>
                {lines.map((line, i) => (
                  <text
                    key={i}
                    y={(lines.length === 1 ? 10 : 4) + i * 14}
                    textAnchor="middle"
                    fontSize={12.5}
                    fontWeight={600}
                    fill="var(--ink)"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-3 space-y-3">
        {selectedComponent ? (
          <div className="rounded-md border border-rule bg-raised p-3.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">{selectedComponent.label}</p>
              <button type="button" className="text-ink-3 hover:text-ink text-xs" onClick={() => setSelected(null)}>
                Clear
              </button>
            </div>
            <p className="mt-1 text-ink-2">{selectedComponent.responsibility}</p>
            {selectedComponent.durableState && (
              <p className="mt-2 text-ink-2">
                <span className="eyebrow mr-2">Durable state</span>
                {selectedComponent.durableState}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-3">Select a component to see what it is responsible for and which state it owns.</p>
        )}
        {geometry.length > 0 && (
          <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-[0.8125rem]">
            {geometry.map(({ flow, number }) => {
              const dimmed = selected !== null && !selectedFlowIds.has(flow.id);
              return (
                <li key={flow.id} className={`flex gap-2 ${dimmed ? "opacity-40" : ""}`}>
                  <span className="font-mono text-ink-3 w-4 text-right shrink-0">{number}</span>
                  <span className="text-ink-2">
                    <span className="text-ink">
                      {nameOf(flow.from)} → {nameOf(flow.to)}
                    </span>
                    : {flow.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {usedKinds.length > 1 && (
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3" aria-label="Line styles">
            {usedKinds.map((kind) => (
              <li key={kind} className="flex items-center gap-2">
                <svg width="26" height="6" aria-hidden="true">
                  <line
                    x1="0"
                    y1="3"
                    x2="26"
                    y2="3"
                    stroke="var(--ink-3)"
                    strokeWidth={FLOW_STYLE[kind].width}
                    strokeDasharray={FLOW_STYLE[kind].dash}
                  />
                </svg>
                {FLOW_STYLE[kind].label}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
    </figure>
  );
}
