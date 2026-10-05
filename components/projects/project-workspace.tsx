"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExerciseWorkspace } from "@/components/exercise/workspace";
import { EMPTY_SLOTS } from "@/components/exercise/types";
import { InlineText, ProseView, type ConceptResolver } from "@/components/prose-core";
import { SystemMap } from "@/components/system-map";
import { SignalBadge, SignalMeter } from "@/components/ui";
import { exerciseKey, type Project } from "@/lib/domain/learner";
import { autoLayout } from "@/lib/domain/layout";
import {
  projectQuestions,
  QUESTION_GROUP_LABELS,
  QUESTION_GROUPS,
  type ProjectQuestion,
} from "@/lib/domain/project-questions";
import { exerciseStatus, latestEvidence, type ExerciseStatus } from "@/lib/domain/understanding";
import { deleteProject, saveProject, useLearnerState } from "@/lib/store/learner-store";
import { ModelEditor } from "./model-editor";

type Tab = "questions" | "model";

export function ProjectWorkspace({
  projectId,
  concepts,
}: {
  projectId: string;
  concepts: Record<string, { title: string; summary: string }>;
}) {
  const state = useLearnerState();
  if (!state) return <div className="section"><div className="h-96 well" aria-busy="true" /></div>;
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="section max-w-xl space-y-4">
        <h1 className="font-display text-[1.875rem] leading-tight">Project not found</h1>
        <p className="text-ink-2">
          There is no project with this address in this browser. Projects live in local storage, so they do not follow
          you between browsers unless you export and import them.
        </p>
        <Link href="/projects" className="btn btn-secondary">
          Back to your projects
        </Link>
      </div>
    );
  }
  return <ProjectView key={project.id} project={project} concepts={concepts} />;
}

function ProjectView({
  project,
  concepts,
}: {
  project: Project;
  concepts: Record<string, { title: string; summary: string }>;
}) {
  const state = useLearnerState();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() =>
    project.components.length === 0 || window.location.hash === "#model" ? "model" : "questions",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const attempts = state?.attempts ?? [];
  const questions = projectQuestions(project);
  const resolve: ConceptResolver = (id) => concepts[id];
  const updated = new Date(project.updatedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div>
      <header className="section rise">
        <div className="flex flex-wrap gap-1.5">
          <span className="chip">
            {project.source.type === "manual" ? "Described by hand" : "Analysed from repository"}
          </span>
          <span className="chip">Updated {updated}</span>
        </div>
        <h1 className="mt-4 font-display text-[1.875rem] leading-[1.1] text-balance sm:text-[2.25rem]">{project.name}</h1>
        {project.summary && (
          <p className="mt-3 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-2">{project.summary}</p>
        )}
      </header>

      {project.components.length > 0 && (
        <section aria-label="Architecture map" className="section">
          <SystemMap
            label={`${project.name} architecture`}
            components={autoLayout(project.components, project.flows)}
            flows={project.flows}
          />
        </section>
      )}

      <div className="section">
      <div
        className="inline-flex gap-0.5 rounded-[10px] bg-sunken p-[3px] shadow-[inset_0_0_0_1px_var(--rule-soft)]"
        role="group"
        aria-label="Project views"
      >
        {(["questions", "model"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-[7px] px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
              tab === t ? "bg-raised text-ink shadow-[var(--shadow-btn)]" : "text-ink-3 hover:text-ink"
            }`}
          >
            {t === "questions" ? `Questions about this system (${questions.length})` : "Architecture model"}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "questions" ? (
          <div>
            {project.components.length === 0 ? (
              <p className="mb-8 max-w-2xl text-[0.875rem] text-ink-2">
                Only the general questions apply until you describe the system.{" "}
                <button type="button" className="link" onClick={() => setTab("model")}>
                  Add components and flows
                </button>{" "}
                to get questions about your specific request paths, state and dependencies.
              </p>
            ) : null}
            <QuestionList project={project} questions={questions} attempts={attempts} resolve={resolve} />
          </div>
        ) : (
          <div>
            <ModelEditor
              key={project.updatedAt}
              project={project}
              onSave={(model) => {
                saveProject({
                  ...project,
                  ...model,
                  updatedAt: new Date().toISOString(),
                });
              }}
            />
            <div className="mt-2 border-t border-rule-soft pt-6">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[0.8125rem] text-ink-2">Delete this project and every answer about it?</p>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      router.push("/projects");
                      deleteProject(project.id);
                    }}
                  >
                    Delete project
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete project
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function QuestionList({
  project,
  questions,
  attempts,
  resolve,
}: {
  project: Project;
  questions: ProjectQuestion[];
  attempts: NonNullable<ReturnType<typeof useLearnerState>>["attempts"];
  resolve: ConceptResolver;
}) {
  const [open, setOpen] = useState<string | null>(() => {
    const hash = window.location.hash.slice(1);
    return questions.some((q) => q.id === hash) ? hash : null;
  });
  const refOf = (q: ProjectQuestion) => ({
    kind: "project-question" as const,
    projectId: project.id,
    questionId: q.id,
  });
  const latest = latestEvidence(attempts);
  const counts = { strong: 0, partial: 0, gap: 0 };
  const weak: ProjectQuestion[] = [];
  for (const q of questions) {
    const e = latest.get(exerciseKey(refOf(q)));
    if (!e) continue;
    counts[e.evidence.signal]++;
    if (e.evidence.signal !== "strong") weak.push(q);
  }
  const answered = counts.strong + counts.partial + counts.gap;

  return (
    <div className="space-y-10">
      <section aria-labelledby="coverage" className="tint grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          <h2 id="coverage" className="font-display text-[1.0625rem] leading-tight">
            How well you can explain it
          </h2>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-2 max-w-2xl">
            {answered === 0
              ? "Answer as you would in an interview, then compare your answer with what a strong one covers. Questions you cannot answer well are the parts of your own system to go and read."
              : `You have answered ${answered} of ${questions.length}. ${
                  weak.length === 0
                    ? "Every answer so far covered the key points."
                    : `${weak.length} came up short; those are the parts of ${project.name} worth going back to the code for.`
                }`}
          </p>
          {weak.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {weak.map((q) => (
                <li key={q.id}>
                  <a
                    href={`#${q.id}`}
                    onClick={() => setOpen(q.id)}
                    className="text-[0.8125rem] text-ink underline decoration-rule-strong underline-offset-4 hover:text-accent"
                  >
                    <InlineText text={q.title} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {answered > 0 && (
          <div className="lg:pt-2">
            <SignalMeter counts={counts} label={`${project.name} answers`} />
          </div>
        )}
      </section>

      {QUESTION_GROUPS.map((group) => {
        const inGroup = questions.filter((q) => q.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`group-${group}`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5">
              <h2 id={`group-${group}`} className="font-display text-[1rem] leading-tight">
                {QUESTION_GROUP_LABELS[group].label}
              </h2>
              <p className="text-[0.8125rem] text-ink-3">{QUESTION_GROUP_LABELS[group].description}</p>
            </div>
            <ul className="panel divide-y divide-rule-soft">
              {inGroup.map((q) => {
                const status = exerciseStatus(attempts, refOf(q));
                const isOpen = open === q.id;
                return (
                  <li key={q.id} id={q.id} className="scroll-mt-16">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`q-${q.id}`}
                      onClick={() => setOpen(isOpen ? null : q.id)}
                      className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                    >
                      <span className="min-w-0 text-[0.875rem] group-hover:text-accent">
                        <InlineText text={q.title} />
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <QuestionStatus status={status} />
                        <span className="knob size-6 font-mono text-[0.8125rem]" aria-hidden="true">
                          {isOpen ? "−" : "+"}
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div id={`q-${q.id}`} className="border-t border-rule-soft bg-well px-4 pb-6 pt-5 sm:px-6">
                        <ExerciseWorkspace
                          spec={{
                            ref: refOf(q),
                            interaction: q.interaction,
                            tags: q.tags,
                          }}
                          slots={{
                            ...EMPTY_SLOTS,
                            reference: <ProseView text={q.interaction.reference} resolve={resolve} />,
                          }}
                          context="practice"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function QuestionStatus({ status }: { status: ExerciseStatus }) {
  if (status === "unattempted") return <span className="chip-flat">Not answered</span>;
  if (status === "awaiting-assessment") return <span className="chip-flat">Needs assessment</span>;
  return <SignalBadge signal={status} />;
}
