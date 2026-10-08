"use client";

import { InlineText } from "@/components/prose-core";
import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui";
import type { RubricPoint } from "@/lib/domain/content";
import { RUBRIC_MARKS, type Citations, type RubricMark, type SelfAssessment } from "@/lib/domain/learner";
import { splitPassages } from "@/lib/domain/passages";

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

/** Covered and partly need the passage that shows them; missed needs nothing. */
const NEEDS_CITATION: Record<RubricMark, boolean> = { covered: true, partial: true, missed: false };

export function RubricAssessment({
  rubric,
  written,
  name,
  onSubmit,
}: {
  rubric: readonly RubricPoint[];
  written: Written;
  name: string;
  onSubmit: (marks: SelfAssessment, citations: Citations) => void;
}) {
  const [marks, setMarks] = useState<SelfAssessment>({});
  const [citations, setCitations] = useState<Citations>({});
  const { text, mono } = written;
  const passages = useMemo(() => splitPassages(text, mono ? "code" : "prose"), [text, mono]);
  const marked = rubric.filter((p) => marks[p.id] !== undefined).length;
  const uncited = rubric.find((p) => {
    const mark = marks[p.id];
    return mark !== undefined && NEEDS_CITATION[mark] && !citations[p.id];
  });
  const complete = marked === rubric.length && !uncited;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete) return;
        // Keep citations only for points that still need them.
        const kept = Object.fromEntries(
          Object.entries(citations).filter(([id]) => {
            const mark = marks[id];
            return mark !== undefined && NEEDS_CITATION[mark];
          }),
        );
        onSubmit(marks, kept);
      }}
    >
      <WrittenText written={written} />
      <div>
        <h3 className="text-[0.875rem] font-medium mb-1">Compare against the points a strong answer makes</h3>
        <p className="text-[0.8125rem] text-ink-2 mb-3 max-w-[66ch]">
          For each point you covered, pick the part of your answer that says it. If no part of your answer says it, it
          was in your head, not in your answer: mark it missed. Partly means you gestured at it without the mechanism.
        </p>
        <ol className="panel divide-y divide-rule-soft">
          {rubric.map((point, i) => {
            const mark = marks[point.id];
            const citation = citations[point.id];
            const asking = mark !== undefined && NEEDS_CITATION[mark];
            return (
              <li key={point.id} className="px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                  <p className="flex-1 text-[0.875rem] leading-relaxed">
                    <InlineText text={point.text} />
                    {point.weight === "supporting" && <span className="ml-2 chip-flat align-middle">Supporting</span>}
                  </p>
                  <Segmented
                    name={`${name}-${point.id}`}
                    legend={`Point ${i + 1}`}
                    hideLegend
                    options={MARK_OPTIONS}
                    value={mark}
                    onChange={(next) => setMarks({ ...marks, [point.id]: next })}
                  />
                </div>
                {asking && (
                  <div className="mt-3">
                    {citation ? (
                      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.8125rem]">
                        <span className="text-ink-3">Shown by</span>
                        <q className={`text-ink ${written.mono ? "font-mono text-[0.75rem]" : ""}`}>{citation}</q>
                        <button
                          type="button"
                          className="link font-normal"
                          onClick={() => {
                            const next = { ...citations };
                            delete next[point.id];
                            setCitations(next);
                          }}
                        >
                          Change
                        </button>
                      </p>
                    ) : (
                      <fieldset>
                        <legend className="mb-2 text-[0.8125rem] font-medium">Which part of your answer says this?</legend>
                        <ul className="well max-h-56 space-y-1 overflow-y-auto p-1.5">
                          {passages.map((passage, j) => (
                            <li key={j}>
                              <button
                                type="button"
                                onClick={() => setCitations({ ...citations, [point.id]: passage })}
                                className={`w-full rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] leading-snug text-ink-2 hover:bg-hover hover:text-ink ${
                                  written.mono ? "font-mono text-[0.75rem] whitespace-pre-wrap break-words" : ""
                                }`}
                              >
                                {passage}
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="link mt-2 text-[0.8125rem] font-normal"
                          onClick={() => setMarks({ ...marks, [point.id]: "missed" })}
                        >
                          No part of it does: mark as missed
                        </button>
                      </fieldset>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={!complete}>
          Record assessment
        </button>
        {!complete && (
          <p className="text-sm text-ink-3">
            {marked < rubric.length
              ? `${marked} of ${rubric.length} marked.`
              : `Point ${rubric.indexOf(uncited as RubricPoint) + 1} needs the part of your answer that shows it.`}
          </p>
        )}
      </div>
    </form>
  );
}

export function RubricResult({
  rubric,
  marks,
  citations,
  written,
}: {
  rubric: readonly RubricPoint[];
  marks: SelfAssessment;
  citations?: Citations;
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
            const citation = citations?.[point.id];
            return (
              <li key={point.id} className="py-3 flex items-start gap-4 text-[0.875rem]">
                <span
                  className={`w-20 shrink-0 inline-flex items-center gap-2 text-sm font-medium ${mark ? MARK_CLASS[mark] : "text-ink-3"}`}
                >
                  <span className={`led ${mark ? MARK_LED[mark] : "led-off"} size-1.5`} aria-hidden="true" />
                  {mark ? MARK_LABEL[mark] : "Unmarked"}
                </span>
                <span className="min-w-0 leading-relaxed">
                  <InlineText text={point.text} />
                  {citation && (
                    <span className={`mt-1 block text-[0.8125rem] text-ink-3 ${written.mono ? "font-mono text-[0.75rem]" : ""}`}>
                      <q>{citation}</q>
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
