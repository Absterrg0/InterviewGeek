import type { Metadata } from "next";
import { DataControls } from "@/components/understanding/data-controls";
import { UnderstandingView, type InvestigationOutline } from "@/components/understanding/understanding-view";
import { listConcepts, listInvestigations } from "@/lib/content";
import { listExercises } from "@/lib/content/exercises";
import type { CuratedLabels } from "@/lib/exercise-labels";

export const metadata: Metadata = {
  title: "Understanding",
  description: "What your answers demonstrate, by dimension, investigation and concept.",
};

export default function UnderstandingPage() {
  const investigations: InvestigationOutline[] = listInvestigations().map((inv) => ({
    id: inv.id,
    title: inv.title,
    stageCount: inv.stages.length,
    firstStageId: inv.stages[0]?.id ?? "",
    competencies: inv.competencies,
  }));
  const concepts = Object.fromEntries(listConcepts().map((c) => [c.id, c.title]));
  const curated: CuratedLabels = Object.fromEntries(
    listExercises().map((e) => [e.key, { title: e.title, source: e.source, href: e.href }]),
  );

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <header className="max-w-2xl mb-12">
        <h1 className="font-serif text-4xl leading-tight tracking-tight">Understanding</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          What your answers demonstrate, not how much you have clicked. Only your latest answer to each exercise
          counts.
        </p>
      </header>

      <UnderstandingView investigations={investigations} concepts={concepts} curated={curated} />

      <div className="mt-20 grid gap-12 lg:grid-cols-2 border-t border-rule pt-10">
        <section aria-labelledby="method">
          <h2 id="method" className="font-serif text-2xl tracking-tight mb-4">How evidence works</h2>
          <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink-2">
            <p>
              <strong className="font-medium text-ink">Checked</strong> evidence comes from comparing your answer with an
              authored key: which option you chose and how it is assessed, your verdicts on claims, your sequence, the
              lines you flagged.
            </p>
            <p>
              <strong className="font-medium text-ink">Self-assessed</strong> evidence comes from your written reasoning.
              After seeing the reference, you mark which specific points your answer covered. Nothing grades your writing
              automatically, so it is only as honest as your marks.
            </p>
            <p>
              Every exercise trains some of six dimensions (trace, explain, defend, change, break, implement) and
              touches named concepts. An exercise&apos;s signal is its weakest part: a sound decision defended with
              missing reasoning is partial, not strong.
            </p>
          </div>
        </section>
        <section aria-labelledby="data">
          <h2 id="data" className="font-serif text-2xl tracking-tight mb-4">Your data</h2>
          <DataControls />
        </section>
      </div>
    </div>
  );
}
