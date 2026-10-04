import Link from "next/link";
import { InvestigationProgress } from "@/components/investigation/progress";
import { SystemThumb } from "@/components/system-thumb";
import type { Investigation } from "@/lib/domain/content";
import { visibleAfter } from "@/lib/domain/visibility";

export const DIFFICULTY = { foundational: "Foundational", intermediate: "Intermediate", advanced: "Advanced" } as const;

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** One investigation as a card: its architecture's silhouette, premise and your progress. */
export function InvestigationTile({
  investigation: inv,
  wide = false,
}: {
  investigation: Investigation;
  /** Lay out horizontally, for the full catalogue. */
  wide?: boolean;
}) {
  const stages = inv.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase }));
  const given = visibleAfter(inv, 0).components;
  const failures = inv.stages.filter((s) => s.event?.kind === "failure").length;
  const changes = inv.stages.filter((s) => s.event && s.event.kind !== "failure").length;

  return (
    <Link
      href={`/investigations/${inv.id}`}
      className={`tile group flex h-full gap-4 p-2.5 ${wide ? "flex-col sm:flex-row" : "flex-col"}`}
    >
      <span
        className={`screen flex items-center justify-center rounded-[8px] px-6 py-5 ${wide ? "sm:w-60 sm:shrink-0" : "h-36"}`}
      >
        <SystemThumb components={inv.system.components} flows={inv.system.flows} given={given} className="max-h-24" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col px-1.5 pb-1.5 sm:pt-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-display text-[1rem] leading-snug transition-colors group-hover:text-accent">
            {inv.title}
          </span>
          <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-wider text-ink-3">
            {inv.estimatedMinutes} min
          </span>
        </span>
        <span
          className={`mt-1.5 block text-[0.8125rem] leading-relaxed text-ink-2 ${wide ? "max-w-2xl" : "line-clamp-3"}`}
        >
          {inv.premise}
        </span>
        <span className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4">
          <InvestigationProgress investigationId={inv.id} stages={stages} />
          <span className="flex items-center gap-1.5">
            <span className="chip-flat">{DIFFICULTY[inv.difficulty]}</span>
            <span className="chip-flat" title={`${plural(failures, "failure")} injected`}>
              <span className="led led-gap size-1.5" aria-hidden="true" />
              {failures}
              <span className="sr-only"> failures</span>
            </span>
            {changes > 0 && (
              <span className="chip-flat" title={plural(changes, "constraint change")}>
                <span className="led led-partial size-1.5" aria-hidden="true" />
                {changes}
                <span className="sr-only"> constraint changes</span>
              </span>
            )}
          </span>
        </span>
      </span>
    </Link>
  );
}
