import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { listCompanies, listConcepts, listInvestigations, listWriteups } from "@/lib/content";
import { breadcrumbs, jsonLd, pageMetadata } from "@/lib/metadata";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: `About ${SITE_NAME}: How the System Design Practice Works`,
  description: `What ${SITE_NAME} is, how each system design exercise is built, where the material comes from, and how answers are checked. Free, no signup, no AI grading.`,
  path: "/about",
});

export default function AboutPage() {
  const investigations = listInvestigations();
  const stages = investigations.reduce((n, inv) => n + inv.stages.length, 0);
  const concepts = listConcepts().length;
  const companies = listCompanies().length;
  const writeups = listWriteups().length;

  return (
    <article className="measure">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@graph": [
              breadcrumbs([{ name: `About ${SITE_NAME}`, path: "/about" }]),
              {
                "@type": "AboutPage",
                name: `About ${SITE_NAME}`,
                url: `${SITE_URL}/about`,
                description: SITE_DESCRIPTION,
                mainEntity: { "@id": `${SITE_URL}/#organization` },
              },
            ],
          }),
        }}
      />
      <PageHeader title={`About ${SITE_NAME}`}>
        {SITE_NAME} is free practice for system design interviews. It teaches the part most preparation skips: why a
        system is built the way it is, what happens when it fails, and what changes when the requirements do.
      </PageHeader>

      <Section id="what" title="What is here">
        <div className="max-w-[66ch] space-y-4 text-[1rem] leading-relaxed text-ink-2">
          <p>
            <Link href="/investigations" className="link">
              {investigations.length} systems
            </Link>{" "}
            to design, split into {stages} stages;{" "}
            <Link href="/concepts" className="link">
              {concepts} concepts
            </Link>{" "}
            explained from the problem they solve to the way they fail; and{" "}
            <Link href="/companies" className="link">
              {companies} companies
            </Link>{" "}
            whose engineers published how they solved the same problems. There is also a{" "}
            <Link href="/system-design-interview" className="link">
              guide to the interview itself
            </Link>{" "}
            and a timed{" "}
            <Link href="/interview" className="link">
              mock interview
            </Link>
            .
          </p>
        </div>
      </Section>

      <Section id="method" title="How each system is built">
        <div className="max-w-[66ch] space-y-4 text-[1rem] leading-relaxed text-ink-2">
          <p>
            Every system starts from a scenario with explicit requirements, constraints and assumptions, the way a real
            design review does. The stages then follow the same loop: model the problem, decide between designs that
            all sound plausible, break the design with a concrete failure, change a constraint, and defend what is left.
          </p>
          <p>
            Each stage asks you to commit to an answer before it shows the reasoning, including where another engineer
            could reasonably land differently. Every system also has a full written walkthrough with the finished
            architecture, its invariants, its tradeoffs and the point where it stops working.
          </p>
        </div>
      </Section>

      <Section id="sources" title="Where the material comes from">
        <div className="max-w-[66ch] space-y-4 text-[1rem] leading-relaxed text-ink-2">
          <p>
            The systems are built from how real companies describe their own designs: {writeups} engineering posts,
            papers and talks from {companies} companies, each linked from the pages that draw on it. Where a design
            follows a published account, the page says so and links to the original, so you can check the reasoning
            against the engineers who built it.
          </p>
          <p>
            The concepts avoid product names wherever a mechanism will do: a page about queues explains acknowledgements
            and redelivery, not a particular broker.
          </p>
        </div>
      </Section>

      <Section id="checking" title="How answers are checked">
        <div className="max-w-[66ch] space-y-4 text-[1rem] leading-relaxed text-ink-2">
          <p>
            Nothing is graded by AI. Choices, verdicts and orderings are checked against an authored answer key. Written
            explanations are compared by you against specific points in a reference answer, so your progress is only as
            honest as your own marks, and it says so.
          </p>
          <p>
            There are no accounts. Your answers and projects are stored in your browser, and you can export or delete
            them from{" "}
            <Link href="/understanding" className="link">
              your progress
            </Link>
            .
          </p>
        </div>
      </Section>
    </article>
  );
}
