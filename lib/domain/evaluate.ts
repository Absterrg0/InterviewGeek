/**
 * Turning a response into evidence.
 *
 * Some parts of an answer can be checked against the authored key (which
 * option, which verdicts, which order, which lines). Written reasoning cannot
 * be checked without a human or a model, so the learner compares it against a
 * rubric of specific points after seeing the reference. Evidence records which
 * basis each part rests on so the progress view can be honest about it.
 */
import type {
  Assessment,
  Dimension,
  Interaction,
  InteractionKind,
  InteractionOf,
  RubricPoint,
} from "./content";
import type {
  Basis,
  Evidence,
  EvidencePart,
  Response,
  ResponseOf,
  RubricMark,
  SelfAssessment,
  Signal,
} from "./learner";

export type ExerciseTags = {
  dimensions: Dimension[];
  conceptIds: string[];
  competencyIds: string[];
};

const SIGNAL_RANK: Record<Signal, number> = { gap: 0, partial: 1, strong: 2 };

export function worstSignal(signals: readonly Signal[]): Signal {
  return signals.reduce<Signal>(
    (worst, s) => (SIGNAL_RANK[s] < SIGNAL_RANK[worst] ? s : worst),
    "strong",
  );
}

export function responseMatches<K extends InteractionKind>(
  interaction: InteractionOf<K>,
  response: Response,
): response is ResponseOf<K> {
  return response.kind === interaction.kind;
}

// ---------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------

/** The rubric a learner assesses their writing against, or null if nothing is written. */
export function rubricFor(interaction: Interaction): RubricPoint[] | null {
  switch (interaction.kind) {
    case "decision":
    case "diagnosis":
      return interaction.rationale.rubric;
    case "open":
    case "implementation":
      return interaction.rubric;
    case "claims":
    case "ordering":
      return null;
  }
}

/** The written part of a response, empty when the learner chose not to write one. */
function writtenText(response: Response): string {
  switch (response.kind) {
    case "decision":
    case "diagnosis":
      return response.rationale;
    case "open":
      return response.text;
    case "implementation":
      return response.code;
    default:
      return "";
  }
}

/**
 * The rubric this particular response is assessed against. Reasoning for a
 * decision or diagnosis is optional; when it was left out there is nothing
 * to assess and the evidence rests on the checked part alone.
 */
export function rubricForResponse(interaction: Interaction, response: Response): RubricPoint[] | null {
  const rubric = rubricFor(interaction);
  if (rubric === null) return null;
  const optional = interaction.kind === "decision" || interaction.kind === "diagnosis";
  return optional && writtenText(response).trim() === "" ? null : rubric;
}

function rubricLabel(kind: InteractionKind): string {
  switch (kind) {
    case "decision":
      return "Reasoning";
    case "implementation":
      return "Implementation";
    default:
      return "Explanation";
  }
}

const MARK_VALUE: Record<RubricMark, number> = { covered: 1, partial: 0.5, missed: 0 };
const WEIGHT = { core: 1, supporting: 0.5 } as const;

/**
 * Core points carry full weight and supporting points half. A strong signal
 * also requires that no core point was missed outright: an answer that skips
 * the central idea is not strong however much else it covers.
 * Returns null until every point has a mark.
 */
export function rubricSignal(rubric: readonly RubricPoint[], marks: SelfAssessment): Signal | null {
  let earned = 0;
  let possible = 0;
  let missedCore = false;
  for (const point of rubric) {
    const mark = marks[point.id];
    if (mark === undefined) return null;
    const weight = WEIGHT[point.weight];
    earned += MARK_VALUE[mark] * weight;
    possible += weight;
    if (point.weight === "core" && mark === "missed") missedCore = true;
  }
  if (possible === 0) return null;
  const score = earned / possible;
  if (score >= 0.8 && !missedCore) return "strong";
  if (score >= 0.4) return "partial";
  return "gap";
}

// ---------------------------------------------------------------------------
// Checked parts
// ---------------------------------------------------------------------------

const ASSESSMENT_SIGNAL: Record<Assessment, Signal> = {
  sound: "strong",
  defensible: "partial",
  flawed: "gap",
};

function checkDecision(
  interaction: InteractionOf<"decision">,
  response: ResponseOf<"decision">,
): EvidencePart[] | null {
  const option = interaction.options.find((o) => o.id === response.optionId);
  if (!option) return null;
  return [{ label: "Decision", signal: ASSESSMENT_SIGNAL[option.assessment], basis: "checked" }];
}

function checkClaims(
  interaction: InteractionOf<"claims">,
  response: ResponseOf<"claims">,
): EvidencePart[] | null {
  // Drills may present a subset of a concept's claims; only answered ones count.
  const answered = interaction.claims.filter((c) => response.verdicts[c.id] !== undefined);
  if (answered.length === 0) return null;
  const correct = answered.filter((c) => response.verdicts[c.id] === c.verdict).length;
  const ratio = correct / answered.length;
  const signal: Signal = ratio === 1 ? "strong" : ratio >= 0.66 ? "partial" : "gap";
  return [{ label: `Claims: ${correct} of ${answered.length}`, signal, basis: "checked" }];
}

/** Fraction of item pairs whose relative order matches the authored order. */
export function orderingAgreement(expected: readonly string[], actual: readonly string[]): number {
  const position = new Map(actual.map((id, i) => [id, i]));
  let agree = 0;
  let pairs = 0;
  for (let i = 0; i < expected.length; i++) {
    for (let j = i + 1; j < expected.length; j++) {
      const a = position.get(expected[i] ?? "");
      const b = position.get(expected[j] ?? "");
      if (a === undefined || b === undefined) continue;
      pairs++;
      if (a < b) agree++;
    }
  }
  return pairs === 0 ? 0 : agree / pairs;
}

function checkOrdering(
  interaction: InteractionOf<"ordering">,
  response: ResponseOf<"ordering">,
): EvidencePart[] | null {
  const expected = interaction.items.map((i) => i.id);
  const isPermutation =
    response.order.length === expected.length &&
    new Set(response.order).size === expected.length &&
    response.order.every((id) => expected.includes(id));
  if (!isPermutation) return null;
  const exact = expected.every((id, i) => response.order[i] === id);
  const agreement = orderingAgreement(expected, response.order);
  const signal: Signal = exact ? "strong" : agreement >= 0.75 ? "partial" : "gap";
  return [{ label: "Sequence", signal, basis: "checked" }];
}

export function faultLines(interaction: InteractionOf<"diagnosis">): number[] {
  return interaction.artifact.lines.flatMap((line, i) => (line.fault ? [i] : []));
}

function checkDiagnosis(
  interaction: InteractionOf<"diagnosis">,
  response: ResponseOf<"diagnosis">,
): EvidencePart[] | null {
  const faults = new Set(faultLines(interaction));
  const lineCount = interaction.artifact.lines.length;
  if (response.selected.some((i) => i >= lineCount)) return null;
  const hits = response.selected.filter((i) => faults.has(i)).length;
  const misses = response.selected.length - hits;
  const signal: Signal =
    hits === faults.size && misses === 0 ? "strong" : hits > 0 ? "partial" : "gap";
  return [{ label: "Located the fault", signal, basis: "checked" }];
}

/**
 * Parts that can be checked immediately on submission. Null means the response
 * no longer fits the interaction (content changed since it was recorded).
 */
export function checkedParts(interaction: Interaction, response: Response): EvidencePart[] | null {
  switch (interaction.kind) {
    case "decision":
      return responseMatches(interaction, response) ? checkDecision(interaction, response) : null;
    case "claims":
      return responseMatches(interaction, response) ? checkClaims(interaction, response) : null;
    case "ordering":
      return responseMatches(interaction, response) ? checkOrdering(interaction, response) : null;
    case "diagnosis":
      return responseMatches(interaction, response) ? checkDiagnosis(interaction, response) : null;
    case "open":
    case "implementation":
      return responseMatches(interaction, response) ? [] : null;
  }
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

function basisOf(parts: readonly EvidencePart[]): Basis {
  const checked = parts.some((p) => p.basis === "checked");
  const self = parts.some((p) => p.basis === "self-assessed");
  return checked && self ? "mixed" : checked ? "checked" : "self-assessed";
}

/**
 * Evidence for a response, or null while the self-assessment is incomplete or
 * the response does not fit the interaction. The overall signal is the weakest
 * part: a sound decision defended with missing reasoning is not yet strong.
 */
export function evaluate(
  interaction: Interaction,
  response: Response,
  selfAssessment: SelfAssessment | null,
  tags: ExerciseTags,
): Evidence | null {
  const parts = checkedParts(interaction, response);
  if (parts === null) return null;
  const rubric = rubricForResponse(interaction, response);
  if (rubric !== null) {
    if (selfAssessment === null) return null;
    const signal = rubricSignal(rubric, selfAssessment);
    if (signal === null) return null;
    parts.push({ label: rubricLabel(interaction.kind), signal, basis: "self-assessed" });
  }
  if (parts.length === 0) return null;
  return {
    signal: worstSignal(parts.map((p) => p.signal)),
    basis: basisOf(parts),
    parts,
    dimensions: [...tags.dimensions],
    conceptIds: [...tags.conceptIds],
    competencyIds: [...tags.competencyIds],
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers that must be deterministic across server and client
// ---------------------------------------------------------------------------

function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seeded PRNG (mulberry32). Deterministic so server and client render the same order. */
export function seededRandom(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic shuffle that never returns the authored order for two or more items. */
export function shuffled<T>(items: readonly T[], seed: string): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    result[i] = result[j] as T;
    result[j] = a;
  }
  if (result.length > 1 && result.every((item, i) => item === items[i])) {
    result.push(result.shift() as T);
  }
  return result;
}
