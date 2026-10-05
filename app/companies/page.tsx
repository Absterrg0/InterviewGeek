import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getInvestigation, listCompanies, writeupsByCompany } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "How Real Companies Do System Design",
  description:
    "One idea per company, from their engineers' own writing: Dub on redirects, Stripe on idempotency, Discord on chat storage, Convex on live queries, PostHog on analytics and more.",
  path: "/companies",
});

export default function CompaniesPage() {
  const companies = listCompanies().map((company) => {
    const writeups = writeupsByCompany(company.id);
    const practise = [...new Set(writeups.flatMap((w) => w.investigationIds))].flatMap((id) => {
      const inv = getInvestigation(id);
      return inv ? [inv] : [];
    });
    return { company, practise };
  });

  return (
    <div>
      <PageHeader title="Companies">
        One idea per company, from what their engineers published about it. Each page explains the idea, links to the
        original writing, and has an investigation to practise it.
      </PageHeader>
      <section aria-label="All companies" className="section pt-2 sm:pt-2">
        <ul className="grid gap-3 sm:grid-cols-2">
          {companies.map(({ company, practise }) => (
            <li key={company.id}>
              <Link href={`/companies/${company.id}`} className="tile group flex h-full flex-col p-5">
                <span className="text-[0.8125rem] text-ink-3">{company.name}</span>
                <span className="mt-0.5 font-display text-[1.125rem] leading-snug transition-colors group-hover:text-accent">
                  {company.topic}
                </span>
                <span className="mt-2 block text-[0.875rem] leading-relaxed text-ink-2">{company.summary}</span>
                {practise[0] && (
                  <span className="mt-auto pt-4 text-[0.8125rem] text-ink-3">Practise: {practise[0].searchTitle}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
