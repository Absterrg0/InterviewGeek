import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConceptStanding } from "@/components/concept-standing";
import { buildSlots } from "@/components/exercise/slots";
import { ExerciseWorkspace } from "@/components/exercise/workspace";
import { Prose } from "@/components/prose";
import { ShareButton } from "@/components/share";
import { PageHeader, Section } from "@/components/page-header";
import { resolveExercise } from "@/lib/content/exercises";
import { conceptsReferencing, getConcept, listConcepts, stagesUsingConcept } from "@/lib/content";
import { DOMAIN_LABELS, PHASE_LABELS } from "@/lib/domain/content";
import { jsonLd, pageMetadata } from "@/lib/metadata";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return listConcepts().map((c) => ({ conceptId: c.id }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/concepts/[conceptId]">): Promise<Metadata> {
  const { conceptId } = await props.params;
  const c = getConcept(conceptId);
  if (!c) return {};
  return pageMetadata({ title: `${c.title} in System Design`, description: c.summary, path: `/concepts/${c.id}` });
}

function Bullets({ items }: { items: { title: string; body: string }[] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.title} className="panel p-4">
          <dt className="text-[0.875rem] font-medium">{item.title}</dt>
          <dd className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">{item.body}</dd>
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
    ...conceptsReferencing(concept.id)
      .map((c) => c.id)
      .filter((id) => !concept.relatedConceptIds.includes(id)),
  ].flatMap((id) => {
    const c = getConcept(id);
    return c ? [c] : [];
  });
  const claims = resolveExercise({
    kind: "concept-claims",
    conceptId: concept.id,
  });
  const explain = resolveExercise({
    kind: "concept-explain",
    conceptId: concept.id,
  });
  const byInvestigation = new Map<string, { title: string; stages: typeof uses }>();
  for (const use of uses) {
    const entry = byInvestigation.get(use.investigation.id) ?? {
      title: use.investigation.title,
      stages: [],
    };
    entry.stages.push(use);
    byInvestigation.set(use.investigation.id, entry);
  }

  let n = 0;
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@type": "DefinedTerm",
            name: concept.title,
            description: concept.summary,
            url: `${SITE_URL}/concepts/${concept.id}`,
            inDefinedTermSet: { "@type": "DefinedTermSet", name: `${SITE_NAME} system design concepts`, url: `${SITE_URL}/concepts` },
          }),
        }}
      />
      <PageHeader
        title={concept.title}
        meta={<span className="chip">{DOMAIN_LABELS[concept.domain]}</span>}
        actions={
          <>
            <ConceptStanding conceptId={concept.id} />
            {claims && (
              <a href="#check" className="btn btn-secondary">
                Check yourself
              </a>
            )}
            {explain && (
              <a href="#explain" className="btn btn-ghost">
                Explain it before reading
              </a>
            )}
            <ShareButton
              url={`${SITE_URL}/concepts/${concept.id}`}
              title={`${concept.title} in System Design · ${SITE_NAME}`}
              text={`${concept.title}, explained for system design interviews.`}
            />
          </>
        }
      >
        {concept.summary}
      </PageHeader>

      <Section id="problem" n={++n} title="The problem">
        <div className="max-w-[66ch]">
          <Prose text={concept.problem} />
        </div>
      </Section>
      <Section id="mechanism" n={++n} title="How it works">
        <div className="max-w-[66ch]">
          <Prose text={concept.mechanism} />
        </div>
      </Section>
      <Section id="assumptions" n={++n} title="What it assumes">
        <ul className="space-y-2 text-[0.875rem] leading-relaxed">
          {concept.assumptions.map((a) => (
            <li key={a} className="flex gap-2.5">
              <span className="mt-[0.6rem] h-px w-2 shrink-0 bg-ink-3" aria-hidden="true" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="failures" n={++n} title="How it goes wrong">
        <Bullets items={concept.failureModes.map((f) => ({ title: f.name, body: f.description }))} />
      </Section>
      <Section id="alternatives" n={++n} title="Alternatives">
        <Bullets items={concept.alternatives.map((a) => ({ title: a.name, body: a.when }))} />
      </Section>
      <Section id="implementations" n={++n} title="In practice" description="From simplest to most specialised.">
        <ol className="space-y-px">
          {concept.implementations.map((impl, i) => (
            <li key={impl.name} className="flex items-baseline gap-3 py-1.5 text-[0.8125rem]">
              <span className="w-5 shrink-0 font-mono text-[0.625rem] tabular-nums text-ink-3">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="font-medium">{impl.name}</span>
                <span className="text-ink-3" aria-hidden="true">
                  {" · "}
                </span>
                <span className="text-ink-2">{impl.note}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {claims && (
        <Section id="check" n={++n} title="Check yourself">
          <ExerciseWorkspace
            spec={{ ref: claims.summary.ref, interaction: claims.interaction, tags: claims.tags }}
            slots={buildSlots(claims.interaction)}
            context="practice"
          />
        </Section>
      )}
      {explain && (
        <Section id="explain" n={++n} title="Explain it in your own words">
          <ExerciseWorkspace
            spec={{ ref: explain.summary.ref, interaction: explain.interaction, tags: explain.tags }}
            slots={buildSlots(explain.interaction)}
            context="practice"
          />
        </Section>
      )}

      <Section id="used-in" n={++n} title="Where it shows up">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Investigations</p>
            {byInvestigation.size === 0 ? (
              <p className="text-[0.8125rem] text-ink-2">
                Not yet exercised by an investigation; it supports the concepts linked here.
              </p>
            ) : (
              <ul className="space-y-4">
                {[...byInvestigation].map(([id, entry]) => (
                  <li key={id}>
                    <Link href={`/investigations/${id}`} className="text-[0.875rem] font-medium hover:text-accent">
                      {entry.title}
                    </Link>
                    <ul className="mt-1.5 space-y-1 border-l border-dashed border-rule pl-3">
                      {entry.stages.map(({ stage }) => (
                        <li key={stage.id}>
                          <Link
                            href={`/investigations/${id}/${stage.id}`}
                            className="block text-[0.8125rem] leading-snug text-ink-2 hover:text-ink"
                          >
                            {stage.title}
                            <span className="ml-2 font-mono text-[0.625rem] uppercase tracking-wider text-ink-3">
                              {PHASE_LABELS[stage.phase]}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {related.length > 0 && (
            <div>
              <p className="eyebrow mb-3">Connected concepts</p>
              <ul className="space-y-3">
                {related.map((c) => (
                  <li key={c.id}>
                    <Link href={`/concepts/${c.id}`} className="text-[0.875rem] font-medium hover:text-accent">
                      {c.title}
                    </Link>
                    <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-2">{c.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
