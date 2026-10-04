import { listConcepts, listInvestigations } from "@/lib/content";
import { card, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { SITE_TITLE } from "@/lib/site";

export const alt = SITE_TITLE;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return card({
    label: "System design interview practice",
    title: "Practise system design the way the interview tests it.",
    body: "Make the decisions, explain why, break the design, defend it. Free, no signup.",
    facts: [`${listInvestigations().length} systems`, `${listConcepts().length} concepts`, "Free"],
  });
}
