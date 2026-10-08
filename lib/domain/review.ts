/**
 * Spaced review: when an exercise is worth answering again.
 *
 * Answering from memory after a delay is what makes understanding stick, and
 * it is exactly what an interview asks for. Each exercise's next review is
 * scheduled from its latest assessed answer: a gap comes back the next day, a
 * partial answer after three days, and a strong one after a week, then at
 * growing intervals for as long as it keeps coming back strong.
 *
 * The schedule is derived from attempts alone, so it needs no state of its
 * own and survives export and import unchanged.
 */
import { exerciseKey, type Attempt, type ExerciseRef, type Signal } from "./learner";

const DAY = 24 * 60 * 60 * 1000;

/** Days until the next review after an answer that was not strong. */
const RETRY_DAYS: Record<Exclude<Signal, "strong">, number> = { gap: 1, partial: 3 };

/** Days until the next review after the 1st, 2nd, 3rd… strong answer in a row. */
const STRONG_DAYS = [7, 21, 60, 180] as const;

export type ReviewItem = {
  key: string;
  exercise: ExerciseRef;
  /** The signal of the latest assessed answer. */
  signal: Signal;
  /** Strong answers in a row, counting back from the latest. */
  streak: number;
  answeredAt: string;
  dueAt: string;
};

export function intervalDays(signal: Signal, streak: number): number {
  if (signal !== "strong") return RETRY_DAYS[signal];
  const index = Math.min(Math.max(streak, 1), STRONG_DAYS.length) - 1;
  return STRONG_DAYS[index] as number;
}

/** The review schedule for every exercise with at least one assessed answer, keyed by exercise key. */
export function reviewSchedule(attempts: readonly Attempt[]): Map<string, ReviewItem> {
  const byKey = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    if (attempt.evidence === null) continue;
    const key = exerciseKey(attempt.exercise);
    const list = byKey.get(key);
    if (list) list.push(attempt);
    else byKey.set(key, [attempt]);
  }

  const schedule = new Map<string, ReviewItem>();
  for (const [key, list] of byKey) {
    const ordered = [...list].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const latest = ordered[0];
    if (!latest?.evidence) continue;
    let streak = 0;
    for (const attempt of ordered) {
      if (attempt.evidence?.signal !== "strong") break;
      streak++;
    }
    const signal = latest.evidence.signal;
    const answered = Date.parse(latest.submittedAt);
    schedule.set(key, {
      key,
      exercise: latest.exercise,
      signal,
      streak,
      answeredAt: latest.submittedAt,
      dueAt: new Date(answered + intervalDays(signal, streak) * DAY).toISOString(),
    });
  }
  return schedule;
}

const SIGNAL_ORDER: Record<Signal, number> = { gap: 0, partial: 1, strong: 2 };

export type ReviewQueue = {
  /** Due now: weakest first, then the longest overdue. */
  due: ReviewItem[];
  /** Scheduled for later, soonest first. */
  upcoming: ReviewItem[];
};

export function reviewQueue(attempts: readonly Attempt[], now: number): ReviewQueue {
  const due: ReviewItem[] = [];
  const upcoming: ReviewItem[] = [];
  for (const item of reviewSchedule(attempts).values()) {
    if (Date.parse(item.dueAt) <= now) due.push(item);
    else upcoming.push(item);
  }
  due.sort((a, b) => SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal] || a.dueAt.localeCompare(b.dueAt));
  upcoming.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return { due, upcoming };
}

/** The review item for one exercise if it is due now, otherwise null. */
export function dueReview(attempts: readonly Attempt[], ref: ExerciseRef, now: number): ReviewItem | null {
  const key = exerciseKey(ref);
  const relevant = attempts.filter((a) => exerciseKey(a.exercise) === key);
  const item = reviewSchedule(relevant).get(key);
  if (!item) return null;
  // An unassessed answer newer than the scheduled one means the review is under way.
  const newest = relevant.reduce<string>((max, a) => (a.submittedAt > max ? a.submittedAt : max), "");
  if (newest > item.answeredAt) return null;
  return Date.parse(item.dueAt) <= now ? item : null;
}

/** "today", "yesterday", "3 days ago", "5 weeks ago". */
export function daysAgo(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** "today", "tomorrow", "in 3 days", "in 2 weeks". */
export function daysUntil(iso: string, now: number): string {
  const days = Math.ceil((Date.parse(iso) - now) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}
