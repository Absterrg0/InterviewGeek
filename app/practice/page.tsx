import type { Metadata } from "next";
import { ClaimDrill, type DrillConcept } from "@/components/practice/claim-drill";
import { DimensionPractice, type PracticeExercise } from "@/components/practice/dimension-practice";
import { Prose } from "@/components/prose";
import { listConcepts } from "@/lib/content";
import { listExercises } from "@/lib/content/exercises";

export const metadata: Metadata = {
  title: "Practice",
  description: "Claim checks and targeted practice by dimension.",
};

export default function PracticePage() {
  const concepts: DrillConcept[] = listConcepts().map((c) => ({ id: c.id, title: c.title, claims: c.claims }));
  const explanations = Object.fromEntries(
    listConcepts().flatMap((c) =>
      c.claims.map((claim) => [`${c.id}/${claim.id}`, <Prose key={claim.id} text={claim.explanation} className="prose-sm" />]),
    ),
  );
  const exercises: PracticeExercise[] = listExercises()
    .filter((e) => e.ref.kind === "stage" || e.ref.kind === "concept-explain")
    .map((e) => ({ key: e.key, ref: e.ref, title: e.title, source: e.source, href: e.href, dimensions: e.dimensions }));

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl leading-tight tracking-tight">Practice</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          Short, deliberate repetitions. Statements that sound right but are not, and the exercises that train the
          dimension you are weakest in.
        </p>
      </header>

      <div className="mt-12 grid gap-16 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="claims" className="min-w-0">
          <h2 id="claims" className="font-serif text-2xl tracking-tight">Claim check</h2>
          <p className="mt-2 mb-6 text-[0.9375rem] leading-relaxed text-ink-2 max-w-2xl">
            Eight statements from across the concepts. Engineers say many of them in design reviews. Decide whether
            each holds, fails, or depends on something, and know what it depends on.
          </p>
          <ClaimDrill concepts={concepts} explanations={explanations} />
        </section>
        <section aria-labelledby="dimension">
          <h2 id="dimension" className="font-serif text-2xl tracking-tight mb-4">By dimension</h2>
          <DimensionPractice exercises={exercises} />
        </section>
      </div>
    </div>
  );
}
