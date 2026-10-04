import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContinueLink, StageOutline, type StageLink } from "@/components/investigation/progress";
import { Prose } from "@/components/prose";
import { SectionHeading } from "@/components/ui";
import { getConcept, getInvestigation, listInvestigations } from "@/lib/content";
import { DIMENSION_LABELS, DIMENSIONS } from "@/lib/domain/content";

export function generateStaticParams() {
  return listInvestigations().map((inv) => ({ investigationId: inv.id }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/investigations/[investigationId]">): Promise<Metadata> {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  return inv ? { title: inv.title, description: inv.premise } : {};
}

const DIFFICULTY = { foundational: "Foundational", intermediate: "Intermediate", advanced: "Advanced" } as const;

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

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-2">
        <Link href="/investigations" className="hover:text-ink">
          Investigations
        </Link>
      </nav>

      <header className="max-w-3xl">
        <p className="eyebrow">
          Investigation · {DIFFICULTY[inv.difficulty]} · about {inv.estimatedMinutes} min · {inv.stages.length} stages
        </p>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl leading-[1.08] tracking-tight text-balance">{inv.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2 text-pretty">{inv.premise}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <ContinueLink investigationId={inv.id} stages={stages} />
          <Link href={`/investigations/${inv.id}/review`} className="btn btn-ghost">
            Skip to the finished design
          </Link>
        </div>
      </header>

      <div className="mt-14 grid gap-14 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-12 max-w-[46rem]">
          <section aria-labelledby="scenario">
            <SectionHeading id="scenario">Scenario</SectionHeading>
            <Prose text={inv.scenario} />
          </section>

          <section aria-labelledby="requirements" className="grid gap-10 sm:grid-cols-2">
            <div>
              <SectionHeading id="requirements">Must do</SectionHeading>
              <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed">
                {inv.requirements.functional.map((r) => (
                  <li key={r} className="pl-4 relative before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-ink-3">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="eyebrow mb-3">Must guarantee</h2>
              <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed">
                {inv.requirements.nonFunctional.map((r) => (
                  <li key={r} className="pl-4 relative before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-ink-3">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="constraints" className="grid gap-10 sm:grid-cols-2">
            <div>
              <SectionHeading id="constraints">Constraints</SectionHeading>
              <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed text-ink-2">
                {inv.constraints.map((c) => (
                  <li key={c} className="pl-4 relative before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-ink-3">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="eyebrow mb-3">Assumptions</h2>
              <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed text-ink-2">
                {inv.assumptions.map((a) => (
                  <li key={a} className="pl-4 relative before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-ink-3">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="objectives">
            <SectionHeading id="objectives">You will be able to</SectionHeading>
            <ol className="space-y-2.5 text-[0.9375rem] leading-relaxed">
              {inv.objectives.map((o, i) => (
                <li key={o} className="flex gap-3">
                  <span className="font-mono text-xs text-ink-3 pt-1">{String(i + 1).padStart(2, "0")}</span>
                  <span>{o}</span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="evidence">
            <SectionHeading id="evidence">What your answers will show</SectionHeading>
            <p className="text-[0.9375rem] leading-relaxed text-ink-2 mb-4">
              Each stage records evidence against these competencies, so you can see where your understanding of this
              system is solid and where it is not.
            </p>
            <dl className="divide-y divide-rule border-y border-rule">
              {inv.competencies.map((c) => (
                <div key={c.id} className="py-3 sm:flex sm:gap-6">
                  <dt className="font-medium sm:w-56 shrink-0">{c.label}</dt>
                  <dd className="text-sm text-ink-2 leading-relaxed">{c.description}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-ink-3">
              Dimensions exercised: {exercised.map((d) => DIMENSION_LABELS[d].label).join(", ")}.
            </p>
          </section>

          <section aria-labelledby="variants">
            <SectionHeading id="variants">Interview questions this prepares you for</SectionHeading>
            <ul className="space-y-2 text-[0.9375rem] leading-relaxed">
              {inv.interviewVariants.map((v) => (
                <li key={v} className="font-serif text-[1.0625rem] text-ink-2">“{v}”</li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-10 lg:border-l lg:border-rule lg:pl-8">
          <section aria-labelledby="stages">
            <SectionHeading id="stages">Stages</SectionHeading>
            <StageOutline investigationId={inv.id} stages={stages} />
          </section>
          {prerequisites.length > 0 && (
            <section aria-labelledby="prereq">
              <SectionHeading id="prereq">Helpful to know first</SectionHeading>
              <ul className="space-y-2.5">
                {prerequisites.map((c) => (
                  <li key={c.id}>
                    <Link href={`/concepts/${c.id}`} className="text-sm font-medium hover:text-accent">
                      {c.title}
                    </Link>
                    <p className="text-[0.8125rem] text-ink-2 leading-snug mt-0.5">{c.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {related.length > 0 && (
            <section aria-labelledby="related">
              <SectionHeading id="related">Related systems</SectionHeading>
              <ul className="space-y-2">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/investigations/${r.id}`} className="text-sm font-medium hover:text-accent">
                      {r.title}
                    </Link>
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
