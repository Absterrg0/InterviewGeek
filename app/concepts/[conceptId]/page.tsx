import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConceptStanding } from "@/components/concept-standing";
import { buildSlots } from "@/components/exercise/slots";
import { ExerciseWorkspace } from "@/components/exercise/workspace";
import { Prose } from "@/components/prose";
import { SectionHeading } from "@/components/ui";
import { resolveExercise } from "@/lib/content/exercises";
import { conceptsReferencing, getConcept, listConcepts, stagesUsingConcept } from "@/lib/content";
import { DOMAIN_LABELS, PHASE_LABELS } from "@/lib/domain/content";

export function generateStaticParams() {
  return listConcepts().map((c) => ({ conceptId: c.id }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/concepts/[conceptId]">): Promise<Metadata> {
  const { conceptId } = await props.params;
  const c = getConcept(conceptId);
  return c ? { title: c.title, description: c.summary } : {};
}

function Bullets({ items }: { items: { title: string; body: string }[] }) {
  return (
    <dl className="space-y-4">
      {items.map((item) => (
        <div key={item.title}>
          <dt className="font-medium">{item.title}</dt>
          <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">{item.body}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ConceptPage(props: PageProps<"/concepts/[conceptId]">) {
  const { conceptId } = await props.params;
  const concept = getConcept(conceptId);
  if (!concept) notFound();

  const uses = stagesUsingConcept(concept.id);
  const related = [
    ...concept.relatedConceptIds,
    ...conceptsReferencing(concept.id).map((c) => c.id).filter((id) => !concept.relatedConceptIds.includes(id)),
  ].flatMap((id) => {
    const c = getConcept(id);
    return c ? [c] : [];
  });
  const claims = resolveExercise({ kind: "concept-claims", conceptId: concept.id });
  const explain = resolveExercise({ kind: "concept-explain", conceptId: concept.id });
  const byInvestigation = new Map<string, { title: string; stages: typeof uses }>();
  for (const use of uses) {
    const entry = byInvestigation.get(use.investigation.id) ?? { title: use.investigation.title, stages: [] };
    entry.stages.push(use);
    byInvestigation.set(use.investigation.id, entry);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-2">
        <Link href="/concepts" className="hover:text-ink">Concepts</Link>
        <span aria-hidden="true" className="mx-2">/</span>
        <span>{DOMAIN_LABELS[concept.domain]}</span>
      </nav>
      <header className="max-w-3xl">
        <p className="eyebrow">Concept · {DOMAIN_LABELS[concept.domain]}</p>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl leading-[1.08] tracking-tight text-balance">{concept.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2 text-pretty">{concept.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <ConceptStanding conceptId={concept.id} />
          <a href="#check" className="link">Check yourself</a>
          <a href="#explain" className="link">Explain it before reading</a>
        </div>
      </header>

      <div className="mt-14 grid gap-14 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 max-w-[46rem] space-y-14">
          <section aria-labelledby="problem">
            <SectionHeading id="problem">The problem</SectionHeading>
            <Prose text={concept.problem} />
          </section>
          <section aria-labelledby="mechanism">
            <SectionHeading id="mechanism">How it works</SectionHeading>
            <Prose text={concept.mechanism} />
          </section>
          <section aria-labelledby="assumptions">
            <SectionHeading id="assumptions">What it assumes</SectionHeading>
            <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed">
              {concept.assumptions.map((a) => (
                <li key={a} className="pl-4 relative before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-ink-3">{a}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="failures">
            <SectionHeading id="failures">How it goes wrong</SectionHeading>
            <Bullets items={concept.failureModes.map((f) => ({ title: f.name, body: f.description }))} />
          </section>
          <section aria-labelledby="alternatives">
            <SectionHeading id="alternatives">Alternatives</SectionHeading>
            <Bullets items={concept.alternatives.map((a) => ({ title: a.name, body: a.when }))} />
          </section>
          <section aria-labelledby="implementations">
            <SectionHeading id="implementations">In practice, from simplest to most specialised</SectionHeading>
            <ol className="divide-y divide-rule border-y border-rule">
              {concept.implementations.map((impl) => (
                <li key={impl.name} className="py-3 sm:flex sm:gap-6">
                  <span className="font-medium sm:w-64 shrink-0 block">{impl.name}</span>
                  <span className="text-sm text-ink-2 leading-relaxed">{impl.note}</span>
                </li>
              ))}
            </ol>
          </section>

          {claims && (
            <section aria-labelledby="check" className="border-t border-rule pt-10">
              <SectionHeading id="check">Check yourself</SectionHeading>
              <ExerciseWorkspace
                spec={{ ref: claims.summary.ref, interaction: claims.interaction, tags: claims.tags }}
                slots={buildSlots(claims.interaction)}
                context="practice"
              />
            </section>
          )}
          {explain && (
            <section aria-labelledby="explain" className="border-t border-rule pt-10">
              <SectionHeading id="explain">Explain it in your own words</SectionHeading>
              <ExerciseWorkspace
                spec={{ ref: explain.summary.ref, interaction: explain.interaction, tags: explain.tags }}
                slots={buildSlots(explain.interaction)}
                context="practice"
              />
            </section>
          )}
        </div>

        <aside className="space-y-10 lg:border-l lg:border-rule lg:pl-8">
          <section aria-labelledby="used-in">
            <SectionHeading id="used-in">Where it shows up</SectionHeading>
            {byInvestigation.size === 0 ? (
              <p className="text-sm text-ink-2">Not yet exercised by an investigation; it supports the concepts linked below.</p>
            ) : (
              <ul className="space-y-5">
                {[...byInvestigation].map(([id, entry]) => (
                  <li key={id}>
                    <Link href={`/investigations/${id}`} className="text-sm font-medium hover:text-accent">{entry.title}</Link>
                    <ul className="mt-1.5 space-y-1">
                      {entry.stages.map(({ stage }) => (
                        <li key={stage.id}>
                          <Link href={`/investigations/${id}/${stage.id}`} className="text-[0.8125rem] text-ink-2 hover:text-ink leading-snug block">
                            <span className="text-ink-3">{PHASE_LABELS[stage.phase]} · </span>
                            {stage.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {related.length > 0 && (
            <section aria-labelledby="related">
              <SectionHeading id="related">Connected concepts</SectionHeading>
              <ul className="space-y-3">
                {related.map((c) => (
                  <li key={c.id}>
                    <Link href={`/concepts/${c.id}`} className="text-sm font-medium hover:text-accent">{c.title}</Link>
                    <p className="text-[0.8125rem] text-ink-2 leading-snug mt-0.5">{c.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
