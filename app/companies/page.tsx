import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listCompanies, listWriteups, writeupsByCompany } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "How Real Companies Do System Design",
  description:
    "System design case studies from engineering blogs at Discord, Stripe, Figma, Twitter, Meta, Notion, Slack and more: what they built, why, and what to take from it.",
  path: "/companies",
});

export default function CompaniesPage() {
  const companies = listCompanies()
    .map((c) => ({ company: c, writeups: writeupsByCompany(c.id) }))
    .sort((a, b) => b.writeups.length - a.writeups.length || a.company.name.localeCompare(b.company.name));

  return (
    <div>
      <PageHeader title="Companies" meta={<span className="chip-flat">{listWriteups().length} sources</span>}>
        What engineers at real companies have published about the systems they built: blog posts, papers and talks,
        summarised with what to take from each and linked to the original. The investigations are built from these.
      </PageHeader>
      <section aria-label="All companies" className="section">
        <ul className="grid gap-3 sm:grid-cols-2">
          {companies.map(({ company, writeups }) => (
            <li key={company.id}>
              <Link href={`/companies/${company.id}`} className="tile group flex h-full flex-col p-4">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[1rem] leading-snug transition-colors group-hover:text-accent">
                    {company.name}
                  </span>
                  <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-wider text-ink-3">
                    {writeups.length} {writeups.length === 1 ? "source" : "sources"}
                  </span>
                </span>
                <span className="mt-1.5 block text-[0.8125rem] leading-relaxed text-ink-2">{company.summary}</span>
                <span className="mt-auto pt-3 text-[0.75rem] leading-snug text-ink-3">
                  {writeups
                    .slice(0, 2)
                    .map((w) => w.title)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
