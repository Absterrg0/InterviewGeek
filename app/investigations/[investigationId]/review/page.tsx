import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetencyBreakdown } from "@/components/investigation/competencies";
import { ShareResult } from "@/components/investigation/share-result";
import { Prose } from "@/components/prose";
import { SystemMap } from "@/components/system-map";
import { DashList, PageHeader, Section } from "@/components/page-header";
import { getInvestigation, listInvestigations } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import { SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return listInvestigations().map((inv) => ({ investigationId: inv.id }));
}

export const dynamicParams = false;

export async function generateMetadata(
  props: PageProps<"/investigations/[investigationId]/review">,
): Promise<Metadata> {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) return {};
  return pageMetadata({
    title: `${inv.searchTitle}: the final design`,
    description: `The finished architecture for "${inv.title}": why it works, what it relies on, its tradeoffs and where it stops working.`,
    path: `/investigations/${inv.id}/review`,
  });
}

function lowerFirst(text: string) {
  return /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}

export default async function ReviewPage(props: PageProps<"/investigations/[investigationId]/review">) {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) notFound();
  const { synthesis, system } = inv;
  const componentName = new Map(system.components.map((c) => [c.id, c.label]));
  const lastStage = inv.stages[inv.stages.length - 1];

  return (
    <div>
      <PageHeader
        title="The finished design"
        meta={inv.title}
      >
        Not the one correct diagram, but a design you can defend under these constraints: why it works, what it
        assumes, what it costs, and where it stops working.
      </PageHeader>

      <section aria-label="Final architecture" className="section">
        <SystemMap label={`${inv.title}: final architecture`} components={system.components} flows={system.flows} />
      </section>

      <Section id="why" title="Why it works">
        <div className="max-w-[66ch]">
          <Prose text={synthesis.whyItWorks} />
        </div>
      </Section>

      <Section id="invariants" title="Invariants, and where they are enforced">
        <ul className="max-w-[66ch] space-y-5">
          {system.invariants.map((inv2) => (
            <li key={inv2.id}>
              <p className="text-[0.9375rem] font-medium leading-snug">{inv2.statement}</p>
              <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">
                {inv2.mechanism}{" "}
                <span className="text-ink-3">
                  Enforced by {inv2.enforcedBy.map((id) => componentName.get(id) ?? id).join(", ")}.
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="relies" title="What it relies on">
        <DashList items={synthesis.reliesOn} />
      </Section>

      <Section id="tradeoffs" title="Tradeoffs it makes">
        <div className="panel overflow-x-auto px-5 py-1">
          <table className="data-table min-w-[560px]">
            <thead>
              <tr>
                <th scope="col" className="w-[30%]">
                  Choice
                </th>
                <th scope="col">Gains</th>
                <th scope="col">Costs</th>
              </tr>
            </thead>
            <tbody>
              {synthesis.tradeoffs.map((t) => (
                <tr key={t.choice}>
                  <th scope="row">{t.choice}</th>
                  <td>{t.gains}</td>
                  <td>{t.costs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="alternatives" title="Reasonable alternatives">
        <dl className="max-w-[66ch] space-y-4">
          {synthesis.alternatives.map((a) => (
            <div key={a.design}>
              <dt className="text-[0.9375rem] font-medium">{a.design}</dt>
              <dd className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-2">Better when {lowerFirst(a.preferWhen)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="breaks" title="Where it stops working">
        <DashList items={synthesis.breaksWhen} />
      </Section>

      <Section id="evidence" title="How you did">
        <CompetencyBreakdown
          investigationId={inv.id}
          competencies={inv.competencies}
          stageCount={inv.stages.length}
          firstStageId={inv.stages[0]?.id ?? ""}
        />
        <ShareResult
          investigationId={inv.id}
          searchTitle={inv.searchTitle}
          stageCount={inv.stages.length}
          url={`${SITE_URL}/investigations/${inv.id}`}
        />
      </Section>

      <Section id="variants" title="Now try it as an interview question">
        <DashList items={inv.interviewVariants.map((v) => `“${v}”`)} muted />
        <p className="mt-4 text-[0.8125rem] text-ink-2">
          The{" "}
          <Link href="/interview" className="link">
            interview mode
          </Link>{" "}
          mixes stages from this and other investigations with concept recall and questions about your own projects.
        </p>
        {lastStage && (
          <Link href={`/investigations/${inv.id}/${lastStage.id}`} className="btn btn-secondary mt-5">
            Back to the last stage
          </Link>
        )}
      </Section>
    </div>
  );
}
