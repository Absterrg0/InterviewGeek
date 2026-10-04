import type { Metadata } from "next";
import Link from "next/link";
import { ConceptStanding } from "@/components/concept-standing";
import { conceptsByDomain, stagesUsingConcept } from "@/lib/content";
import { CONCEPT_DOMAINS, DOMAIN_LABELS } from "@/lib/domain/content";

export const metadata: Metadata = {
  title: "Concepts",
  description: "The mechanisms behind the systems: what problem each solves, how it works, and how it fails.",
};

export default function ConceptsPage() {
  const groups = conceptsByDomain();
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl leading-tight tracking-tight">Concepts</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          The mechanisms the investigations depend on. Each one starts from the problem it solves, explains how it
          actually works, and ends with how it fails, not with a product name.
        </p>
      </header>
      <div className="mt-12 space-y-14">
        {CONCEPT_DOMAINS.map((domain) => {
          const concepts = groups.get(domain) ?? [];
          if (concepts.length === 0) return null;
          return (
            <section key={domain} aria-labelledby={`domain-${domain}`} className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
              <h2 id={`domain-${domain}`} className="eyebrow lg:pt-4">{DOMAIN_LABELS[domain]}</h2>
              <ul className="border-t border-rule">
                {concepts.map((c) => {
                  const uses = stagesUsingConcept(c.id);
                  const investigations = new Set(uses.map((u) => u.investigation.id)).size;
                  return (
                    <li key={c.id} className="border-b border-rule">
                      <Link href={`/concepts/${c.id}`} className="group grid gap-x-8 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
                        <span>
                          <span className="font-medium group-hover:text-accent transition-colors">{c.title}</span>
                          <span className="mt-1 block text-sm text-ink-2 leading-relaxed">{c.summary}</span>
                        </span>
                        <span className="text-xs text-ink-3 sm:text-right sm:pt-1 space-y-1.5">
                          <span className="block">
                            {uses.length > 0
                              ? `${uses.length} stage${uses.length === 1 ? "" : "s"} in ${investigations} investigation${investigations === 1 ? "" : "s"}`
                              : "Background concept"}
                          </span>
                          <span className="block">
                            <ConceptStanding conceptId={c.id} />
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
