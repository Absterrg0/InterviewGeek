/**
 * Learner-owned state: what someone answered, what that demonstrated, and the
 * models of their own projects.
 *
 * Types and pure helpers live here without a validation library, so client
 * components can use them without shipping a validator. Reading state that
 * crossed a trust boundary (browser storage, imported files) is
 * `learner-state.ts`'s job, and it validates as it parses.
 */
import type { ArchitectureComponent, ArchitectureFlow, CodeLocation } from "./content";
import { isSlug, type ClaimVerdict, type Dimension } from "./taxonomy";

// ---------------------------------------------------------------------------
// Shared vocabularies
// ---------------------------------------------------------------------------

export const RUBRIC_MARKS = ["covered", "partial", "missed"] as const;
export const SIGNALS = ["strong", "partial", "gap"] as const;
export const ATTEMPT_CONTEXTS = ["investigation", "practice", "interview"] as const;
export const LEARNER_STATE_VERSION = 1;

/**
 * Project question ids are `<template>` for whole-system questions or
 * `<template>.<target>` for questions about one component, flow, or invariant.
 */
export const PROJECT_QUESTION_ID_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)?$/;

// ---------------------------------------------------------------------------
// What an attempt is about
// ---------------------------------------------------------------------------

export type ExerciseRef =
  | { kind: "stage"; investigationId: string; stageId: string }
  | { kind: "concept-claims"; conceptId: string }
  | { kind: "concept-explain"; conceptId: string }
  | { kind: "project-question"; projectId: string; questionId: string };

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
  switch (prefix) {
    case "stage":
      return isSlug(first) && second !== undefined && isSlug(second)
        ? { kind: "stage", investigationId: first, stageId: second }
        : null;
    case "claims":
      return second === undefined && isSlug(first) ? { kind: "concept-claims", conceptId: first } : null;
    case "explain":
      return second === undefined && isSlug(first) ? { kind: "concept-explain", conceptId: first } : null;
    case "project":
      return isSlug(first) && second !== undefined && PROJECT_QUESTION_ID_RE.test(second)
        ? { kind: "project-question", projectId: first, questionId: second }
        : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Responses — one per interaction kind
// ---------------------------------------------------------------------------

export type Response =
  | { kind: "decision"; optionId: string; rationale: string }
  | { kind: "claims"; verdicts: Record<string, ClaimVerdict> }
  | { kind: "ordering"; order: string[] }
  | { kind: "diagnosis"; selected: number[]; rationale: string }
  | { kind: "open"; text: string }
  | { kind: "implementation"; code: string };
export type ResponseOf<K extends Response["kind"]> = Extract<Response, { kind: K }>;

export type RubricMark = (typeof RUBRIC_MARKS)[number];
export type SelfAssessment = Record<string, RubricMark>;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type Signal = (typeof SIGNALS)[number];

/**
 * checked: compared against an authored answer key.
 * self-assessed: the learner compared their own writing against a rubric.
 * mixed: both kinds of part contributed.
 */
export type Basis = "checked" | "self-assessed" | "mixed";

export type EvidencePart = {
  label: string;
  signal: Signal;
  basis: "checked" | "self-assessed";
};

export type Evidence = {
  signal: Signal;
  basis: Basis;
  parts: EvidencePart[];
  dimensions: Dimension[];
  conceptIds: string[];
  competencyIds: string[];
};

export type AttemptContext = (typeof ATTEMPT_CONTEXTS)[number];

export type Attempt = {
  id: string;
  exercise: ExerciseRef;
  context: AttemptContext;
  response: Response;
  submittedAt: string;
  selfAssessment: SelfAssessment | null;
  /** Null until every part has been checked or self-assessed. */
  evidence: Evidence | null;
};

// ---------------------------------------------------------------------------
// The learner's own projects
// ---------------------------------------------------------------------------

export type ProjectInvariant = {
  id: string;
  statement: string;
  /** Components that are responsible for keeping this true. */
  enforcedBy: string[];
  /** How it is enforced: the mechanism, not the technology. */
  mechanism: string;
  evidence?: CodeLocation[];
};

/**
 * A project's architecture model. Today it is described by hand; repository
 * analysis will later fill the same shape (with code evidence) and the
 * question templates in `project-questions.ts` will work unchanged. Answers to
 * those questions are ordinary attempts, so they feed the same evidence model.
 */
export type Project = {
  id: string;
  name: string;
  summary: string;
  source: { type: "manual" } | { type: "repository"; url: string; analyzedAt: string };
  components: ArchitectureComponent[];
  flows: ArchitectureFlow[];
  invariants: ProjectInvariant[];
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Interview sessions
// ---------------------------------------------------------------------------

export type InterviewSession = {
  id: string;
  startedAt: string;
  durationMinutes: number;
  focus: "balanced" | "failure" | "weakest";
  items: { exercise: ExerciseRef; section: string; attemptId: string | null }[];
  finishedAt: string | null;
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export type LearnerState = {
  version: typeof LEARNER_STATE_VERSION;
  learnerId: string;
  createdAt: string;
  attempts: Attempt[];
  projects: Project[];
  interviews: InterviewSession[];
};
