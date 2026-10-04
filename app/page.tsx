import Link from "next/link";
import { ContinueStrip } from "@/components/continue-strip";
import { InvestigationTile } from "@/components/investigation/investigation-tile";
import { Section } from "@/components/page-header";
import { InlineText } from "@/components/prose-core";
import { Prose } from "@/components/prose";
import { SystemMap } from "@/components/system-map";
import { VERDICT_LABEL } from "@/components/ui";
import { getConcept, getInvestigation, listCompanies, listConcepts, listInvestigations, listWriteups, writeupsByCompany } from "@/lib/content";
import { CLAIM_VERDICTS } from "@/lib/domain/content";
import { visibleAfter } from "@/lib/domain/visibility";

const LOOP = [
  { step: "Requirements", text: "Start from what the system must do and guarantee, with real numbers." },
  { step: "Decide", text: "Choose between designs that all sound plausible." },
  { step: "Explain why", text: "Write your reasoning before you see anyone else's." },
  { step: "Reveal", text: "See the mechanism, the tradeoff, and where another engineer would differ." },
  { step: "Break it", text: "A worker dies, a message arrives twice, a request times out after succeeding.", led: "led-gap" },
  { step: "Change it", text: "100x traffic, a new requirement, a promise from sales.", led: "led-partial" },
  { step: "Defend it", text: "Explain what the design guarantees, what it assumes, and where it stops working." },
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
  const conceptCount = listConcepts().length;
  const writeupCount = listWriteups().length;
  const companies = listCompanies()
    .map((c) => ({ company: c, count: writeupsByCompany(c.id).length }))
    .sort((a, b) => b.count - a.count);
  const first = investigations[0];
  const example = getConcept("caching")?.claims.find((c) => c.id === "redis-faster");
  const scene = heroScene();
  const stage = scene?.investigation.stages[scene.index];
  const visible = scene ? visibleAfter(scene.investigation, scene.index) : null;

  return (
    <div>
      <section className="section rise">
        <p className="eyebrow">Free system design interview practice</p>
        <h1 className="mt-4 max-w-[22ch] font-display text-[2.25rem] leading-[1.05] text-balance sm:text-[2.875rem]">
          Practise system design the way the interview tests it.
        </h1>
        <p className="mt-4 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-2 text-pretty">
          You can build a job queue, a payment flow, a WebSocket app. The interview asks something else: why it is built
          that way, what happens when it fails, and what you would change at 100x. This is where you practise that.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {first && (
            <Link href={`/investigations/${first.id}`} className="btn btn-primary">
              Start the first investigation
            </Link>
          )}
          <Link href="/investigations" className="btn btn-secondary">
            Browse investigations
          </Link>
        </div>
        <p className="mt-4 font-mono text-[0.625rem] uppercase tracking-wider text-ink-3">
          Free · No signup · {investigations.length} systems · {conceptCount} concepts · {writeupCount} engineering sources
        </p>

        {scene && stage && visible && (
          <figure
            className="panel rise mt-10 p-2.5"
            style={{ "--d": "120ms" } as React.CSSProperties}
            aria-label="An investigation in progress"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-1 pb-2.5">
              <p className="text-[0.8125rem] font-medium">{scene.investigation.title}</p>
              <p className="font-mono text-[0.625rem] uppercase tracking-wider text-ink-3">
                Stage {scene.index + 1} of {scene.investigation.stages.length}
              </p>
            </div>
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
                    <p className="text-[0.875rem] font-medium leading-snug">
                      <InlineText text={stage.event.title} />
                    </p>
                    <p className="mt-1 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-2">
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

      <Section
        id="loop"
        n={1}
        title="How an investigation works"
        description="The same seven moves, in every system."
      >
        <ol className="space-y-px">
          {LOOP.map((item, i) => (
            <li key={item.step} className="flex items-baseline gap-3 rounded-lg py-1.5 text-[0.8125rem]">
              <span className="w-5 shrink-0 font-mono text-[0.625rem] tabular-nums text-ink-3">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {item.step}
                  {item.led && <span className={`led ${item.led} size-1.5`} aria-hidden="true" />}
                </span>
                <span className="hidden text-ink-3 sm:inline" aria-hidden="true">
                  ·
                </span>
                <span className="text-ink-2">{item.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="tint mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink">
            Every answer is evidence. Decisions, claims, sequences and diagnoses are checked against a key; written
            reasoning you assess against specific points. No AI grading, no streaks.
          </p>
          <Link href="/understanding" className="link shrink-0 text-[0.8125rem]">
            What evidence looks like
          </Link>
        </div>
      </Section>

      <Section
        id="systems"
        n={2}
        title="Systems to investigate"
        description="Each sketch is the finished design: solid parts are given, outlined parts are yours to work out."
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {investigations.map((inv) => (
            <li key={inv.id}>
              <InvestigationTile investigation={inv} />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="sources"
        n={3}
        title="Built from what real teams published"
        description="Each investigation follows decisions engineers wrote about: the schema, the incident, the migration, the numbers."
      >
        <ul className="flex flex-wrap gap-1.5">
          {companies.map(({ company, count }) => (
            <li key={company.id}>
              <Link href={`/companies/${company.id}`} className="chip hover:text-accent">
                {company.name}
                <span className="font-mono text-[0.625rem] tabular-nums text-ink-3">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-2">
          Discord&apos;s message storage, Twitter&apos;s timelines, Facebook&apos;s memcache, Notion&apos;s sharding, Slack&apos;s job
          queue: you make each decision first, then see what they chose, what broke, and the original write-up to read next.
        </p>
        <Link href="/companies" className="btn btn-secondary mt-4">
          Browse by company
        </Link>
      </Section>

      {example && (
        <Section
          id="precision"
          n={4}
          title="Precision over slogans"
          description="Statements engineers say in design reviews, checked."
        >
          <div className="tint p-5 sm:p-6">
            <p className="font-display text-[1.375rem] leading-snug">
              “<InlineText text={example.statement} />”
            </p>
            <div
              className="mt-4 inline-flex gap-0.5 rounded-[10px] bg-paper/70 p-[3px] shadow-[inset_0_0_0_1px_var(--rule)]"
              aria-label="Verdict"
            >
              {CLAIM_VERDICTS.map((v) => (
                <span
                  key={v}
                  aria-current={v === example.verdict ? "true" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[0.75rem] font-medium ${
                    v === example.verdict ? "bg-raised text-ink shadow-[var(--shadow-btn)]" : "text-ink-3"
                  }`}
                >
                  {v === example.verdict && <span className="led led-accent size-1.5" aria-hidden="true" />}
                  {VERDICT_LABEL[v]}
                </span>
              ))}
            </div>
            <div className="mt-4 max-w-[64ch] text-ink-2">
              <Prose text={example.explanation} className="prose-sm" />
            </div>
          </div>
          <Link href="/practice" className="btn btn-secondary mt-4">
            Try a claim check
          </Link>
        </Section>
      )}

      <Section id="own" n={5} title="Then, your own system" description="The questions an interviewer asks about it.">
        <p className="max-w-[30ch] font-display text-[1.375rem] leading-snug text-balance">
          “I built this project, but can I actually explain how it works?”
        </p>
        <p className="mt-3 max-w-[62ch] text-[0.875rem] leading-relaxed text-ink-2">
          Describe a system you built: its components, flows and invariants. You get the questions an interviewer would
          ask about it: trace this request, which state survives a restart, what happens when this dependency is slow,
          where is that guarantee enforced. Your answers show which parts you understand and which you only assembled.
        </p>
        <Link href="/projects" className="btn btn-primary mt-5">
          Describe a project
        </Link>
      </Section>
    </div>
  );
}
