"use client";

import { SignalBadge, STANDING_LABEL, STANDING_SIGNAL } from "@/components/ui";
import { byConcept, latestEvidence } from "@/lib/domain/understanding";
import { useLearnerState } from "@/lib/store/learner-store";

/** The learner's standing on one concept, across every exercise tagged with it. */
export function ConceptStanding({ conceptId, showEmpty = false }: { conceptId: string; showEmpty?: boolean }) {
  const state = useLearnerState();
  if (!state) return null;
  const summary = byConcept(latestEvidence(state.attempts)).get(conceptId);
  if (!summary) return showEmpty ? <span className="chip-flat">No evidence yet</span> : null;
  const signal = STANDING_SIGNAL[summary.standing];
  if (!signal) return null;
  return (
    <span title={`${summary.counts.strong} strong, ${summary.counts.partial} partial, ${summary.counts.gap} gap`}>
      <SignalBadge signal={signal}>
        {STANDING_LABEL[summary.standing]}
        {summary.thin ? " (thin)" : ""}
      </SignalBadge>
    </span>
  );
}
