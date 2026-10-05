"use client";

import Link from "next/link";
import { SignalBadge, STANDING_LABEL, STANDING_SIGNAL } from "@/components/ui";
import type { Competency } from "@/lib/domain/content";
import { byCompetency, latestEvidence } from "@/lib/domain/understanding";
import { useLearnerState } from "@/lib/store/learner-store";

/** Per-competency standing for one investigation, from the learner's latest evidence. */
export function CompetencyBreakdown({
  investigationId,
  competencies,
  stageCount,
  firstStageId,
}: {
  investigationId: string;
  competencies: Competency[];
  stageCount: number;
  firstStageId: string;
}) {
  const state = useLearnerState();
  if (!state) return <div className="h-40 well" aria-busy="true" />;
  const latest = latestEvidence(state.attempts);
  const summaries = byCompetency(latest, investigationId);
  const assessed = [...latest.values()].filter(
    (e) => e.exercise.kind === "stage" && e.exercise.investigationId === investigationId,
  ).length;

  if (assessed === 0) {
    return (
      <p className="text-[0.875rem] text-ink-2 leading-relaxed">
        You have not recorded any evidence in this investigation yet.{" "}
        <Link href={`/investigations/${investigationId}/${firstStageId}`} className="link">
          Start with stage 1
        </Link>{" "}
        and this section will show which parts of the design you can actually reason about.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-2 mb-4">
        Based on your latest answer to {assessed} of {stageCount} stages.
      </p>
      <dl className="panel divide-y divide-rule-soft px-4">
        {competencies.map((c) => {
          const s = summaries.get(c.id);
          const standing = s?.standing ?? "unexplored";
          const signal = STANDING_SIGNAL[standing];
          return (
            <div key={c.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-6">
              <dt className="sm:w-56 shrink-0 text-[0.875rem] font-medium">{c.label}</dt>
              <dd className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {signal ? <SignalBadge signal={signal}>{STANDING_LABEL[standing]}</SignalBadge> : (
                  <span className="text-ink-3">{STANDING_LABEL[standing]}</span>
                )}
                {s && (
                  <span className="text-ink-3">
                    {s.counts.strong} strong, {s.counts.partial} partial, {s.counts.gap} gap
                    {s.thin ? " (thin evidence)" : ""}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
