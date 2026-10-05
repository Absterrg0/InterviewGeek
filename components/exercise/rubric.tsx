"use client";

import { InlineText } from "@/components/prose-core";
import { useState } from "react";
import { Segmented } from "@/components/ui";
import type { RubricPoint } from "@/lib/domain/content";
import { RUBRIC_MARKS, type RubricMark, type SelfAssessment } from "@/lib/domain/learner";

const MARK_LABEL: Record<RubricMark, string> = {
  covered: "Covered",
  partial: "Partly",
  missed: "Missed",
};
const MARK_OPTIONS = RUBRIC_MARKS.map((m) => ({
  value: m,
  label: MARK_LABEL[m],
}));
const MARK_CLASS: Record<RubricMark, string> = {
  covered: "text-signal-strong",
  partial: "text-signal-partial",
  missed: "text-signal-gap",
};

const MARK_LED: Record<RubricMark, string> = {
  covered: "led-strong",
  partial: "led-partial",
  missed: "led-gap",
};

export type Written = { label: string; text: string; mono?: boolean };

function WrittenText({ written }: { written: Written }) {
  return (
    <div>
      <h3 className="eyebrow mb-2">{written.label}</h3>
      <div
        className={`well px-5 py-4 whitespace-pre-wrap break-words max-h-96 overflow-y-auto ${
          written.mono ? "font-mono text-[0.8125rem] leading-relaxed" : "leading-relaxed"
        }`}
      >
        {written.text}
      </div>
    </div>
  );
}

export function RubricAssessment({
  rubric,
  written,
  name,
  onSubmit,
}: {
  rubric: readonly RubricPoint[];
  written: Written;
  name: string;
  onSubmit: (marks: SelfAssessment) => void;
}) {
  const [marks, setMarks] = useState<SelfAssessment>({});
  const complete = rubric.every((p) => marks[p.id] !== undefined);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) onSubmit(marks);
      }}
    >
      <WrittenText written={written} />
      <div>
        <h3 className="text-[0.875rem] font-medium mb-1">Compare against the points a strong answer makes</h3>
        <p className="text-[0.8125rem] text-ink-2 mb-3">
          Mark a point covered only if your answer states it, not if it was in your head. Partly means you gestured at
          it without the mechanism.
        </p>
        <ol className="panel divide-y divide-rule-soft">
          {rubric.map((point, i) => (
            <li key={point.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6">
              <p className="flex-1 text-[0.875rem] leading-relaxed">
                <InlineText text={point.text} />
                {point.weight === "supporting" && <span className="ml-2 chip-flat align-middle">Supporting</span>}
              </p>
              <Segmented
                name={`${name}-${point.id}`}
                legend={`Point ${i + 1}`}
                hideLegend
                options={MARK_OPTIONS}
                value={marks[point.id]}
                onChange={(mark) => setMarks({ ...marks, [point.id]: mark })}
              />
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={!complete}>
          Record assessment
        </button>
        {!complete && (
          <p className="text-sm text-ink-3">
            {rubric.filter((p) => marks[p.id] !== undefined).length} of {rubric.length} marked.
          </p>
        )}
      </div>
    </form>
  );
}

export function RubricResult({
  rubric,
  marks,
  written,
}: {
  rubric: readonly RubricPoint[];
  marks: SelfAssessment;
  written: Written;
}) {
  return (
    <div className="space-y-5">
      <WrittenText written={written} />
      <div>
        <h3 className="eyebrow mb-2">Your assessment</h3>
        <ul className="panel divide-y divide-rule-soft px-4">
          {rubric.map((point) => {
            const mark = marks[point.id];
            return (
              <li key={point.id} className="py-3 flex items-start gap-4 text-[0.875rem]">
                <span
                  className={`w-20 shrink-0 inline-flex items-center gap-2 text-sm font-medium ${mark ? MARK_CLASS[mark] : "text-ink-3"}`}
                >
                  <span className={`led ${mark ? MARK_LED[mark] : "led-off"} size-1.5`} aria-hidden="true" />
                  {mark ? MARK_LABEL[mark] : "Unmarked"}
                </span>
                <span className="leading-relaxed"><InlineText text={point.text} /></span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
