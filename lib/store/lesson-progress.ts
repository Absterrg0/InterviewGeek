/**
 * Which lesson checks a learner has worked through, so a lesson reopens where
 * they left off. Kept apart from the learner state on purpose: lesson checks
 * are practice while learning, not evidence of understanding, and losing this
 * only means a lesson starts from the top again.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "interviewgeek.lessons";
/** Marks a lesson the learner chose to skip: everything is shown. */
export const SKIPPED = "*";

type Progress = Record<string, string[]>;

let cache: Progress | null = null;
const listeners = new Set<() => void>();

function read(): Progress {
  if (cache) return cache;
  cache = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.every((v) => typeof v === "string")) cache[key] = value;
      }
    }
  } catch {
    // Unreadable or unavailable storage: start every lesson fresh.
  }
  return cache;
}

function write(next: Progress) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Progress lasts for this tab only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const NONE: readonly string[] = [];

/** Completed step ids for a lesson, or null before hydration (the server does not know). */
export function useLessonProgress(lessonKey: string): readonly string[] | null {
  return useSyncExternalStore(
    subscribe,
    () => read()[lessonKey] ?? NONE,
    () => null,
  );
}

export function completeStep(lessonKey: string, stepId: string) {
  const progress = read();
  const done = progress[lessonKey] ?? [];
  if (done.includes(stepId)) return;
  write({ ...progress, [lessonKey]: [...done, stepId] });
}

export function resetLesson(lessonKey: string) {
  const rest = { ...read() };
  delete rest[lessonKey];
  write(rest);
}
