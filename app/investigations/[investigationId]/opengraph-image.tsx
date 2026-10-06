import { DIFFICULTY } from "@/components/investigation/difficulty";
import { getInvestigation, listInvestigations } from "@/lib/content";
import { visibleAfter } from "@/lib/domain/visibility";
import { card, clip, Diagram, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export function generateStaticParams() {
  return listInvestigations().map((inv) => ({ investigationId: inv.id }));
}

export const dynamicParams = false;
export const alt = "The system you design in this investigation";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ investigationId: string }> }) {
  const inv = getInvestigation((await params).investigationId);
  if (!inv) return new Response("Not found", { status: 404 });
  return card({
    label: inv.searchTitle,
    title: inv.title,
    body: clip(inv.premise, 150),
    aside: (
      <Diagram
        components={inv.system.components}
        flows={inv.system.flows}
        given={visibleAfter(inv, 0).components}
        width={400}
        height={260}
      />
    ),
    facts: [DIFFICULTY[inv.difficulty], `${inv.estimatedMinutes} min`, `${inv.stages.length} stages`],
  });
}
