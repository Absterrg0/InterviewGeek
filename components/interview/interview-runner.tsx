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
    slots: { ...EMPTY_SLOTS, reference: <ProseView text={question.interaction.reference} resolve={resolve} /> },
    context: (
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
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
  if (!state) return <div className="h-96 rounded-md bg-sunken" aria-busy="true" />;
  const session = state.interviews.find((s) => s.id === sessionId);
  if (!session) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="font-serif text-3xl tracking-tight">Session not found</h1>
        <p className="text-ink-2">This session is not stored in this browser. It may have been deleted, or started elsewhere.</p>
        <Link href="/interview" className="btn btn-secondary">Start a new session</Link>
      </div>
    );
  }
  const byKey = new Map(curated.map((c) => [c.key, c]));
  const missing = session.items.some((i) => i.exercise.kind !== "project-question" && !byKey.has(exerciseKey(i.exercise)));
  if (missing) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="text-ink-2">This link does not include the session&apos;s questions.</p>
        <Link href={sessionUrl(session)} className="btn btn-primary">Open the session</Link>
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
      <div className="sticky top-14 z-20 -mx-5 sm:-mx-8 mb-8 border-b border-rule bg-paper/95 px-5 sm:px-8 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ol className="flex gap-1.5" aria-label="Questions">
            {session.items.map((it, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={`Question ${i + 1}${it.attemptId ? ", answered" : ""}`}
                  className={`grid size-7 place-items-center rounded font-mono text-xs border transition-colors ${
                    i === index
                      ? "border-ink bg-ink text-paper"
                      : it.attemptId
                        ? "border-rule-strong bg-sunken text-ink"
                        : "border-rule text-ink-3 hover:text-ink"
                  }`}
                >
                  {i + 1}
                </button>
              </li>
            ))}
          </ol>
          <p className="font-mono text-sm tabular-nums" aria-label="Elapsed time">
            <span className="text-ink">{clock(elapsed)}</span>
            <span className="text-ink-3"> / {clock(budget)}</span>
            {elapsed > budget && <span className="ml-2 text-ink-2">over time</span>}
          </p>
        </div>
      </div>

      {item && (
        <article key={index} className="max-w-[46rem]">
          <p className="eyebrow">
            Question {index + 1} of {session.items.length} · {item.section}
          </p>
          {resolved ? (
            <>
              <h1 className="mt-3 font-serif text-3xl leading-tight tracking-tight">
                <InlineText text={resolved.title} />
              </h1>
              <p className="mt-1 text-sm text-ink-3">{resolved.source}</p>
              <div className="mt-6 space-y-6">{resolved.context}</div>
              <div className="mt-8 border-t border-rule pt-8">
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
            <p className="mt-4 text-ink-2">This question is no longer available (its project or content changed). Skip it.</p>
          )}
        </article>
      )}

      <div className="mt-12 max-w-[46rem] flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6">
        <button type="button" className="btn btn-ghost -ml-3" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          ← Previous
        </button>
        <div className="flex flex-wrap items-center gap-3">
          {!last && (
            <button type="button" className="btn btn-secondary" onClick={() => setIndex(index + 1)}>
              {item?.attemptId ? "Next question" : "Skip for now"}
            </button>
          )}
          {confirmFinish ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-2">
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
    <div className="max-w-[46rem]">
      <header>
        <p className="eyebrow">Interview debrief</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight">How it went</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          You answered {answered} of {session.items.length} in {clock(took)} of a {session.durationMinutes}-minute budget.{" "}
          {awaiting > 0
            ? `${awaiting} written answer${awaiting === 1 ? "" : "s"} still need${awaiting === 1 ? "s" : ""} your assessment below.`
            : "Everything answered has been assessed."}
        </p>
      </header>

      <ol className="mt-8 border-y border-rule divide-y divide-rule">
        {session.items.map((item, i) => {
          const attempt = item.attemptId ? attempts.get(item.attemptId) : undefined;
          return (
            <li key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
              <a href={`#item-${i}`} className="min-w-0 hover:text-accent">
                <span className="font-mono text-xs text-ink-3 mr-2">{String(i + 1).padStart(2, "0")}</span>
                {item.section}
                {items[i] && <span className="text-ink-3">: <InlineText text={items[i].title} /></span>}
              </a>
              <span className="shrink-0">
                {!attempt ? (
                  <span className="text-xs text-ink-3">Skipped</span>
                ) : attempt.evidence ? (
                  <SignalBadge signal={attempt.evidence.signal} />
                ) : (
                  <span className="text-xs text-ink-2">Needs assessment</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-16 space-y-20">
        {session.items.map((item, i) => {
          const resolved = items[i];
          return (
            <section key={i} id={`item-${i}`} aria-labelledby={`item-${i}-title`} className="scroll-mt-20">
              <p className="eyebrow">
                {String(i + 1).padStart(2, "0")} · {item.section}
              </p>
              <h2 id={`item-${i}-title`} className="mt-2 font-serif text-2xl leading-snug tracking-tight">
                {resolved ? <InlineText text={resolved.title} /> : "Unavailable question"}
              </h2>
              {resolved && <p className="mt-1 text-sm text-ink-3">{resolved.source}</p>}
              <div className="mt-6">
                {!resolved ? null : item.attemptId ? (
                  <ExerciseWorkspace
                    spec={resolved.spec}
                    slots={resolved.slots}
                    reveal={resolved.reveal}
                    context="interview"
                    pinned={{ attemptId: item.attemptId, draftKey: `interview:${session.id}:${i}`, onRecorded: () => {} }}
                  />
                ) : (
                  <p className="text-[0.9375rem] text-ink-2">
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

      <div className="mt-20 border-t border-rule pt-6 flex flex-wrap gap-3">
        <Link href="/interview" className="btn btn-primary">Start another session</Link>
        <Link href="/understanding" className="btn btn-secondary">See your understanding</Link>
      </div>
    </div>
  );
}
