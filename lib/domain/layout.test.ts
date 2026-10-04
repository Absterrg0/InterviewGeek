import { describe, expect, it } from "vitest";
import { slug } from "./content";
import { exampleProject } from "./example-project";
import { autoLayout, slugify, uniqueSlug } from "./layout";

describe("autoLayout", () => {
  it("places components in columns by kind and drops empty columns", () => {
    const placed = autoLayout([
      { id: "web", label: "Web", kind: "client", responsibility: "x" },
      { id: "db", label: "DB", kind: "database", responsibility: "x" },
      { id: "cache", label: "Cache", kind: "cache", responsibility: "x" },
    ]);
    expect(placed.map((p) => p.position.col)).toEqual([0, 1, 1]);
    expect(new Set(placed.map((p) => `${p.position.col},${p.position.row}`)).size).toBe(3);
  });

  it("keeps flows from running through other components where it can", () => {
    const example = exampleProject("x", "2026-01-01T00:00:00.000Z");
    const placed = autoLayout(example.components, example.flows);
    const at = new Map(placed.map((p) => [p.id, p.position]));
    let crossings = 0;
    for (const f of example.flows) {
      const a = at.get(f.from);
      const b = at.get(f.to);
      if (!a || !b) continue;
      for (const [id, c] of at) {
        if (id === f.from || id === f.to) continue;
        for (let i = 1; i < 24; i++) {
          const t = i / 24;
          if (Math.abs(a.col + (b.col - a.col) * t - c.col) < 0.38 && Math.abs(a.row + (b.row - a.row) * t - c.row) < 0.34) {
            crossings++;
            break;
          }
        }
      }
    }
    expect(crossings).toBe(0);
  });
});

describe("slugs", () => {
  it("produces valid, unique slugs", () => {
    for (const text of ["Payment Provider", "  ", "Ünïcødé API!!", "a".repeat(80)]) {
      expect(slug.safeParse(slugify(text)).success, text).toBe(true);
    }
    expect(uniqueSlug("API", ["api", "api-2"])).toBe("api-3");
  });
});
