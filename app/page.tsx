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
      <section className="section rise pt-8 sm:pt-12">
        <h1 className="max-w-[20ch] font-display text-[2.5rem] leading-[1.05] text-balance sm:text-[3.25rem]">
          Practise system design the way the interview tests it.
        </h1>
        <p className="mt-5 max-w-[58ch] text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">
          You can build a job queue, a payment flow, a WebSocket app. The interview asks something else: why it is built
          that way, what happens when it fails, and what you would change at ten times the load.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {first && (
            <Link href={`/investigations/${first.id}`} className="btn btn-primary">
              Start the first investigation
            </Link>
          )}
          <Link href="/investigations" className="btn btn-secondary">
            Browse all {investigations.length}
          </Link>
        </div>
        <p className="mt-4 text-[0.8125rem] text-ink-3">Free. No signup. Nothing graded by AI.</p>

        {scene && stage && visible && (
          <figure
            className="panel rise mt-12 p-2.5"
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
        <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {LOOP.map((item) => (
            <div key={item.step}>
              <dt className="text-[0.9375rem] font-medium">{item.step}</dt>
              <dd className="mt-0.5 text-[0.9375rem] leading-relaxed text-ink-2">{item.text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-3">
          After each answer you see the reasoning and where another engineer could reasonably disagree. Choices are checked
          against a key; written answers you mark yourself against specific points.
        </p>
      </Section>

      <Section id="systems" title="Systems to design">
        <ul className="grid gap-3 md:grid-cols-2">
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
      >
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {companies.map((company) => (
            <li key={company.id}>
              <Link href={`/companies/${company.id}`} className="group block text-[0.9375rem] leading-snug">
                <span className="font-medium group-hover:text-accent">{company.name}</span>
                <span className="text-ink-2"> · {company.topic}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {example && (
        <Section id="precision" title="Precision over slogans" description="Things engineers say in design reviews, checked.">
          <div className="max-w-[66ch]">
            <p className="font-display text-[1.375rem] leading-snug">
              “<InlineText text={example.statement} />”
            </p>
            <p className="mt-3 text-[0.9375rem] font-medium">
              {VERDICT_LABEL[example.verdict]}.
            </p>
            <div className="mt-1 text-ink-2">
              <Prose text={example.explanation} className="prose-sm" />
            </div>
          </div>
          <Link href="/practice" className="btn btn-secondary mt-5">
            Check more claims
          </Link>
        </Section>
      )}

      <Section id="own" title="Then, your own system">
        <p className="max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-2">
          Describe a system you built, its parts and how requests flow through it, and get the questions an interviewer
          would ask about it: trace this request, what survives a restart, what happens when this dependency is slow.
        </p>
        <Link href="/projects" className="btn btn-primary mt-5">
          Describe a project
        </Link>
      </Section>
    </div>
  );
}
