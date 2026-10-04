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
    .map((e) => ({ e, status: state ? exerciseStatus(state.attempts, e.ref) : ("unattempted" as const) }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div>
      <div role="group" aria-label="Dimension" className="flex flex-wrap gap-1.5">
        {DIMENSIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === dimension}
            onClick={() => setDimension(d)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              d === dimension ? "bg-ink text-paper" : "text-ink-2 hover:text-ink bg-sunken"
            }`}
          >
            {DIMENSION_LABELS[d].label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-2">{DIMENSION_LABELS[dimension].description}</p>
      <ul className="mt-4 border-t border-rule" aria-live="polite">
        {list.map(({ e, status }) => (
          <li key={e.key} className="border-b border-rule">
            <Link href={e.href} className="group flex items-center justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="block group-hover:text-accent">{e.title}</span>
                <span className="block text-xs text-ink-3">{e.source}</span>
              </span>
              <span className="shrink-0">
                {status === "unattempted" ? (
                  <span className="text-xs text-ink-3">New</span>
                ) : status === "awaiting-assessment" ? (
                  <span className="text-xs text-ink-2">Awaiting assessment</span>
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
