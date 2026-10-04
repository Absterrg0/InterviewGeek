import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetencyBreakdown } from "@/components/investigation/competencies";
import { Prose } from "@/components/prose";
import { SystemMap } from "@/components/system-map";
import { SectionHeading } from "@/components/ui";
import { getInvestigation, listInvestigations } from "@/lib/content";

export function generateStaticParams() {
  return listInvestigations().map((inv) => ({ investigationId: inv.id }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/investigations/[investigationId]/review">): Promise<Metadata> {
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
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-2 flex gap-2">
        <Link href="/investigations" className="hover:text-ink">Investigations</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/investigations/${inv.id}`} className="hover:text-ink">{inv.title}</Link>
      </nav>
      <header className="max-w-3xl">
        <p className="eyebrow">The design, defended</p>
        <h1 className="mt-3 font-serif text-4xl sm:text-[2.75rem] leading-[1.1] tracking-tight text-balance">{inv.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2 text-pretty">
          Not one correct diagram, but one defensible design under these constraints: why it works, what it assumes,
          what it costs, and where it stops working.
        </p>
      </header>

      <section aria-label="Final architecture" className="mt-12">
        <SystemMap label={`${inv.title}: final architecture`} components={system.components} flows={system.flows} />
      </section>

      <div className="mt-16 max-w-[46rem] space-y-14">
        <section aria-labelledby="why">
          <SectionHeading id="why">Why it works</SectionHeading>
          <Prose text={synthesis.whyItWorks} />
        </section>

        <section aria-labelledby="invariants">
          <SectionHeading id="invariants">Invariants, and where they are enforced</SectionHeading>
          <ul className="space-y-6">
            {system.invariants.map((inv2) => (
              <li key={inv2.id} className="border-l-2 border-ink pl-4">
                <p className="font-medium leading-snug">{inv2.statement}</p>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">{inv2.mechanism}</p>
                <p className="mt-1.5 text-xs text-ink-3">
                  Enforced by {inv2.enforcedBy.map((id) => componentName.get(id) ?? id).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="relies">
          <SectionHeading id="relies">What it relies on</SectionHeading>
          <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed">
            {synthesis.reliesOn.map((r) => (
              <li key={r} className="pl-4 relative before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-ink-3">{r}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="tradeoffs">
          <SectionHeading id="tradeoffs">Tradeoffs it makes</SectionHeading>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[560px]">
              <thead>
                <tr className="text-left text-ink-3">
                  <th scope="col" className="font-normal py-2 pr-4 border-b border-rule w-[30%]">Choice</th>
                  <th scope="col" className="font-normal py-2 pr-4 border-b border-rule">Gains</th>
                  <th scope="col" className="font-normal py-2 border-b border-rule">Costs</th>
                </tr>
              </thead>
              <tbody>
                {synthesis.tradeoffs.map((t) => (
                  <tr key={t.choice} className="align-top">
                    <th scope="row" className="text-left font-medium py-3 pr-4 border-b border-rule">{t.choice}</th>
                    <td className="py-3 pr-4 border-b border-rule text-ink-2">{t.gains}</td>
                    <td className="py-3 border-b border-rule text-ink-2">{t.costs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="alternatives">
          <SectionHeading id="alternatives">Reasonable alternatives</SectionHeading>
          <dl className="space-y-5">
            {synthesis.alternatives.map((a) => (
              <div key={a.design}>
                <dt className="font-medium">{a.design}</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
                  <span className="text-ink-3">Prefer when: </span>
                  {a.preferWhen}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="breaks">
          <SectionHeading id="breaks">Where it stops working</SectionHeading>
          <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed">
            {synthesis.breaksWhen.map((b) => (
              <li key={b} className="pl-4 relative before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-signal-gap">{b}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="evidence">
          <SectionHeading id="evidence">Your evidence in this investigation</SectionHeading>
          <CompetencyBreakdown
            investigationId={inv.id}
            competencies={inv.competencies}
            stageCount={inv.stages.length}
            firstStageId={inv.stages[0]?.id ?? ""}
          />
        </section>

        <section aria-labelledby="variants">
          <SectionHeading id="variants">Now try it as an interview question</SectionHeading>
          <ul className="space-y-2">
            {inv.interviewVariants.map((v) => (
              <li key={v} className="font-serif text-[1.0625rem] text-ink-2">“{v}”</li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-ink-2">
            The <Link href="/interview" className="link">interview mode</Link> mixes stages from this and other
            investigations with concept recall and questions about your own projects.
          </p>
        </section>

        {lastStage && (
          <p className="text-sm text-ink-3">
            <Link href={`/investigations/${inv.id}/${lastStage.id}`} className="hover:text-ink">
              ← Back to the last stage
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
