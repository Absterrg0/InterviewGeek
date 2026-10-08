/**
 * Pure transitions over learner state, plus reading state that crossed a trust
 * boundary. The browser store applies these and persists the result; keeping
 * them pure keeps them testable and lets a future server-backed store reuse
 * them unchanged.
 *
 * Reading is hand-written rather than schema-library-driven so the browser
 * bundle does not carry a validator: a first visit has nothing to validate.
 */
import {
  ATTEMPT_CONTEXTS,
  LEARNER_STATE_VERSION,
  PROJECT_QUESTION_ID_RE,
  RUBRIC_MARKS,
  SIGNALS,
  type Attempt,
  type Citations,
  type Evidence,
  type InterviewSession,
  type LearnerState,
  type Project,
  type SelfAssessment,
} from "./learner";
import { DESIGN_SECTION_IDS, type DesignRound } from "./design-round";
import { CLAIM_VERDICTS, COMPONENT_KINDS, DIMENSIONS, FLOW_KINDS, isSlug } from "./taxonomy";

export function createLearnerState(learnerId: string, now: string): LearnerState {
  return {
    version: LEARNER_STATE_VERSION,
    learnerId,
    createdAt: now,
    attempts: [],
    projects: [],
    interviews: [],
    rounds: [],
  };
}

export function addAttempt(state: LearnerState, attempt: Attempt): LearnerState {
  return { ...state, attempts: [...state.attempts, attempt] };
}

export function assessAttempt(
  state: LearnerState,
  attemptId: string,
  selfAssessment: SelfAssessment,
  evidence: Evidence | null,
  citations: Citations = {},
): LearnerState {
  return {
    ...state,
    attempts: state.attempts.map((a) => (a.id === attemptId ? { ...a, selfAssessment, citations, evidence } : a)),
  };
}

export function saveProject(state: LearnerState, project: Project): LearnerState {
  const exists = state.projects.some((p) => p.id === project.id);
  return {
    ...state,
    projects: exists
      ? state.projects.map((p) => (p.id === project.id ? project : p))
      : [...state.projects, project],
  };
}

/** Removing a project also removes the answers about it; they mean nothing without it. */
export function deleteProject(state: LearnerState, projectId: string): LearnerState {
  return {
    ...state,
    projects: state.projects.filter((p) => p.id !== projectId),
    attempts: state.attempts.filter(
      (a) => !(a.exercise.kind === "project-question" && a.exercise.projectId === projectId),
    ),
    interviews: state.interviews.map((s) => ({
      ...s,
      items: s.items.filter(
        (item) => !(item.exercise.kind === "project-question" && item.exercise.projectId === projectId),
      ),
    })).filter((s) => s.items.length > 0),
  };
}

export function startInterview(state: LearnerState, session: InterviewSession): LearnerState {
  return { ...state, interviews: [...state.interviews, session] };
}

export function linkInterviewAttempt(
  state: LearnerState,
  sessionId: string,
  itemIndex: number,
  attemptId: string,
): LearnerState {
  return {
    ...state,
    interviews: state.interviews.map((s) =>
      s.id === sessionId
        ? { ...s, items: s.items.map((item, i) => (i === itemIndex ? { ...item, attemptId } : item)) }
        : s,
    ),
  };
}

export function finishInterview(state: LearnerState, sessionId: string, now: string): LearnerState {
  return {
    ...state,
    interviews: state.interviews.map((s) =>
      s.id === sessionId && s.finishedAt === null ? { ...s, finishedAt: now } : s,
    ),
  };
}

export function deleteInterview(state: LearnerState, sessionId: string): LearnerState {
  return { ...state, interviews: state.interviews.filter((s) => s.id !== sessionId) };
}

export function saveRound(state: LearnerState, round: DesignRound): LearnerState {
  const exists = state.rounds.some((r) => r.id === round.id);
  return {
    ...state,
    rounds: exists ? state.rounds.map((r) => (r.id === round.id ? round : r)) : [...state.rounds, round],
  };
}

export function deleteRound(state: LearnerState, roundId: string): LearnerState {
  return { ...state, rounds: state.rounds.filter((r) => r.id !== roundId) };
}

// ---------------------------------------------------------------------------
// Reading serialized state
// ---------------------------------------------------------------------------

export type ParseResult = { ok: true; state: LearnerState } | { ok: false; error: string };

/** Parse serialized learner state from storage or an imported file. */
export function parseLearnerState(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The data is not valid JSON." };
  }
  return readLearnerState(json);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** Returns an error message, or null when the value is fine. */
type Check = string | null;

function textCheck(value: unknown, path: string, { max = Infinity, min = 1 } = {}): Check {
  if (typeof value !== "string") return `${path} must be text.`;
  if (value.length < min) return `${path} must not be empty.`;
  if (value.length > max) return `${path} is too long.`;
  return null;
}

function slugCheck(value: unknown, path: string): Check {
  return isSlug(value) ? null : `${path} must be a kebab-case slug.`;
}

function slugListCheck(value: unknown, path: string): Check {
  if (!Array.isArray(value)) return `${path} must be a list.`;
  for (const [i, item] of value.entries()) {
    const error = slugCheck(item, `${path}[${i}]`);
    if (error) return error;
  }
  return null;
}

function listCheck(value: unknown, path: string, check: (item: unknown, path: string) => Check, min = 0): Check {
  if (!Array.isArray(value)) return `${path} must be a list.`;
  if (value.length < min) return `${path} needs at least ${min} entries.`;
  for (const [i, item] of value.entries()) {
    const error = check(item, `${path}[${i}]`);
    if (error) return error;
  }
  return null;
}

function exerciseRefCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  switch (value.kind) {
    case "stage":
      return slugCheck(value.investigationId, `${path}.investigationId`) ?? slugCheck(value.stageId, `${path}.stageId`);
    case "concept-claims":
    case "concept-explain":
      return slugCheck(value.conceptId, `${path}.conceptId`);
    case "project-question":
      return (
        slugCheck(value.projectId, `${path}.projectId`) ??
        (typeof value.questionId === "string" && PROJECT_QUESTION_ID_RE.test(value.questionId)
          ? null
          : `${path}.questionId is not a question id.`)
      );
    default:
      return `${path}.kind is not a known exercise kind.`;
  }
}

function responseCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  switch (value.kind) {
    case "decision":
      return slugCheck(value.optionId, `${path}.optionId`) ?? textCheck(value.rationale, `${path}.rationale`, { max: 20_000, min: 0 });
    case "claims": {
      if (!isRecord(value.verdicts)) return `${path}.verdicts must be an object.`;
      for (const [id, verdict] of Object.entries(value.verdicts)) {
        const error = slugCheck(id, `${path}.verdicts`) ?? (oneOf(verdict, CLAIM_VERDICTS) ? null : `${path}.verdicts.${id} is not a verdict.`);
        if (error) return error;
      }
      return null;
    }
    case "ordering":
      return slugListCheck(value.order, `${path}.order`);
    case "diagnosis": {
      if (!Array.isArray(value.selected)) return `${path}.selected must be a list.`;
      for (const line of value.selected) {
        if (!isInt(line) || line < 0) return `${path}.selected must be line numbers.`;
      }
      return textCheck(value.rationale, `${path}.rationale`, { max: 20_000, min: 0 });
    }
    case "open":
      return textCheck(value.text, `${path}.text`, { max: 20_000 });
    case "implementation":
      return textCheck(value.code, `${path}.code`, { max: 20_000 });
    default:
      return `${path}.kind is not a known response kind.`;
  }
}

function selfAssessmentCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  for (const [id, mark] of Object.entries(value)) {
    const error = slugCheck(id, `${path}`) ?? (oneOf(mark, RUBRIC_MARKS) ? null : `${path}.${id} is not a rubric mark.`);
    if (error) return error;
  }
  return null;
}

function citationsCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  for (const [id, quote] of Object.entries(value)) {
    const error = slugCheck(id, path) ?? textCheck(quote, `${path}.${id}`, { max: 20_000 });
    if (error) return error;
  }
  return null;
}

function evidenceCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  if (!oneOf(value.signal, SIGNALS)) return `${path}.signal is not a signal.`;
  if (!oneOf(value.basis, ["checked", "self-assessed", "mixed"])) return `${path}.basis is not a basis.`;
  const parts = listCheck(
    value.parts,
    `${path}.parts`,
    (part, partPath) => {
      if (!isRecord(part)) return `${partPath} must be an object.`;
      if (typeof part.label !== "string") return `${partPath}.label must be text.`;
      if (!oneOf(part.signal, SIGNALS)) return `${partPath}.signal is not a signal.`;
      return oneOf(part.basis, ["checked", "self-assessed"]) ? null : `${partPath}.basis is not a basis.`;
    },
    1,
  );
  if (parts) return parts;
  const dimensions = listCheck(value.dimensions, `${path}.dimensions`, (d, dPath) =>
    oneOf(d, DIMENSIONS) ? null : `${dPath} is not a dimension.`,
  );
  if (dimensions) return dimensions;
  const conceptIds = slugListCheck(value.conceptIds, `${path}.conceptIds`);
  if (conceptIds) return conceptIds;
  if (value.competencyIds !== undefined) return slugListCheck(value.competencyIds, `${path}.competencyIds`);
  return null;
}

function attemptCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  return (
    textCheck(value.id, `${path}.id`) ??
    exerciseRefCheck(value.exercise, `${path}.exercise`) ??
    (oneOf(value.context, ATTEMPT_CONTEXTS) ? null : `${path}.context is not a context.`) ??
    responseCheck(value.response, `${path}.response`) ??
    (isDateTime(value.submittedAt) ? null : `${path}.submittedAt must be a date.`) ??
    (value.selfAssessment === null ? null : selfAssessmentCheck(value.selfAssessment, `${path}.selfAssessment`)) ??
    (value.citations === undefined ? null : citationsCheck(value.citations, `${path}.citations`)) ??
    (value.evidence === null ? null : evidenceCheck(value.evidence, `${path}.evidence`))
  );
}

function codeLocationCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  if (textCheck(value.path, `${path}.path`)) return `${path}.path must be a path.`;
  for (const field of ["startLine", "endLine"] as const) {
    const line = value[field];
    if (line !== undefined && (!isInt(line) || line <= 0)) return `${path}.${field} must be a positive line number.`;
  }
  return null;
}

function componentCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  return (
    slugCheck(value.id, `${path}.id`) ??
    textCheck(value.label, `${path}.label`) ??
    (oneOf(value.kind, COMPONENT_KINDS) ? null : `${path}.kind is not a component kind.`) ??
    textCheck(value.responsibility, `${path}.responsibility`) ??
    (value.durableState === undefined ? null : textCheck(value.durableState, `${path}.durableState`, { min: 0 })) ??
    (value.evidence === undefined ? null : listCheck(value.evidence, `${path}.evidence`, codeLocationCheck))
  );
}

function flowCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  return (
    slugCheck(value.id, `${path}.id`) ??
    slugCheck(value.from, `${path}.from`) ??
    slugCheck(value.to, `${path}.to`) ??
    textCheck(value.label, `${path}.label`) ??
    (oneOf(value.kind, FLOW_KINDS) ? null : `${path}.kind is not a flow kind.`)
  );
}

function invariantCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  return (
    slugCheck(value.id, `${path}.id`) ??
    textCheck(value.statement, `${path}.statement`) ??
    slugListCheck(value.enforcedBy, `${path}.enforcedBy`) ??
    textCheck(value.mechanism, `${path}.mechanism`, { min: 0 }) ??
    (value.evidence === undefined ? null : listCheck(value.evidence, `${path}.evidence`, codeLocationCheck))
  );
}

function projectCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  const id = slugCheck(value.id, `${path}.id`);
  if (id) return id;
  const name = textCheck(value.name, `${path}.name`, { max: 120 });
  if (name) return name;
  const summary = textCheck(value.summary, `${path}.summary`, { max: 2_000, min: 0 });
  if (summary) return summary;
  if (!isRecord(value.source)) return `${path}.source must be an object.`;
  if (value.source.type === "repository") {
    const url = value.source.url;
    const valid = typeof url === "string" && (() => { try { new URL(url); return true; } catch { return false; } })();
    if (!valid) return `${path}.source.url must be a URL.`;
    if (!isDateTime(value.source.analyzedAt)) return `${path}.source.analyzedAt must be a date.`;
  } else if (value.source.type !== "manual") {
    return `${path}.source.type is not a source type.`;
  }
  const components = listCheck(value.components, `${path}.components`, componentCheck);
  if (components) return components;
  const flows = listCheck(value.flows, `${path}.flows`, flowCheck);
  if (flows) return flows;
  const invariants = listCheck(value.invariants, `${path}.invariants`, invariantCheck);
  if (invariants) return invariants;
  if (!isDateTime(value.createdAt)) return `${path}.createdAt must be a date.`;
  if (!isDateTime(value.updatedAt)) return `${path}.updatedAt must be a date.`;
  return null;
}

function interviewCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  if (textCheck(value.id, `${path}.id`)) return `${path}.id must be text.`;
  if (!isDateTime(value.startedAt)) return `${path}.startedAt must be a date.`;
  if (!isInt(value.durationMinutes) || value.durationMinutes <= 0) return `${path}.durationMinutes must be positive.`;
  if (!oneOf(value.focus, ["balanced", "failure", "weakest"])) return `${path}.focus is not a focus.`;
  const items = listCheck(
    value.items,
    `${path}.items`,
    (item, itemPath) => {
      if (!isRecord(item)) return `${itemPath} must be an object.`;
      return (
        exerciseRefCheck(item.exercise, `${itemPath}.exercise`) ??
        textCheck(item.section, `${itemPath}.section`) ??
        (item.attemptId === null || typeof item.attemptId === "string" ? null : `${itemPath}.attemptId must be text or null.`)
      );
    },
    1,
  );
  if (items) return items;
  if (value.finishedAt !== null && !isDateTime(value.finishedAt)) return `${path}.finishedAt must be a date or null.`;
  return null;
}

function roundCheck(value: unknown, path: string): Check {
  if (!isRecord(value)) return `${path} must be an object.`;
  if (textCheck(value.id, `${path}.id`)) return `${path}.id must be text.`;
  const inv = slugCheck(value.investigationId, `${path}.investigationId`);
  if (inv) return inv;
  if (!isDateTime(value.startedAt)) return `${path}.startedAt must be a date.`;
  if (!isDateTime(value.finishedAt)) return `${path}.finishedAt must be a date.`;
  if (!isRecord(value.answers)) return `${path}.answers must be an object.`;
  for (const [section, text] of Object.entries(value.answers)) {
    if (!oneOf(section, DESIGN_SECTION_IDS)) return `${path}.answers.${section} is not a section.`;
    const error = textCheck(text, `${path}.answers.${section}`, { max: 50_000, min: 0 });
    if (error) return error;
  }
  if (!isRecord(value.covered)) return `${path}.covered must be an object.`;
  for (const [section, items] of Object.entries(value.covered)) {
    if (!oneOf(section, DESIGN_SECTION_IDS)) return `${path}.covered.${section} is not a section.`;
    if (!Array.isArray(items) || !items.every((item) => typeof item === "string")) {
      return `${path}.covered.${section} must be a list of item ids.`;
    }
  }
  return null;
}

/**
 * Evidence gained `competencyIds` after the first states were written, so a
 * missing list is filled in rather than treated as corruption.
 */
function normalize(state: LearnerState): LearnerState {
  return {
    ...state,
    rounds: state.rounds ?? [],
    attempts: state.attempts.map((attempt) =>
      attempt.evidence && attempt.evidence.competencyIds === undefined
        ? { ...attempt, evidence: { ...attempt.evidence, competencyIds: [] } }
        : attempt,
    ),
  };
}

function readLearnerState(json: unknown): ParseResult {
  if (!isRecord(json)) return { ok: false, error: "The saved progress is not an object." };
  if (json.version !== LEARNER_STATE_VERSION) {
    return { ok: false, error: `Saved progress has version ${String(json.version)}, not ${LEARNER_STATE_VERSION}.` };
  }
  if (typeof json.learnerId !== "string") return { ok: false, error: "learnerId is missing." };
  if (!isDateTime(json.createdAt)) return { ok: false, error: "createdAt must be a date." };
  const attempts = listCheck(json.attempts, "attempts", attemptCheck);
  if (attempts) return { ok: false, error: attempts };
  const projects = listCheck(json.projects, "projects", projectCheck);
  if (projects) return { ok: false, error: projects };
  const interviews = listCheck(json.interviews, "interviews", interviewCheck);
  if (interviews) return { ok: false, error: interviews };
  if (json.rounds !== undefined) {
    const rounds = listCheck(json.rounds, "rounds", roundCheck);
    if (rounds) return { ok: false, error: rounds };
  }
  return { ok: true, state: normalize(json as unknown as LearnerState) };
}
