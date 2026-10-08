import type { ReactNode } from "react";
import type { Interaction } from "@/lib/domain/content";
import type { ExerciseTags } from "@/lib/domain/evaluate";
import type { ExerciseRef, Response } from "@/lib/domain/learner";

/** What the client needs to run an exercise: the interaction itself plus evidence tags. */
export type ExerciseSpec = {
  ref: ExerciseRef;
  interaction: Interaction;
  tags: ExerciseTags;
};

/**
 * Authored prose, rendered on the server and handed to client components as
 * ready-made nodes so the content library stays out of client bundles.
 */
export type InteractionSlots = {
  optionFeedback: Record<string, ReactNode>;
  claimExplanations: Record<string, ReactNode>;
  explanation: ReactNode;
  reference: ReactNode;
};

export const EMPTY_SLOTS: InteractionSlots = {
  optionFeedback: {},
  claimExplanations: {},
  explanation: null,
  reference: null,
};

export type InputProps<I, R extends Response> = {
  interaction: I;
  /** Namespaces the unsent draft in local storage. */
  draftKey: string;
  /** Used to seed deterministic presentation order. */
  seed: string;
  onSubmit: (response: R) => void;
};

export const MIN_ANSWER = 60;
