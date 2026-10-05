/**
 * The learner's state, persisted in localStorage.
 *
 * One module owns reading, validating, writing and broadcasting. React reads
 * it through useSyncExternalStore; the server snapshot is null, so anything
 * that depends on learner state renders a neutral placeholder until hydration
 * instead of flashing "no progress". Unreadable data is never thrown away: it
 * is copied to a quarantine key and the learner is told.
 */
import { track } from "@vercel/analytics";
import { useSyncExternalStore } from "react";
import type { Interaction } from "@/lib/domain/content";
import { evaluate, type ExerciseTags } from "@/lib/domain/evaluate";
import type {
  Attempt,
  AttemptContext,
  ExerciseRef,
  InterviewSession,
  LearnerState,
  Project,
  Response,
  SelfAssessment,
} from "@/lib/domain/learner";
import { exerciseKey } from "@/lib/domain/learner";
import * as transitions from "@/lib/domain/learner-state";

// Keys keep the original "interviewgeek" prefix so existing progress survives the rename.
const STORAGE_KEY = "interviewgeek.learner";

export type StoreStatus = {
  /** False when the browser refuses storage: progress lasts only for this tab. */
  persistent: boolean;
  /** Set when stored data could not be read and was set aside. */
  recovered: { quarantineKey: string; error: string } | null;
  /** The last write failed (usually quota). */
  saveFailed: boolean;
};

let state: LearnerState | null = null;
let status: StoreStatus = { persistent: true, recovered: null, saveFailed: false };
const listeners = new Set<() => void>();

let available: Storage | null | undefined;

function storage(): Storage | null {
  if (available !== undefined) return available;
  try {
    const s = window.localStorage;
    const probe = "interviewgeek.probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    available = s;
  } catch {
    available = null;
  }
  return available;
}

function fresh(): LearnerState {
  return transitions.createLearnerState(crypto.randomUUID(), new Date().toISOString());
}

function persist(next: LearnerState) {
  const s = storage();
  if (!s) {
    if (status.persistent) status = { ...status, persistent: false };
    return;
  }
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(next));
    if (status.saveFailed) status = { ...status, saveFailed: false };
  } catch {
    status = { ...status, saveFailed: true };
  }
}

function load(): LearnerState {
  const s = storage();
  if (!s) {
    status = { ...status, persistent: false };
    return fresh();
  }
  const raw = s.getItem(STORAGE_KEY);
  if (raw === null) return fresh();
  const parsed = transitions.parseLearnerState(raw);
  if (parsed.ok) return parsed.state;

  const quarantineKey = `${STORAGE_KEY}.unreadable.${Date.now()}`;
  try {
    s.setItem(quarantineKey, raw);
  } catch {
    // If even the quarantine copy fails, keep the original in place untouched.
    status = { ...status, recovered: { quarantineKey: STORAGE_KEY, error: parsed.error } };
    return fresh();
  }
  status = { ...status, recovered: { quarantineKey, error: parsed.error } };
  const next = fresh();
  persist(next);
  return next;
}

function current(): LearnerState {
  if (state === null) state = load();
  return state;
}

function emit() {
  for (const listener of listeners) listener();
}

function commit(next: LearnerState) {
  state = next;
  persist(next);
  emit();
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  // Another tab wrote; adopt its state if it is readable.
  if (event.newValue === null) {
    state = fresh();
  } else {
    const parsed = transitions.parseLearnerState(event.newValue);
    if (!parsed.ok) return;
    state = parsed.state;
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = () => null;

export function useLearnerState(): LearnerState | null {
  return useSyncExternalStore(subscribe, current, serverSnapshot);
}

export function useStoreStatus(): StoreStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      current();
      return status;
    },
    serverSnapshot,
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function submitAttempt(input: {
  exercise: ExerciseRef;
  interaction: Interaction;
  tags: ExerciseTags;
  response: Response;
  context: AttemptContext;
}): Attempt {
  const attempt: Attempt = {
    id: crypto.randomUUID(),
    exercise: input.exercise,
    context: input.context,
    response: input.response,
    submittedAt: new Date().toISOString(),
    selfAssessment: null,
    // Fully checked interactions have evidence immediately; written ones wait for the rubric.
    evidence: evaluate(input.interaction, input.response, null, input.tags),
  };
  commit(transitions.addAttempt(current(), attempt));
  // Which exercises get answered, never what was answered. Project ids stay out of analytics.
  track("answer_submitted", {
    exercise: input.exercise.kind === "project-question" ? "project-question" : exerciseKey(input.exercise),
  });
  return attempt;
}

export function assessAttempt(input: {
  attempt: Attempt;
  interaction: Interaction;
  tags: ExerciseTags;
  selfAssessment: SelfAssessment;
}) {
  const evidence = evaluate(input.interaction, input.attempt.response, input.selfAssessment, input.tags);
  commit(transitions.assessAttempt(current(), input.attempt.id, input.selfAssessment, evidence));
}

export function saveProject(project: Project) {
  commit(transitions.saveProject(current(), project));
}

export function deleteProject(projectId: string) {
  commit(transitions.deleteProject(current(), projectId));
}

export function startInterview(session: InterviewSession) {
  commit(transitions.startInterview(current(), session));
}

export function linkInterviewAttempt(sessionId: string, itemIndex: number, attemptId: string) {
  commit(transitions.linkInterviewAttempt(current(), sessionId, itemIndex, attemptId));
}

export function finishInterview(sessionId: string) {
  commit(transitions.finishInterview(current(), sessionId, new Date().toISOString()));
}

export function deleteInterview(sessionId: string) {
  commit(transitions.deleteInterview(current(), sessionId));
}

export function exportState(): string {
  return JSON.stringify(current(), null, 2);
}

export function importState(raw: string): transitions.ParseResult {
  const parsed = transitions.parseLearnerState(raw);
  if (parsed.ok) commit(parsed.state);
  return parsed;
}

export function resetState() {
  commit(fresh());
}

export function dismissRecovery() {
  status = { ...status, recovered: null };
  emit();
}

// ---------------------------------------------------------------------------
// Drafts: unsent answers survive navigation and reloads
// ---------------------------------------------------------------------------

const DRAFT_PREFIX = "interviewgeek.draft.";

const draftCache = new Map<string, unknown>();
const draftListeners = new Map<string, Set<() => void>>();

/** Subscribe to one draft key; used by `useDraft` through useSyncExternalStore. */
export function subscribeDraft(key: string, listener: () => void): () => void {
  let listeners = draftListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    draftListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) draftListeners.delete(key);
  };
}

/** The cached draft for a key. Stable until that draft is written or cleared. */
export function draftSnapshot(key: string): unknown {
  if (!draftCache.has(key)) draftCache.set(key, readDraft(key));
  return draftCache.get(key);
}

function emitDraft(key: string) {
  for (const listener of draftListeners.get(key) ?? []) listener();
}

export function readDraft(key: string): unknown {
  const raw = storage()?.getItem(DRAFT_PREFIX + key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeDraft(key: string, value: unknown) {
  draftCache.set(key, value);
  try {
    storage()?.setItem(DRAFT_PREFIX + key, JSON.stringify(value));
  } catch {
    // Drafts are a convenience; losing one is not worth surfacing.
  }
  emitDraft(key);
}

export function clearDraft(key: string) {
  draftCache.set(key, undefined);
  storage()?.removeItem(DRAFT_PREFIX + key);
  emitDraft(key);
}
