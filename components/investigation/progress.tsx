"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SIGNAL_LABEL } from "@/components/ui";
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

const STEP_FILL: Record<ExerciseStatus, string> = {
  strong: "bg-mark-strong shadow-none",
  partial: "bg-mark-partial shadow-none",
  gap: "bg-mark-gap shadow-none",
  "awaiting-assessment": "bg-ink-3 shadow-none",
  unattempted: "bg-paper",
};

/** The circle on the stage line: filled in the colour of your latest answer, ringed when it is the current stage. */
function StepMark({ status, current }: { status: ExerciseStatus | null; current: boolean }) {
  return (
    <span
      role="img"
      aria-label={statusLabel(status)}
      className={`relative z-10 block size-[11px] shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--rule-strong)] ${STEP_FILL[status ?? "unattempted"]} ${
        current ? "outline-2 outline-offset-2 outline-accent-solid [outline-style:solid]" : ""
      }`}
    />
  );
}

function StepRow({
  href,
  current,
  status,
  children,
  aside,
  onNavigate,
}: {
  href: string;
  current: boolean;
  status: ExerciseStatus | null;
  children: ReactNode;
  aside?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <li className="relative">
      <Link
        href={href}
        aria-current={current ? "step" : undefined}
        onClick={onNavigate}
        className={`flex items-baseline gap-3 rounded-md py-[5px] pr-2 pl-[7px] text-[0.8125rem] leading-snug transition-colors ${
          current ? "bg-hover font-medium text-ink" : "text-ink-2 hover:text-ink"
        }`}
      >
        <span className="translate-y-[1px] self-start pt-[3px]">
          <StepMark status={status} current={current} />
        </span>
        <span className="min-w-0 flex-1">{children}</span>
        {aside}
      </Link>
    </li>
  );
}

/**
 * The stages as a line of steps: where you are, and what you have answered.
 * `withPhase` adds what you do in each stage, for the overview page.
 */
export function StageOutline({
  investigationId,
  stages,
  currentId,
  withPhase = false,
  withReview = false,
  onNavigate,
}: {
  investigationId: string;
  stages: StageLink[];
  currentId?: string;
  withPhase?: boolean;
  /** End the line with the finished design. */
  withReview?: boolean;
  onNavigate?: () => void;
}) {
  const state = useLearnerState();
  const marks = statuses(state?.attempts, investigationId, stages);
  return (
    <ol className="relative">
      <span className="absolute top-3 bottom-3 left-[12px] w-px bg-rule" aria-hidden="true" />
      {stages.map((stage, i) => (
        <StepRow
          key={stage.id}
          href={`/investigations/${investigationId}/${stage.id}`}
          current={stage.id === currentId}
          status={marks[i] ?? null}
          onNavigate={onNavigate}
          aside={
            withPhase ? (
              <span className="hidden shrink-0 text-[0.75rem] text-ink-3 sm:inline">{PHASE_LABELS[stage.phase]}</span>
            ) : undefined
          }
        >
          {stage.title}
        </StepRow>
      ))}
      {withReview && (
        <StepRow
          href={`/investigations/${investigationId}/review`}
          current={currentId === "review"}
          status={null}
          onNavigate={onNavigate}
        >
          The finished design
        </StepRow>
      )}
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
        className={`text-[0.75rem] tabular-nums ${state ? "" : "invisible"} ${answered === 0 ? "text-ink-3" : "text-ink-2"}`}
      >
        {answered === 0 ? `${stages.length} stages` : `${answered} of ${stages.length} answered`}
      </span>
    </span>
  );
}
