"use client";

import Link from "next/link";
import { ContinueLink, InvestigationProgress, type StageLink } from "@/components/investigation/progress";
import { reviewQueue } from "@/lib/domain/review";
import { useLearnerState } from "@/lib/store/learner-store";
import { useNow } from "@/lib/use-now";

type Outline = { id: string; title: string; stages: StageLink[] };

/** For returning learners: the investigation they touched most recently, and what is due for review. */
export function ContinueStrip({ investigations }: { investigations: Outline[] }) {
  const state = useLearnerState();
  const now = useNow();
  if (!state || now === null) return null;
  const recent = [...state.attempts]
    .filter((a) => a.exercise.kind === "stage")
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  const inv =
    recent?.exercise.kind === "stage"
      ? investigations.find((i) => recent.exercise.kind === "stage" && i.id === recent.exercise.investigationId)
      : undefined;
  const due = reviewQueue(state.attempts, now).due.length;
  if (!inv && due === 0) return null;
  return (
    <section aria-label="Continue" className="section space-y-3">
      {inv && (
        <div className="tint flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="min-w-0">
            <p className="eyebrow">Where you left off</p>
            <p className="mt-1 font-display text-[1rem] leading-snug">{inv.title}</p>
            <div className="mt-2">
              <InvestigationProgress investigationId={inv.id} stages={inv.stages} />
            </div>
          </div>
          <ContinueLink investigationId={inv.id} stages={inv.stages} />
        </div>
      )}
      {due > 0 && (
        <div className="panel flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <p className="text-[0.875rem]">
            <span className="font-medium">
              {due} answer{due === 1 ? " is" : "s are"} due for review.
            </span>{" "}
            <span className="text-ink-2">Answering from memory after a few days is what makes it stick.</span>
          </p>
          <Link href="/understanding#review" className="btn btn-secondary shrink-0">
            Review now
          </Link>
        </div>
      )}
    </section>
  );
}
