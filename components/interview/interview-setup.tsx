"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Segmented } from "@/components/ui";
import { composeInterview, DURATIONS, type Duration, type Focus, type InterviewCandidate } from "@/lib/domain/interview";
import type { InterviewSession } from "@/lib/domain/learner";
import { projectQuestions } from "@/lib/domain/project-questions";
import { latestEvidence } from "@/lib/domain/understanding";
import { sessionUrl } from "@/lib/interview-url";
import { deleteInterview, startInterview, useLearnerState } from "@/lib/store/learner-store";

const FOCUS: { value: Focus; label: string; description: string }[] = [
  { value: "balanced", label: "Balanced", description: "Recall, decisions, tradeoffs, failure and a defense, as a typical loop would." },
  { value: "failure", label: "Failure-heavy", description: "More time on what breaks: crashes, duplicates, timeouts, partial failure." },
  { value: "weakest", label: "My weak spots", description: "Weighted towards exercises and concepts where your evidence is weakest." },
];

export function InterviewSetup({ candidates }: { candidates: InterviewCandidate[] }) {
  const state = useLearnerState();
  const router = useRouter();
  const [duration, setDuration] = useState<Duration>(45);
  const [focus, setFocus] = useState<Focus>("balanced");
  const [projectChoice, setProjectChoice] = useState<string | null>(null);

  if (!state) return <div className="h-72 rounded-md bg-sunken" aria-busy="true" />;

  const latest = latestEvidence(state.attempts);
  const projectId = projectChoice ?? state.projects[0]?.id ?? "";
  const project = state.projects.find((p) => p.id === projectId);
  const sessions = [...state.interviews].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const start = () => {
    const projectCandidates: InterviewCandidate[] = project
      ? projectQuestions(project).map((q) => ({
          key: `project:${project.id}/${q.id}`,
          ref: { kind: "project-question", projectId: project.id, questionId: q.id },
          interactionKind: "open",
          phase: null,
          eventKind: null,
          dimensions: q.tags.dimensions,
          conceptIds: q.tags.conceptIds,
          minutes: 8,
        }))
      : [];
    const items = composeInterview({
      candidates: [...candidates, ...projectCandidates],
      duration,
      focus,
      latest,
      seed: crypto.randomUUID(),
    });
    const session: InterviewSession = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      durationMinutes: duration,
      focus,
      items: items.map((i) => ({ exercise: i.ref, section: i.section, attemptId: null })),
      finishedAt: null,
    };
    startInterview(session);
    router.push(sessionUrl(session));
  };

  return (
    <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="setup" className="space-y-8 max-w-2xl">
        <h2 id="setup" className="sr-only">Set up a session</h2>
        <Segmented
          name="duration"
          legend="Length"
          options={DURATIONS.map((d) => ({ value: String(d), label: `${d} min` }))}
          value={String(duration)}
          onChange={(v) => setDuration(Number(v) as Duration)}
        />
        <fieldset>
          <legend className="text-sm text-ink-2 mb-2">Focus</legend>
          <div className="space-y-2">
            {FOCUS.map((f) => {
              const disabled = f.value === "weakest" && latest.size === 0;
              return (
                <label
                  key={f.value}
                  className={`flex gap-3 rounded-md border p-3.5 transition-colors has-[:checked]:border-ink has-[:checked]:bg-raised has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                    disabled ? "opacity-50 cursor-not-allowed border-rule" : "cursor-pointer border-rule hover:border-rule-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="focus"
                    className="mt-1 accent-[var(--ink)]"
                    checked={focus === f.value}
                    disabled={disabled}
                    onChange={() => setFocus(f.value)}
                  />
                  <span>
                    <span className="block font-medium text-[0.9375rem]">{f.label}</span>
                    <span className="block text-sm text-ink-2">
                      {disabled ? "Available once you have some evidence to target." : f.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <p className="text-sm text-ink-2 mb-2">Project to defend</p>
          {state.projects.length === 0 ? (
            <p className="text-sm text-ink-3">
              Without a project, the last question defends a curated design instead.{" "}
              <Link href="/projects" className="link">Describe one of yours</Link> to be asked about it.
            </p>
          ) : (
            <select
              className="field max-w-sm"
              aria-label="Project to defend"
              value={projectId}
              onChange={(e) => setProjectChoice(e.target.value)}
            >
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="">No project, use a curated design</option>
            </select>
          )}
        </div>
        <div className="space-y-3">
          <button type="button" className="btn btn-primary" onClick={start}>
            Start a {duration}-minute session
          </button>
          <p className="text-xs text-ink-3 leading-relaxed">
            You answer every question first. Feedback, references and self-assessment wait for the debrief, as in a
            real interview. The clock is a guide, not a penalty.
          </p>
        </div>
      </section>

      <section aria-labelledby="history">
        <h2 id="history" className="eyebrow mb-3">Past sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-3">None yet.</p>
        ) : (
          <ul className="border-t border-rule">
            {sessions.map((s) => {
              const answered = s.items.filter((i) => i.attemptId).length;
              const date = new Date(s.startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
              return (
                <li key={s.id} className="border-b border-rule flex items-center justify-between gap-3 py-3">
                  <Link href={sessionUrl(s)} className="group min-w-0">
                    <span className="block text-sm group-hover:text-accent">
                      {date} · {s.durationMinutes} min · {FOCUS.find((f) => f.value === s.focus)?.label}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {answered} of {s.items.length} answered · {s.finishedAt ? "debrief" : "in progress"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="text-xs text-ink-3 hover:text-signal-gap"
                    onClick={() => deleteInterview(s.id)}
                    aria-label={`Delete session from ${date}`}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
