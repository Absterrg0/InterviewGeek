import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSlots, Reveal } from "@/components/exercise/slots";
import { ExerciseWorkspace } from "@/components/exercise/workspace";
import { EventBanner } from "@/components/investigation/event-banner";
import { StageOutline, type StageLink } from "@/components/investigation/progress";
import { SystemMap } from "@/components/system-map";
import { Prose } from "@/components/prose";
import { getConcept, getStage, listInvestigations } from "@/lib/content";
import { PHASE_LABELS } from "@/lib/domain/content";
import { type ExerciseRef } from "@/lib/domain/learner";
import { visibleAfter } from "@/lib/domain/visibility";
import { breadcrumbs, clip, jsonLd, pageMetadata } from "@/lib/metadata";
import { proseToPlainText } from "@/lib/prose";

export function generateStaticParams() {
  return listInvestigations().flatMap((inv) =>
    inv.stages.map((stage) => ({ investigationId: inv.id, stageId: stage.id })),
  );
}

export const dynamicParams = false;

export async function generateMetadata(
  props: PageProps<"/investigations/[investigationId]/[stageId]">,
): Promise<Metadata> {
  const { investigationId, stageId } = await props.params;
  const found = getStage(investigationId, stageId);
  if (!found) return {};
  const { investigation, stage } = found;
  // Lead with the question the stage asks: it is what a searcher typed.
  const question = proseToPlainText(stage.interaction.prompt);
  return pageMetadata({
    title: `${investigation.searchTitle}: ${stage.title}`,
    description: clip(
      stage.event
        ? `${proseToPlainText(stage.event.title)}. ${question} ${proseToPlainText(stage.event.detail)}`
        : `${question} ${proseToPlainText(stage.context)}`,
    ),
    path: `/investigations/${investigation.id}/${stage.id}`,
  });
}

export default async function StagePage(props: PageProps<"/investigations/[investigationId]/[stageId]">) {
  const { investigationId, stageId } = await props.params;
  const found = getStage(investigationId, stageId);
  if (!found) notFound();
  const { investigation, stage, index } = found;
  const ref: ExerciseRef = { kind: "stage", investigationId: investigation.id, stageId: stage.id };

  const stages: StageLink[] = investigation.stages.map((s) => ({
    id: s.id,
    title: s.title,
    phase: s.phase,
  }));
  const previous = investigation.stages[index - 1];
  const next = investigation.stages[index + 1];
  const before = visibleAfter(investigation, index);
  const after = visibleAfter(investigation, index + 1);
  const added = {
    components: [...after.components].filter((id) => !before.components.has(id)),
    flows: [...after.flows].filter((id) => !before.flows.has(id)),
  };
  const concepts = stage.conceptIds.flatMap((id) => {
    const c = getConcept(id);
    return c ? [c] : [];
  });

  const reveal = (
    <div className="space-y-8">
      <Reveal reveal={stage.reveal} />
      {(added.components.length > 0 || added.flows.length > 0) && (
        <div>
          <h3 className="mb-3 text-[0.9375rem] font-medium">The system now</h3>
          <SystemMap
            label={`${investigation.title}: system after stage ${index + 1}`}
            components={investigation.system.components}
            flows={investigation.system.flows}
            visibleComponents={[...after.components]}
            visibleFlows={[...after.flows]}
            highlightComponents={added.components}
            highlightFlows={added.flows}
          />
        </div>
      )}
      {concepts.length > 0 && (
        <div>
          <h3 className="mb-3 text-[0.9375rem] font-medium">Concepts in this stage</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {concepts.map((c) => (
              <li key={c.id}>
                <Link href={`/concepts/${c.id}`} className="tile group block h-full px-4 py-3">
                  <span className="block text-[0.875rem] font-medium group-hover:text-accent">{c.title}</span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-ink-2">{c.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbs([
              { name: "System design interview questions", path: "/investigations" },
              { name: investigation.searchTitle, path: `/investigations/${investigation.id}` },
              { name: stage.title, path: `/investigations/${investigation.id}/${stage.id}` },
            ]),
          ),
        }}
      />
      <header className="section rise pt-6 pb-0 sm:pt-8 sm:pb-0">
        <details className="mb-6 rounded-xl bg-well lg:hidden">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[0.8125rem] font-medium text-ink-2">
            All stages
          </summary>
          <div className="px-2 pb-3">
            <StageOutline investigationId={investigation.id} stages={stages} currentId={stage.id} withReview />
          </div>
        </details>
        <p className="text-[0.8125rem] text-ink-3">
          <Link href={`/investigations/${investigation.id}`} className="hover:text-ink">
            {investigation.searchTitle}
          </Link>{" "}
          · Stage {index + 1} of {investigation.stages.length} · {PHASE_LABELS[stage.phase]}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.1] text-balance sm:text-[2.5rem]">{stage.title}</h1>
      </header>

      <section aria-label="The situation" className="section space-y-6">
        {stage.event && <EventBanner event={stage.event} />}
        <div className="max-w-[66ch]">
          <Prose text={stage.context} />
        </div>
        {before.components.size > 0 && (
          <details className="group">
            <summary className="flex w-fit cursor-pointer select-none list-none items-center gap-2 rounded-lg py-1 text-[0.8125rem] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="transition-transform group-open:rotate-90">
                <path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span className="font-medium">System so far</span>
              <span className="text-ink-3">· {before.components.size} parts</span>
            </summary>
            <div className="mt-3">
              <SystemMap
                label={`${investigation.title}: system before stage ${index + 1}`}
                components={investigation.system.components}
                flows={investigation.system.flows}
                visibleComponents={[...before.components]}
                visibleFlows={[...before.flows]}
              />
            </div>
          </details>
        )}
      </section>

      <section aria-label="Your answer" className="section">
        <ExerciseWorkspace
          key={stage.id}
          spec={{
            ref,
            interaction: stage.interaction,
            tags: { dimensions: stage.dimensions, conceptIds: stage.conceptIds, competencyIds: stage.competencyIds },
          }}
          slots={buildSlots(stage.interaction)}
          reveal={reveal}
          context="investigation"
        />
      </section>

      <nav aria-label="Stage navigation" className="section flex items-start justify-between gap-6 text-[0.875rem]">
        {previous ? (
          <Link href={`/investigations/${investigation.id}/${previous.id}`} className="group min-w-0 text-ink-2 hover:text-ink">
            <span className="block text-[0.75rem] text-ink-3">Previous</span>
            <span className="font-medium">← {previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        <Link
          href={`/investigations/${investigation.id}/${next ? next.id : "review"}`}
          className="group min-w-0 text-right text-ink-2 hover:text-ink"
        >
          <span className="block text-[0.75rem] text-ink-3">{next ? "Next" : "Finish"}</span>
          <span className="font-medium">{next ? next.title : "The full walkthrough"} →</span>
        </Link>
      </nav>
    </article>
  );
}
