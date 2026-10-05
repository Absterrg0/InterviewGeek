import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { getCompany } from "@/lib/content";
import type { Writeup } from "@/lib/domain/content";

const FORMAT_LABEL: Record<Writeup["format"], string> = {
  post: "Post",
  paper: "Paper",
  talk: "Talk",
  code: "Code",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function publishedLabel(published: string): string {
  const [year, month] = published.split("-");
  return month ? `${MONTHS[Number(month) - 1]} ${year}` : (year ?? published);
}

function authorsLabel(authors: readonly string[]): string {
  if (authors.length <= 2) return authors.join(" and ");
  return `${authors[0]} and others`;
}

/**
 * Links to original writing, each with a line on why to read it. `showCompany`
 * names the company, for pages that cite sources from several.
 */
export function SourceList({ writeups, showCompany = false }: { writeups: readonly Writeup[]; showCompany?: boolean }) {
  return (
    <ul className="max-w-[66ch] space-y-6">
      {writeups.map((w) => {
        const company = showCompany ? getCompany(w.companyId) : undefined;
        return (
          <li key={w.id}>
            <a
              href={w.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-baseline gap-1.5 text-[1rem] font-medium leading-snug hover:text-accent"
            >
              <span>{w.title}</span>
              <span className="text-ink-3 group-hover:text-accent">
                <ArrowIcon />
              </span>
            </a>
            <p className="mt-0.5 text-[0.8125rem] text-ink-3">
              {company && (
                <>
                  <Link href={`/companies/${company.id}`} className="hover:text-ink">
                    {company.name}
                  </Link>
                  {" · "}
                </>
              )}
              {authorsLabel(w.authors)} · {FORMAT_LABEL[w.format]}, {publishedLabel(w.published)}
            </p>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">{w.note}</p>
          </li>
        );
      })}
    </ul>
  );
}
