import Link from "next/link";
import { ContinueStrip } from "@/components/continue-strip";
import { InvestigationTile } from "@/components/investigation/investigation-tile";
import { Section } from "@/components/page-header";
import { InlineText } from "@/components/prose-core";
import { Prose } from "@/components/prose";
import { SystemMap } from "@/components/system-map";
import { VERDICT_LABEL } from "@/components/ui";
import { getConcept, getInvestigation, listCompanies, listInvestigations } from "@/lib/content";
import { visibleAfter } from "@/lib/domain/visibility";

const LOOP = [
  { step: "Decide", text: "Choose between designs that all sound plausible, and write down why." },
  { step: "Break it", text: "A worker dies, a message arrives twice, a request times out after it succeeded." },
  { step: "Change it", text: "Ten times the traffic, a new requirement, a promise from sales." },
  { step: "Defend it", text: "Say what the design guarantees, what it assumes, and where it stops working." },
];

/** The moment the product is about: a real system, mid-failure, waiting for your reasoning. */
function heroScene() {
  const preferred = getInvestigation("video-processing-pipeline");
  const index = preferred?.stages.findIndex((s) => s.id === "worker-dies-mid-job") ?? -1;
  if (preferred && index >= 0) {
    return { investigation: preferred, index, failed: ["workers"] };
  }
  for (const investigation of listInvestigations()) {
    const i = investigation.stages.findIndex((s) => s.event?.kind === "failure");
    if (i >= 0) return { investigation, index: i, failed: [] };
  }
  return null;
}

export default function Home() {
  const investigations = listInvestigations();
  const outlines = investigations.map((inv) => ({
    id: inv.id,
    title: inv.title,
    stages: inv.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase })),
  }));
  const companies = listCompanies();
  const first = investigations[0];
  const example = getConcept("caching")?.claims.find((c) => c.id === "redis-faster");
  const scene = heroScene();
  const stage = scene?.investigation.stages[scene.index];
  const visible = scene ? visibleAfter(scene.investigation, scene.index) : null;

  return (
    <div>
      <section className="section rise grid items-center gap-x-14 gap-y-12 pt-12 sm:pt-16 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div>
          <p className="chip-flat w-fit">
            <span className="led led-accent size-1.5" aria-hidden="true" />
            {investigations.length} systems · free · no signup
          </p>
          <h1 className="mt-5 max-w-[18ch] font-display text-[2.5rem] leading-[1.04] text-balance sm:text-[3.5rem] xl:text-[3.25rem]">
            Practise system design the way the interview tests it.
          </h1>
          <p className="mt-5 max-w-[54ch] text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">
            You can build a job queue, a payment flow, a WebSocket app. The interview asks something else: why it is built
            that way, what happens when it fails, and what you would change at ten times the load.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {first && (
              <Link href={`/investigations/${first.id}`} className="btn btn-primary min-h-10 px-4 text-[0.875rem]">
                Start the first investigation
              </Link>
            )}
            <Link href="/investigations" className="btn btn-secondary min-h-10 px-4 text-[0.875rem]">
              Browse all {investigations.length}
            </Link>
          </div>
          <p className="mt-4 text-[0.8125rem] text-ink-3">Nothing graded by AI. Your progress stays in your browser.</p>
        </div>

        {scene && stage && visible && (
          <figure
            className="panel rise min-w-0 p-2.5"
            style={{ "--d": "120ms" } as React.CSSProperties}
            aria-label="An investigation in progress"
          >
            <SystemMap
              compact
              label={`${scene.investigation.title}: the system when this failure happens`}
              components={scene.investigation.system.components}
              flows={scene.investigation.system.flows}
              visibleComponents={[...visible.components]}
              visibleFlows={[...visible.flows]}
              failedComponents={scene.failed.filter((id) => visible.components.has(id))}
            />
            <figcaption className="grid gap-4 px-2 pt-4 pb-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              {stage.event && (
                <div className="flex gap-3">
                  <span className="led led-gap led-pulse mt-1.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium leading-snug">
                      <InlineText text={stage.event.title} />
                    </p>
                    <p className="mt-1 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-2">
                      <InlineText text={stage.event.detail} /> What happens to the job now?
                    </p>
                  </div>
                </div>
              )}
              <Link href={`/investigations/${scene.investigation.id}/${stage.id}`} className="btn btn-secondary">
                Reason through it
              </Link>
            </figcaption>
          </figure>
        )}
      </section>

      <ContinueStrip investigations={outlines} />

      <Section id="loop" title="How it works" description="Every investigation is one system, built up from its requirements.">
        <ol className="grid gap-px overflow-hidden rounded-[14px] bg-rule shadow-[0_0_0_1px_var(--rule)] sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((item, i) => (
            <li key={item.step} className="bg-raised p-5">
              <span className="font-mono text-[0.75rem] text-ink-3 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-3 font-display text-[1.125rem] leading-tight">{item.step}</p>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-2">{item.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-[70ch] text-[0.875rem] leading-relaxed text-ink-3">
          After each answer you see the reasoning and where another engineer could reasonably disagree. Choices are checked
          against a key; written answers you mark yourself against specific points.
        </p>
      </Section>

      <Section
        id="systems"
        title="Systems to design"
        action={
          <Link href="/investigations" className="btn btn-ghost">
            All {investigations.length} →
          </Link>
        }
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {investigations.map((inv) => (
            <li key={inv.id}>
              <InvestigationTile investigation={inv} />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="companies"
        title="One idea from each company"
        description="Each system pairs with a company that solved the same problem and wrote about it. Read the original once you have made your own decisions."
        action={
          <Link href="/companies" className="btn btn-ghost">
            All companies →
          </Link>
        }
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <li key={company.id}>
              <Link href={`/companies/${company.id}`} className="tile group flex h-full flex-col px-4 py-3.5">
                <span className="text-[0.8125rem] text-ink-3">{company.name}</span>
                <span className="mt-0.5 text-[0.9375rem] font-medium leading-snug group-hover:text-accent">
                  {company.topic}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <section aria-label="More ways to practise" className="section grid gap-4 lg:grid-cols-2">
        {example && (
          <div className="panel flex flex-col p-6 sm:p-7">
            <h2 className="font-display text-[1.375rem] leading-tight">Precision over slogans</h2>
            <p className="mt-1.5 text-[0.875rem] text-ink-2">Things engineers say in design reviews, checked.</p>
            <blockquote className="mt-6 border-l-2 border-accent-solid pl-4">
              <p className="font-display text-[1.25rem] leading-snug">
                “<InlineText text={example.statement} />”
              </p>
              <p className="mt-3 text-[0.9375rem] font-medium">{VERDICT_LABEL[example.verdict]}.</p>
              <div className="mt-1 text-ink-2">
                <Prose text={example.explanation} className="prose-sm" />
              </div>
            </blockquote>
            <div className="mt-auto pt-6">
              <Link href="/practice" className="btn btn-secondary">
                Check more claims
              </Link>
            </div>
          </div>
        )}
        <div className="tint flex flex-col p-6 sm:p-7">
          <h2 className="font-display text-[1.375rem] leading-tight">Then, your own system</h2>
          <p className="mt-3 max-w-[56ch] text-[0.9375rem] leading-relaxed text-ink-2">
            Describe a system you built, its parts and how requests flow through it, and get the questions an interviewer
            would ask about it: trace this request, what survives a restart, what happens when this dependency is slow.
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            <Link href="/projects" className="btn btn-primary">
              Describe a project
            </Link>
            <Link href="/interview" className="btn btn-secondary">
              Try a mock interview
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
