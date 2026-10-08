import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompetencyBreakdown } from "@/components/investigation/competencies";
import { ShareResult } from "@/components/investigation/share-result";
import { StageWalkthrough } from "@/components/investigation/walkthrough";
import { Prose } from "@/components/prose";
import { SystemMap } from "@/components/system-map";
import { DashList, PageHeader, Section } from "@/components/page-header";
import { getInvestigation, listInvestigations } from "@/lib/content";
import { breadcrumbs, clip, faqPage, jsonLd, pageMetadata } from "@/lib/metadata";
import { proseToPlainText } from "@/lib/prose";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return listInvestigations().map((inv) => ({ investigationId: inv.id }));
}

export const dynamicParams = false;

function lowerFirst(text: string) {
  return /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}

/** "How to design a URL Shortener": the walkthrough answers the question people type, the overview asks it. */
function howTo(searchTitle: string) {
  return `How to ${lowerFirst(searchTitle)}`;
}

export async function generateMetadata(
  props: PageProps<"/investigations/[investigationId]/review">,
): Promise<Metadata> {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) return {};
  return pageMetadata({
    title: `${howTo(inv.searchTitle)}: Step-by-Step System Design`,
    description: clip(
      `${howTo(inv.searchTitle)}, step by step: ${inv.system.components.map((c) => c.label).join(", ")}. ${inv.premise}`,
    ),
    path: `/investigations/${inv.id}/review`,
  });
}

export default async function ReviewPage(props: PageProps<"/investigations/[investigationId]/review">) {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) notFound();
  const { synthesis, system } = inv;
  const componentName = new Map(system.components.map((c) => [c.id, c.label]));
  const lastStage = inv.stages[inv.stages.length - 1];
  const firstStage = inv.stages[0];
  const shortAnswer = `${howTo(inv.searchTitle)}: ${system.components
    .map((c) => `${c.label} (${lowerFirst(c.responsibility).replace(/\.$/, "")})`)
    .join("; ")}.`;

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
                { name: "Full walkthrough", path: `/investigations/${inv.id}/review` },
              ]),
              {
                "@type": "LearningResource",
                name: `${inv.searchTitle}: full system design walkthrough`,
                description: `Every stage of "${inv.title}", decided and explained: the question, the answer, the reasoning, the tradeoffs, and the finished architecture.`,
                url: `${SITE_URL}/investigations/${inv.id}/review`,
                learningResourceType: "Walkthrough",
                educationalLevel: inv.difficulty,
                teaches: inv.competencies.map((c) => c.label),
                isAccessibleForFree: true,
                inLanguage: "en",
                provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
              },
              faqPage([
                { question: `How do you ${lowerFirst(inv.searchTitle)}?`, answer: shortAnswer },
                ...inv.stages.map((stage) => ({
                  question: proseToPlainText(stage.interaction.prompt),
                  answer: proseToPlainText(stage.reveal.reasoning),
                })),
              ]),
            ],
          }),
        }}
      />
      <div className="measure">
        <PageHeader
          eyebrow="The finished design, decision by decision"
          title={howTo(inv.searchTitle)}
          meta={inv.title}
        >
          Not the one correct diagram, but a design you can defend under these constraints: the finished architecture, then
          every stage&apos;s question with the reasoning that answers it, the tradeoffs it accepts, and where another
          engineer could land differently.
        </PageHeader>

        <section aria-labelledby="short-answer" className="section pt-0 sm:pt-0">
          <h2 id="short-answer" className="font-display text-[1.5rem] leading-tight">
            The short answer
          </h2>
          <p className="mt-3 max-w-[66ch] text-[1rem] leading-relaxed text-ink-2">
            {system.components.length} parts, each with one job. The map below shows how requests and data move between
            them; the stages after it explain why each part is there.
          </p>
          <dl className="mt-6 max-w-[66ch] divide-y divide-rule border-y border-rule">
            {system.components.map((c) => (
              <div key={c.id} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <dt className="text-[0.9375rem] font-medium">{c.label}</dt>
                <dd className="text-[0.9375rem] leading-relaxed text-ink-2">{c.responsibility}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-label="Final architecture" className="section pt-0 sm:pt-0">
        <SystemMap label={`${inv.title}: final architecture`} components={system.components} flows={system.flows} />
      </section>

      <div className="measure">
        <Section id="why" title="Why does this design work?">
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

        <Section id="relies" title="What does it rely on?">
          <DashList items={synthesis.reliesOn} />
        </Section>

        <Section id="tradeoffs" title="What tradeoffs does it make?">
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

        <Section id="alternatives" title="What are the reasonable alternatives?">
          <dl className="max-w-[66ch] space-y-4">
            {synthesis.alternatives.map((a) => (
              <div key={a.design}>
                <dt className="text-[0.9375rem] font-medium">{a.design}</dt>
                <dd className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-2">Better when {lowerFirst(a.preferWhen)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="breaks" title="When does it stop working?">
          <DashList items={synthesis.breaksWhen} />
        </Section>

        <Section
          id="walkthrough"
          title="Every stage, decided and explained"
          description="Spoilers, for the whole investigation: each stage's question and its answer, the reasoning behind it, and the tradeoffs it accepts. If you have not worked through the stages yet, you may want to do that first."
          action={
            firstStage && (
              <Link href={`/investigations/${inv.id}/${firstStage.id}`} className="btn btn-secondary">
                Work through the stages
              </Link>
            )
          }
        >
          <nav aria-label="Stages in this walkthrough" className="well px-4 py-4 sm:px-5">
            <p className="eyebrow mb-2">Jump to a stage</p>
            <ol className="grid gap-x-8 gap-y-1.5 text-[0.875rem] sm:grid-cols-2">
              {inv.stages.map((stage, i) => (
                <li key={stage.id}>
                  <a href={`#stage-${stage.id}`} className="flex gap-2.5 text-ink-2 hover:text-ink">
                    <span className="font-mono text-[0.75rem] leading-5 text-ink-3 tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">{stage.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-10 space-y-10">
            {inv.stages.map((stage, i) => (
              <StageWalkthrough
                key={stage.id}
                investigationId={inv.id}
                stage={stage}
                index={i}
                total={inv.stages.length}
              />
            ))}
          </div>
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
    </div>
  );
}
