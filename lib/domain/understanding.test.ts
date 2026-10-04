import { describe, expect, it } from "vitest";
import type { Dimension } from "./content";
import type { Attempt, Signal } from "./learner";
import { byCompetency, byConcept, byDimension, exerciseStatus, insights, latestEvidence, summarize } from "./understanding";

let n = 0;
function attempt(
  stageId: string,
  signal: Signal | null,
  opts: { at?: string; dims?: Dimension[]; concepts?: string[]; inv?: string; basis?: "checked" | "self-assessed" } = {},
): Attempt {
  n++;
  return {
    id: `a${n}`,
    exercise: { kind: "stage", investigationId: opts.inv ?? "inv", stageId },
    context: "investigation",
    response: { kind: "open", text: "x" },
    submittedAt: opts.at ?? `2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`,
    selfAssessment: null,
    evidence: signal
      ? {
          signal,
          basis: opts.basis ?? "checked",
          parts: [{ label: "x", signal, basis: "checked" }],
          dimensions: opts.dims ?? ["defend"],
          conceptIds: opts.concepts ?? [],
          competencyIds: ["comp"],
        }
      : null,
  };
}

describe("latestEvidence", () => {
  it("keeps only the most recent assessed attempt per exercise", () => {
    const attempts = [
      attempt("s1", "gap", { at: "2026-01-01T00:00:00.000Z" }),
      attempt("s1", "strong", { at: "2026-01-02T00:00:00.000Z" }),
      attempt("s1", null, { at: "2026-01-03T00:00:00.000Z" }),
      attempt("s2", "partial"),
    ];
    const latest = latestEvidence(attempts);
    expect(latest.size).toBe(2);
    expect(latest.get("stage:inv/s1")?.evidence.signal).toBe("strong");
  });

  it("reports unassessed latest attempts as awaiting assessment", () => {
    const attempts = [attempt("s1", "strong", { at: "2026-01-01T00:00:00.000Z" }), attempt("s1", null, { at: "2026-01-02T00:00:00.000Z" })];
    expect(exerciseStatus(attempts, { kind: "stage", investigationId: "inv", stageId: "s1" })).toBe("awaiting-assessment");
    expect(exerciseStatus(attempts, { kind: "stage", investigationId: "inv", stageId: "nope" })).toBe("unattempted");
  });
});

describe("summaries", () => {
  it("scores and classifies standing, flagging thin evidence", () => {
    const latest = latestEvidence([attempt("s1", "strong"), attempt("s2", "strong"), attempt("s3", "gap")]);
    const s = summarize(latest.values());
    expect(s.total).toBe(3);
    expect(s.score).toBeCloseTo(2 / 3);
    expect(s.standing).toBe("developing");
    expect(s.thin).toBe(false);
    expect(summarize([]).standing).toBe("unexplored");
  });

  it("groups by dimension, concept and competency", () => {
    const latest = latestEvidence([
      attempt("s1", "strong", { dims: ["defend", "break"], concepts: ["idem"] }),
      attempt("s2", "gap", { dims: ["break"], concepts: ["idem"], inv: "other" }),
    ]);
    const dims = byDimension(latest);
    expect(dims.break.total).toBe(2);
    expect(dims.trace.standing).toBe("unexplored");
    expect(byConcept(latest).get("idem")?.counts).toEqual({ strong: 1, partial: 0, gap: 1 });
    expect(byCompetency(latest, "inv").get("comp")?.total).toBe(1);
  });
});

describe("insights", () => {
  const labels = { concept: (id: string) => `Concept ${id}`, source: (e: Attempt["exercise"]) => (e.kind === "stage" ? e.investigationId : "Concepts") };

  it("contrasts the strongest and weakest dimensions", () => {
    const latest = latestEvidence([
      attempt("d1", "strong", { dims: ["defend"] }),
      attempt("d2", "strong", { dims: ["defend"] }),
      attempt("b1", "gap", { dims: ["break"] }),
      attempt("b2", "partial", { dims: ["break"] }),
    ]);
    const result = insights(latest, labels);
    const contrast = result.find((i) => i.id === "dimension-contrast");
    expect(contrast?.text).toMatch(/^Defend is your most reliable/);
    expect(contrast?.text).toMatch(/Break is where gaps cluster/);
  });

  it("names concepts that are weak in more than one place", () => {
    const latest = latestEvidence([
      attempt("x", "gap", { concepts: ["idem"], inv: "video" }),
      attempt("y", "partial", { concepts: ["idem"], inv: "payments" }),
      attempt("z", "gap", { concepts: ["solo"], inv: "video" }),
    ]);
    const ids = insights(latest, labels).map((i) => i.id);
    expect(ids).toContain("recurring-idem");
    expect(ids).not.toContain("recurring-solo");
  });

  it("notes when most evidence is self-assessed", () => {
    const latest = latestEvidence(
      ["a", "b", "c", "d", "e"].map((s) => attempt(s, "strong", { basis: "self-assessed" })),
    );
    expect(insights(latest, labels).some((i) => i.id === "self-assessed-share")).toBe(true);
  });
});
