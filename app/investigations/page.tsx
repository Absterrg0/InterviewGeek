import type { Metadata } from "next";
import Link from "next/link";
import { InvestigationProgress } from "@/components/investigation/progress";
import { listInvestigations } from "@/lib/content";
import { DIMENSION_LABELS, DIMENSIONS } from "@/lib/domain/content";

export const metadata: Metadata = {
  title: "Investigations",
  description: "Real systems, worked through from requirements to failure modes.",
};

const DIFFICULTY = { foundational: "Foundational", intermediate: "Intermediate", advanced: "Advanced" } as const;

export default function InvestigationsPage() {
  const investigations = listInvestigations();
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl leading-tight tracking-tight">Investigations</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          Each one is a real system you design from its requirements: decide, explain why, see the consequences, break
          it, change the constraints, and defend what is left.
        </p>
      </header>
      <ol className="mt-12 border-t border-rule">
        {investigations.map((inv, i) => {
          const stages = inv.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase }));
          const dims = DIMENSIONS.filter((d) => inv.stages.some((s) => s.dimensions.includes(d)));
          const failures = inv.stages.filter((s) => s.event?.kind === "failure").length;
          const changes = inv.stages.filter((s) => s.event && s.event.kind !== "failure").length;
          return (
            <li key={inv.id} className="border-b border-rule">
              <Link
                href={`/investigations/${inv.id}`}
                className="group grid gap-x-10 gap-y-3 py-8 md:grid-cols-[3rem_minmax(0,1fr)_16rem]"
              >
                <span className="font-mono text-sm text-ink-3 pt-1.5">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block font-serif text-2xl leading-snug tracking-tight group-hover:text-accent transition-colors">
                    {inv.title}
                  </span>
                  <span className="mt-2 block text-[0.9375rem] leading-relaxed text-ink-2 max-w-2xl">{inv.premise}</span>
                </span>
                <span className="text-sm space-y-1.5 md:pt-1.5">
                  <span className="block text-ink-2">
                    {DIFFICULTY[inv.difficulty]} · {inv.stages.length} stages · ~{inv.estimatedMinutes} min
                  </span>
                  <span className="block text-ink-3">
                    {failures} failure{failures === 1 ? "" : "s"} injected · {changes} constraint change{changes === 1 ? "" : "s"}
                  </span>
                  <span className="block text-ink-3">{dims.map((d) => DIMENSION_LABELS[d].label).join(" · ")}</span>
                  <span className="block pt-1">
                    <InvestigationProgress investigationId={inv.id} stages={stages} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
