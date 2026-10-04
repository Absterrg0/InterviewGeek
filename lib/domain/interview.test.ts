import { describe, expect, it } from "vitest";
import { listExercises } from "@/lib/content/exercises";
import { composeInterview, DURATIONS, type InterviewCandidate } from "./interview";
import type { Attempt } from "./learner";
import { latestEvidence } from "./understanding";

const candidates: InterviewCandidate[] = listExercises().map((e) => ({
  key: e.key,
  ref: e.ref,
  interactionKind: e.interactionKind,
  phase: e.phase,
  eventKind: e.eventKind,
  dimensions: e.dimensions,
  conceptIds: e.conceptIds,
  minutes: e.minutes,
}));

const project: InterviewCandidate = {
  key: "project:shop/retry",
  ref: { kind: "project-question", projectId: "shop", questionId: "retry" },
  interactionKind: "open",
  phase: null,
  eventKind: null,
  dimensions: ["break"],
  conceptIds: ["idempotency"],
  minutes: 8,
};

describe("composeInterview", () => {
  it("fills every section of every plan from the curated library without repeats", () => {
    for (const duration of DURATIONS) {
      for (const focus of ["balanced", "failure", "weakest"] as const) {
        const items = composeInterview({ candidates, duration, focus, latest: new Map(), seed: "s" });
        expect(items.length, `${focus} ${duration}`).toBe(duration === 30 ? 4 : duration === 45 ? 6 : 8);
        expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
        expect(items[0]?.ref.kind).toBe("concept-explain");
      }
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const a = composeInterview({ candidates, duration: 45, focus: "balanced", latest: new Map(), seed: "one" });
    const b = composeInterview({ candidates, duration: 45, focus: "balanced", latest: new Map(), seed: "one" });
    expect(a).toEqual(b);
    const keys = new Set(
      ["1", "2", "3", "4", "5"].map((seed) =>
        composeInterview({ candidates, duration: 45, focus: "balanced", latest: new Map(), seed }).map((i) => i.key).join(),
      ),
    );
    expect(keys.size).toBeGreaterThan(1);
  });

  it("asks about the learner's project when one is available", () => {
    const items = composeInterview({ candidates: [...candidates, project], duration: 30, focus: "balanced", latest: new Map(), seed: "x" });
    expect(items.some((i) => i.ref.kind === "project-question")).toBe(true);
  });

  it("prioritises weak exercises when focusing on weaknesses", () => {
    const weak = candidates.find((c) => c.ref.kind === "concept-explain");
    if (!weak || weak.ref.kind !== "concept-explain") throw new Error("no candidate");
    const attempt: Attempt = {
      id: "a",
      exercise: weak.ref,
      context: "practice",
      response: { kind: "open", text: "x" },
      submittedAt: "2026-01-01T00:00:00.000Z",
      selfAssessment: {},
      evidence: {
        signal: "gap",
        basis: "self-assessed",
        parts: [{ label: "Explanation", signal: "gap", basis: "self-assessed" }],
        dimensions: ["explain"],
        conceptIds: weak.conceptIds,
        competencyIds: [],
      },
    };
    const items = composeInterview({
      candidates,
      duration: 30,
      focus: "weakest",
      latest: latestEvidence([attempt]),
      seed: "w",
    });
    expect(items[0]?.key).toBe(weak.key);
  });
});
