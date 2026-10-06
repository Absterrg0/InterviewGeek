import Link from "next/link";
import { DIFFICULTY } from "@/components/investigation/difficulty";
import { InvestigationProgress } from "@/components/investigation/progress";
import { SystemThumb } from "@/components/system-thumb";
import type { Investigation } from "@/lib/domain/content";
import { visibleAfter } from "@/lib/domain/visibility";

/**
 * The investigations as a ruled index: each row is the architecture's silhouette,
 * the system and its premise, and how long and how far along it is.
 */
export function InvestigationIndex({
  investigations,
  clamp = false,
}: {
  investigations: readonly Investigation[];
  /** Cut each premise to two lines, for the home page. */
  clamp?: boolean;
}) {
  return (
    <ol className="border-b border-rule">
      {investigations.map((inv) => {
        const stages = inv.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase }));
        return (
          <li key={inv.id} className="border-t border-rule">
            <Link
              href={`/investigations/${inv.id}`}
              className="group grid gap-x-10 gap-y-4 py-7 sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[8rem_minmax(0,1fr)_11rem]"
            >
              <span className="hidden pt-1 sm:block" aria-hidden="true">
                <SystemThumb
                  components={inv.system.components}
                  flows={inv.system.flows}
                  given={visibleAfter(inv, 0).components}
                />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[1.3125rem] leading-snug transition-colors group-hover:text-accent">
                  {inv.title}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] text-ink-3">{inv.searchTitle}</span>
                <span
                  className={`mt-3 max-w-[66ch] text-[0.9375rem] leading-relaxed text-ink-2 ${clamp ? "line-clamp-2" : "block"}`}
                >
                  {inv.premise}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] sm:col-start-2 lg:col-start-auto lg:flex-col lg:items-start lg:pt-1.5">
                <span>
                  <span className="text-ink">{DIFFICULTY[inv.difficulty]}</span>
                  <span className="text-ink-3">, {inv.estimatedMinutes} min</span>
                </span>
                <InvestigationProgress investigationId={inv.id} stages={stages} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
