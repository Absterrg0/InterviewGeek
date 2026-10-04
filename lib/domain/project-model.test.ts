import { describe, expect, it } from "vitest";
import { exampleProject } from "./example-project";
import { project as projectSchema } from "./learner";
import { modelOf, modelProblems, removeComponent } from "./project-model";

describe("project model editing", () => {
  const example = exampleProject("example", "2026-01-01T00:00:00.000Z");

  it("ships a valid example", () => {
    expect(projectSchema.safeParse(example).success).toBe(true);
    expect(modelProblems(modelOf(example))).toEqual([]);
  });

  it("cascades component removal to flows and invariants", () => {
    const model = removeComponent(modelOf(example), "postgres");
    expect(model.components.some((c) => c.id === "postgres")).toBe(false);
    expect(model.flows.some((f) => f.from === "postgres" || f.to === "postgres")).toBe(false);
    expect(model.invariants.every((i) => !i.enforcedBy.includes("postgres"))).toBe(true);
    expect(modelProblems(model)).toEqual([]);
  });

  it("reports blank fields and self-loops", () => {
    const model = modelOf(example);
    const broken = {
      ...model,
      components: model.components.map((c, i) => (i === 0 ? { ...c, responsibility: " " } : c)),
      flows: [...model.flows, { id: "loop", from: "api", to: "api", label: "", kind: "request" as const }],
    };
    const problems = modelProblems(broken);
    expect(problems.some((p) => p.includes("responsible"))).toBe(true);
    expect(problems.some((p) => p.includes("to itself"))).toBe(true);
    expect(problems.some((p) => p.startsWith("Describe the flow"))).toBe(true);
  });
});
