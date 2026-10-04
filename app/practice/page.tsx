import type { Metadata } from "next";
import { ClaimDrill, type DrillConcept } from "@/components/practice/claim-drill";
import { DimensionPractice, type PracticeExercise } from "@/components/practice/dimension-practice";
import { PageHeader, Section } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { listConcepts } from "@/lib/content";
import { listExercises } from "@/lib/content/exercises";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "System Design Practice",
  description:
    "Quick system design practice: check common engineering claims and drill the dimensions interviewers probe.",
  path: "/practice",
});

export default function PracticePage() {
  const concepts: DrillConcept[] = listConcepts().map((c) => ({
    id: c.id,
    title: c.title,
    claims: c.claims,
  }));
  const explanations = Object.fromEntries(
    listConcepts().flatMap((c) =>
      c.claims.map((claim) => [
        `${c.id}/${claim.id}`,
        <Prose key={claim.id} text={claim.explanation} className="prose-sm" />,
      ]),
    ),
  );
  const exercises: PracticeExercise[] = listExercises()
    .filter((e) => e.ref.kind === "stage" || e.ref.kind === "concept-explain")
    .map((e) => ({
      key: e.key,
      ref: e.ref,
      title: e.title,
      source: e.source,
      href: e.href,
      dimensions: e.dimensions,
    }));

  return (
    <div>
      <PageHeader title="Practice">
        Short, deliberate repetitions. Statements that sound right but are not, and the exercises that train the
        dimension you are weakest in.
      </PageHeader>

      <Section
        id="claims"
        n={1}
        title="Claim check"
        description="Eight statements engineers say in design reviews. Does each hold, fail, or depend on something?"
      >
        <ClaimDrill concepts={concepts} explanations={explanations} />
      </Section>
      <Section
        id="dimension"
        n={2}
        title="By dimension"
        description="Every exercise that trains one dimension, weakest evidence first."
      >
        <DimensionPractice exercises={exercises} />
      </Section>
    </div>
  );
}
