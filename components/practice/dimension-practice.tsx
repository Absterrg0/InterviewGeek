"use client";

import Link from "next/link";
import { useState } from "react";
import { SignalBadge } from "@/components/ui";
import { DIMENSION_LABELS, DIMENSIONS, type Dimension } from "@/lib/domain/content";
import { exerciseStatus, type ExerciseStatus } from "@/lib/domain/understanding";
import type { ExerciseRef } from "@/lib/domain/learner";
import { useLearnerState } from "@/lib/store/learner-store";

export type PracticeExercise = {
  key: string;
  ref: ExerciseRef;
  title: string;
  source: string;
  href: string;
  dimensions: Dimension[];
};

const ORDER: Record<ExerciseStatus, number> = { gap: 0, partial: 1, "awaiting-assessment": 2, unattempted: 3, strong: 4 };

/** Every exercise that trains one dimension, ordered by where practice is most useful. */
export function DimensionPractice({ exercises }: { exercises: PracticeExercise[] }) {
  const state = useLearnerState();
  const [dimension, setDimension] = useState<Dimension>("break");
  const list = exercises
    .filter((e) => e.dimensions.includes(dimension))
    .map((e) => ({
      e,
      status: state ? exerciseStatus(state.attempts, e.ref) : ("unattempted" as const),
    }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div>
      <div
        role="group"
        aria-label="Dimension"
        className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-sunken p-[3px] shadow-[inset_0_0_0_1px_var(--rule-soft)]"
      >
        {DIMENSIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === dimension}
            onClick={() => setDimension(d)}
            className={`rounded-[7px] px-2.5 py-1 text-[0.75rem] font-medium transition-colors ${
              d === dimension ? "bg-raised text-ink shadow-[var(--shadow-btn)]" : "text-ink-3 hover:text-ink"
            }`}
          >
            {DIMENSION_LABELS[d].label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">{DIMENSION_LABELS[dimension].description}</p>
      <ul className="mt-4 space-y-px" aria-live="polite">
        {list.map(({ e, status }) => (
          <li key={e.key}>
            <Link
              href={e.href}
              className="group -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-hover"
            >
              <span className="min-w-0 truncate text-[0.8125rem]">
                <span className="font-medium text-ink">{e.title}</span>
                <span className="text-ink-3" aria-hidden="true">
                  {" · "}
                </span>
                <span className="text-ink-3">{e.source}</span>
              </span>
              <span className="shrink-0">
                {status === "unattempted" ? (
                  <span className="chip-flat">New</span>
                ) : status === "awaiting-assessment" ? (
                  <span className="chip-flat">Needs assessment</span>
                ) : (
                  <SignalBadge signal={status} />
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
