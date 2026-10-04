"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { EMPTY_SLOTS, type ExerciseSpec, type InteractionSlots } from "@/components/exercise/types";
import { ExerciseWorkspace } from "@/components/exercise/workspace";
import { InlineText, ProseView, type ConceptResolver } from "@/components/prose-core";
import { SignalBadge } from "@/components/ui";
import { exerciseKey, type InterviewSession, type LearnerState } from "@/lib/domain/learner";
import { findProjectQuestion } from "@/lib/domain/project-questions";
import { sessionUrl } from "@/lib/interview-url";
import { finishInterview, linkInterviewAttempt, useLearnerState } from "@/lib/store/learner-store";

/** A curated item, rendered on the server. Project questions are resolved here instead. */
export type CuratedItem = {
  key: string;
  title: string;
  source: string;
  href: string;
  spec: ExerciseSpec;
  slots: InteractionSlots;
  context: ReactNode;
  reveal: ReactNode;
};

type Resolved = Omit<CuratedItem, "key">;

function resolveItem(
  item: InterviewSession["items"][number],
  curated: Map<string, CuratedItem>,
  state: LearnerState,
  resolve: ConceptResolver,
): Resolved | null {
  const ref = item.exercise;
  if (ref.kind !== "project-question") return curated.get(exerciseKey(ref)) ?? null;
  const project = state.projects.find((p) => p.id === ref.projectId);
  const question = project ? findProjectQuestion(project, ref.questionId) : undefined;
  if (!project || !question) return null;
  return {
    title: question.title,
    source: project.name,
    href: `/projects/${project.id}#${question.id}`,
    spec: { ref, interaction: question.interaction, tags: question.tags },
    slots: {
      ...EMPTY_SLOTS,
      reference: <ProseView text={question.interaction.reference} resolve={resolve} />,
    },
    context: (
      <p className="text-[0.875rem] leading-relaxed text-ink-2">
        About your project, <strong className="font-medium text-ink">{project.name}</strong>. Answer about the system as
        it is.
      </p>
    ),
    reveal: null,
  };
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function InterviewRunner({
  sessionId,
  curated,
  concepts,
}: {
  sessionId: string | null;
  curated: CuratedItem[];
  concepts: Record<string, { title: string; summary: string }>;
}) {
  const state = useLearnerState();
  if (!state) return <div className="section"><div className="h-96 well" aria-busy="true" /></div>;
  const session = state.interviews.find((s) => s.id === sessionId);
  if (!session) {
    return (
      <div className="section max-w-xl space-y-4">
        <h1 className="font-display text-[1.875rem] leading-tight">Session not found</h1>
        <p className="text-ink-2">
          This session is not stored in this browser. It may have been deleted, or started elsewhere.
        </p>
        <Link href="/interview" className="btn btn-secondary">
          Start a new session
        </Link>
      </div>
    );
  }
  const byKey = new Map(curated.map((c) => [c.key, c]));
  const missing = session.items.some(
    (i) => i.exercise.kind !== "project-question" && !byKey.has(exerciseKey(i.exercise)),
  );
  if (missing) {
    return (
      <div className="section max-w-xl space-y-4">
        <p className="text-ink-2">This link does not include the session&apos;s questions.</p>
        <Link href={sessionUrl(session)} className="btn btn-primary">
          Open the session
        </Link>
      </div>
    );
  }
  const resolve: ConceptResolver = (id) => concepts[id];
  const items = session.items.map((item) => resolveItem(item, byKey, state, resolve));
  return session.finishedAt ? (
    <Debrief session={session} items={items} />
  ) : (
    <Live key={session.id} session={session} items={items} />
  );
}

function Live({ session, items }: { session: InterviewSession; items: (Resolved | null)[] }) {
  const firstOpen = session.items.findIndex((i) => i.attemptId === null);
  const [index, setIndex] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const now = useNow(1000);
  const elapsed = now - new Date(session.startedAt).getTime();
  const budget = session.durationMinutes * 60_000;
  const answered = session.items.filter((i) => i.attemptId).length;
  const item = session.items[index];
  const resolved = items[index];
  const last = index === session.items.length - 1;

  return (
    <div>
      <div className="sticky top-12 z-20 border-b border-dashed border-rule bg-paper px-5 py-2.5 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ol
            className="flex flex-wrap gap-0.5 rounded-[10px] bg-sunken p-[3px] shadow-[inset_0_0_0_1px_var(--rule-soft)]"
            aria-label="Questions"
          >
            {session.items.map((it, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={`Question ${i + 1}${it.attemptId ? ", answered" : ""}`}
                  className={`relative grid size-7 place-items-center rounded-[7px] font-mono text-[0.6875rem] tabular-nums transition-colors ${
                    i === index
                      ? "bg-raised text-ink shadow-[var(--shadow-btn)]"
                      : it.attemptId
                        ? "text-ink"
                        : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {i + 1}
                  {it.attemptId && (
                    <span className="led led-strong absolute right-0.5 top-0.5 size-1" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ol>
          <p
            className="chip-flat h-7 gap-2 px-2.5 font-mono text-[0.8125rem] tabular-nums"
            aria-label="Elapsed time"
          >
            <span className={`led ${elapsed > budget ? "led-partial" : "led-strong"} size-1.5`} aria-hidden="true" />
            <span className="text-ink">{clock(elapsed)}</span>
            <span className="text-ink-3">/ {clock(budget)}</span>
            {elapsed > budget && <span className="font-sans text-xs font-medium text-signal-partial">over time</span>}
          </p>
        </div>
      </div>

      {item && (
        <article key={index} className="section">
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">
              Question {index + 1} of {session.items.length}
            </span>
            <span className="chip">{item.section}</span>
          </div>
          {resolved ? (
            <>
              <h1 className="mt-4 font-display text-[1.75rem] leading-[1.1] text-balance sm:text-[2rem]">
                <InlineText text={resolved.title} />
              </h1>
              <p className="mt-2 text-[0.8125rem] text-ink-3">{resolved.source}</p>
              <div className="mt-6 max-w-[66ch] space-y-5">{resolved.context}</div>
              <div className="mt-8 border-t border-dashed border-rule pt-8">
                <ExerciseWorkspace
                  spec={resolved.spec}
                  slots={resolved.slots}
                  context="interview"
                  deferFeedback
                  pinned={{
                    attemptId: item.attemptId,
                    draftKey: `interview:${session.id}:${index}`,
                    onRecorded: (attemptId) => linkInterviewAttempt(session.id, index, attemptId),
                  }}
                />
              </div>
            </>
          ) : (
            <p className="mt-4 text-ink-2">
              This question is no longer available (its project or content changed). Skip it.
            </p>
          )}
        </article>
      )}

      <div className="section flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-ghost -ml-3"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Previous question
        </button>
        <div className="flex flex-wrap items-center gap-3">
          {!last && (
            <button type="button" className="btn btn-secondary" onClick={() => setIndex(index + 1)}>
              {item?.attemptId ? "Next question" : "Skip for now"}
            </button>
          )}
          {confirmFinish ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="text-[0.8125rem] text-ink-2">
                {session.items.length - answered} unanswered. Finish anyway?
              </span>
              <button type="button" className="btn btn-primary" onClick={() => finishInterview(session.id)}>
                Finish
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmFinish(false)}>
                Keep going
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={last || answered === session.items.length ? "btn btn-primary" : "btn btn-ghost"}
              onClick={() => (answered === session.items.length ? finishInterview(session.id) : setConfirmFinish(true))}
            >
              Finish and debrief
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Debrief({ session, items }: { session: InterviewSession; items: (Resolved | null)[] }) {
  const state = useLearnerState();
  const attempts = new Map((state?.attempts ?? []).map((a) => [a.id, a]));
  const took = session.finishedAt ? new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime() : 0;
  const answered = session.items.filter((i) => i.attemptId).length;
  const awaiting = session.items.filter((i) => i.attemptId && attempts.get(i.attemptId)?.evidence === null).length;

  return (
    <div>
      <header className="section rise">
        <span className="chip">Interview debrief</span>
        <h1 className="mt-4 font-display text-[1.875rem] leading-[1.1] sm:text-[2.25rem]">How it went</h1>
        <p className="mt-3 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-2">
          You answered {answered} of {session.items.length} in {clock(took)} of a {session.durationMinutes}-minute
          budget.{" "}
          {awaiting > 0
            ? `${awaiting} written answer${awaiting === 1 ? "" : "s"} still need${awaiting === 1 ? "s" : ""} your assessment below.`
            : "Everything answered has been assessed."}
        </p>
      </header>

      <div className="section">
      <ol className="panel divide-y divide-dashed divide-rule px-4">
        {session.items.map((item, i) => {
          const attempt = item.attemptId ? attempts.get(item.attemptId) : undefined;
          return (
            <li key={i} className="flex items-center justify-between gap-4 py-3 text-[0.8125rem]">
              <a href={`#item-${i}`} className="min-w-0 hover:text-accent">
                <span className="mr-2.5 font-mono text-[0.625rem] tabular-nums text-ink-3">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-medium">{item.section}</span>
                {items[i] && (
                  <span className="text-ink-3">
                    : <InlineText text={items[i].title} />
                  </span>
                )}
              </a>
              <span className="shrink-0">
                {!attempt ? (
                  <span className="chip-flat">Skipped</span>
                ) : attempt.evidence ? (
                  <SignalBadge signal={attempt.evidence.signal} />
                ) : (
                  <span className="chip-flat">Needs assessment</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      </div>
      <div>
        {session.items.map((item, i) => {
          const resolved = items[i];
          return (
            <section
              key={i}
              id={`item-${i}`}
              aria-labelledby={`item-${i}-title`}
              className="section scroll-mt-14"
            >
              <p className="eyebrow">
                Question {i + 1}: {item.section}
              </p>
              <h2 id={`item-${i}-title`} className="mt-2 font-display text-[1.125rem] leading-snug">
                {resolved ? <InlineText text={resolved.title} /> : "Unavailable question"}
              </h2>
              {resolved && <p className="mt-1 text-[0.8125rem] text-ink-3">{resolved.source}</p>}
              <div className="mt-6">
                {!resolved ? null : item.attemptId ? (
                  <ExerciseWorkspace
                    spec={resolved.spec}
                    slots={resolved.slots}
                    reveal={resolved.reveal}
                    context="interview"
                    pinned={{
                      attemptId: item.attemptId,
                      draftKey: `interview:${session.id}:${i}`,
                      onRecorded: () => {},
                    }}
                  />
                ) : (
                  <p className="text-[0.875rem] text-ink-2">
                    Skipped.{" "}
                    <Link href={resolved.href} className="link">
                      Work through it properly
                    </Link>{" "}
                    when you have time.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="section flex flex-wrap gap-2">
        <Link href="/interview" className="btn btn-primary">
          Start another session
        </Link>
        <Link href="/understanding" className="btn btn-secondary">
          See your understanding
        </Link>
      </div>
    </div>
  );
}
