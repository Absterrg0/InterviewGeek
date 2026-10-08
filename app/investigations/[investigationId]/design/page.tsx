import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignRoundRunner, type ReferenceView } from "@/components/design/design-round";
import { DashList, PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { InlineText } from "@/components/prose-core";
import { SystemMap } from "@/components/system-map";
import { getConcept, getInvestigation, listInvestigations } from "@/lib/content";
import { designReference, interviewPrompt } from "@/lib/content/design-reference";
import { DESIGN_ROUND_MINUTES, DESIGN_SECTION_IDS } from "@/lib/domain/design-round";
import { breadcrumbs, clip, jsonLd, pageMetadata } from "@/lib/metadata";

export function generateStaticParams() {
  return listInvestigations().map((inv) => ({ investigationId: inv.id }));
}

export const dynamicParams = false;

export async function generateMetadata(
  props: PageProps<"/investigations/[investigationId]/design">,
): Promise<Metadata> {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) return {};
  return pageMetadata({
    title: `${inv.searchTitle}: Practice Round from a Blank Page`,
    description: clip(
      `A ${DESIGN_ROUND_MINUTES}-minute system design round: ${inv.premise} Write requirements, estimates, the design, deep dives and failure handling yourself, then compare with a reference design.`,
    ),
    path: `/investigations/${inv.id}/design`,
  });
}

const resolve = (id: string) => getConcept(id);

export default async function DesignPage(props: PageProps<"/investigations/[investigationId]/design">) {
  const { investigationId } = await props.params;
  const inv = getInvestigation(investigationId);
  if (!inv) notFound();

  const reference = designReference(inv);
  const view = Object.fromEntries(
    DESIGN_SECTION_IDS.map((section) => [
      section,
      reference[section].map((item) => ({
        id: item.id,
        text: <InlineText text={item.text} resolve={resolve} />,
        detail: item.detail ? <InlineText text={item.detail} resolve={resolve} /> : undefined,
      })),
    ]),
  ) as ReferenceView;

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbs([
              { name: "System design interview questions", path: "/investigations" },
              { name: inv.searchTitle, path: `/investigations/${inv.id}` },
              { name: "Design round", path: `/investigations/${inv.id}/design` },
            ]),
          ),
        }}
      />
      <PageHeader
        eyebrow={
          <Link href={`/investigations/${inv.id}`} className="hover:text-ink">
            {inv.title}
          </Link>
        }
        title={`${inv.searchTitle}, from a blank page`}
        meta={`A ${DESIGN_ROUND_MINUTES}-minute round. You drive; nothing prompts you.`}
      >
        This is how the interview actually runs: one prompt, and you decide what to cover and in what order. Write each
        section, then compare it with a reference design and see what you left out.
      </PageHeader>

      <section aria-labelledby="prompt" className="section max-w-3xl pt-0 sm:pt-0">
        <div className="well px-5 py-4">
          <h2 id="prompt" className="eyebrow mb-2">
            The prompt
          </h2>
          <div className="max-w-[66ch]">
            <Prose text={interviewPrompt(inv.scenario)} />
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-[0.8125rem] font-medium text-ink-2 hover:text-ink">
              What the interviewer would tell you if you asked
            </summary>
            <div className="mt-3 max-w-[66ch]">
              <DashList items={[...inv.constraints, ...inv.assumptions]} muted />
            </div>
          </details>
        </div>
      </section>

      <section aria-label="Your round" className="pb-16">
        <DesignRoundRunner
          investigationId={inv.id}
          reference={view}
          walkthroughHref={`/investigations/${inv.id}/review`}
          designExtra={
            <SystemMap
              label={`${inv.title}: the reference architecture`}
              components={inv.system.components}
              flows={inv.system.flows}
            />
          }
        />
      </section>
    </div>
  );
}
