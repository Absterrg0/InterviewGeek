import { getConcept, listConcepts, stagesUsingConcept } from "@/lib/content";
import { DOMAIN_LABELS } from "@/lib/domain/content";
import { card, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export function generateStaticParams() {
  return listConcepts().map((c) => ({ conceptId: c.id }));
}

export const dynamicParams = false;
export const alt = "A system design concept, explained";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ conceptId: string }> }) {
  const c = getConcept((await params).conceptId);
  if (!c) return new Response("Not found", { status: 404 });
  const uses = stagesUsingConcept(c.id).length;
  return card({
    label: `Concept · ${DOMAIN_LABELS[c.domain]}`,
    title: c.title,
    body: c.summary,
    facts: [`${c.claims.length} claims to check`, ...(uses > 0 ? [`Used in ${uses} stages`] : [])],
  });
}
