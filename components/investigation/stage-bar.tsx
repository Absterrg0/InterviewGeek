"use client";

import Link from "next/link";
import { useRef } from "react";
import { InvestigationProgress, StageOutline, type StageLink } from "@/components/investigation/progress";
import { PHASE_LABELS } from "@/lib/domain/content";

export type StageBarInvestigation = { id: string; title: string; stages: StageLink[] };

function Chevron({ direction }: { direction: "left" | "right" | "down" }) {
  const d = { left: "M6.5 2.5 3.5 5.5l3 3", right: "M3.5 2.5l3 3-3 3", down: "M2.5 4l3 3 3-3" }[direction];
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Under the top bar while you are inside an investigation: which system, how far along you are,
 * every stage one click away, and the previous and next stage.
 */
export function StageBar({ investigation: inv, current }: { investigation: StageBarInvestigation; current: string }) {
  const popover = useRef<HTMLDivElement>(null);
  const isReview = current === "review";
  const index = inv.stages.findIndex((s) => s.id === current);
  const stage = inv.stages[index];
  const base = `/investigations/${inv.id}`;
  const previous = isReview ? inv.stages[inv.stages.length - 1] : inv.stages[index - 1];
  const next = isReview ? undefined : (inv.stages[index + 1] ?? { id: "review", title: "The full walkthrough" });
  const popoverId = `stages-${inv.id}`;

  const step = (target: { id: string; title: string } | undefined, direction: "left" | "right") => {
    const label = direction === "left" ? "Previous" : "Next";
    return target ? (
      <Link href={`${base}/${target.id}`} className="knob size-8" aria-label={`${label}: ${target.title}`} title={target.title}>
        <Chevron direction={direction} />
      </Link>
    ) : (
      <span className="knob size-8 opacity-35" aria-hidden="true">
        <Chevron direction={direction} />
      </span>
    );
  };

  return (
    <div className="border-t border-rule-soft">
      <nav aria-label={`${inv.title}: stages`} className="shell flex h-12 items-center gap-4">
        <Link
          href={base}
          className="flex min-w-0 items-center gap-2 text-[0.8125rem] font-medium text-ink-2 hover:text-ink"
        >
          <Chevron direction="left" />
          <span className="truncate">{inv.title}</span>
        </Link>

        <div className="ml-auto hidden md:block">
          <InvestigationProgress investigationId={inv.id} stages={inv.stages} />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-2">
          <button
            type="button"
            popoverTarget={popoverId}
            className="btn btn-secondary h-8 min-h-0 gap-2 px-3 text-[0.8125rem]"
          >
            {isReview ? (
              "Walkthrough"
            ) : (
              <>
                <span className="tabular-nums">
                  Stage {index + 1}
                  <span className="text-ink-3"> / {inv.stages.length}</span>
                </span>
                {stage && <span className="hidden text-ink-3 sm:inline">· {PHASE_LABELS[stage.phase]}</span>}
              </>
            )}
            <Chevron direction="down" />
          </button>
          {step(previous, "left")}
          {step(next, "right")}
        </div>
      </nav>

      <div ref={popover} id={popoverId} popover="auto" className="stage-popover panel">
        <div className="flex items-baseline justify-between gap-4 px-2 pt-1 pb-3">
          <p className="text-[0.8125rem] font-medium">All stages</p>
          <InvestigationProgress investigationId={inv.id} stages={inv.stages} />
        </div>
        <StageOutline
          investigationId={inv.id}
          stages={inv.stages}
          currentId={current}
          withReview
          onNavigate={() => popover.current?.hidePopover()}
        />
      </div>
    </div>
  );
}
