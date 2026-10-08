"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useDraft } from "@/components/exercise/use-draft";
import {
  DESIGN_ROUND_MINUTES,
  DESIGN_SECTIONS,
  DESIGN_SECTION_IDS,
  formatClock,
  roundCoverage,
  type Coverage,
  type DesignRound,
  type DesignSectionId,
  type ReferenceIds,
} from "@/lib/domain/design-round";
import { deleteRound, saveRound, useLearnerState } from "@/lib/store/learner-store";

export type ReferenceItemView = { id: string; text: ReactNode; detail?: ReactNode };
export type ReferenceView = Record<DesignSectionId, ReferenceItemView[]>;

type Draft = {
  startedAt: string | null;
  phase: "write" | "compare";
  answers: Partial<Record<DesignSectionId, string>>;
  covered: Partial<Record<DesignSectionId, string[]>>;
};

const EMPTY: Draft = { startedAt: null, phase: "write", answers: {}, covered: {} };

function parseDraft(raw: unknown): Draft | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const d = raw as Partial<Draft>;
  if (d.phase !== "write" && d.phase !== "compare") return undefined;
  if (typeof d.answers !== "object" || d.answers === null) return undefined;
  if (typeof d.covered !== "object" || d.covered === null) return undefined;
  return {
    startedAt: typeof d.startedAt === "string" ? d.startedAt : null,
    phase: d.phase,
    answers: d.answers,
    covered: d.covered,
  };
}

/** Enough writing to be worth comparing: something in at least three sections. */
const MIN_SECTIONS = 3;

function written(answers: Draft["answers"]): number {
  return DESIGN_SECTION_IDS.filter((id) => (answers[id] ?? "").trim().length >= 20).length;
}

function idsOf(reference: ReferenceView): ReferenceIds {
  const ids = {} as Record<DesignSectionId, string[]>;
  for (const id of DESIGN_SECTION_IDS) ids[id] = reference[id].map((item) => item.id);
  return ids;
}

function percent({ covered, total }: Coverage): number {
  return total === 0 ? 0 : Math.round((covered / total) * 100);
}

/**
 * A blank-page design round for one investigation. The learner writes every
 * section with a clock running, then compares each section with the reference
 * and ticks what they covered. Unfinished rounds survive reloads as a draft;
 * finished ones are saved with the learner's progress.
 */
export function DesignRoundRunner({
  investigationId,
  reference,
  designExtra,
  walkthroughHref,
}: {
  investigationId: string;
  reference: ReferenceView;
  /** Server-rendered extra for the design section's reference, such as the system map. */
  designExtra?: ReactNode;
  walkthroughHref: string;
}) {
  const [draft, setDraft, discard] = useDraft(`design:${investigationId}`, parseDraft, () => EMPTY);
  const [savedId, setSavedId] = useState<string | null>(null);
  const state = useLearnerState();
  const rounds = (state?.rounds ?? [])
    .filter((r) => r.investigationId === investigationId)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const ids = idsOf(reference);
  const saved = savedId ? rounds.find((r) => r.id === savedId) : undefined;

  const update = (next: Partial<Draft>) => setDraft({ ...draft, ...next });

  return (
    <div className="space-y-14">
      {saved ? (
        <RoundSaved round={saved} ids={ids} walkthroughHref={walkthroughHref} onAgain={() => setSavedId(null)} />
      ) : draft.phase === "write" ? (
        <WritePhase
          draft={draft}
          onWrite={(section, text) =>
            update({
              answers: { ...draft.answers, [section]: text },
              startedAt: draft.startedAt ?? new Date().toISOString(),
            })
          }
          onStart={() => update({ startedAt: new Date().toISOString() })}
          onCompare={() => {
            update({ phase: "compare" });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onDiscard={discard}
        />
      ) : (
        <ComparePhase
          draft={draft}
          reference={reference}
          designExtra={designExtra}
          onToggle={(section, itemId) => {
            const current = new Set(draft.covered[section] ?? []);
            if (current.has(itemId)) current.delete(itemId);
            else current.add(itemId);
            update({ covered: { ...draft.covered, [section]: [...current] } });
          }}
          onBack={() => update({ phase: "write" })}
          onSave={() => {
            const round: DesignRound = {
              id: crypto.randomUUID(),
              investigationId,
              startedAt: draft.startedAt ?? new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              answers: draft.answers,
              covered: draft.covered,
            };
            saveRound(round);
            discard();
            setSavedId(round.id);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {rounds.length > 0 && <PastRounds rounds={rounds} ids={ids} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function Clock({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const start = Date.parse(startedAt);
    const tick = () => setElapsed((Date.now() - start) / 1000);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const over = elapsed > DESIGN_ROUND_MINUTES * 60;
  return (
    <span className="inline-flex items-baseline gap-2" role="timer" aria-live="off">
      <span className={`font-mono text-[1.125rem] tabular-nums ${over ? "text-signal-partial" : "text-ink"}`}>
        {formatClock(startedAt ? elapsed : 0)}
      </span>
      <span className="text-[0.8125rem] text-ink-3">of {DESIGN_ROUND_MINUTES} min</span>
    </span>
  );
}

function WritePhase({
  draft,
  onWrite,
  onStart,
  onCompare,
  onDiscard,
}: {
  draft: Draft;
  onWrite: (section: DesignSectionId, text: string) => void;
  onStart: () => void;
  onCompare: () => void;
  onDiscard: () => void;
}) {
  const count = written(draft.answers);
  const ready = count >= MIN_SECTIONS;
  const started = Object.values(draft.answers).some((t) => (t ?? "").trim().length > 0);
  return (
    <div className="max-w-3xl">
      <div className="glass sticky top-14 z-10 -mx-2 mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-rule px-2 py-3">
        <Clock startedAt={draft.startedAt} />
        <div className="flex items-center gap-2">
          {!draft.startedAt && (
            <button type="button" className="btn btn-secondary" onClick={onStart}>
              Start the clock
            </button>
          )}
          <span className="text-[0.8125rem] text-ink-3">
            {count} of {DESIGN_SECTIONS.length} sections written
          </span>
        </div>
      </div>

      <ol className="space-y-12">
        {DESIGN_SECTIONS.map((section, i) => (
          <li key={section.id}>
            <SectionField
              number={i + 1}
              title={section.title}
              minutes={section.minutes}
              prompt={section.prompt}
              placeholder={section.placeholder}
              value={draft.answers[section.id] ?? ""}
              onChange={(text) => onWrite(section.id, text)}
            />
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-rule pt-8">
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={onCompare}>
          Finish and compare with the reference
        </button>
        {!ready && (
          <p className="text-sm text-ink-3">
            Write something in at least {MIN_SECTIONS} sections first. Gaps are fine; the comparison shows what they cost.
          </p>
        )}
        {started && (
          <button
            type="button"
            className="btn btn-ghost ml-auto"
            onClick={() => {
              if (window.confirm("Discard this round and start again from a blank page?")) onDiscard();
            }}
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}

function SectionField({
  number,
  title,
  minutes,
  prompt,
  placeholder,
  value,
  onChange,
}: {
  number: number;
  title: string;
  minutes: number;
  prompt: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-[1.25rem] leading-tight">
          <span className="mr-2 font-mono text-[0.8125rem] text-ink-3">{String(number).padStart(2, "0")}</span>
          <label htmlFor={id}>{title}</label>
        </h2>
        <span className="text-[0.8125rem] text-ink-3">about {minutes} min</span>
      </div>
      <p id={`${id}-prompt`} className="mb-3 max-w-[66ch] text-[0.9375rem] leading-relaxed text-ink-2">
        {prompt}
      </p>
      <textarea
        id={id}
        value={value}
        rows={7}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-prompt`}
        className="field resize-y leading-relaxed"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparing
// ---------------------------------------------------------------------------

function ComparePhase({
  draft,
  reference,
  designExtra,
  onToggle,
  onBack,
  onSave,
}: {
  draft: Draft;
  reference: ReferenceView;
  designExtra?: ReactNode;
  onToggle: (section: DesignSectionId, itemId: string) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const { sections, overall } = roundCoverage(draft, idsOf(reference));
  return (
    <div>
      <div className="mb-10 max-w-[66ch] space-y-3">
        <h2 className="font-display text-[1.5rem] leading-tight">Compare with the reference</h2>
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          Your answer is on the left, the reference on the right. Tick a reference point only if your answer says it, in
          your words. The reference is one defensible design, not the only one: where you chose differently for a reason
          you can state, that counts.
        </p>
      </div>

      <ol className="space-y-14">
        {DESIGN_SECTIONS.map((section, i) => {
          const items = reference[section.id];
          const ticked = new Set(draft.covered[section.id] ?? []);
          const answer = (draft.answers[section.id] ?? "").trim();
          return (
            <li key={section.id}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
                <h3 className="font-display text-[1.125rem] leading-tight">
                  <span className="mr-2 font-mono text-[0.8125rem] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  {section.title}
                </h3>
                <span className="text-[0.8125rem] tabular-nums text-ink-2">
                  {sections[section.id].covered} of {sections[section.id].total} covered
                </span>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="eyebrow mb-2">You wrote</p>
                  {answer ? (
                    <div className="well max-h-[28rem] overflow-y-auto px-4 py-3 text-[0.875rem] leading-relaxed whitespace-pre-wrap break-words">
                      {answer}
                    </div>
                  ) : (
                    <p className="well px-4 py-3 text-[0.875rem] text-ink-3">Nothing. In an interview this section would be a gap.</p>
                  )}
                </div>
                <div>
                  <p className="eyebrow mb-2">The reference</p>
                  {items.length === 0 ? (
                    <p className="text-[0.875rem] text-ink-3">This investigation has no reference points for this section.</p>
                  ) : (
                    <ul className="panel divide-y divide-rule-soft">
                      {items.map((item) => (
                        <li key={item.id}>
                          <label className="flex cursor-pointer gap-3 px-4 py-3 hover:bg-hover/50">
                            <input
                              type="checkbox"
                              checked={ticked.has(item.id)}
                              onChange={() => onToggle(section.id, item.id)}
                              className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                            />
                            <span className="min-w-0 text-[0.875rem] leading-relaxed">
                              <span className="block">{item.text}</span>
                              {item.detail && <span className="mt-1 block text-[0.8125rem] text-ink-2">{item.detail}</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.id === "design" && designExtra && <div className="mt-4">{designExtra}</div>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-rule pt-8">
        <button type="button" className="btn btn-primary" onClick={onSave}>
          Save this round ({percent(overall)}% covered)
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back to writing
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function CoverageRows({ round, ids }: { round: DesignRound; ids: ReferenceIds }) {
  const { sections } = roundCoverage(round, ids);
  return (
    <ul className="divide-y divide-rule-soft">
      {DESIGN_SECTIONS.map((section) => {
        const c = sections[section.id];
        const p = percent(c);
        return (
          <li key={section.id} className="grid grid-cols-[minmax(0,1fr)_8rem_4rem] items-center gap-4 py-2 text-[0.8125rem]">
            <span>{section.title}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden="true">
              <span
                className={`block h-full rounded-full ${p >= 75 ? "bg-mark-strong" : p >= 40 ? "bg-mark-partial" : "bg-mark-gap"}`}
                style={{ width: `${p}%` }}
              />
            </span>
            <span className="text-right tabular-nums text-ink-2">
              {c.covered}/{c.total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function minutesBetween(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60_000));
}

function weakest(round: DesignRound, ids: ReferenceIds): string | null {
  const { sections } = roundCoverage(round, ids);
  const measured = DESIGN_SECTIONS.filter((s) => sections[s.id].total > 0);
  const sorted = [...measured].sort((a, b) => percent(sections[a.id]) - percent(sections[b.id]));
  const first = sorted[0];
  return first && percent(sections[first.id]) < 60 ? first.title : null;
}

function RoundSaved({
  round,
  ids,
  walkthroughHref,
  onAgain,
}: {
  round: DesignRound;
  ids: ReferenceIds;
  walkthroughHref: string;
  onAgain: () => void;
}) {
  const { overall } = roundCoverage(round, ids);
  const weak = weakest(round, ids);
  return (
    <section aria-labelledby="round-result" className="max-w-3xl space-y-6">
      <div className="tint px-5 py-4">
        <p className="eyebrow">Round saved</p>
        <h2 id="round-result" className="mt-1 font-display text-[1.5rem] leading-tight">
          {percent(overall)}% of the reference in {minutesBetween(round.startedAt, round.finishedAt)} minutes
        </h2>
        {weak && (
          <p className="mt-2 max-w-[66ch] text-[0.9375rem] leading-relaxed text-ink-2">
            {weak} is where most of the reference was missing. The guided stages teach that part step by step.
          </p>
        )}
      </div>
      <div className="panel px-4 py-2">
        <CoverageRows round={round} ids={ids} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={walkthroughHref} className="btn btn-primary">
          Read the full walkthrough
        </Link>
        <button type="button" className="btn btn-secondary" onClick={onAgain}>
          Start another round
        </button>
      </div>
    </section>
  );
}

function PastRounds({ rounds, ids }: { rounds: DesignRound[]; ids: ReferenceIds }) {
  return (
    <section aria-labelledby="past-rounds" className="max-w-3xl">
      <h2 id="past-rounds" className="mb-1 font-display text-[1.0625rem] leading-tight">
        Your rounds on this system
      </h2>
      <p className="mb-4 text-[0.8125rem] text-ink-3">Newest first. Coverage is what you ticked against the reference.</p>
      <ul className="space-y-3">
        {rounds.map((round) => {
          const { overall } = roundCoverage(round, ids);
          const date = new Date(round.finishedAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          return (
            <li key={round.id}>
              <details className="panel group">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="text-[0.875rem] font-medium">{date}</span>
                  <span className="text-[0.8125rem] tabular-nums text-ink-2">
                    {percent(overall)}% covered · {minutesBetween(round.startedAt, round.finishedAt)} min
                  </span>
                </summary>
                <div className="space-y-5 border-t border-rule-soft px-4 py-4">
                  <CoverageRows round={round} ids={ids} />
                  {DESIGN_SECTIONS.map((section) => {
                    const answer = (round.answers[section.id] ?? "").trim();
                    if (!answer) return null;
                    return (
                      <div key={section.id}>
                        <p className="eyebrow mb-1">{section.title}</p>
                        <p className="text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words text-ink-2">{answer}</p>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn btn-ghost -ml-2 text-signal-gap"
                    onClick={() => {
                      if (window.confirm("Delete this round?")) deleteRound(round.id);
                    }}
                  >
                    Delete this round
                  </button>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
