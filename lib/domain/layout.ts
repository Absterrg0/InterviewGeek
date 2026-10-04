import type { ArchitectureComponent, ArchitectureFlow, ComponentKind, PlacedComponent } from "./content";

/** Left-to-right: callers, entry points, logic, async plumbing, state, the outside world. */
const COLUMN: Record<ComponentKind, number> = {
  client: 0,
  edge: 1,
  service: 2,
  worker: 3,
  queue: 3,
  stream: 3,
  database: 4,
  cache: 4,
  "object-store": 4,
  external: 5,
};

type Cell = { col: number; row: number };

// A box's half-extent in grid units (matches the map's box and cell sizes, plus margin).
const HALF_W = 0.38;
const HALF_H = 0.34;

/** Does the straight segment a→b pass through the box at c? */
function passesThrough(a: Cell, b: Cell, c: Cell): boolean {
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    const x = a.col + (b.col - a.col) * t;
    const y = a.row + (b.row - a.row) * t;
    if (Math.abs(x - c.col) < HALF_W && Math.abs(y - c.row) < HALF_H) return true;
  }
  return false;
}

/**
 * Places hand-described components on a grid so a learner's own model can be
 * drawn without asking them to position anything. Columns come from the kind
 * (callers left, the outside world right; empty columns dropped). Rows are
 * chosen greedily so that as few flows as possible run straight through
 * another component's box.
 */
export function autoLayout(
  components: readonly ArchitectureComponent[],
  flows: readonly ArchitectureFlow[] = [],
): PlacedComponent[] {
  const used = [...new Set(components.map((c) => COLUMN[c.kind]))].sort((a, b) => a - b);
  const colOf = (c: ArchitectureComponent) => used.indexOf(COLUMN[c.kind]);
  const order = [...components].sort((a, b) => colOf(a) - colOf(b));
  const placed = new Map<string, Cell>();
  const maxRow = Math.max(3, components.length);

  for (const component of order) {
    const col = colOf(component);
    let best: { row: number; cost: number } | null = null;
    for (let row = 0; row < maxRow; row++) {
      const here: Cell = { col, row };
      if ([...placed.values()].some((p) => p.col === col && p.row === row)) continue;
      let cost = row * 0.05;
      for (const flow of flows) {
        const a = flow.from === component.id ? here : placed.get(flow.from);
        const b = flow.to === component.id ? here : placed.get(flow.to);
        if (!a || !b) continue;
        const touches = flow.from === component.id || flow.to === component.id;
        if (touches) {
          // Our flows must not run through anything already placed.
          for (const [id, p] of placed) {
            if (id !== flow.from && id !== flow.to && passesThrough(a, b, p)) cost += 1;
          }
        } else if (passesThrough(a, b, here)) {
          // And we must not sit on someone else's flow.
          cost += 1;
        }
      }
      if (!best || cost < best.cost) best = { row, cost };
    }
    placed.set(component.id, { col, row: best?.row ?? 0 });
  }

  // Then improve: move or swap components within their column while that
  // reduces the total number of crossings. Models are small, so this is cheap.
  const total = () => crossings(placed, flows) + [...placed.values()].reduce((sum, p) => sum + p.row * 0.01, 0);
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (const component of order) {
      const current = placed.get(component.id) as Cell;
      for (let row = 0; row < maxRow; row++) {
        if (row === current.row) continue;
        const occupant = [...placed].find(([, p]) => p.col === current.col && p.row === row)?.[0];
        const before = total();
        placed.set(component.id, { col: current.col, row });
        if (occupant) placed.set(occupant, { col: current.col, row: current.row });
        if (total() < before - 1e-9) {
          improved = true;
          break;
        }
        placed.set(component.id, current);
        if (occupant) placed.set(occupant, { col: current.col, row });
      }
    }
    if (!improved) break;
  }
  return components.map((c) => ({ ...c, position: placed.get(c.id) ?? { col: colOf(c), row: 0 } }));
}

function crossings(placed: Map<string, Cell>, flows: readonly ArchitectureFlow[]): number {
  let count = 0;
  for (const flow of flows) {
    const a = placed.get(flow.from);
    const b = placed.get(flow.to);
    if (!a || !b) continue;
    for (const [id, p] of placed) {
      if (id !== flow.from && id !== flow.to && passesThrough(a, b, p)) count++;
    }
  }
  return count;
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "item";
}

/** A slug for `text` that does not collide with `taken`. */
export function uniqueSlug(text: string, taken: Iterable<string>): string {
  const existing = new Set(taken);
  const base = slugify(text);
  if (!existing.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
}
