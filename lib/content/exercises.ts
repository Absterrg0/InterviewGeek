/**
 * Every curated thing a learner can answer, under one shape. Stages are
 * exercises as authored; concept checks and explanations are derived from the
 * concept documents. Project questions are derived on the client from the
 * learner's own project model (see `lib/domain/project-questions.ts`).
 */
import type {
  Dimension,
  Interaction,
  InteractionKind,
  Phase,
  Stage,
  StageEvent,
} from "@/lib/domain/content";
import type { ExerciseTags } from "@/lib/domain/evaluate";
import { exerciseKey, type ExerciseRef } from "@/lib/domain/learner";
import { getConcept, getStage, listConcepts, listInvestigations } from ".";

/** Serializable description of an exercise, small enough to ship to client pages. */
export type ExerciseSummary = {
  key: string;
  ref: ExerciseRef;
  title: string;
  /** Where it lives: an investigation title, or "Concept". */
  source: string;
  href: string;
  interactionKind: InteractionKind;
  phase: Phase | null;
  eventKind: StageEvent["kind"] | null;
  dimensions: Dimension[];
  conceptIds: string[];
  minutes: number;
};

export type ResolvedExercise = {
  summary: ExerciseSummary;
  context: string | null;
  event: StageEvent | null;
  interaction: Interaction;
  tags: ExerciseTags;
  reveal: Stage["reveal"] | null;
};

/** Rough time to answer thoughtfully, used to fit interview sessions to a duration. */
const MINUTES: Record<InteractionKind, number> = {
  decision: 6,
  claims: 4,
  ordering: 4,
  diagnosis: 6,
  open: 8,
  implementation: 12,
};

export function resolveExercise(ref: ExerciseRef): ResolvedExercise | null {
  switch (ref.kind) {
    case "stage": {
      const found = getStage(ref.investigationId, ref.stageId);
      if (!found) return null;
      const { investigation, stage } = found;
      return {
        summary: {
          key: exerciseKey(ref),
          ref,
          title: stage.title,
          source: investigation.title,
          href: `/investigations/${investigation.id}/${stage.id}`,
          interactionKind: stage.interaction.kind,
          phase: stage.phase,
          eventKind: stage.event?.kind ?? null,
          dimensions: stage.dimensions,
          conceptIds: stage.conceptIds,
          minutes: MINUTES[stage.interaction.kind],
        },
        context: stage.context,
        event: stage.event ?? null,
        interaction: stage.interaction,
        tags: {
          dimensions: stage.dimensions,
          conceptIds: stage.conceptIds,
          competencyIds: stage.competencyIds,
        },
        reveal: stage.reveal,
      };
    }
    case "concept-claims": {
      const concept = getConcept(ref.conceptId);
      if (!concept) return null;
      const interaction: Interaction = {
        kind: "claims",
        prompt: "Decide whether each statement holds, fails, or depends on circumstances.",
        claims: concept.claims,
      };
      return {
        summary: {
          key: exerciseKey(ref),
          ref,
          title: `Check your claims: ${concept.title}`,
          source: "Concept",
          href: `/concepts/${concept.id}#check`,
          interactionKind: "claims",
          phase: null,
          eventKind: null,
          dimensions: ["explain"],
          conceptIds: [concept.id],
          minutes: MINUTES.claims,
        },
        context: null,
        event: null,
        interaction,
        tags: { dimensions: ["explain"], conceptIds: [concept.id], competencyIds: [] },
        reveal: null,
      };
    }
    case "concept-explain": {
      const concept = getConcept(ref.conceptId);
      if (!concept) return null;
      const interaction: Interaction = {
        kind: "open",
        prompt: concept.explain.prompt,
        rubric: concept.explain.rubric,
        reference: concept.mechanism,
      };
      return {
        summary: {
          key: exerciseKey(ref),
          ref,
          title: `Explain: ${concept.title}`,
          source: "Concept",
          href: `/concepts/${concept.id}#explain`,
          interactionKind: "open",
          phase: null,
          eventKind: null,
          dimensions: ["explain"],
          conceptIds: [concept.id],
          minutes: 5,
        },
        context: null,
        event: null,
        interaction,
        tags: { dimensions: ["explain"], conceptIds: [concept.id], competencyIds: [] },
        reveal: null,
      };
    }
    case "project-question":
      return null;
  }
}

/** Every curated exercise, in a stable order: investigations by stage, then concepts. */
export function listExercises(): ExerciseSummary[] {
  const refs: ExerciseRef[] = [
    ...listInvestigations().flatMap((inv) =>
      inv.stages.map((s): ExerciseRef => ({ kind: "stage", investigationId: inv.id, stageId: s.id })),
    ),
    ...listConcepts().flatMap((c): ExerciseRef[] => [
      { kind: "concept-claims", conceptId: c.id },
      { kind: "concept-explain", conceptId: c.id },
    ]),
  ];
  return refs.flatMap((ref) => {
    const resolved = resolveExercise(ref);
    return resolved ? [resolved.summary] : [];
  });
}
