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
    attempts ? exerciseStatus(attempts, { kind: "stage", investigationId, stageId: s.id }) : null,
  );
}

function statusLabel(status: ExerciseStatus | null): string {
  if (status === null || status === "unattempted") return "Not answered";
  if (status === "awaiting-assessment") return "Answered, awaiting your assessment";
  return `Answered: ${SIGNAL_LABEL[status].toLowerCase()}`;
}

function StatusMark({ status }: { status: ExerciseStatus | null }) {
  if (status === "awaiting-assessment") {
    return <span className="inline-block size-2 rounded-full shrink-0 bg-ink-3" role="img" aria-label={statusLabel(status)} />;
  }
  return (
    <SignalDot
      signal={status === null || status === "unattempted" ? null : status}
      label={statusLabel(status)}
    />
  );
}

/** The stage list beside a stage: where you are, and what you have answered. */
export function StageOutline({
  investigationId,
  stages,
  currentId,
}: {
  investigationId: string;
  stages: StageLink[];
  currentId?: string;
}) {
  const state = useLearnerState();
  const marks = statuses(state?.attempts, investigationId, stages);
  return (
    <ol className="space-y-px">
      {stages.map((stage, i) => {
        const current = stage.id === currentId;
        const showPhase = i === 0 || stages[i - 1]?.phase !== stage.phase;
        return (
          <li key={stage.id}>
            {showPhase && <p className="eyebrow pt-3 pb-1 first:pt-0">{PHASE_LABELS[stage.phase]}</p>}
            <Link
              href={`/investigations/${investigationId}/${stage.id}`}
              aria-current={current ? "step" : undefined}
              className={`flex items-baseline gap-2.5 rounded px-2 py-1.5 -mx-2 text-[0.8125rem] leading-snug transition-colors ${
                current ? "bg-sunken text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              <span className="font-mono text-[0.6875rem] text-ink-3 w-4 shrink-0">{String(i + 1).padStart(2, "0")}</span>
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
      {started ? `Continue: ${String(nextIndex + 1).padStart(2, "0")} ${next.title}` : "Start the investigation"}
    </Link>
  );
}

/** Compact "7 of 14 answered" for lists. */
export function InvestigationProgress({ investigationId, stages }: { investigationId: string; stages: StageLink[] }) {
  const state = useLearnerState();
  if (!state) return <span className="invisible">—</span>;
  const marks = statuses(state.attempts, investigationId, stages);
  const answered = marks.filter((m) => m !== "unattempted").length;
  if (answered === 0) return <span className="text-ink-3">Not started</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-0.5" aria-hidden="true">
        {marks.map((m, i) => (
          <span
            key={i}
            className={`h-2.5 w-1.5 rounded-[1px] ${
              m === "strong"
                ? "bg-mark-strong"
                : m === "partial"
                  ? "bg-mark-partial"
                  : m === "gap"
                    ? "bg-mark-gap"
                    : m === "awaiting-assessment"
                      ? "bg-ink-3"
                      : "bg-rule-strong"
            }`}
          />
        ))}
      </span>
      <span className="text-ink-2">
        {answered} of {stages.length} answered
      </span>
    </span>
  );
}
