import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getInvestigation, listCompanies, writeupsByCompany } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "How Real Companies Do System Design",
  description:
    "How Stripe, Discord, Figma, Uber, Slack and others solved real system design problems, in their engineers' own words, with a system to practise each on.",
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
      <PageHeader title="How real companies do system design">
        One idea per company, from what their engineers published about it. Each page explains the idea, links to the
        original writing, and has an investigation to practise it.
      </PageHeader>
      <section aria-label="All companies" className="section pt-2 sm:pt-2">
        <ul className="grid gap-x-16 lg:grid-cols-2">
          {companies.map(({ company, practise }) => (
            <li key={company.id} className="border-t border-rule">
              <Link href={`/companies/${company.id}`} className="group block py-6">
                <span className="text-[0.875rem] font-medium text-ink-2">{company.name}</span>
                <span className="mt-1 block font-display text-[1.3125rem] leading-snug transition-colors group-hover:text-accent">
                  {company.topic}
                </span>
                <span className="mt-2 block max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">{company.summary}</span>
                {practise[0] && (
                  <span className="mt-3 block text-[0.8125rem] text-ink-3">Practise it in {practise[0].searchTitle}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
