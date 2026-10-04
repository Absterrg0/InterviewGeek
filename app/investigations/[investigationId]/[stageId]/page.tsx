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

export function generateStaticParams() {
  return listInvestigations().flatMap((inv) =>
    inv.stages.map((stage) => ({ investigationId: inv.id, stageId: stage.id })),
  );
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/investigations/[investigationId]/[stageId]">): Promise<Metadata> {
  const { investigationId, stageId } = await props.params;
  const found = getStage(investigationId, stageId);
  if (!found) return {};
  return { title: `${found.stage.title} · ${found.investigation.title}` };
}

export default async function StagePage(props: PageProps<"/investigations/[investigationId]/[stageId]">) {
  const { investigationId, stageId } = await props.params;
  const found = getStage(investigationId, stageId);
  if (!found) notFound();
  const { investigation, stage, index } = found;

  const stages: StageLink[] = investigation.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase }));
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
  const number = String(index + 1).padStart(2, "0");

  const reveal = (
    <div className="space-y-10">
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
          <ul className="divide-y divide-rule border-y border-rule">
            {concepts.map((c) => (
              <li key={c.id}>
                <Link href={`/concepts/${c.id}`} className="group flex flex-col sm:flex-row sm:gap-6 py-3">
                  <span className="font-medium sm:w-48 shrink-0 group-hover:text-accent">{c.title}</span>
                  <span className="text-sm text-ink-2 leading-relaxed">{c.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-8 lg:pt-12 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
      <aside className="hidden lg:block" aria-label="Stages">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-8 pr-2">
          <Link href={`/investigations/${investigation.id}`} className="block font-serif font-semibold leading-snug hover:text-accent">
            {investigation.title}
          </Link>
          <div className="mt-5">
            <StageOutline investigationId={investigation.id} stages={stages} currentId={stage.id} />
          </div>
          <Link href={`/investigations/${investigation.id}/review`} className="mt-5 block text-[0.8125rem] text-ink-2 hover:text-ink">
            The design, defended →
          </Link>
        </div>
      </aside>

      <article className="min-w-0 max-w-[46rem]">
        <nav aria-label="Breadcrumb" className="lg:hidden mb-4 text-sm text-ink-2">
          <Link href={`/investigations/${investigation.id}`} className="hover:text-ink">
            ← {investigation.title}
          </Link>
        </nav>
        <details className="lg:hidden mb-6 rounded-md border border-rule">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-sm text-ink-2">All stages</summary>
          <div className="border-t border-rule px-4 py-3">
            <StageOutline investigationId={investigation.id} stages={stages} currentId={stage.id} />
          </div>
        </details>
        <header className="space-y-4">
          <p className="eyebrow">
            Stage {number} of {String(investigation.stages.length).padStart(2, "0")} · {PHASE_LABELS[stage.phase]}
          </p>
          <h1 className="font-serif text-3xl sm:text-[2.25rem] leading-tight tracking-tight text-balance">{stage.title}</h1>
          <DimensionTags dimensions={stage.dimensions} />
        </header>

        <div className="mt-8 space-y-6">
          {stage.event && <EventBanner event={stage.event} />}
          <Prose text={stage.context} />
          {before.components.size > 0 && (
            <details className="group rounded-md border border-rule">
              <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-2.5 flex items-center justify-between text-sm">
                <span>
                  <span className="text-ink">System so far</span>
                  <span className="text-ink-3"> · {before.components.size} components</span>
                </span>
                <span className="text-ink-3 group-open:rotate-180 transition-transform" aria-hidden="true">⌄</span>
              </summary>
              <div className="border-t border-rule px-4 py-4">
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
        </div>

        <div className="mt-10 border-t border-rule pt-8">
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
        </div>

        <nav aria-label="Stage navigation" className="mt-14 grid grid-cols-2 gap-4 border-t border-rule pt-6">
          <div>
            {previous && (
              <Link href={`/investigations/${investigation.id}/${previous.id}`} className="group block">
                <span className="eyebrow">← Previous</span>
                <span className="mt-1 block text-sm text-ink-2 group-hover:text-ink">{previous.title}</span>
              </Link>
            )}
          </div>
          <div className="text-right">
            {next ? (
              <Link href={`/investigations/${investigation.id}/${next.id}`} className="group block">
                <span className="eyebrow">Next →</span>
                <span className="mt-1 block text-sm text-ink-2 group-hover:text-ink">{next.title}</span>
              </Link>
            ) : (
              <Link href={`/investigations/${investigation.id}/review`} className="group block">
                <span className="eyebrow">Finish →</span>
                <span className="mt-1 block text-sm text-ink-2 group-hover:text-ink">The design, defended</span>
              </Link>
            )}
          </div>
        </nav>
      </article>
    </div>
  );
}
