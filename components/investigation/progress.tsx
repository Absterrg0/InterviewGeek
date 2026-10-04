"use client";

import Link from "next/link";
import { SignalDot, SIGNAL_LABEL } from "@/components/ui";
import { PHASE_LABELS, type Phase } from "@/lib/domain/content";
import type { Attempt } from "@/lib/domain/learner";
import { exerciseStatus, type ExerciseStatus } from "@/lib/domain/understanding";
import { useLearnerState } from "@/lib/store/learner-store";

export type StageLink = { id: string; title: string; phase: Phase };

function statuses(attempts: readonly Attempt[] | undefined, investigationId: string, stages: readonly StageLink[]) {
  return stages.map((s) =>
    attempts
      ? exerciseStatus(attempts, {
          kind: "stage",
          investigationId,
          stageId: s.id,
        })
      : null,
  );
}

function statusLabel(status: ExerciseStatus | null): string {
  if (status === null || status === "unattempted") return "Not answered";
  if (status === "awaiting-assessment") return "Answered, awaiting your assessment";
  return `Answered: ${SIGNAL_LABEL[status].toLowerCase()}`;
}

function StatusMark({ status }: { status: ExerciseStatus | null }) {
  if (status === "awaiting-assessment") {
    return <span className="led led-idle" role="img" aria-label={statusLabel(status)} />;
  }
  return <SignalDot signal={status === null || status === "unattempted" ? null : status} label={statusLabel(status)} />;
}

/** The stage list: where you are, and what you have answered. `dense` drops the phase headings. */
export function StageOutline({
  investigationId,
  stages,
  currentId,
  dense = false,
}: {
  investigationId: string;
  stages: StageLink[];
  currentId?: string;
  dense?: boolean;
}) {
  const state = useLearnerState();
  const marks = statuses(state?.attempts, investigationId, stages);
  return (
    <ol className="space-y-px">
      {stages.map((stage, i) => {
        const current = stage.id === currentId;
        const showPhase = !dense && (i === 0 || stages[i - 1]?.phase !== stage.phase);
        return (
          <li key={stage.id}>
            {showPhase && <p className={`eyebrow px-2 pb-1.5 ${i === 0 ? "" : "pt-3"}`}>{PHASE_LABELS[stage.phase]}</p>}
            <Link
              href={`/investigations/${investigationId}/${stage.id}`}
              aria-current={current ? "step" : undefined}
              className={`flex items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-[0.8125rem] leading-snug transition-colors ${
                current ? "plate rounded-lg text-ink" : "text-ink-2 hover:text-ink hover:bg-hover"
              }`}
            >
              <span className="w-4 shrink-0 font-mono text-[0.625rem] tabular-nums text-ink-3">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1">{stage.title}</span>
              <span className="self-center">
                <StatusMark status={marks[i] ?? null} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** "Start", "Continue at stage N" or "Review the design", depending on progress. */
export function ContinueLink({ investigationId, stages }: { investigationId: string; stages: StageLink[] }) {
  const state = useLearnerState();
  const first = stages[0];
  if (!first) return null;
  if (!state) {
    return (
      <span className="btn btn-primary invisible" aria-hidden="true">
        Start the investigation
      </span>
    );
  }
  const marks = statuses(state.attempts, investigationId, stages);
  const nextIndex = marks.findIndex((m) => m === "unattempted" || m === "awaiting-assessment");
  const started = marks.some((m) => m !== "unattempted");
  if (nextIndex < 0) {
    return (
      <Link href={`/investigations/${investigationId}/review`} className="btn btn-primary">
        Review the design
      </Link>
    );
  }
  const next = stages[nextIndex] as StageLink;
  return (
    <Link href={`/investigations/${investigationId}/${next.id}`} className="btn btn-primary">
      {started ? `Continue at stage ${nextIndex + 1}: ${next.title}` : "Start the investigation"}
    </Link>
  );
}

const SEGMENT: Record<ExerciseStatus, string> = {
  strong: "bg-mark-strong",
  partial: "bg-mark-partial",
  gap: "bg-mark-gap",
  "awaiting-assessment": "bg-ink-3",
  unattempted: "bg-rule",
};

/** One tick per stage, coloured by your latest answer, with "7 of 14 answered". */
export function InvestigationProgress({ investigationId, stages }: { investigationId: string; stages: StageLink[] }) {
  const state = useLearnerState();
  const marks = statuses(state?.attempts, investigationId, stages);
  const answered = marks.filter((m) => m !== null && m !== "unattempted").length;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className="inline-flex gap-[2px]" aria-hidden="true">
        {marks.map((m, i) => (
          <span key={i} className={`h-3 w-[3px] rounded-full ${SEGMENT[m ?? "unattempted"]}`} />
        ))}
      </span>
      <span
        className={`font-mono text-[0.6875rem] tabular-nums ${state ? "" : "invisible"} ${answered === 0 ? "text-ink-3" : "text-ink-2"}`}
      >
        {answered === 0 ? `${stages.length} stages, not started` : `${answered} of ${stages.length} answered`}
      </span>
    </span>
  );
}
