/**
 * Learner-owned state: what someone answered, what that demonstrated, and the
 * models of their own projects. Everything here crosses a trust boundary
 * (browser storage, imported files) and is validated on the way in.
 */
import { z } from "zod";
import {
  architectureComponent,
  architectureFlow,
  claimVerdict,
  codeLocation,
  dimension,
  slug,
} from "./content";

// ---------------------------------------------------------------------------
// What an attempt is about
// ---------------------------------------------------------------------------

/**
 * Project question ids are `<template>` for whole-system questions or
 * `<template>.<target>` for questions about one component, flow, or invariant.
 */
export const projectQuestionId = z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)?$/);

export const exerciseRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage"), investigationId: slug, stageId: slug }),
  z.object({ kind: z.literal("concept-claims"), conceptId: slug }),
  z.object({ kind: z.literal("concept-explain"), conceptId: slug }),
  z.object({ kind: z.literal("project-question"), projectId: slug, questionId: projectQuestionId }),
]);
export type ExerciseRef = z.infer<typeof exerciseRef>;

/** A stable string identity for an exercise. Also used in URLs, so it must round-trip. */
export function exerciseKey(ref: ExerciseRef): string {
  switch (ref.kind) {
    case "stage":
      return `stage:${ref.investigationId}/${ref.stageId}`;
    case "concept-claims":
      return `claims:${ref.conceptId}`;
    case "concept-explain":
      return `explain:${ref.conceptId}`;
    case "project-question":
      return `project:${ref.projectId}/${ref.questionId}`;
  }
}

export function parseExerciseKey(key: string): ExerciseRef | null {
  const separator = key.indexOf(":");
  if (separator < 0) return null;
  const prefix = key.slice(0, separator);
  const rest = key.slice(separator + 1);
  const [first, second, ...extra] = rest.split("/");
  if (extra.length > 0 || first === undefined) return null;
  const candidate =
    prefix === "stage"
      ? { kind: "stage", investigationId: first, stageId: second }
      : prefix === "claims"
        ? { kind: "concept-claims", conceptId: first }
        : prefix === "explain"
          ? { kind: "concept-explain", conceptId: first }
          : prefix === "project"
            ? { kind: "project-question", projectId: first, questionId: second }
            : null;
  if (candidate === null) return null;
  if (prefix !== "stage" && prefix !== "project" && second !== undefined) return null;
  const parsed = exerciseRef.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Responses — one per interaction kind
// ---------------------------------------------------------------------------

const text = z.string().max(20_000);

export const response = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("decision"), optionId: slug, rationale: text }),
  z.object({ kind: z.literal("claims"), verdicts: z.record(slug, claimVerdict) }),
  z.object({ kind: z.literal("ordering"), order: z.array(slug) }),
  z.object({
    kind: z.literal("diagnosis"),
    selected: z.array(z.number().int().nonnegative()),
    rationale: text,
  }),
  z.object({ kind: z.literal("open"), text }),
  z.object({ kind: z.literal("implementation"), code: text }),
]);
export type Response = z.infer<typeof response>;
export type ResponseOf<K extends Response["kind"]> = Extract<Response, { kind: K }>;

export const RUBRIC_MARKS = ["covered", "partial", "missed"] as const;
export const rubricMark = z.enum(RUBRIC_MARKS);
export type RubricMark = z.infer<typeof rubricMark>;
export const selfAssessment = z.record(slug, rubricMark);
export type SelfAssessment = z.infer<typeof selfAssessment>;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const SIGNALS = ["strong", "partial", "gap"] as const;
export const signal = z.enum(SIGNALS);
export type Signal = z.infer<typeof signal>;

/**
 * checked: compared against an authored answer key.
 * self-assessed: the learner compared their own writing against a rubric.
 * mixed: both kinds of part contributed.
 */
export const basis = z.enum(["checked", "self-assessed", "mixed"]);
export type Basis = z.infer<typeof basis>;

export const evidencePart = z.object({
  label: z.string(),
  signal,
  basis: z.enum(["checked", "self-assessed"]),
});
export type EvidencePart = z.infer<typeof evidencePart>;

export const evidence = z.object({
  signal,
  basis,
  parts: z.array(evidencePart).min(1),
  dimensions: z.array(dimension),
  conceptIds: z.array(slug),
  competencyIds: z.array(slug).default([]),
});
export type Evidence = z.infer<typeof evidence>;

export const ATTEMPT_CONTEXTS = ["investigation", "practice", "interview"] as const;

export const attempt = z.object({
  id: z.string().min(1),
  exercise: exerciseRef,
  context: z.enum(ATTEMPT_CONTEXTS),
  response,
  submittedAt: z.iso.datetime(),
  selfAssessment: selfAssessment.nullable(),
  /** Null until every part has been checked or self-assessed. */
  evidence: evidence.nullable(),
});
export type Attempt = z.infer<typeof attempt>;
export type AttemptContext = Attempt["context"];

// ---------------------------------------------------------------------------
// The learner's own projects
// ---------------------------------------------------------------------------

export const projectInvariant = z.object({
  id: slug,
  statement: z.string().min(1),
  enforcedBy: z.array(slug),
  mechanism: z.string(),
  evidence: z.array(codeLocation).optional(),
});
export type ProjectInvariant = z.infer<typeof projectInvariant>;

/**
 * A project's architecture model. Today it is described by hand; repository
 * analysis will later fill the same shape (with code evidence) and the
 * question templates in `project-questions.ts` will work unchanged. Answers to
 * those questions are ordinary attempts, so they feed the same evidence model.
 */
export const project = z.object({
  id: slug,
  name: z.string().min(1).max(120),
  summary: z.string().max(2_000),
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("manual") }),
    z.object({ type: z.literal("repository"), url: z.url(), analyzedAt: z.iso.datetime() }),
  ]),
  components: z.array(architectureComponent),
  flows: z.array(architectureFlow),
  invariants: z.array(projectInvariant),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Project = z.infer<typeof project>;

// ---------------------------------------------------------------------------
// Interview sessions
// ---------------------------------------------------------------------------

export const interviewSession = z.object({
  id: z.string().min(1),
  startedAt: z.iso.datetime(),
  durationMinutes: z.number().int().positive(),
  focus: z.enum(["balanced", "failure", "weakest"]),
  items: z
    .array(z.object({ exercise: exerciseRef, section: z.string(), attemptId: z.string().nullable() }))
    .min(1),
  finishedAt: z.iso.datetime().nullable(),
});
export type InterviewSession = z.infer<typeof interviewSession>;

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export const LEARNER_STATE_VERSION = 1;

export const learnerState = z.object({
  version: z.literal(LEARNER_STATE_VERSION),
  learnerId: z.string(),
  createdAt: z.iso.datetime(),
  attempts: z.array(attempt),
  projects: z.array(project),
  interviews: z.array(interviewSession),
});
export type LearnerState = z.infer<typeof learnerState>;
