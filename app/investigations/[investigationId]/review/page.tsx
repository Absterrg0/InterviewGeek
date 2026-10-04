import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetencyBreakdown } from "@/components/investigation/competencies";
import { Prose } from "@/components/prose";
import { SystemMap } from "@/components/system-map";
import { PageHeader, Section } from "@/components/page-header";
import { getInvestigation, listInvestigations } from "@/lib/content";

export function generateStaticParams() {
  return listInvestigations().map((inv) => ({ investigationId: inv.id }));
}

export const dynamicParams = false;

export async function generateMetadata(
  props: PageProps<"/investigations/[investigationId]/review">,
): Promise<Metadata> {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  return inv ? { title: `The design, defended · ${inv.title}` } : {};
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
        title={inv.title}
        meta={
          <span className="chip">
            <span className="led led-strong size-1.5" aria-hidden="true" />
            The design, defended
          </span>
        }
      >
        Not one correct diagram, but one defensible design under these constraints: why it works, what it assumes, what
        it costs, and where it stops working.
      </PageHeader>

      <section aria-label="Final architecture" className="section">
        <SystemMap label={`${inv.title}: final architecture`} components={system.components} flows={system.flows} />
      </section>

      <Section id="why" n={1} title="Why it works">
        <div className="max-w-[66ch]">
          <Prose text={synthesis.whyItWorks} />
        </div>
      </Section>

      <Section id="invariants" n={2} title="Invariants, and where they are enforced">
        <ul className="panel divide-y divide-dashed divide-rule">
          {system.invariants.map((inv2) => (
            <li key={inv2.id} className="flex gap-3 px-4 py-4">
              <span className="led led-strong mt-1.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[0.875rem] font-medium leading-snug">{inv2.statement}</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">{inv2.mechanism}</p>
                <p className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="eyebrow mr-1">Enforced by</span>
                  {inv2.enforcedBy.map((id) => (
                    <span key={id} className="chip-flat">
                      {componentName.get(id) ?? id}
                    </span>
                  ))}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="relies" n={3} title="What it relies on">
        <ul className="space-y-2 text-[0.875rem] leading-relaxed">
          {synthesis.reliesOn.map((r) => (
            <li key={r} className="flex gap-2.5">
              <span className="mt-[0.6rem] h-px w-2 shrink-0 bg-ink-3" aria-hidden="true" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="tradeoffs" n={4} title="Tradeoffs it makes">
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

      <Section id="alternatives" n={5} title="Reasonable alternatives">
        <dl className="grid gap-2 sm:grid-cols-2">
          {synthesis.alternatives.map((a) => (
            <div key={a.design} className="panel p-4">
              <dt className="text-[0.875rem] font-medium">{a.design}</dt>
              <dd className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
                <span className="text-ink-3">Prefer when: </span>
                {a.preferWhen}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="breaks" n={6} title="Where it stops working">
        <ul className="space-y-2 text-[0.875rem] leading-relaxed">
          {synthesis.breaksWhen.map((b) => (
            <li key={b} className="flex gap-2.5">
              <span className="led led-gap mt-[0.45rem] size-1.5" aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="evidence" n={7} title="Your evidence in this investigation">
        <CompetencyBreakdown
          investigationId={inv.id}
          competencies={inv.competencies}
          stageCount={inv.stages.length}
          firstStageId={inv.stages[0]?.id ?? ""}
        />
      </Section>

      <Section id="variants" n={8} title="Now try it as an interview question">
        <ul className="space-y-2">
          {inv.interviewVariants.map((v) => (
            <li key={v} className="well-sm px-4 py-3 text-[0.875rem] text-ink-2">
              “{v}”
            </li>
          ))}
        </ul>
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
