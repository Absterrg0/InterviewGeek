"use client";

import { ContinueLink, InvestigationProgress, type StageLink } from "@/components/investigation/progress";
import { useLearnerState } from "@/lib/store/learner-store";

type Outline = { id: string; title: string; stages: StageLink[] };

/** For returning learners: the investigation they touched most recently. */
export function ContinueStrip({ investigations }: { investigations: Outline[] }) {
  const state = useLearnerState();
  if (!state) return null;
  const recent = [...state.attempts]
    .filter((a) => a.exercise.kind === "stage")
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  if (!recent || recent.exercise.kind !== "stage") return null;
  const investigationId = recent.exercise.investigationId;
  const inv = investigations.find((i) => i.id === investigationId);
  if (!inv) return null;
  return (
    <section aria-label="Continue" className="rounded-md border border-rule bg-raised px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">Where you left off</p>
        <p className="mt-1 font-medium">{inv.title}</p>
        <div className="mt-1 text-sm">
          <InvestigationProgress investigationId={inv.id} stages={inv.stages} />
        </div>
      </div>
      <ContinueLink investigationId={inv.id} stages={inv.stages} />
    </section>
  );
}
