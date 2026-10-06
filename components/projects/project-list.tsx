"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignalMeter } from "@/components/ui";
import { exampleProject } from "@/lib/domain/example-project";
import { exerciseKey, type Project } from "@/lib/domain/learner";
import { uniqueSlug } from "@/lib/domain/layout";
import { projectQuestions } from "@/lib/domain/project-questions";
import { latestEvidence } from "@/lib/domain/understanding";
import { saveProject, useLearnerState } from "@/lib/store/learner-store";

function newProject(name: string, summary: string, taken: string[]): Project {
  const now = new Date().toISOString();
  return {
    id: uniqueSlug(name, taken),
    name: name.trim(),
    summary: summary.trim(),
    source: { type: "manual" },
    components: [],
    flows: [],
    invariants: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function ProjectList() {
  const state = useLearnerState();
  const router = useRouter();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");

  if (!state) return <div className="section"><div className="h-48 well" aria-busy="true" /></div>;

  const taken = state.projects.map((p) => p.id);
  const latest = latestEvidence(state.attempts);
  const hasExample = state.projects.some((p) => p.name === "Subscription SaaS (example)");

  const create = (project: Project) => {
    saveProject(project);
    router.push(`/projects/${project.id}`);
  };

  return (
    <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <section aria-labelledby="your-projects" className="section min-w-0">
        <div className="mb-5 flex items-baseline gap-2.5">
          <span className="font-mono text-[0.625rem] tabular-nums text-ink-3">01</span>
          <h2 id="your-projects" className="font-display text-[1.0625rem] leading-tight">
            Your projects
          </h2>
        </div>
        {state.projects.length === 0 ? (
          <div className="tint px-5 py-6 text-[0.875rem] leading-relaxed text-ink">
            <p>
              No projects yet. Describe one you have built: its components, how requests and messages flow between them,
              and what must always be true. You will get questions about <em>your</em> system, the kind an interviewer
              asks when they say &ldquo;tell me about something you built&rdquo;.
            </p>
            {!hasExample && (
              <button
                type="button"
                className="btn btn-secondary mt-5"
                onClick={() => create(exampleProject(uniqueSlug("subscription-saas", taken), new Date().toISOString()))}
              >
                Explore an example project first
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {state.projects.map((p) => {
              const questions = projectQuestions(p);
              const counts = { strong: 0, partial: 0, gap: 0 };
              for (const q of questions) {
                const e = latest.get(
                  exerciseKey({
                    kind: "project-question",
                    projectId: p.id,
                    questionId: q.id,
                  }),
                );
                if (e) counts[e.evidence.signal]++;
              }
              const answered = counts.strong + counts.partial + counts.gap;
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="tile group grid gap-x-8 gap-y-3 p-4 sm:grid-cols-[minmax(0,1fr)_14rem]"
                  >
                    <span className="min-w-0">
                      <span className="block font-display text-[1rem] leading-tight group-hover:text-accent">
                        {p.name}
                      </span>
                      {p.summary && (
                        <span className="mt-1 block text-[0.8125rem] text-ink-2 line-clamp-2">{p.summary}</span>
                      )}
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        <span className="chip-flat">{p.components.length} components</span>
                        <span className="chip-flat">{p.flows.length} flows</span>
                        <span className="chip-flat">{p.invariants.length} invariants</span>
                      </span>
                    </span>
                    <span className="space-y-2 text-[0.8125rem] sm:pt-1">
                      <span className="block font-mono text-[0.6875rem] text-ink-2">
                        {answered} of {questions.length} questions answered
                      </span>
                      {answered > 0 && <SignalMeter counts={counts} label={`${p.name} answers`} />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {state.projects.length > 0 && !hasExample && (
          <button
            type="button"
            className="btn btn-ghost mt-5 -ml-3"
            onClick={() => create(exampleProject(uniqueSlug("subscription-saas", taken), new Date().toISOString()))}
          >
            Add the example project
          </button>
        )}
      </section>

      <section aria-labelledby="new-project" className="section">
        <div className="mb-5 flex items-baseline gap-2.5">
          <span className="font-mono text-[0.625rem] tabular-nums text-ink-3">02</span>
          <h2 id="new-project" className="font-display text-[1.0625rem] leading-tight">
            Describe a project
          </h2>
        </div>
        <form
          className="panel max-w-xl space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create(newProject(name, summary, taken));
          }}
        >
          <div>
            <label htmlFor="project-name" className="eyebrow mb-2 block">
              Name
            </label>
            <input
              id="project-name"
              className="field"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Course marketplace backend"
              required
            />
          </div>
          <div>
            <label htmlFor="project-summary" className="eyebrow mb-2 block">
              What does it do?
            </label>
            <textarea
              id="project-summary"
              className="field resize-y"
              rows={3}
              maxLength={2000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One or two sentences about what it does and who uses it."
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Create and describe its architecture
          </button>
        </form>
        <p className="mt-3 max-w-xl text-[0.75rem] leading-relaxed text-ink-3">
          Today you describe the model by hand. Connecting a repository to build it from code is planned; it will fill
          the same model, so your answers will carry over.
        </p>
      </section>
    </div>
  );
}
