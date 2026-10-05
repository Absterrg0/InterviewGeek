import type { Metadata } from "next";
import Link from "next/link";
import { ConceptStanding } from "@/components/concept-standing";
import { PageHeader, Section } from "@/components/page-header";
import { conceptsByDomain, stagesUsingConcept } from "@/lib/content";
import { CONCEPT_DOMAINS, DOMAIN_LABELS } from "@/lib/domain/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "System Design Concepts",
  description:
    "The mechanisms behind system design interviews: caching, idempotency, replication, queues and more. What each solves, how it works and how it fails.",
  path: "/concepts",
});

export default function ConceptsPage() {
  const groups = conceptsByDomain();
  const domains = CONCEPT_DOMAINS.filter((d) => (groups.get(d) ?? []).length > 0);
  return (
    <div>
      <PageHeader title="System design concepts">
        The mechanisms the investigations depend on. Each one starts from the problem it solves, explains how it actually
        works, and ends with how it fails, not with a product name.
      </PageHeader>
      {domains.map((domain) => {
        const concepts = groups.get(domain) ?? [];
        return (
          <Section
            key={domain}
            id={`domain-${domain}`}
            title={DOMAIN_LABELS[domain]}
          >
            <ul className="space-y-px">
              {concepts.map((c) => {
                const uses = stagesUsingConcept(c.id);
                const investigations = new Set(uses.map((u) => u.investigation.id)).size;
                const where =
                  uses.length > 0
                    ? `${uses.length} stage${uses.length === 1 ? "" : "s"} in ${investigations} investigation${investigations === 1 ? "" : "s"}`
                    : "Background concept";
                return (
                  <li key={c.id}>
                    <Link
                      href={`/concepts/${c.id}`}
                      className="group -mx-3 flex items-baseline gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-medium text-ink">{c.title}</span>
                        <span className="mt-0.5 block text-[0.875rem] leading-relaxed text-ink-2">{c.summary}</span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-2 sm:flex">
                        <ConceptStanding conceptId={c.id} />
                        <span className="w-20 text-right text-[0.75rem] tabular-nums text-ink-3" title={where}>
                          {uses.length > 0 ? `${uses.length} stage${uses.length === 1 ? "" : "s"}` : "background"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}
