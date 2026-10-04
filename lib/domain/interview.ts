/**
 * Composing an interview session from exercises that already exist. There is
 * no separate question bank: an interview is a timed arrangement of concept
 * recall, design decisions, failure reasoning and project defense drawn from
 * the same investigations and concepts the learner studies.
 */
import type { Dimension, InteractionKind, Phase, StageEvent } from "./content";
import { seededRandom } from "./evaluate";
import type { ExerciseRef, InterviewSession } from "./learner";
import type { LatestEvidence } from "./understanding";

export type InterviewCandidate = {
  key: string;
  ref: ExerciseRef;
  interactionKind: InteractionKind;
  phase: Phase | null;
  eventKind: StageEvent["kind"] | null;
  dimensions: Dimension[];
  conceptIds: string[];
  minutes: number;
};

export type Focus = InterviewSession["focus"];
export const DURATIONS = [30, 45, 60] as const;
export type Duration = (typeof DURATIONS)[number];

type Section = { name: string; accepts: (c: InterviewCandidate) => boolean };

const isStage = (c: InterviewCandidate) => c.ref.kind === "stage";

const SECTIONS = {
  recall: { name: "Explain a concept", accepts: (c) => c.ref.kind === "concept-explain" },
  diagnose: { name: "Diagnose a problem", accepts: (c) => isStage(c) && c.interactionKind === "diagnosis" },
  decide: {
    name: "Make a design decision",
    accepts: (c) => isStage(c) && c.phase === "decide" && c.interactionKind === "decision",
  },
  tradeoff: {
    name: "Judge the claims",
    accepts: (c) => c.interactionKind === "claims" && (c.ref.kind === "concept-claims" || c.phase === "change"),
  },
  failure: {
    name: "Reason about a failure",
    accepts: (c) => isStage(c) && c.phase === "break" && c.interactionKind !== "implementation",
  },
  change: { name: "Adapt to a new constraint", accepts: (c) => isStage(c) && c.phase === "change" && c.interactionKind === "decision" },
  implement: { name: "Write the code", accepts: (c) => c.interactionKind === "implementation" },
  defend: { name: "Defend a design", accepts: (c) => c.ref.kind === "project-question" || (isStage(c) && c.phase === "defend") },
} satisfies Record<string, Section>;

type SectionId = keyof typeof SECTIONS;

const PLANS: Record<Focus, Record<Duration, SectionId[]>> = {
  balanced: {
    30: ["recall", "decide", "failure", "defend"],
    45: ["recall", "diagnose", "decide", "tradeoff", "failure", "defend"],
    60: ["recall", "diagnose", "decide", "tradeoff", "failure", "change", "implement", "defend"],
  },
  failure: {
    30: ["recall", "failure", "diagnose", "defend"],
    45: ["recall", "diagnose", "failure", "failure", "tradeoff", "defend"],
    60: ["recall", "diagnose", "failure", "failure", "failure", "implement", "tradeoff", "defend"],
  },
  weakest: {
    30: ["recall", "decide", "failure", "defend"],
    45: ["recall", "diagnose", "decide", "tradeoff", "failure", "defend"],
    60: ["recall", "diagnose", "decide", "tradeoff", "failure", "change", "implement", "defend"],
  },
};

const SIGNAL_WEAKNESS = { gap: 3, partial: 2, strong: 0 } as const;

function sourceOf(ref: ExerciseRef): string {
  switch (ref.kind) {
    case "stage":
      return ref.investigationId;
    case "project-question":
      return `project:${ref.projectId}`;
    default:
      return `concept:${ref.conceptId}`;
  }
}

/**
 * How much a candidate deserves a place, given the focus. Higher is better.
 * Randomness breaks ties so repeated sessions differ.
 */
function priority(
  c: InterviewCandidate,
  focus: Focus,
  latest: Map<string, LatestEvidence>,
  weakConcepts: Set<string>,
  random: () => number,
): number {
  const evidence = latest.get(c.key)?.evidence;
  let score = random();
  // Defending your own system is the point of the final section whenever one is described.
  if (c.ref.kind === "project-question") score += 5;
  if (focus === "weakest") {
    if (evidence) score += SIGNAL_WEAKNESS[evidence.signal] * 2;
    score += c.conceptIds.filter((id) => weakConcepts.has(id)).length;
    if (!evidence) score += 1;
  } else {
    // Prefer things not yet seen; an interview is more useful on fresh material.
    if (!evidence) score += 2;
    if (focus === "failure" && c.dimensions.includes("break")) score += 1.5;
  }
  return score;
}

export type ComposedItem = { section: string; ref: ExerciseRef; key: string };

export function composeInterview(input: {
  candidates: readonly InterviewCandidate[];
  duration: Duration;
  focus: Focus;
  latest: Map<string, LatestEvidence>;
  seed: string;
}): ComposedItem[] {
  const random = seededRandom(input.seed);
  const weakConcepts = new Set<string>();
  for (const e of input.latest.values()) {
    if (e.evidence.signal !== "strong") e.evidence.conceptIds.forEach((id) => weakConcepts.add(id));
  }
  const scored = input.candidates.map((c) => ({
    c,
    score: priority(c, input.focus, input.latest, weakConcepts, random),
  }));
  const chosen: ComposedItem[] = [];
  const usedKeys = new Set<string>();
  const usedSources = new Map<string, number>();

  for (const sectionId of PLANS[input.focus][input.duration]) {
    const section: Section = SECTIONS[sectionId];
    const pick = scored
      .filter(({ c }) => section.accepts(c) && !usedKeys.has(c.key))
      // Spread the session across systems: each reuse of a source costs priority.
      .map(({ c, score }) => ({ c, score: score - (usedSources.get(sourceOf(c.ref)) ?? 0) * 1.5 }))
      .sort((a, b) => b.score - a.score)[0];
    if (!pick) continue;
    usedKeys.add(pick.c.key);
    usedSources.set(sourceOf(pick.c.ref), (usedSources.get(sourceOf(pick.c.ref)) ?? 0) + 1);
    chosen.push({ section: section.name, ref: pick.c.ref, key: pick.c.key });
  }
  return chosen;
}

/** Planned minutes for a composed session, for display. */
export function plannedMinutes(items: readonly ComposedItem[], candidates: readonly InterviewCandidate[]): number {
  const minutes = new Map(candidates.map((c) => [c.key, c.minutes]));
  return items.reduce((sum, item) => sum + (minutes.get(item.key) ?? 6), 0);
}
