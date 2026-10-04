/**
 * Pure transitions over learner state. The browser store applies these and
 * persists the result; keeping them pure keeps them testable and lets a future
 * server-backed store reuse them unchanged.
 */
import { z } from "zod";
import {
  LEARNER_STATE_VERSION,
  learnerState,
  type Attempt,
  type Evidence,
  type InterviewSession,
  type LearnerState,
  type Project,
  type SelfAssessment,
} from "./learner";

export function createLearnerState(learnerId: string, now: string): LearnerState {
  return {
    version: LEARNER_STATE_VERSION,
    learnerId,
    createdAt: now,
    attempts: [],
    projects: [],
    interviews: [],
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
): LearnerState {
  return {
    ...state,
    attempts: state.attempts.map((a) => (a.id === attemptId ? { ...a, selfAssessment, evidence } : a)),
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

export type ParseResult = { ok: true; state: LearnerState } | { ok: false; error: string };

/** Parse serialized learner state from storage or an imported file. */
export function parseLearnerState(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The data is not valid JSON." };
  }
  const result = learnerState.safeParse(json);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error) };
  }
  return { ok: true, state: result.data };
}
