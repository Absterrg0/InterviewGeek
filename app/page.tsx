import Link from "next/link";
import { ContinueStrip } from "@/components/continue-strip";
import { InlineText } from "@/components/prose-core";
import { Prose } from "@/components/prose";
import { VERDICT_LABEL } from "@/components/ui";
import { getConcept, listInvestigations } from "@/lib/content";

const LOOP = [
  { step: "Requirements", text: "Start from what the system must do and guarantee, with real numbers." },
  { step: "Decide", text: "Choose between designs that all sound plausible." },
  { step: "Explain why", text: "Write your reasoning before you see anyone else's." },
  { step: "Reveal", text: "See the mechanism, the tradeoff, and where another engineer would differ." },
  { step: "Break it", text: "A worker dies, a message arrives twice, a request times out after succeeding." },
  { step: "Change it", text: "100x traffic, a new requirement, a promise from sales." },
  { step: "Defend it", text: "Explain what the design guarantees, what it assumes, and where it stops working." },
];

export default function Home() {
  const investigations = listInvestigations();
  const outlines = investigations.map((inv) => ({
    id: inv.id,
    title: inv.title,
    stages: inv.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase })),
  }));
  const first = investigations[0];
  const example = getConcept("caching")?.claims.find((c) => c.id === "redis-faster");

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <section className="pt-16 sm:pt-24 pb-14 max-w-3xl">
        <p className="eyebrow">Engineering investigations</p>
        <h1 className="mt-4 font-serif text-[2.6rem] sm:text-6xl leading-[1.04] tracking-tight text-balance">
          Prepare for interviews by learning how systems actually work.
        </h1>
        <p className="mt-6 text-lg sm:text-xl leading-relaxed text-ink-2 text-pretty">
          You can build a job queue, a payment flow, a WebSocket app. The interview asks something else: why it is
          built that way, what happens when it fails, and what you would change at 100x. This is where you practise
          that.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {first && (
            <Link href={`/investigations/${first.id}`} className="btn btn-primary">
              Start the first investigation
            </Link>
          )}
          <Link href="/investigations" className="btn btn-secondary">
            Browse investigations
          </Link>
        </div>
      </section>

      <ContinueStrip investigations={outlines} />

      <section aria-labelledby="loop" className="mt-16 border-t border-rule pt-10">
        <h2 id="loop" className="eyebrow mb-6">How an investigation works</h2>
        <ol className="grid gap-px bg-rule border border-rule rounded-md overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((item, i) => (
            <li key={item.step} className="bg-paper p-5">
              <p className="font-mono text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-2 font-medium">{item.step}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{item.text}</p>
            </li>
          ))}
          <li className="bg-paper p-5 flex flex-col justify-between">
            <p className="text-sm leading-relaxed text-ink-2">
              Every answer is evidence. Decisions, claims, sequences and diagnoses are checked against a key; written
              reasoning you assess against specific points. No AI grading, no streaks.
            </p>
            <Link href="/understanding" className="mt-3 text-sm link">What evidence looks like</Link>
          </li>
        </ol>
      </section>

      <section aria-labelledby="systems" className="mt-20">
        <h2 id="systems" className="eyebrow mb-2">Systems to investigate</h2>
        <ul className="border-t border-rule">
          {investigations.map((inv) => (
            <li key={inv.id} className="border-b border-rule">
              <Link href={`/investigations/${inv.id}`} className="group grid gap-x-10 gap-y-2 py-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <span className="font-serif text-2xl leading-snug tracking-tight group-hover:text-accent transition-colors">
                  {inv.title}
                </span>
                <span className="text-[0.9375rem] leading-relaxed text-ink-2">
                  {inv.premise}
                  <span className="mt-2 block text-xs text-ink-3">
                    {inv.stages.length} stages · about {inv.estimatedMinutes} minutes
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-20 grid gap-12 lg:grid-cols-2">
        {example && (
          <section aria-labelledby="precision" className="rounded-md border border-rule bg-raised p-6 sm:p-8">
            <h2 id="precision" className="eyebrow">Precision over slogans</h2>
            <p className="mt-4 font-serif text-2xl leading-snug">“<InlineText text={example.statement} />”</p>
            <p className="mt-3 text-sm font-medium">{VERDICT_LABEL[example.verdict]}.</p>
            <div className="mt-2 text-ink-2">
              <Prose text={example.explanation} className="prose-sm" />
            </div>
            <Link href="/practice" className="mt-5 inline-block text-sm link">Try a claim check</Link>
          </section>
        )}
        <section aria-labelledby="own" className="p-0 lg:p-8">
          <h2 id="own" className="eyebrow">Then, your own system</h2>
          <p className="mt-4 font-serif text-2xl leading-snug">
            “I built this project, but can I actually explain how it works?”
          </p>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-2">
            Describe a system you built: its components, flows and invariants. You get the questions an interviewer
            would ask about it: trace this request, which state survives a restart, what happens when this dependency
            is slow, where is that guarantee enforced. Your answers show which parts you understand and which you only
            assembled.
          </p>
          <Link href="/projects" className="mt-5 inline-block text-sm link">Describe a project</Link>
        </section>
      </div>
    </div>
  );
}
