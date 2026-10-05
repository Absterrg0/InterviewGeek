/**
 * Aggregating evidence into a picture of understanding.
 *
 * Only the latest assessed attempt per exercise counts: retrying a stage after
 * learning from it should replace the earlier signal, not average with it.
 * Standings are deliberately coarse (weak / developing / strong) and carry a
 * "thin" flag when they rest on too little evidence to mean much.
 */
import { DIMENSIONS, DIMENSION_LABELS, type Dimension } from "./taxonomy";
import {
  exerciseKey,
  type Attempt,
  type Evidence,
  type ExerciseRef,
  type Signal,
} from "./learner";

export type LatestEvidence = {
  key: string;
  exercise: ExerciseRef;
  evidence: Evidence;
  attemptId: string;
  submittedAt: string;
};

function isLater(a: Attempt, b: Attempt): boolean {
  return a.submittedAt >= b.submittedAt;
}

/** The most recent attempt for an exercise, assessed or not. */
export function latestAttempt(attempts: readonly Attempt[], ref: ExerciseRef): Attempt | undefined {
  const key = exerciseKey(ref);
  let latest: Attempt | undefined;
  for (const attempt of attempts) {
    if (exerciseKey(attempt.exercise) !== key) continue;
    if (!latest || isLater(attempt, latest)) latest = attempt;
  }
  return latest;
}

/** The most recent assessed attempt for every exercise, keyed by exercise key. */
export function latestEvidence(attempts: readonly Attempt[]): Map<string, LatestEvidence> {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if (attempt.evidence === null) continue;
    const key = exerciseKey(attempt.exercise);
    const current = latest.get(key);
    if (!current || isLater(attempt, current)) latest.set(key, attempt);
  }
  const result = new Map<string, LatestEvidence>();
  for (const [key, attempt] of latest) {
    if (attempt.evidence === null) continue;
    result.set(key, {
      key,
      exercise: attempt.exercise,
      evidence: attempt.evidence,
      attemptId: attempt.id,
      submittedAt: attempt.submittedAt,
    });
  }
  return result;
}

/** Exercises whose most recent attempt still needs the learner's self-assessment. */
export function awaitingAssessment(attempts: readonly Attempt[]): Attempt[] {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    const key = exerciseKey(attempt.exercise);
    const current = latest.get(key);
    if (!current || isLater(attempt, current)) latest.set(key, attempt);
  }
  return [...latest.values()].filter((a) => a.evidence === null);
}

export type ExerciseStatus = "unattempted" | "awaiting-assessment" | Signal;

export function exerciseStatus(attempts: readonly Attempt[], ref: ExerciseRef): ExerciseStatus {
  const attempt = latestAttempt(attempts, ref);
  if (!attempt) return "unattempted";
  return attempt.evidence ? attempt.evidence.signal : "awaiting-assessment";
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export type Standing = "unexplored" | "weak" | "developing" | "strong";

export type Summary = {
  counts: Record<Signal, number>;
  total: number;
  /** 0..1, strong = 1, partial = 0.5, gap = 0. */
  score: number;
  standing: Standing;
  /** Fewer than three pieces of evidence: indicative, not conclusive. */
  thin: boolean;
  selfAssessed: number;
};

const SIGNAL_VALUE: Record<Signal, number> = { strong: 1, partial: 0.5, gap: 0 };

export function summarize(entries: Iterable<LatestEvidence>): Summary {
  const counts: Record<Signal, number> = { strong: 0, partial: 0, gap: 0 };
  let total = 0;
  let value = 0;
  let selfAssessed = 0;
  for (const entry of entries) {
    counts[entry.evidence.signal]++;
    value += SIGNAL_VALUE[entry.evidence.signal];
    total++;
    if (entry.evidence.basis === "self-assessed") selfAssessed++;
  }
  const score = total === 0 ? 0 : value / total;
  const standing: Standing =
    total === 0 ? "unexplored" : score >= 0.8 ? "strong" : score >= 0.4 ? "developing" : "weak";
  return { counts, total, score, standing, thin: total < 3, selfAssessed };
}

function groupBy(
  entries: Iterable<LatestEvidence>,
  keysOf: (entry: LatestEvidence) => readonly string[],
): Map<string, LatestEvidence[]> {
  const groups = new Map<string, LatestEvidence[]>();
  for (const entry of entries) {
    for (const key of keysOf(entry)) {
      const group = groups.get(key);
      if (group) group.push(entry);
      else groups.set(key, [entry]);
    }
  }
  return groups;
}

export function byDimension(latest: Map<string, LatestEvidence>): Record<Dimension, Summary> {
  const groups = groupBy(latest.values(), (e) => e.evidence.dimensions);
  return Object.fromEntries(
    DIMENSIONS.map((d) => [d, summarize(groups.get(d) ?? [])]),
  ) as Record<Dimension, Summary>;
}

export function byConcept(latest: Map<string, LatestEvidence>): Map<string, Summary> {
  const groups = groupBy(latest.values(), (e) => e.evidence.conceptIds);
  return new Map([...groups].map(([id, entries]) => [id, summarize(entries)]));
}

/** Competencies are scoped to one investigation. */
export function byCompetency(
  latest: Map<string, LatestEvidence>,
  investigationId: string,
): Map<string, Summary> {
  const scoped = [...latest.values()].filter(
    (e) => e.exercise.kind === "stage" && e.exercise.investigationId === investigationId,
  );
  const groups = groupBy(scoped, (e) => e.evidence.competencyIds);
  return new Map([...groups].map(([id, entries]) => [id, summarize(entries)]));
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export type Insight = {
  id: string;
  tone: "strength" | "gap" | "note";
  text: string;
};

export type InsightLabels = {
  concept: (id: string) => string | undefined;
  source: (exercise: ExerciseRef) => string;
};

function sourceKey(exercise: ExerciseRef): string {
  switch (exercise.kind) {
    case "stage":
      return `investigation:${exercise.investigationId}`;
    case "concept-claims":
    case "concept-explain":
      return "concepts";
    case "project-question":
      return `project:${exercise.projectId}`;
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function listJoin(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Plain-language observations a reviewer would make after reading the
 * evidence. Each one is derived from counts; none of them is generated text.
 */
export function insights(latest: Map<string, LatestEvidence>, labels: InsightLabels): Insight[] {
  const result: Insight[] = [];
  const dimensions = byDimension(latest);
  const measured = DIMENSIONS.filter((d) => dimensions[d].total >= 2);

  if (measured.length >= 2) {
    const sorted = [...measured].sort((a, b) => dimensions[b].score - dimensions[a].score);
    const best = sorted[0] as Dimension;
    const worst = sorted[sorted.length - 1] as Dimension;
    const b = dimensions[best];
    const w = dimensions[worst];
    if (b.score - w.score >= 0.3) {
      result.push({
        id: "dimension-contrast",
        tone: "gap",
        text:
          `${DIMENSION_LABELS[best].label} is your most reliable dimension ` +
          `(${b.counts.strong} of ${b.total} strong). ` +
          `${DIMENSION_LABELS[worst].label} is where gaps cluster: ` +
          `${plural(w.counts.gap, "gap")} and ${w.counts.partial} partial across ` +
          `${plural(w.total, "exercise")}. ${DIMENSION_LABELS[worst].description}`,
      });
    } else if (measured.every((d) => dimensions[d].standing === "strong")) {
      result.push({
        id: "dimension-consistent",
        tone: "strength",
        text:
          "Your evidence is consistently strong across every dimension you have exercised. " +
          "The useful next step is breadth: an investigation you have not opened, or the interview mode.",
      });
    }
  }

  // Concepts that come up weak in more than one place are habits, not slips.
  const weakSources = new Map<string, Set<string>>();
  for (const entry of latest.values()) {
    if (entry.evidence.signal === "strong") continue;
    for (const conceptId of entry.evidence.conceptIds) {
      const sources = weakSources.get(conceptId) ?? new Set<string>();
      sources.add(sourceKey(entry.exercise));
      weakSources.set(conceptId, sources);
    }
  }
  const sourceLabels = new Map<string, string>();
  for (const entry of latest.values()) {
    sourceLabels.set(sourceKey(entry.exercise), labels.source(entry.exercise));
  }
  const recurring = [...weakSources]
    .filter(([, sources]) => sources.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 3);
  for (const [conceptId, sources] of recurring) {
    const title = labels.concept(conceptId) ?? conceptId;
    const where = [...sources].map((s) => sourceLabels.get(s) ?? s);
    result.push({
      id: `recurring-${conceptId}`,
      tone: "gap",
      text: `${title} is a recurring weak point: it came up short in ${listJoin(where)}. It is worth reading the mechanism again rather than retrying individual stages.`,
    });
  }

  const all = summarize(latest.values());
  if (all.total >= 5 && all.selfAssessed / all.total > 0.6) {
    result.push({
      id: "self-assessed-share",
      tone: "note",
      text:
        `${all.selfAssessed} of ${all.total} signals rest entirely on your own rubric marks. ` +
        "That is useful, but checked exercises (decisions, claims, sequences, diagnoses) are harder to fool yourself on.",
    });
  }

  return result;
}
