"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Segmented } from "@/components/ui";
import {
  composeInterview,
  DURATIONS,
  type Duration,
  type Focus,
  type InterviewCandidate,
} from "@/lib/domain/interview";
import type { InterviewSession } from "@/lib/domain/learner";
import { projectQuestions } from "@/lib/domain/project-questions";
import { latestEvidence } from "@/lib/domain/understanding";
import { sessionUrl } from "@/lib/interview-url";
import { deleteInterview, startInterview, useLearnerState } from "@/lib/store/learner-store";
import { useHydrated } from "@/lib/use-hydrated";

const FOCUS: { value: Focus; label: string; description: string }[] = [
  {
    value: "balanced",
    label: "Balanced",
    description: "Recall, decisions, tradeoffs, failure and a defense, as a typical loop would.",
  },
  {
    value: "failure",
    label: "Failure-heavy",
    description: "More time on what breaks: crashes, duplicates, timeouts, partial failure.",
  },
  {
    value: "weakest",
    label: "My weak spots",
    description: "Weighted towards exercises and concepts where your evidence is weakest.",
  },
];

export function InterviewSetup({ candidates }: { candidates: InterviewCandidate[] }) {
  const state = useLearnerState();
  const hydrated = useHydrated();
  const router = useRouter();
  const [duration, setDuration] = useState<Duration>(45);
  const [focus, setFocus] = useState<Focus>("balanced");
  const [projectChoice, setProjectChoice] = useState<string | null>(null);

  // The form is the same for everyone; only the few parts that read stored
  // progress wait for hydration, so the page itself paints from the server HTML.
  const learner = hydrated ? state : null;
  const latest = learner ? latestEvidence(learner.attempts) : null;
  const projects = learner?.projects ?? [];
  const projectId = projectChoice ?? projects[0]?.id ?? "";
  const project = projects.find((p) => p.id === projectId);
  const sessions = learner ? [...learner.interviews].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [];

  const start = () => {
    const projectCandidates: InterviewCandidate[] = project
      ? projectQuestions(project).map((q) => ({
          key: `project:${project.id}/${q.id}`,
          ref: {
            kind: "project-question",
            projectId: project.id,
            questionId: q.id,
          },
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
      latest: latest ?? new Map(),
      seed: crypto.randomUUID(),
    });
    const session: InterviewSession = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      durationMinutes: duration,
      focus,
      items: items.map((i) => ({
        exercise: i.ref,
        section: i.section,
        attemptId: null,
      })),
      finishedAt: null,
    };
    startInterview(session);
    router.push(sessionUrl(session));
  };

  return (
    <>
      <section aria-labelledby="setup" className="section space-y-7">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[0.625rem] tabular-nums text-ink-3">01</span>
          <h2 id="setup" className="font-display text-[1.0625rem] leading-tight">
            Set up a session
          </h2>
        </div>
        <Segmented
          name="duration"
          legend="Length"
          options={DURATIONS.map((d) => ({
            value: String(d),
            label: `${d} min`,
          }))}
          value={String(duration)}
          onChange={(v) => setDuration(Number(v) as Duration)}
        />
        <fieldset>
          <legend className="eyebrow mb-2">Focus</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {FOCUS.map((f) => {
              const disabled = f.value === "weakest" && (latest?.size ?? 0) === 0;
              return (
                <label key={f.value} className={`choice flex-col ${disabled ? "opacity-50 cursor-not-allowed!" : ""}`}>
                  <input
                    type="radio"
                    name="focus"
                    className="sr-only peer"
                    checked={focus === f.value}
                    disabled={disabled}
                    onChange={() => setFocus(f.value)}
                  />
                  <span
                    className="led led-off peer-checked:bg-accent-solid peer-checked:shadow-none"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-[0.875rem] font-medium">{f.label}</span>
                    <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-ink-2">
                      {disabled ? "Available once you have some evidence to target." : f.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <p className="eyebrow mb-2">Project to defend</p>
          {projects.length === 0 ? (
            <p className="text-[0.8125rem] text-ink-2">
              Without a project, the last question defends a curated design instead.{" "}
              <Link href="/projects" className="link">
                Describe one of yours
              </Link>{" "}
              to be asked about it.
            </p>
          ) : (
            <select
              className="field max-w-sm"
              aria-label="Project to defend"
              value={projectId}
              onChange={(e) => setProjectChoice(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="">No project, use a curated design</option>
            </select>
          )}
        </div>
        <div className="space-y-3 border-t border-rule-soft pt-6">
          <button type="button" className="btn btn-primary" onClick={start}>
            Start a {duration}-minute session
          </button>
          <p className="max-w-xl text-[0.8125rem] leading-relaxed text-ink-3">
            You answer every question first. Feedback, references and self-assessment wait for the debrief, as in a real
            interview. The clock is a guide, not a penalty.
          </p>
        </div>
      </section>

      <section aria-labelledby="history" className="section space-y-4">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[0.625rem] tabular-nums text-ink-3">02</span>
          <h2 id="history" className="font-display text-[1.0625rem] leading-tight">
            Past sessions
          </h2>
        </div>
        {sessions.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-3">None yet. Your sessions and their debriefs will be listed here.</p>
        ) : (
          <ul className="panel divide-y divide-rule-soft">
            {sessions.map((s) => {
              const answered = s.items.filter((i) => i.attemptId).length;
              const date = new Date(s.startedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              });
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link href={sessionUrl(s)} className="group flex min-w-0 gap-3">
                    <span
                      className={`led ${s.finishedAt ? "led-strong" : "led-partial"} mt-1.5 size-1.5`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.8125rem] font-medium group-hover:text-accent">
                        {date}, {s.durationMinutes} min, {FOCUS.find((f) => f.value === s.focus)?.label.toLowerCase()}
                      </span>
                      <span className="block text-xs text-ink-3">
                        {answered} of {s.items.length} answered, {s.finishedAt ? "debriefed" : "in progress"}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="text-xs font-medium text-ink-3 hover:text-signal-gap"
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
    </>
  );
}
