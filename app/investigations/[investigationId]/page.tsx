import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContinueLink, InvestigationProgress, StageOutline, type StageLink } from "@/components/investigation/progress";
import { Prose } from "@/components/prose";
import { DIFFICULTY } from "@/components/investigation/difficulty";
import { ShareButton } from "@/components/share";
import { SystemThumb } from "@/components/system-thumb";
import { DashList, PageHeader, Section } from "@/components/page-header";
import { getCompany, getConcept, getInvestigation, listInvestigations, writeupsForInvestigation } from "@/lib/content";
import { DESIGN_ROUND_MINUTES } from "@/lib/domain/design-round";
import { visibleAfter } from "@/lib/domain/visibility";
import { breadcrumbs, clip, jsonLd, pageMetadata } from "@/lib/metadata";
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
    description: clip(inv.premise),
    path: `/investigations/${inv.id}`,
  });
}

export default async function InvestigationPage(props: PageProps<"/investigations/[investigationId]">) {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) notFound();

  const stages: StageLink[] = inv.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase }));
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

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@graph": [
              breadcrumbs([
                { name: "System design interview questions", path: "/investigations" },
                { name: inv.searchTitle, path: `/investigations/${inv.id}` },
              ]),
              {
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
              },
            ],
          }),
        }}
      />
      <div className="bleed drafting border-b border-rule">
        <PageHeader
          eyebrow={inv.title}
          title={inv.searchTitle}
          meta={`${DIFFICULTY[inv.difficulty]}, about ${inv.estimatedMinutes} minutes, ${inv.stages.length} stages`}
          actions={
            <>
              <ContinueLink investigationId={inv.id} stages={stages} />
              <Link href={`/investigations/${inv.id}/design`} className="btn btn-secondary">
                Design it from a blank page
              </Link>
              <Link href={`/investigations/${inv.id}/review`} className="btn btn-ghost">
                See the full walkthrough
              </Link>
              <ShareButton
                url={`${SITE_URL}/investigations/${inv.id}`}
                title={`${inv.searchTitle} · ${SITE_NAME}`}
                text={`${inv.searchTitle}, worked through like a real system design interview.`}
              />
            </>
          }
          aside={
            <div className="hidden w-96 md:block" aria-hidden="true">
              <SystemThumb components={inv.system.components} flows={inv.system.flows} given={visibleAfter(inv, 0).components} />
            </div>
          }
        >
          {inv.premise}
        </PageHeader>
      </div>

      <div className="grid gap-x-16 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          <Section id="scenario" title="The situation">
            <div className="max-w-[66ch]">
              <Prose text={inv.scenario} />
            </div>
          </Section>

          <Section id="requirements" title="What it has to do">
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              <div>
                <h3 className="mb-3 text-[0.875rem] font-medium text-ink-2">Functional</h3>
                <DashList items={inv.requirements.functional} />
              </div>
              <div>
                <h3 className="mb-3 text-[0.875rem] font-medium text-ink-2">Non-functional</h3>
                <DashList items={inv.requirements.nonFunctional} />
              </div>
            </div>
            <div className="mt-10 border-l-2 border-rule-strong pl-5">
              <h3 className="mb-3 text-[0.875rem] font-medium text-ink-2">Constraints and assumptions</h3>
              <DashList items={[...inv.constraints, ...inv.assumptions]} muted />
            </div>
          </Section>

          <Section id="variants" title="Interview questions it prepares you for">
            <DashList items={inv.interviewVariants.map((v) => `“${v}”`)} muted />
          </Section>

          {(sources.length > 0 || prerequisites.length > 0 || related.length > 0) && (
            <Section id="more" title="Read and practise next">
              <div className="space-y-6 text-[0.9375rem] leading-relaxed">
                {companies.map((c) => (
                  <p key={c.id}>
                    <Link href={`/companies/${c.id}`} className="link">
                      How {c.name} built it
                    </Link>
                    <span className="text-ink-2"> · {c.topic}, in their engineers&apos; own words</span>
                  </p>
                ))}
                {prerequisites.length > 0 && (
                  <p className="text-ink-2">
                    Concepts to know first:{" "}
                    {prerequisites.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ", "}
                        <Link href={`/concepts/${c.id}`} className="concept-link text-ink">
                          {c.title}
                        </Link>
                      </span>
                    ))}
                    .
                  </p>
                )}
                {related.length > 0 && (
                  <p className="text-ink-2">
                    Similar systems:{" "}
                    {related.map((r, i) => (
                      <span key={r.id}>
                        {i > 0 && ", "}
                        <Link href={`/investigations/${r.id}`} className="concept-link text-ink">
                          {r.searchTitle}
                        </Link>
                      </span>
                    ))}
                    .
                  </p>
                )}
              </div>
            </Section>
          )}
        </div>

        <aside aria-labelledby="stages" className="section lg:pt-10">
          <div className="lg:sticky lg:top-20 lg:border-l lg:border-rule lg:pl-6">
            <div className="flex items-baseline justify-between gap-4 px-2 pt-1">
              <h2 id="stages" className="font-display text-[1.0625rem] leading-tight">
                Stages
              </h2>
              <InvestigationProgress investigationId={inv.id} stages={stages} />
            </div>
            <p className="mt-1.5 px-2 text-[0.8125rem] leading-relaxed text-ink-2">
              Each teaches what you need, then asks you to decide.
            </p>
            <div className="mt-4">
              <StageOutline investigationId={inv.id} stages={stages} withPhase withReview />
            </div>
            <p className="mt-5 border-t border-rule-soft px-2 pt-4 text-[0.8125rem] leading-relaxed text-ink-2">
              Ready to drive it yourself?{" "}
              <Link href={`/investigations/${inv.id}/design`} className="link font-normal">
                Do it as a {DESIGN_ROUND_MINUTES}-minute round
              </Link>{" "}
              from a blank page, then compare with this design.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
