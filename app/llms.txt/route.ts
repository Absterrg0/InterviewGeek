import { listCompanies, listConcepts, listInvestigations } from "@/lib/content";
import { proseToPlainText } from "@/lib/prose";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/**
 * A plain-markdown map of the site for AI assistants and agents (https://llmstxt.org):
 * what SysGeeks is, and one line per system, concept and company with its URL.
 */
export function GET() {
  const investigations = listInvestigations();
  const line = (title: string, path: string, text: string) => `- [${title}](${SITE_URL}${path}): ${proseToPlainText(text)}`;

  const body = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} is a free system design interview practice site. Each system is worked through from its requirements in stages: the learner makes a design decision and explains why, then sees the engineering reasoning, injects a failure, changes a constraint and defends the final design. There are ${investigations.length} systems, from foundational (URL shortener, rate limiter) to advanced (sharding a live database, collaborative editing). No account is needed, progress stays in the browser, and nothing is graded by AI: choices are checked against an authored key and written answers are self-assessed against specific rubric points.`,
    "",
    "Good fit for: software engineers preparing for system design (high-level design) interviews, and anyone who wants to understand why distributed systems are built the way they are and how they fail.",
    "",
    "## System design interview questions",
    "",
    ...investigations.map((inv) => line(inv.searchTitle, `/investigations/${inv.id}`, inv.premise)),
    "",
    "## System design walkthroughs",
    "",
    ...investigations.map((inv) =>
      line(
        `${inv.searchTitle}: full system design walkthrough`,
        `/investigations/${inv.id}/review`,
        "Every stage's question and answer, the reasoning and tradeoffs behind each decision, the finished architecture, its invariants, and where it stops working.",
      ),
    ),
    "",
    "## System design concepts",
    "",
    ...listConcepts().map((c) => line(c.title, `/concepts/${c.id}`, c.summary)),
    "",
    "## How real companies solved these problems",
    "",
    ...listCompanies().map((c) => line(`${c.name}: ${c.topic}`, `/companies/${c.id}`, c.summary)),
    "",
    "## Practice",
    "",
    `- [Mock system design interview](${SITE_URL}/interview): A timed session drawn from the systems and concepts above.`,
    `- [Claim check](${SITE_URL}/practice): Common engineering statements ("adding Redis makes it faster") judged as holds, fails or depends, with the reason.`,
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
