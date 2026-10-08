import type { Metadata } from "next";
import Link from "next/link";
import { DIFFICULTY } from "@/components/investigation/difficulty";
import { DashList, PageHeader, Section } from "@/components/page-header";
import { getConcept, listInvestigations } from "@/lib/content";
import { DIMENSION_LABELS, DIMENSIONS } from "@/lib/domain/content";
import { breadcrumbs, faqPage, jsonLd, pageMetadata } from "@/lib/metadata";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const PATH = "/system-design-interview";
const PUBLISHED = "2026-10-06";
const MODIFIED = "2026-10-06";

export const metadata: Metadata = pageMetadata({
  title: "System Design Interview: How It Works and How to Prepare",
  description:
    "What a system design interview tests, how to spend the 45 minutes, the mistakes that sink candidates, and real systems to practise on. Free, no signup.",
  path: PATH,
});

const LEAD =
  "A system design interview asks you to design a large system, such as a URL shortener or a news feed, out loud in about 45 minutes. It does not test whether you can draw the expected diagram. It tests whether you can turn vague requirements into numbers, choose between designs for a stated reason, and say what happens when parts of your design fail.";

const PLAN = [
  {
    step: "Pin down the requirements",
    minutes: "about 5 minutes",
    text: "Ask what users do (the functional requirements) and how well it must work: scale, latency, durability, consistency (the non-functional ones). Then state your assumptions out loud, so the interviewer can correct them before you build on them.",
  },
  {
    step: "Estimate the load",
    minutes: "about 5 minutes",
    text: "Requests per second at peak, storage per year, the ratio of reads to writes. Round freely. The point is not the number but what it tells you: which part of the system is under pressure, and which is not worth optimising.",
  },
  {
    step: "Sketch the high-level design",
    minutes: "about 10 minutes",
    text: "Clients, the API, the data stores, and any work that happens asynchronously. Then trace one request from end to end across every boundary it crosses, so both of you agree on what the boxes do.",
  },
  {
    step: "Go deep where the requirements make it hard",
    minutes: "about 15 minutes",
    text: "Every question has one or two hard parts: a hot key, an effect that must happen exactly once, a write that fans out to millions of readers. Put two designs side by side, choose one, and say what it costs.",
  },
  {
    step: "Break it",
    minutes: "5 to 10 minutes",
    text: "A worker dies halfway through a job. A message arrives twice. A request times out after it succeeded. Traffic grows ten times. Say what your design does in each case, and change it where the answer is wrong.",
  },
  {
    step: "Close with what it guarantees",
    minutes: "the last few minutes",
    text: "What the design promises, what it assumes, and where it stops working. Interviewers remember a candidate who knows the limits of their own design.",
  },
];

const LISTEN_FOR = [
  "A tradeoff named together with its cost, not just its benefit.",
  "Numbers that change a decision: why one database is enough, or why it is not.",
  "Mechanisms instead of product names: “a durable queue with acknowledgements”, not “use Kafka”.",
  "Precise guarantees: at-least-once delivery with an idempotent consumer, not “exactly once”.",
  "Failure behaviour you volunteer before being asked.",
  "Changing the design calmly when the interviewer changes a constraint.",
];

const MISTAKES = [
  "Drawing boxes before agreeing on the requirements, then designing for the wrong problem.",
  "Designing for a billion users when the question implied ten thousand.",
  "Presenting one design as the answer, with no alternative and no reason.",
  "Treating a cache, a queue or a retry as free: each adds a failure mode of its own.",
  "Saying nothing about what happens when a component dies or a network call times out.",
  "Going silent while thinking. The interview grades your reasoning, so it has to be audible.",
];

const CONCEPT_IDS = [
  "caching",
  "message-queues",
  "idempotency",
  "delivery-guarantees",
  "partitioning",
  "replication",
  "consistent-hashing",
  "rate-limiting",
  "timeouts",
  "transactional-outbox",
  "fan-out",
  "backpressure",
];

const FAQ = [
  {
    question: "How long is a system design interview?",
    answer:
      "Usually 45 to 60 minutes for a single problem. Expect around 5 minutes on requirements, 5 on estimates, 10 on the high-level design, 15 on the hardest part, and the rest on failures, scale and questions.",
  },
  {
    question: "Do junior engineers get system design interviews?",
    answer:
      "Sometimes, in a lighter form. They become standard from mid-level roles upwards, and for senior roles the system design round often decides the level of the offer.",
  },
  {
    question: "What is the difference between high-level and low-level design?",
    answer:
      "High-level design (HLD) is about services, data stores and how requests and data flow between them. Low-level design (LLD) is about the inside of one component: its classes, interfaces and data schema. Most system design interviews are high-level, with a deep dive into one component.",
  },
  {
    question: "Should I memorise designs for common questions?",
    answer:
      "No. Interviewers change a constraint precisely to see whether you understand why a design works. Practise the reasoning instead: decide, explain the mechanism, break it, and adapt it when the requirements move.",
  },
  {
    question: "How should I practise for a system design interview?",
    answer:
      "Work through whole systems from their requirements, out loud or in writing, and check your reasoning against a worked answer. Practise failure scenarios deliberately, since that is where most candidates are weakest. Finish with timed mock interviews.",
  },
  {
    question: `Is ${SITE_NAME} free?`,
    answer: `Yes. ${SITE_NAME} is free, needs no account, and keeps your progress in your browser.`,
  },
];

export default function SystemDesignInterviewPage() {
  const investigations = listInvestigations();
  const levels = (["foundational", "intermediate", "advanced"] as const).map((level) => ({
    level,
    items: investigations.filter((inv) => inv.difficulty === level),
  }));
  const concepts = CONCEPT_IDS.flatMap((id) => {
    const c = getConcept(id);
    return c ? [c] : [];
  });

  return (
    <article className="measure">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@graph": [
              breadcrumbs([{ name: "System design interview guide", path: PATH }]),
              {
                "@type": "Article",
                headline: "How to prepare for a system design interview",
                description: LEAD,
                url: `${SITE_URL}${PATH}`,
                mainEntityOfPage: `${SITE_URL}${PATH}`,
                datePublished: PUBLISHED,
                dateModified: MODIFIED,
                inLanguage: "en",
                author: { "@id": `${SITE_URL}/#organization` },
                publisher: { "@id": `${SITE_URL}/#organization` },
                about: ["System design interview", "Distributed systems", "Software engineering interview"],
              },
              faqPage(FAQ),
            ],
          }),
        }}
      />
      <PageHeader title="How to prepare for a system design interview" meta={`Updated ${formatDate(MODIFIED)}`}>
        {LEAD}
      </PageHeader>

      <Section id="tests" title="What does a system design interview test?">
        <p className="max-w-[66ch] text-[1rem] leading-relaxed text-ink-2">
          Six abilities, and every question exercises several of them. They are also how every exercise on {SITE_NAME}{" "}
          is tagged, so your progress shows which ones you are weak in.
        </p>
        <dl className="mt-6 max-w-[66ch] divide-y divide-rule border-y border-rule">
          {DIMENSIONS.map((d) => (
            <div key={d} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt className="text-[0.9375rem] font-medium">{DIMENSION_LABELS[d].verb}</dt>
              <dd className="text-[0.9375rem] leading-relaxed text-ink-2">{DIMENSION_LABELS[d].description}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="plan" title="How should you spend the 45 minutes?">
        <ol className="max-w-[66ch] space-y-6">
          {PLAN.map((item, i) => (
            <li key={item.step} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
              <span className="pt-0.5 font-display text-[1.125rem] text-ink-3 tabular-nums">{i + 1}</span>
              <div>
                <h3 className="text-[1rem] font-medium">
                  {item.step} <span className="font-normal text-ink-3">({item.minutes})</span>
                </h3>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="listen" title="What do interviewers listen for?">
        <DashList items={LISTEN_FOR} />
      </Section>

      <Section id="mistakes" title="Which mistakes sink candidates?">
        <DashList items={MISTAKES} />
      </Section>

      <Section
        id="questions"
        title="System design interview questions to practise"
        description="Each one is worked through in stages: you decide and explain before you see the reasoning. Every question also has a full written answer."
      >
        <div className="space-y-8">
          {levels.map(({ level, items }) =>
            items.length === 0 ? null : (
              <div key={level}>
                <h3 className="mb-3 text-[0.875rem] font-medium text-ink-2">{DIFFICULTY[level]}</h3>
                <ul className="divide-y divide-rule border-y border-rule">
                  {items.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                      <Link href={`/investigations/${inv.id}`} className="text-[0.9375rem] font-medium hover:text-accent">
                        {inv.searchTitle}
                      </Link>
                      <Link href={`/investigations/${inv.id}/review`} className="text-[0.8125rem] text-ink-3 hover:text-ink">
                        Read the answer
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      </Section>

      {concepts.length > 0 && (
        <Section id="concepts" title="Which concepts should you know first?">
          <ul className="grid max-w-[66ch] gap-x-8 gap-y-3 sm:grid-cols-2">
            {concepts.map((c) => (
              <li key={c.id}>
                <Link href={`/concepts/${c.id}`} className="text-[0.9375rem] font-medium hover:text-accent">
                  {c.title}
                </Link>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-2">{c.summary}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="faq" title="Frequently asked questions">
        <dl className="max-w-[66ch] space-y-6">
          {FAQ.map((item) => (
            <div key={item.question}>
              <dt className="text-[1rem] font-medium">{item.question}</dt>
              <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <section aria-label="Start practising" className="section border-t border-rule">
        <p className="max-w-[60ch] font-display text-[1.375rem] leading-snug">
          The fastest way to get better is to reason through a real system and check your answer against a worked one.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {investigations[0] && (
            <Link href={`/investigations/${investigations[0].id}`} className="btn btn-primary">
              Start with {investigations[0].searchTitle.toLowerCase()}
            </Link>
          )}
          <Link href="/interview" className="btn btn-secondary">
            Take a mock interview
          </Link>
        </div>
      </section>
    </article>
  );
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
