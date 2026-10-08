import { describe, expect, it } from "vitest";
import { exerciseKey, parseExerciseKey, type Attempt, type Project } from "./learner";
import {
  addAttempt,
  assessAttempt,
  createLearnerState,
  deleteProject,
  finishInterview,
  linkInterviewAttempt,
  parseLearnerState,
  saveProject,
  startInterview,
} from "./learner-state";

const now = "2026-01-01T00:00:00.000Z";

const project: Project = {
  id: "p1",
  name: "P",
  summary: "",
  source: { type: "manual" },
  components: [],
  flows: [],
  invariants: [],
  createdAt: now,
  updatedAt: now,
};

const attempt = (id: string, exercise: Attempt["exercise"]): Attempt => ({
  id,
  exercise,
  context: "practice",
  response: { kind: "open", text: "answer" },
  submittedAt: now,
  selfAssessment: null,
  evidence: null,
});

describe("exercise keys", () => {
  it("round-trip every kind of ref", () => {
    const refs = [
      { kind: "stage", investigationId: "inv", stageId: "s" },
      { kind: "concept-claims", conceptId: "c" },
      { kind: "concept-explain", conceptId: "c" },
      { kind: "project-question", projectId: "p", questionId: "trace.flow" },
    ] as const;
    for (const ref of refs) expect(parseExerciseKey(exerciseKey(ref))).toEqual(ref);
  });

  it("rejects malformed keys", () => {
    for (const key of ["", "stage:x", "claims:a/b", "nope:x", "stage:A/b", "project:p/a.b.c"]) {
      expect(parseExerciseKey(key), key).toBeNull();
    }
  });
});

describe("learner state transitions", () => {
  it("records and assesses attempts immutably", () => {
    const s0 = createLearnerState("me", now);
    const s1 = addAttempt(s0, attempt("a1", { kind: "concept-explain", conceptId: "c" }));
    expect(s0.attempts).toHaveLength(0);
    const evidence = {
      signal: "strong" as const,
      basis: "self-assessed" as const,
      parts: [{ label: "Explanation", signal: "strong" as const, basis: "self-assessed" as const }],
      dimensions: [],
      conceptIds: [],
      competencyIds: [],
    };
    const s2 = assessAttempt(s1, "a1", { x: "covered" }, evidence, { x: "answer" });
    expect(s2.attempts[0]?.evidence).toEqual(evidence);
    expect(s2.attempts[0]?.citations).toEqual({ x: "answer" });
    expect(s1.attempts[0]?.evidence).toBeNull();

    const parsed = parseLearnerState(JSON.stringify(s2));
    expect(parsed.ok && parsed.state.attempts[0]?.citations).toEqual({ x: "answer" });
    const badCitation = JSON.parse(JSON.stringify(s2)) as { attempts: { citations: unknown }[] };
    badCitation.attempts[0]!.citations = { x: 42 };
    expect(parseLearnerState(JSON.stringify(badCitation)).ok).toBe(false);
  });

  it("removes a project's answers and interview items with it", () => {
    let s = saveProject(createLearnerState("me", now), project);
    s = addAttempt(s, attempt("a1", { kind: "project-question", projectId: "p1", questionId: "retry" }));
    s = addAttempt(s, attempt("a2", { kind: "concept-claims", conceptId: "c" }));
    s = startInterview(s, {
      id: "i1",
      startedAt: now,
      durationMinutes: 30,
      focus: "balanced",
      items: [{ exercise: { kind: "project-question", projectId: "p1", questionId: "retry" }, section: "Defend", attemptId: null }],
      finishedAt: null,
    });
    s = deleteProject(s, "p1");
    expect(s.projects).toHaveLength(0);
    expect(s.attempts.map((a) => a.id)).toEqual(["a2"]);
    expect(s.interviews).toHaveLength(0);
  });

  it("links interview attempts and finishes sessions once", () => {
    let s = startInterview(createLearnerState("me", now), {
      id: "i1",
      startedAt: now,
      durationMinutes: 30,
      focus: "balanced",
      items: [{ exercise: { kind: "concept-claims", conceptId: "c" }, section: "Recall", attemptId: null }],
      finishedAt: null,
    });
    s = linkInterviewAttempt(s, "i1", 0, "a9");
    expect(s.interviews[0]?.items[0]?.attemptId).toBe("a9");
    s = finishInterview(s, "i1", "2026-01-02T00:00:00.000Z");
    s = finishInterview(s, "i1", "2026-01-03T00:00:00.000Z");
    expect(s.interviews[0]?.finishedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("parses stored state and rejects invalid data", () => {
    const state = saveProject(createLearnerState("me", now), project);
    expect(parseLearnerState(JSON.stringify(state))).toEqual({ ok: true, state });
    expect(parseLearnerState("{not json").ok).toBe(false);
    expect(parseLearnerState(JSON.stringify({ ...state, version: 99 })).ok).toBe(false);
  });

  it("reads back decisions and diagnoses submitted without reasoning", () => {
    const decision: Attempt = {
      ...attempt("a1", { kind: "stage", investigationId: "inv", stageId: "s1" }),
      response: { kind: "decision", optionId: "good", rationale: "" },
    };
    const diagnosis: Attempt = {
      ...attempt("a2", { kind: "stage", investigationId: "inv", stageId: "s2" }),
      response: { kind: "diagnosis", selected: [1], rationale: "" },
    };
    const state = addAttempt(addAttempt(createLearnerState("me", now), decision), diagnosis);
    expect(parseLearnerState(JSON.stringify(state))).toEqual({ ok: true, state });
  });

  it("rejects malformed attempts, evidence and projects", () => {
    const base = saveProject(createLearnerState("me", now), project);
    const withAttempt = addAttempt(base, attempt("a1", { kind: "concept-explain", conceptId: "c" }));
    type Loose = {
      attempts: { response: { kind: string } }[];
      projects: { components: { id: string; label: string; kind: string; responsibility: string }[] }[];
    };
    const raw = JSON.parse(JSON.stringify(withAttempt)) as unknown as Loose;

    const badResponse = structuredClone(raw);
    badResponse.attempts[0]!.response.kind = "telepathy";
    expect(parseLearnerState(JSON.stringify(badResponse)).ok).toBe(false);

    const badEvidence = structuredClone(raw);
    Object.assign(badEvidence.attempts[0]!, {
      evidence: {
        signal: "strong",
        basis: "self-assessed",
        parts: [{ label: "Explanation", signal: "strong", basis: "self-assessed" }],
        dimensions: ["vibes"],
        conceptIds: [],
      },
    });
    expect(parseLearnerState(JSON.stringify(badEvidence)).ok).toBe(false);

    const badProject = structuredClone(raw);
    badProject.projects[0]!.components.push({ id: "db", label: "DB", kind: "blockchain", responsibility: "Store" });
    expect(parseLearnerState(JSON.stringify(badProject)).ok).toBe(false);
  });

  it("fills in evidence fields added after the first states were written", () => {
    const state = addAttempt(createLearnerState("me", now), attempt("a1", { kind: "concept-explain", conceptId: "c" }));
    const evidence = {
      signal: "strong",
      basis: "self-assessed",
      parts: [{ label: "Answer", signal: "strong", basis: "self-assessed" }],
      dimensions: ["explain"],
      conceptIds: ["caching"],
    };
    const raw = JSON.stringify({ ...state, attempts: [{ ...state.attempts[0], evidence }] });
    const parsed = parseLearnerState(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.state.attempts[0]?.evidence?.competencyIds).toEqual([]);
  });
});
