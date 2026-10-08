import Link from "next/link";
import { ContinueStrip } from "@/components/continue-strip";
import { InvestigationIndex } from "@/components/investigation/investigation-index";
import { Lesson } from "@/components/lesson/lesson";
import { InlineText } from "@/components/prose-core";
import { SystemMap } from "@/components/system-map";
import { getConcept, getInvestigation, listCompanies, listInvestigations } from "@/lib/content";
import { visibleAfter } from "@/lib/domain/visibility";

const LOOP = [
  { step: "Learn", text: "Short explanations with quick checks: estimate the numbers, predict what breaks, then see why." },
  { step: "Decide", text: "Choose between designs that all sound plausible, using what you just worked out." },
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
  const demo = getConcept("caching")?.lesson?.slice(0, 3);
  const scene = heroScene();
  const stage = scene?.investigation.stages[scene.index];
  const visible = scene ? visibleAfter(scene.investigation, scene.index) : null;

  return (
    <div>
      <section className="bleed drafting border-b border-rule">
        <div className="pt-14 pb-12 sm:pt-20 sm:pb-16">
          <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
            <h1 className="max-w-[13ch] font-display text-[2.75rem] leading-[0.98] tracking-[-0.035em] text-balance sm:text-[4.25rem]">
              Practise system design the way the interview tests it.
            </h1>
            <div className="max-w-[46ch] lg:pb-2">
              <p className="text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">
                You can build a job queue, a payment flow, a WebSocket app. The interview asks something else: why it is
                built that way, what happens when it fails, and what you would change at ten times the load.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {first && (
                  <Link href={`/investigations/${first.id}`} className="btn btn-primary min-h-10 px-4 text-[0.875rem]">
                    Start the first investigation
                  </Link>
                )}
                <Link href="/investigations" className="btn btn-secondary min-h-10 px-4 text-[0.875rem]">
                  Browse all {investigations.length} systems
                </Link>
              </div>
              <p className="mt-4 text-[0.8125rem] text-ink-3">Free and without signup. Nothing is graded by AI.</p>
            </div>
          </div>

          {scene && stage && visible && (
            <figure className="mt-10 sm:mt-12" aria-label="An investigation in progress">
              <SystemMap
                bare
                compact
                label={`${scene.investigation.title}: the system when this failure happens`}
                components={scene.investigation.system.components}
                flows={scene.investigation.system.flows}
                visibleComponents={[...visible.components]}
                visibleFlows={[...visible.flows]}
                failedComponents={scene.failed.filter((id) => visible.components.has(id))}
                callout={
                  stage.event && scene.failed[0]
                    ? {
                        componentId: scene.failed[0],
                        content: (
                          <div className="pt-1 pb-1">
                            <p className="font-display text-[1.25rem] leading-snug">
                              <InlineText text={stage.event.title} />
                            </p>
                            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
                              <InlineText text={stage.event.detail} /> What happens to the job now?
                            </p>
                            <Link
                              href={`/investigations/${scene.investigation.id}/${stage.id}`}
                              className="btn btn-secondary mt-5"
                            >
                              Reason through it
                            </Link>
                          </div>
                        ),
                      }
                    : undefined
                }
              />
            </figure>
          )}
        </div>
      </section>

      <ContinueStrip investigations={outlines} />

      <section aria-labelledby="loop" className="section pt-14 sm:pt-20">
        <h2 id="loop" className="max-w-[30ch] font-display text-[1.75rem] leading-tight text-balance">
          Every investigation is one system, built up from its requirements, in the same loop.
        </h2>
        <ol className="mt-10 grid gap-y-8 lg:grid-cols-5">
          {LOOP.map((item, i) => (
            <li key={item.step} className="min-w-0">
              <div className="flex items-center">
                <span className="rounded-lg border border-ink/40 bg-raised px-4 py-2 text-[0.9375rem] font-medium">
                  {item.step}
                </span>
                {i < LOOP.length - 1 && (
                  <span className="relative mx-3 hidden h-px flex-1 bg-ink/40 lg:block" aria-hidden="true">
                    <span className="absolute -top-[3.5px] right-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-ink/40" />
                  </span>
                )}
              </div>
              <p className="mt-4 max-w-[30ch] text-[0.9375rem] leading-relaxed text-ink-2 lg:pr-6">{item.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 max-w-[70ch] text-[0.875rem] leading-relaxed text-ink-3">
          After each answer you see why every option is right or wrong, and the few points worth remembering. Choices are
          checked against a key; if you write down your reasoning, you mark it yourself against specific points. New to the format? Read{" "}
          <Link href="/system-design-interview" className="link">
            how the system design interview works
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="systems" className="section pt-14 sm:pt-20">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="systems" className="font-display text-[1.75rem] leading-tight">
            Systems to design
          </h2>
          <p className="text-[0.875rem] text-ink-3">
            Solid parts are given; you design the outlined ones.
          </p>
        </div>
        <InvestigationIndex investigations={investigations.slice(0, 6)} clamp />
        <Link href="/investigations" className="btn btn-secondary mt-8">
          See all {investigations.length} systems
        </Link>
      </section>

      <section aria-labelledby="companies" className="section pt-14 sm:pt-20">
        <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <h2 id="companies" className="font-display text-[1.75rem] leading-tight">
              One idea from each company
            </h2>
            <p className="mt-3 max-w-[42ch] text-[0.9375rem] leading-relaxed text-ink-2">
              Each system pairs with a company that solved the same problem and wrote about it. Read the original once you
              have made your own decisions.
            </p>
            <Link href="/companies" className="link mt-5 inline-block text-[0.875rem]">
              All companies
            </Link>
          </div>
          <ul className="grid gap-x-10 sm:grid-cols-2">
            {companies.map((company) => (
              <li key={company.id} className="border-t border-rule">
                <Link href={`/companies/${company.id}`} className="group block py-3.5 text-[0.9375rem] leading-snug">
                  <span className="font-medium group-hover:text-accent">{company.name}</span>
                  <span className="mt-0.5 block text-ink-2">{company.topic}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="More ways to practise" className="section grid gap-x-16 gap-y-14 pt-14 sm:pt-20 lg:grid-cols-2">
        {demo && (
          <div>
            <h2 className="font-display text-[1.75rem] leading-tight">Learn by working it out</h2>
            <p className="mt-2 max-w-[52ch] text-[0.9375rem] text-ink-2">
              Every idea comes in small steps, each with a check that answers straight away. Try the start of the caching
              lesson.
            </p>
            <div className="mt-7">
              <Lesson lessonKey="home:caching" steps={demo} />
            </div>
            <Link href="/concepts/caching#learn" className="btn btn-secondary mt-2">
              Continue the caching lesson
            </Link>
          </div>
        )}
        <div className="lg:border-l lg:border-rule lg:pl-16">
          <h2 className="font-display text-[1.75rem] leading-tight">Then, your own system</h2>
          <p className="mt-4 max-w-[52ch] text-[1rem] leading-relaxed text-ink-2">
            Describe a system you built, its parts and how requests flow through it, and get the questions an interviewer
            would ask about it: trace this request, what survives a restart, what happens when this dependency is slow.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
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
