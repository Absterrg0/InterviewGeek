import { getStage, listInvestigations } from "@/lib/content";
import { PHASE_LABELS, type StageEvent } from "@/lib/domain/content";
import { visibleAfter } from "@/lib/domain/visibility";
import { card, clip, Diagram, OG_CONTENT_TYPE, OG_SIZE, type Tone } from "@/lib/og";

export function generateStaticParams() {
  return listInvestigations().flatMap((inv) =>
    inv.stages.map((stage) => ({ investigationId: inv.id, stageId: stage.id })),
  );
}

export const dynamicParams = false;
export const alt = "A stage of a system design investigation";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const EVENT: Record<StageEvent["kind"], { label: string; tone: Tone }> = {
  failure: { label: "Something breaks", tone: "gap" },
  scale: { label: "Traffic changes", tone: "partial" },
  "requirement-change": { label: "Requirements change", tone: "partial" },
};

export default async function Image({ params }: { params: Promise<{ investigationId: string; stageId: string }> }) {
  const { investigationId, stageId } = await params;
  const found = getStage(investigationId, stageId);
  if (!found) return new Response("Not found", { status: 404 });
  const { investigation: inv, stage, index } = found;
  const event = stage.event ? EVENT[stage.event.kind] : null;
  return card({
    label: event?.label ?? PHASE_LABELS[stage.phase],
    tone: event?.tone ?? "accent",
    title: clip(stage.event?.title ?? stage.title, 70),
    body: stage.event ? clip(stage.event.detail, 140) : clip(inv.title, 140),
    aside: (
      <Diagram
        components={inv.system.components}
        flows={inv.system.flows}
        given={visibleAfter(inv, index).components}
        width={400}
        height={260}
      />
    ),
    facts: [`Stage ${index + 1} of ${inv.stages.length}`, clip(inv.searchTitle, 34)],
  });
}
