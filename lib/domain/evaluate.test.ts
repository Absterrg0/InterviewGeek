import { describe, expect, it } from "vitest";
import type { InteractionOf, RubricPoint } from "./content";
import { checkedParts, evaluate, orderingAgreement, rubricSignal, shuffled, worstSignal } from "./evaluate";

const tags = { dimensions: ["defend" as const], conceptIds: ["idempotency"], competencyIds: ["c"] };

const rubric: RubricPoint[] = [
  { id: "a", text: "A", weight: "core" },
  { id: "b", text: "B", weight: "core" },
  { id: "c", text: "C", weight: "supporting" },
];

const decision: InteractionOf<"decision"> = {
  kind: "decision",
  prompt: "?",
  options: [
    { id: "good", label: "Good", assessment: "sound", feedback: "f" },
    { id: "ok", label: "Ok", assessment: "defensible", feedback: "f" },
    { id: "bad", label: "Bad", assessment: "flawed", feedback: "f" },
  ],
  rationale: { prompt: "why", rubric },
};

describe("rubricSignal", () => {
  it("waits for every point to be marked", () => {
    expect(rubricSignal(rubric, { a: "covered", b: "covered" })).toBeNull();
  });

  it("is strong when core points are covered", () => {
    expect(rubricSignal(rubric, { a: "covered", b: "covered", c: "missed" })).toBe("strong");
  });

  it("is never strong when a core point is missed outright", () => {
    const many: RubricPoint[] = [
      ...rubric,
      { id: "d", text: "D", weight: "core" },
      { id: "e", text: "E", weight: "core" },
      { id: "f", text: "F", weight: "core" },
    ];
    expect(
      rubricSignal(many, { a: "covered", b: "covered", c: "covered", d: "covered", e: "covered", f: "missed" }),
    ).toBe("partial");
  });

  it("is a gap when little is covered", () => {
    expect(rubricSignal(rubric, { a: "missed", b: "partial", c: "missed" })).toBe("gap");
  });
});

describe("evaluate", () => {
  it("needs a self-assessment before a decision has evidence", () => {
    const response = { kind: "decision" as const, optionId: "good", rationale: "because" };
    expect(evaluate(decision, response, null, tags)).toBeNull();
  });

  it("rests on the decision alone when no reasoning was written", () => {
    const response = { kind: "decision" as const, optionId: "good", rationale: "  " };
    const evidence = evaluate(decision, response, null, tags);
    expect(evidence?.signal).toBe("strong");
    expect(evidence?.basis).toBe("checked");
    expect(evidence?.parts.map((p) => p.label)).toEqual(["Decision"]);
  });

  it("takes the weakest part as the overall signal and records the basis", () => {
    const response = { kind: "decision" as const, optionId: "good", rationale: "because" };
    const evidence = evaluate(decision, response, { a: "covered", b: "partial", c: "missed" }, tags);
    expect(evidence?.signal).toBe("partial");
    expect(evidence?.basis).toBe("mixed");
    expect(evidence?.parts.map((p) => [p.label, p.signal])).toEqual([
      ["Decision", "strong"],
      ["Reasoning", "partial"],
    ]);
    expect(evidence?.conceptIds).toEqual(["idempotency"]);
  });

  it("treats a defensible choice as partial and a flawed one as a gap", () => {
    const marks = { a: "covered", b: "covered", c: "covered" } as const;
    expect(evaluate(decision, { kind: "decision", optionId: "ok", rationale: "x" }, marks, tags)?.signal).toBe("partial");
    expect(evaluate(decision, { kind: "decision", optionId: "bad", rationale: "x" }, marks, tags)?.signal).toBe("gap");
  });

  it("returns null when the response no longer fits the content", () => {
    expect(checkedParts(decision, { kind: "decision", optionId: "removed", rationale: "x" })).toBeNull();
    expect(checkedParts(decision, { kind: "open", text: "x" })).toBeNull();
  });

  it("checks claims, counting only the claims answered", () => {
    const claims: InteractionOf<"claims"> = {
      kind: "claims",
      prompt: "?",
      claims: [
        { id: "x", statement: "x", verdict: "holds", explanation: "e" },
        { id: "y", statement: "y", verdict: "fails", explanation: "e" },
        { id: "z", statement: "z", verdict: "depends", explanation: "e" },
      ],
    };
    const all = evaluate(claims, { kind: "claims", verdicts: { x: "holds", y: "fails", z: "holds" } }, null, tags);
    expect(all?.signal).toBe("partial");
    expect(all?.basis).toBe("checked");
    const subset = evaluate(claims, { kind: "claims", verdicts: { x: "holds" } }, null, tags);
    expect(subset?.signal).toBe("strong");
    expect(subset?.parts[0]?.label).toBe("Claims: 1 of 1");
  });

  it("checks diagnoses for both missed faults and false alarms", () => {
    const diagnosis: InteractionOf<"diagnosis"> = {
      kind: "diagnosis",
      prompt: "?",
      artifact: { type: "log", lines: [{ text: "a" }, { text: "b", fault: "why" }, { text: "c" }] },
      rationale: { prompt: "why", rubric },
    };
    expect(checkedParts(diagnosis, { kind: "diagnosis", selected: [1], rationale: "" })?.[0]?.signal).toBe("strong");
    expect(checkedParts(diagnosis, { kind: "diagnosis", selected: [1, 2], rationale: "" })?.[0]?.signal).toBe("partial");
    expect(checkedParts(diagnosis, { kind: "diagnosis", selected: [0], rationale: "" })?.[0]?.signal).toBe("gap");
    expect(checkedParts(diagnosis, { kind: "diagnosis", selected: [9], rationale: "" })).toBeNull();
  });
});

describe("ordering", () => {
  const ordering: InteractionOf<"ordering"> = {
    kind: "ordering",
    prompt: "?",
    items: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id })),
    explanation: "e",
  };

  it("measures pairwise agreement", () => {
    expect(orderingAgreement(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    expect(orderingAgreement(["a", "b", "c"], ["c", "b", "a"])).toBe(0);
  });

  it("is strong only when exact, partial when nearly right", () => {
    const signal = (order: string[]) => checkedParts(ordering, { kind: "ordering", order })?.[0]?.signal;
    expect(signal(["a", "b", "c", "d", "e"])).toBe("strong");
    expect(signal(["a", "c", "b", "d", "e"])).toBe("partial");
    expect(signal(["e", "d", "c", "b", "a"])).toBe("gap");
    expect(checkedParts(ordering, { kind: "ordering", order: ["a", "b"] })).toBeNull();
  });
});

describe("presentation helpers", () => {
  it("shuffles deterministically and never returns the authored order", () => {
    const items = ["a", "b", "c", "d"];
    expect(shuffled(items, "seed")).toEqual(shuffled(items, "seed"));
    for (const seed of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
      expect(shuffled(items, seed)).not.toEqual(items);
      expect([...shuffled(items, seed)].sort()).toEqual(items);
    }
    expect(shuffled(["only"], "x")).toEqual(["only"]);
  });

  it("finds the weakest signal", () => {
    expect(worstSignal(["strong", "gap", "partial"])).toBe("gap");
    expect(worstSignal([])).toBe("strong");
  });
});
