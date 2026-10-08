import type { Metadata } from "next";
import Link from "next/link";
import { DIFFICULTY } from "@/components/investigation/difficulty";
import { InterviewSetup } from "@/components/interview/interview-setup";
import { PageHeader } from "@/components/page-header";
import { listInvestigations } from "@/lib/content";
import { listExercises } from "@/lib/content/exercises";
import { DESIGN_ROUND_MINUTES } from "@/lib/domain/design-round";
import type { InterviewCandidate } from "@/lib/domain/interview";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Mock System Design Interview",
  description:
    "Two mock interview formats: a full system design round from a blank page, or a timed mix of decisions, failure diagnosis, concept recall and a defense of your own project.",
  path: "/interview",
});

export default function InterviewPage() {
  const candidates: InterviewCandidate[] = listExercises().map((e) => ({
    key: e.key,
    ref: e.ref,
    interactionKind: e.interactionKind,
    phase: e.phase,
    eventKind: e.eventKind,
    dimensions: e.dimensions,
    conceptIds: e.conceptIds,
    minutes: e.minutes,
  }));
  const investigations = listInvestigations();
  return (
    <div>
      <PageHeader
        title="Mock system design interview"
        meta={`${investigations.length} systems and ${candidates.length} questions · free, no signup`}
      >
        Two formats. A full round is the interview as it runs: one system, a blank page, and you decide what to cover. A
        mixed session is a timed set of shorter questions drawn from what you have been studying, with an honest debrief.
      </PageHeader>

      <section aria-labelledby="full-round" className="section pt-0 sm:pt-0">
        <div className="mb-5 max-w-[66ch]">
          <h2 id="full-round" className="flex items-baseline gap-2 font-display text-[1.25rem] leading-tight">
            <span className="font-mono text-[0.8125rem] text-ink-3">01</span>A full design round
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
            {DESIGN_ROUND_MINUTES} minutes on one system: requirements, estimates, the design, deep dives, and what breaks.
            Afterwards you compare every section with a reference design. Pick a system you have not studied yet for a
            real test, or one you have for a check of what stuck.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {investigations.map((inv) => (
            <li key={inv.id}>
              <Link href={`/investigations/${inv.id}/design`} className="tile group block h-full px-4 py-3">
                <span className="block text-[0.875rem] font-medium group-hover:text-accent">{inv.searchTitle}</span>
                <span className="mt-0.5 block text-[0.75rem] text-ink-3">{DIFFICULTY[inv.difficulty]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mixed-session">
        <div className="max-w-[66ch]">
          <h2 id="mixed-session" className="flex items-baseline gap-2 font-display text-[1.25rem] leading-tight">
            <span className="font-mono text-[0.8125rem] text-ink-3">02</span>A mixed session
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
            Explain a mechanism, make a design call, reason through a failure, and defend a system, ideally one you built.
          </p>
        </div>
        <InterviewSetup candidates={candidates} />
      </section>
    </div>
  );
}
