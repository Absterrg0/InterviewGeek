"use client";

import Link from "next/link";
import { SignalBadge, SignalMeter, SIGNAL_LED, STANDING_LABEL, STANDING_SIGNAL } from "@/components/ui";
import { DIMENSION_LABELS, DIMENSIONS, type Competency } from "@/lib/domain/content";
import { exerciseKey, type ExerciseRef } from "@/lib/domain/learner";
import {
  awaitingAssessment,
  byCompetency,
  byConcept,
  byDimension,
  insights,
  latestEvidence,
  summarize,
  type Insight,
} from "@/lib/domain/understanding";
import { labelFor, type CuratedLabels } from "@/lib/exercise-labels";
import { useLearnerState } from "@/lib/store/learner-store";

export type InvestigationOutline = {
  id: string;
  title: string;
  stageCount: number;
  firstStageId: string;
  competencies: Competency[];
};

type Props = {
  investigations: InvestigationOutline[];
  concepts: Record<string, string>;
  curated: CuratedLabels;
};

const TONE_MARK: Record<Insight["tone"], string> = {
  strength: SIGNAL_LED.strong,
  gap: SIGNAL_LED.gap,
  note: "led led-idle",
};

function Legend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3" aria-hidden="true">
      <span>Counts are</span>
      {(["strong", "partial", "gap"] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`${SIGNAL_LED[s]} size-1.5`} />
          {s}
        </span>
      ))}
    </p>
  );
}

export function UnderstandingView({ investigations, concepts, curated }: Props) {
  const state = useLearnerState();
  if (!state) {
    return (
      <div aria-busy="true" className="space-y-4">
        <div className="section">
          <div className="h-64 well" />
        </div>
      </div>
    );
  }

  const latest = latestEvidence(state.attempts);
  const overall = summarize(latest.values());
  const awaiting = awaitingAssessment(state.attempts);
  const label = (ref: ExerciseRef) => labelFor(ref, curated, state.projects);

  if (overall.total === 0) {
    return (
      <div className="section space-y-5">
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          Nothing here yet, and nothing will be until you answer something. This page does not count visits or minutes.
          It reads the evidence from your answers: which decisions held up, which explanations covered the mechanism,
          which failure scenarios you reasoned through.
        </p>
        {awaiting.length > 0 && (
          <p className="text-[0.875rem] text-ink-2">
            You have {awaiting.length} answer{awaiting.length === 1 ? "" : "s"} waiting for your self-assessment. Finish
            those and they will appear here.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {investigations[0] && (
            <Link
              href={`/investigations/${investigations[0].id}/${investigations[0].firstStageId}`}
              className="btn btn-primary"
            >
              Start with {investigations[0].title}
            </Link>
          )}
          <Link href="/concepts" className="btn btn-secondary">
            Or check a concept
          </Link>
        </div>
      </div>
    );
  }

  const dimensions = byDimension(latest);
  const conceptSummaries = [...byConcept(latest)]
    .map(([id, s]) => ({ id, title: concepts[id] ?? id, s }))
    .sort((a, b) => a.s.score - b.s.score || b.s.total - a.s.total);
  const found = insights(latest, {
    concept: (id) => concepts[id],
    source: (ref) => label(ref)?.source ?? "an exercise",
  });
  const revisit = [...latest.values()]
    .filter((e) => e.evidence.signal !== "strong")
    .sort((a, b) => (a.evidence.signal === b.evidence.signal ? 0 : a.evidence.signal === "gap" ? -1 : 1));
  const awaitingRefs = awaiting.map((a) => a.exercise);
  const touched = investigations.filter((inv) =>
    [...latest.values()].some((e) => e.exercise.kind === "stage" && e.exercise.investigationId === inv.id),
  );

  return (
    <div>
      <section
        aria-labelledby="summary"
        className="section grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
      >
        <div className="max-w-3xl">
          <h2 id="summary" className="sr-only">
            Summary
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-ink-2">
            Based on your latest answer to <strong className="font-medium text-ink">{overall.total}</strong> exercise
            {overall.total === 1 ? "" : "s"}: {overall.counts.strong} strong, {overall.counts.partial} partial,{" "}
            {overall.counts.gap} gap.{" "}
            {overall.selfAssessed === 0
              ? "All of it was checked against an answer key."
              : overall.selfAssessed === overall.total
                ? "All of it rests on your own rubric marks."
                : `${overall.selfAssessed} of ${overall.total} rest${overall.selfAssessed === 1 ? "s" : ""} on your own rubric marks; the rest were checked against an answer key.`}
          </p>
          {found.length > 0 && (
            <ul className="mt-5 space-y-2">
              {found.map((insight) => (
                <li key={insight.id} className="flex gap-3 text-[0.875rem] leading-relaxed">
                  <span className={`${TONE_MARK[insight.tone]} mt-2 size-1.5`} aria-hidden="true" />
                  <span>{insight.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel grid min-w-[16rem] grid-cols-3 divide-x divide-dashed divide-rule" aria-hidden="true">
          {(["strong", "partial", "gap"] as const).map((s) => (
            <div key={s} className="px-4 py-3">
              <p className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-wider text-ink-3">
                <span className={`${SIGNAL_LED[s]} size-1.5`} />
                {s}
              </p>
              <p className="mt-1.5 font-display text-[1.5rem] leading-none tabular-nums">{overall.counts[s]}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="dimensions" className="section">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <h2 id="dimensions" className="font-display text-[1.0625rem] leading-tight">
            By dimension
          </h2>
          <Legend />
        </div>
        <div className="panel divide-y divide-dashed divide-rule px-4">
          {DIMENSIONS.map((d) => {
            const s = dimensions[d];
            const signal = STANDING_SIGNAL[s.standing];
            return (
              <div
                key={d}
                className="grid gap-x-6 gap-y-2 py-3 md:grid-cols-[9rem_minmax(0,1fr)_16rem] md:items-center"
              >
                <div>
                  <p className="text-[0.875rem] font-medium">{DIMENSION_LABELS[d].label}</p>
                  <p className="text-xs text-ink-3">{DIMENSION_LABELS[d].verb}</p>
                </div>
                <p className="text-[0.8125rem] leading-relaxed text-ink-2">{DIMENSION_LABELS[d].description}</p>
                <div className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    {signal ? (
                      <SignalBadge signal={signal}>{STANDING_LABEL[s.standing]}</SignalBadge>
                    ) : (
                      <span className="chip-flat">Not yet</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SignalMeter counts={s.counts} label={DIMENSION_LABELS[d].label} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-ink-3">
          Fewer than three pieces of evidence in a dimension is indicative, not conclusive.
        </p>
      </section>

      {touched.length > 0 && (
        <section aria-labelledby="investigations" className="section">
          <h2 id="investigations" className="font-display text-[1.0625rem] leading-tight mb-5">
            By investigation
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {touched.map((inv) => {
              const comps = byCompetency(latest, inv.id);
              const answered = [...latest.values()].filter(
                (e) => e.exercise.kind === "stage" && e.exercise.investigationId === inv.id,
              ).length;
              return (
                <div key={inv.id} className="panel p-4">
                  <div className="flex items-baseline justify-between gap-4 pb-3">
                    <Link
                      href={`/investigations/${inv.id}/review`}
                      className="font-display text-[1rem] leading-tight hover:text-accent"
                    >
                      {inv.title}
                    </Link>
                    <span className="text-xs text-ink-3 shrink-0">
                      {answered} of {inv.stageCount} stages
                    </span>
                  </div>
                  <ul className="divide-y divide-dashed divide-rule">
                    {inv.competencies.map((c) => {
                      const s = comps.get(c.id);
                      return (
                        <li
                          key={c.id}
                          className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-4 py-2.5 text-sm"
                        >
                          <span title={c.description}>{c.label}</span>
                          {s ? (
                            <SignalMeter counts={s.counts} label={c.label} />
                          ) : (
                            <span className="text-xs text-ink-3">not yet exercised</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {conceptSummaries.length > 0 && (
        <section aria-labelledby="concepts" className="section">
          <h2 id="concepts" className="font-display text-[1.0625rem] leading-tight mb-1">
            By concept
          </h2>
          <p className="text-[0.8125rem] text-ink-3 mb-5">
            Weakest first. Each concept collects evidence from every stage and check that uses it.
          </p>
          <ul className="grid gap-x-10 sm:grid-cols-2">
            {conceptSummaries.map(({ id, title, s }) => (
              <li
                key={id}
                className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-4 border-b border-dashed border-rule py-2.5 text-[0.8125rem]"
              >
                <Link href={`/concepts/${id}`} className="font-medium hover:text-accent truncate">
                  {title}
                </Link>
                <SignalMeter counts={s.counts} label={title} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(revisit.length > 0 || awaitingRefs.length > 0) && (
        <section aria-labelledby="revisit" className="section">
          <h2 id="revisit" className="font-display text-[1.0625rem] leading-tight mb-1">
            Worth revisiting
          </h2>
          <p className="text-[0.8125rem] text-ink-3 mb-5">
            Answering again replaces the earlier evidence, so improvement shows up here instead of averaging away.
          </p>
          <ul className="panel divide-y divide-dashed divide-rule">
            {awaitingRefs.map((ref) => {
              const l = label(ref);
              if (!l) return null;
              return (
                <li key={exerciseKey(ref)}>
                  <Link
                    href={l.href}
                    className="group flex items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-[0.8125rem] font-medium group-hover:text-accent">{l.title}</span>
                      <span className="block text-[0.75rem] text-ink-3">{l.source}</span>
                    </span>
                    <span className="chip-flat shrink-0">Needs your assessment</span>
                  </Link>
                </li>
              );
            })}
            {revisit.map((e) => {
              const l = label(e.exercise);
              if (!l) return null;
              return (
                <li key={e.key}>
                  <Link
                    href={l.href}
                    className="group flex items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-[0.8125rem] font-medium group-hover:text-accent">{l.title}</span>
                      <span className="block text-[0.75rem] text-ink-3">{l.source}</span>
                    </span>
                    <SignalBadge signal={e.evidence.signal} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
