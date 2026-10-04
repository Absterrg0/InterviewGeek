import type { ArchitectureFlow, PlacedComponent } from "@/lib/domain/content";

const CELL_W = 40;
const CELL_H = 26;
const BOX_W = 26;
const BOX_H = 13;
const PAD = 6;

/**
 * The silhouette of an investigation's finished architecture. Parts given by
 * the scenario are solid; parts the learner designs are drawn as outlines.
 */
export function SystemThumb({
  components,
  flows,
  given,
  className = "",
}: {
  components: PlacedComponent[];
  flows: ArchitectureFlow[];
  /** Component ids present from the start. */
  given: ReadonlySet<string>;
  className?: string;
}) {
  if (components.length === 0) return null;
  const cols = components.map((c) => c.position.col);
  const rows = components.map((c) => c.position.row);
  const origin = { col: Math.min(...cols), row: Math.min(...rows) };
  const width = (Math.max(...cols) - origin.col + 1) * CELL_W + PAD * 2;
  const height = (Math.max(...rows) - origin.row + 1) * CELL_H + PAD * 2;
  const at = new Map(
    components.map((c) => [
      c.id,
      {
        x: PAD + (c.position.col - origin.col) * CELL_W + CELL_W / 2,
        y: PAD + (c.position.row - origin.row) * CELL_H + CELL_H / 2,
      },
    ]),
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`h-auto w-full ${className}`} aria-hidden="true">
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
            stroke="var(--ink-3)"
            strokeOpacity={0.45}
            strokeWidth={0.9}
            strokeDasharray={f.kind === "async" ? "2.5 2" : undefined}
          />
        );
      })}
      {components.map((c) => {
        const p = at.get(c.id);
        if (!p) return null;
        const isGiven = given.has(c.id);
        return (
          <rect
            key={c.id}
            x={p.x - BOX_W / 2}
            y={p.y - BOX_H / 2}
            width={BOX_W}
            height={BOX_H}
            rx={c.kind === "client" ? 6.5 : 3.5}
            fill={isGiven ? "var(--ink)" : "var(--raised)"}
            fillOpacity={isGiven ? 0.78 : 1}
            stroke={isGiven ? "none" : "var(--accent-solid)"}
            strokeWidth={1}
            strokeDasharray={isGiven ? undefined : "2.5 1.8"}
          />
        );
      })}
    </svg>
  );
}
