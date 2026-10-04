import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContinueLink, StageOutline, type StageLink } from "@/components/investigation/progress";
import { Prose } from "@/components/prose";
import { DIFFICULTY } from "@/components/investigation/investigation-tile";
import { ShareButton } from "@/components/share";
import { SystemThumb } from "@/components/system-thumb";
import { SourceList } from "@/components/writeup";
import { PageHeader, Section } from "@/components/page-header";
import { getCompany, getConcept, getInvestigation, listInvestigations, writeupsForInvestigation } from "@/lib/content";
import { DIMENSION_LABELS, DIMENSIONS } from "@/lib/domain/content";
import { visibleAfter } from "@/lib/domain/visibility";
import { jsonLd, pageMetadata } from "@/lib/metadata";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return listInvestigations().map((inv) => ({ investigationId: inv.id }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/investigations/[investigationId]">): Promise<Metadata> {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) return {};
  return pageMetadata({
    title: `${inv.searchTitle} · System Design Interview`,
    description: inv.premise,
    path: `/investigations/${inv.id}`,
  });
}

function Bulleted({ items, muted = false }: { items: readonly string[]; muted?: boolean }) {
  return (
    <ul className={`space-y-2 text-[0.875rem] leading-relaxed ${muted ? "text-ink-2" : ""}`}>
      {items.map((r) => (
        <li key={r} className="flex gap-2.5">
          <span className="mt-[0.6rem] h-px w-2 shrink-0 bg-ink-3" aria-hidden="true" />
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function InvestigationPage(props: PageProps<"/investigations/[investigationId]">) {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) notFound();

  const stages: StageLink[] = inv.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase }));
  const exercised = DIMENSIONS.filter((d) => inv.stages.some((s) => s.dimensions.includes(d)));
  const prerequisites = inv.prerequisites.flatMap((id) => {
    const c = getConcept(id);
    return c ? [c] : [];
  });
  const related = inv.relatedInvestigationIds.flatMap((id) => {
    const r = getInvestigation(id);
    return r ? [r] : [];
  });
  const sources = writeupsForInvestigation(inv.id);
  const companies = [...new Set(sources.map((w) => w.companyId))].flatMap((id) => {
    const c = getCompany(id);
    return c ? [c] : [];
  });

  let n = 0;

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@type": "LearningResource",
            name: `${inv.searchTitle}: ${inv.title}`,
            description: inv.premise,
            url: `${SITE_URL}/investigations/${inv.id}`,
            learningResourceType: "Interactive exercise",
            educationalLevel: inv.difficulty,
            timeRequired: `PT${inv.estimatedMinutes}M`,
            teaches: inv.competencies.map((c) => c.label),
            isAccessibleForFree: true,
            inLanguage: "en",
            provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
            citation: sources.map((w) => ({ "@type": "CreativeWork", name: w.title, url: w.url })),
          }),
        }}
      />
      <PageHeader
        title={inv.title}
        meta={
          <>
            <span className="chip">{DIFFICULTY[inv.difficulty]}</span>
            <span className="chip">About {inv.estimatedMinutes} min</span>
            <span className="chip">{inv.stages.length} stages</span>
          </>
        }
        actions={
          <>
            <ContinueLink investigationId={inv.id} stages={stages} />
            <Link href={`/investigations/${inv.id}/review`} className="btn btn-ghost">
              Skip to the finished design
            </Link>
            <ShareButton
              url={`${SITE_URL}/investigations/${inv.id}`}
              title={`${inv.searchTitle} · ${SITE_NAME}`}
              text={`${inv.searchTitle}, worked through like a real system design interview.`}
            />
          </>
        }
        aside={
          <figure className="w-full md:w-64">
            <div className="screen flex items-center justify-center px-6 py-6">
              <SystemThumb components={inv.system.components} flows={inv.system.flows} given={visibleAfter(inv, 0).components} />
            </div>
            <figcaption className="mt-2 text-[0.6875rem] leading-relaxed text-ink-3">
              The finished design. Solid parts are given; outlined parts are yours to work out.
            </figcaption>
          </figure>
        }
      >
        {inv.premise}
      </PageHeader>

      <Section id="scenario" n={++n} title="Scenario">
        <div className="max-w-[66ch]">
          <Prose text={inv.scenario} />
        </div>
      </Section>

      {sources.length > 0 && (
        <Section
          id="sources"
          n={++n}
          title="Based on"
          description="What the engineers who built systems like this published. Read them after you have made your own decisions."
        >
          <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_auto]">
            <SourceList writeups={sources} />
            <div className="sm:w-48">
              <p className="eyebrow mb-3">Companies</p>
              <ul className="space-y-1.5">
                {companies.map((c) => (
                  <li key={c.id}>
                    <Link href={`/companies/${c.id}`} className="text-[0.8125rem] font-medium hover:text-accent">
                      How {c.name} built it
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}

      <Section id="requirements" n={++n} title="Requirements" description="What it must do, and what it must guarantee.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="panel p-5">
            <p className="eyebrow mb-3">Must do</p>
            <Bulleted items={inv.requirements.functional} />
          </div>
          <div className="panel p-5">
            <p className="eyebrow mb-3">Must guarantee</p>
            <Bulleted items={inv.requirements.nonFunctional} />
          </div>
        </div>
      </Section>

      <Section id="constraints" n={++n} title="Constraints and assumptions">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Constraints</p>
            <Bulleted items={inv.constraints} muted />
          </div>
          <div>
            <p className="eyebrow mb-3">Assumptions</p>
            <Bulleted items={inv.assumptions} muted />
          </div>
        </div>
      </Section>

      <Section id="stages" n={++n} title="Stages" description={`${inv.stages.length} stages, grouped by what you do in them.`}>
        <div className="max-w-xl">
          <StageOutline investigationId={inv.id} stages={stages} />
        </div>
      </Section>

      <Section id="objectives" n={++n} title="You will be able to">
        <ul className="space-y-px">
          {inv.objectives.map((o) => (
            <li key={o} className="flex items-baseline gap-2.5 py-1 text-[0.875rem]">
              <span className="led led-accent size-1.5 translate-y-[-1px]" aria-hidden="true" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="evidence"
        n={++n}
        title="What your answers will show"
        description="Each stage records evidence against these competencies."
      >
        <dl className="panel divide-y divide-dashed divide-rule px-5">
          {inv.competencies.map((c) => (
            <div key={c.id} className="py-3 sm:flex sm:gap-6">
              <dt className="shrink-0 text-[0.875rem] font-medium sm:w-56">{c.label}</dt>
              <dd className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2 sm:mt-0">{c.description}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1.5">Dimensions</span>
          {exercised.map((d) => (
            <span key={d} className="chip-flat" title={DIMENSION_LABELS[d].description}>
              {DIMENSION_LABELS[d].label}
            </span>
          ))}
        </div>
      </Section>

      <Section id="variants" n={++n} title="Interview questions this prepares you for">
        <ul className="space-y-2">
          {inv.interviewVariants.map((v) => (
            <li key={v} className="well-sm px-4 py-3 text-[0.875rem] text-ink-2">
              “{v}”
            </li>
          ))}
        </ul>
      </Section>

      {(prerequisites.length > 0 || related.length > 0) && (
        <Section id="before" n={++n} title="Around this investigation">
          <div className="grid gap-8 sm:grid-cols-2">
            {prerequisites.length > 0 && (
              <div>
                <p className="eyebrow mb-3">Helpful to know first</p>
                <ul className="space-y-3">
                  {prerequisites.map((c) => (
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
            {related.length > 0 && (
              <div>
                <p className="eyebrow mb-3">Related systems</p>
                <ul className="space-y-2">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link href={`/investigations/${r.id}`} className="text-[0.875rem] font-medium hover:text-accent">
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
