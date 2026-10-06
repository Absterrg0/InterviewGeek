import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/page-header";
import { DataControls } from "@/components/understanding/data-controls";
import { UnderstandingView, type InvestigationOutline } from "@/components/understanding/understanding-view";
import { listConcepts, listInvestigations } from "@/lib/content";
import { listExercises } from "@/lib/content/exercises";
import type { CuratedLabels } from "@/lib/exercise-labels";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Understanding",
  description:
    "What your answers demonstrate, by dimension, investigation and concept.",
  path: "/understanding",
  noindex: true,
});

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
    <div>
      <PageHeader title="Understanding">
        What your answers demonstrate, not how much you have clicked. Only your latest answer to each exercise counts.
      </PageHeader>

      <UnderstandingView investigations={investigations} concepts={concepts} curated={curated} />

      <div className="grid gap-x-14 lg:grid-cols-2">
        <Section id="method" title="How evidence works">
          <div className="max-w-[66ch] space-y-3 text-[0.875rem] leading-relaxed text-ink-2">
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
              Every exercise trains some of six dimensions (trace, explain, defend, change, break, implement) and touches
              named concepts. An exercise&apos;s signal is its weakest part: a sound decision defended with missing
              reasoning is partial, not strong.
            </p>
          </div>
        </Section>
        <Section id="data" title="Your data">
          <DataControls />
        </Section>
      </div>
    </div>
  );
}
