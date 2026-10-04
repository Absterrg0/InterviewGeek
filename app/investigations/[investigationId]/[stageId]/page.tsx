import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSlots, Reveal } from "@/components/exercise/slots";
import { ExerciseWorkspace } from "@/components/exercise/workspace";
import { EventBanner } from "@/components/investigation/event-banner";
import { StageOutline, type StageLink } from "@/components/investigation/progress";
import { SystemMap } from "@/components/system-map";
import { DimensionTags } from "@/components/ui";
import { Prose } from "@/components/prose";
import { getConcept, getStage, listInvestigations } from "@/lib/content";
import { PHASE_LABELS } from "@/lib/domain/content";
import { visibleAfter } from "@/lib/domain/visibility";
import { pageMetadata } from "@/lib/metadata";
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
  const { investigation, stage, index } = found;
  return pageMetadata({
    title: `${stage.title} · ${investigation.searchTitle}`,
    description: stage.event
      ? proseToPlainText(`${stage.event.title} — ${stage.event.detail}`)
      : `Stage ${index + 1} of ${investigation.stages.length} in "${investigation.title}": ${investigation.premise}`,
    path: `/investigations/${investigation.id}/${stage.id}`,
  });
}

export default async function StagePage(props: PageProps<"/investigations/[investigationId]/[stageId]">) {
  const { investigationId, stageId } = await props.params;
  const found = getStage(investigationId, stageId);
  if (!found) notFound();
  const { investigation, stage, index } = found;

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
          <h3 className="eyebrow mb-3">The system now</h3>
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
          <h3 className="eyebrow mb-3">Mechanisms in this stage</h3>
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
      <header className="section rise">
        <details className="well-sm mb-6 lg:hidden">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[0.8125rem] font-medium text-ink-2">
            All stages of {investigation.title}
          </summary>
          <div className="px-2 pb-3">
            <StageOutline investigationId={investigation.id} stages={stages} currentId={stage.id} dense />
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip">
            Stage {index + 1} of {investigation.stages.length}
          </span>
          <span className="chip">{PHASE_LABELS[stage.phase]}</span>
        </div>
        <h1 className="mt-4 font-display text-[1.875rem] leading-[1.1] text-balance sm:text-[2.25rem]">{stage.title}</h1>
        <div className="mt-4">
          <DimensionTags dimensions={stage.dimensions} />
        </div>
      </header>

      <section aria-label="The situation" className="section space-y-5">
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
              <span className="font-mono text-[0.625rem] text-ink-3">{before.components.size} components</span>
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
            ref: { kind: "stage", investigationId: investigation.id, stageId: stage.id },
            interaction: stage.interaction,
            tags: { dimensions: stage.dimensions, conceptIds: stage.conceptIds, competencyIds: stage.competencyIds },
          }}
          slots={buildSlots(stage.interaction)}
          reveal={reveal}
          context="investigation"
        />
      </section>

      <nav aria-label="Stage navigation" className="section grid grid-cols-2 gap-3">
        <div>
          {previous && (
            <Link href={`/investigations/${investigation.id}/${previous.id}`} className="tile group block h-full px-4 py-3">
              <span className="eyebrow">Previous</span>
              <span className="mt-1 block text-[0.8125rem] font-medium text-ink-2 group-hover:text-ink">
                {previous.title}
              </span>
            </Link>
          )}
        </div>
        <div className="text-right">
          {next ? (
            <Link href={`/investigations/${investigation.id}/${next.id}`} className="tile group block h-full px-4 py-3">
              <span className="eyebrow">Next</span>
              <span className="mt-1 block text-[0.8125rem] font-medium text-ink-2 group-hover:text-ink">{next.title}</span>
            </Link>
          ) : (
            <Link href={`/investigations/${investigation.id}/review`} className="tile group block h-full px-4 py-3">
              <span className="eyebrow">Finish</span>
              <span className="mt-1 block text-[0.8125rem] font-medium text-ink-2 group-hover:text-ink">
                The design, defended
              </span>
            </Link>
          )}
        </div>
      </nav>
    </article>
  );
}
