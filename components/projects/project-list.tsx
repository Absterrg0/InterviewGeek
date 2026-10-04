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

  if (!state) return <div className="h-48 rounded-md bg-sunken" aria-busy="true" />;

  const taken = state.projects.map((p) => p.id);
  const latest = latestEvidence(state.attempts);
  const hasExample = state.projects.some((p) => p.name === "Subscription SaaS (example)");

  const create = (project: Project) => {
    saveProject(project);
    router.push(`/projects/${project.id}`);
  };

  return (
    <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="your-projects" className="min-w-0">
        <h2 id="your-projects" className="eyebrow mb-3">Your projects</h2>
        {state.projects.length === 0 ? (
          <div className="rounded-md border border-dashed border-rule-strong px-5 py-8 text-[0.9375rem] leading-relaxed text-ink-2">
            <p>
              No projects yet. Describe one you have built: its components, how requests and messages flow between
              them, and what must always be true. You will get questions about <em>your</em> system, the kind an
              interviewer asks when they say &ldquo;tell me about something you built&rdquo;.
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
          <ul className="border-t border-rule">
            {state.projects.map((p) => {
              const questions = projectQuestions(p);
              const counts = { strong: 0, partial: 0, gap: 0 };
              for (const q of questions) {
                const e = latest.get(exerciseKey({ kind: "project-question", projectId: p.id, questionId: q.id }));
                if (e) counts[e.evidence.signal]++;
              }
              const answered = counts.strong + counts.partial + counts.gap;
              return (
                <li key={p.id} className="border-b border-rule">
                  <Link href={`/projects/${p.id}`} className="group grid gap-x-8 gap-y-2 py-5 sm:grid-cols-[minmax(0,1fr)_14rem]">
                    <span className="min-w-0">
                      <span className="block font-medium group-hover:text-accent">{p.name}</span>
                      {p.summary && <span className="mt-1 block text-sm text-ink-2 line-clamp-2">{p.summary}</span>}
                      <span className="mt-1.5 block text-xs text-ink-3">
                        {p.components.length} components · {p.flows.length} flows · {p.invariants.length} invariants
                      </span>
                    </span>
                    <span className="text-sm sm:pt-0.5 space-y-1.5">
                      <span className="block text-ink-2">
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
            className="btn btn-ghost mt-4 -ml-3"
            onClick={() => create(exampleProject(uniqueSlug("subscription-saas", taken), new Date().toISOString()))}
          >
            Add the example project
          </button>
        )}
      </section>

      <section aria-labelledby="new-project">
        <h2 id="new-project" className="eyebrow mb-3">Describe a project</h2>
        <form
          className="space-y-4 rounded-md border border-rule bg-raised p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create(newProject(name, summary, taken));
          }}
        >
          <div>
            <label htmlFor="project-name" className="block text-sm font-medium mb-1.5">Name</label>
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
            <label htmlFor="project-summary" className="block text-sm font-medium mb-1.5">What does it do?</label>
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
          <button type="submit" className="btn btn-primary w-full" disabled={!name.trim()}>
            Create and describe its architecture
          </button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          Today you describe the model by hand. Connecting a repository to build it from code is planned; it will fill
          the same model, so your answers will carry over.
        </p>
      </section>
    </div>
  );
}
