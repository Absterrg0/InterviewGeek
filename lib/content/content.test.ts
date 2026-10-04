import { describe, expect, it } from "vitest";
import { checkContentIntegrity, conceptReferences } from "./integrity";
import { getConcept, listConcepts, listInvestigations } from ".";
import { listExercises, resolveExercise } from "./exercises";
import { parseExerciseKey } from "@/lib/domain/learner";

describe("curated content", () => {
  it("parses and has a consistent reference graph", () => {
    expect(checkContentIntegrity(listInvestigations(), listConcepts())).toEqual([]);
  });

  it("links every concept from at least one investigation or concept", () => {
    const referenced = new Set<string>();
    for (const inv of listInvestigations()) {
      for (const s of inv.stages) s.conceptIds.forEach((id) => referenced.add(id));
      conceptReferences(inv).forEach((id) => referenced.add(id));
    }
    for (const c of listConcepts()) c.relatedConceptIds.forEach((id) => referenced.add(id));
    const orphans = listConcepts().filter((c) => !referenced.has(c.id)).map((c) => c.id);
    expect(orphans).toEqual([]);
  });

  it("gives every investigation a failure, a change and a defense stage", () => {
    for (const inv of listInvestigations()) {
      expect(inv.stages.some((s) => s.phase === "break"), inv.id).toBe(true);
      expect(inv.stages.some((s) => s.phase === "change"), inv.id).toBe(true);
      expect(inv.stages.some((s) => s.phase === "defend"), inv.id).toBe(true);
    }
  });

  it("resolves every listed exercise and round-trips its key", () => {
    const exercises = listExercises();
    expect(exercises.length).toBeGreaterThan(0);
    for (const e of exercises) {
      expect(parseExerciseKey(e.key)).toEqual(e.ref);
      expect(resolveExercise(e.ref)?.summary.key).toBe(e.key);
    }
  });

  it("derives concept checks from concept claims", () => {
    const concept = listConcepts()[0];
    if (!concept) throw new Error("no concepts");
    const resolved = resolveExercise({ kind: "concept-claims", conceptId: concept.id });
    expect(resolved?.interaction.kind).toBe("claims");
    expect(getConcept(concept.id)?.claims.length).toBeGreaterThanOrEqual(2);
  });
});

describe("integrity checker", () => {
  it("reports dangling references", () => {
    const [inv] = listInvestigations();
    if (!inv) throw new Error("no investigations");
    const broken = {
      ...inv,
      relatedInvestigationIds: ["does-not-exist"],
      stages: inv.stages.map((s, i) => (i === 0 ? { ...s, conceptIds: ["no-such-concept"] } : s)),
    };
    const errors = checkContentIntegrity([broken], listConcepts());
    expect(errors.some((e) => e.includes("does-not-exist"))).toBe(true);
    expect(errors.some((e) => e.includes("no-such-concept"))).toBe(true);
  });
});
