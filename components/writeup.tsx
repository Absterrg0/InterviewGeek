import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { Prose } from "@/components/prose";
import { getCompany, getConcept, getInvestigation } from "@/lib/content";
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

/** Who wrote it, when, and in what form. */
function WriteupMeta({ writeup, showCompany }: { writeup: Writeup; showCompany: boolean }) {
  const company = showCompany ? getCompany(writeup.companyId) : undefined;
  return (
    <p className="font-mono text-[0.625rem] uppercase tracking-wider text-ink-3">
      {company && (
        <>
          <Link href={`/companies/${company.id}`} className="hover:text-ink">
            {company.name}
          </Link>
          {" · "}
        </>
      )}
      {FORMAT_LABEL[writeup.format]} · {publishedLabel(writeup.published)} · {authorsLabel(writeup.authors)}
    </p>
  );
}

function OriginalLink({ writeup, className = "" }: { writeup: Writeup; className?: string }) {
  return (
    <a
      href={writeup.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-baseline gap-1.5 hover:text-accent ${className}`}
    >
      <span>{writeup.title}</span>
      <ArrowIcon />
    </a>
  );
}

/** A writeup in full: what they built, what to take from it, and where to practise it. */
export function WriteupCard({ writeup, showCompany = false }: { writeup: Writeup; showCompany?: boolean }) {
  const investigations = writeup.investigationIds.flatMap((id) => {
    const inv = getInvestigation(id);
    return inv ? [inv] : [];
  });
  const concepts = writeup.conceptIds.flatMap((id) => {
    const c = getConcept(id);
    return c ? [c] : [];
  });

  return (
    <article className="panel p-5">
      <WriteupMeta writeup={writeup} showCompany={showCompany} />
      <h3 className="mt-2 font-display text-[1.0625rem] leading-snug">
        <OriginalLink writeup={writeup} />
      </h3>
      <div className="mt-2 max-w-[66ch] text-ink-2">
        <Prose text={writeup.summary} className="prose-sm" />
      </div>
      <p className="eyebrow mt-4 mb-2">What to take from it</p>
      <ul className="space-y-1.5 text-[0.8125rem] leading-relaxed">
        {writeup.takeaways.map((t) => (
          <li key={t} className="flex gap-2.5">
            <span className="mt-[0.55rem] h-px w-2 shrink-0 bg-ink-3" aria-hidden="true" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {(investigations.length > 0 || concepts.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-dashed border-rule pt-4">
          <span className="eyebrow mr-1.5">Practise it</span>
          {investigations.map((inv) => (
            <Link key={inv.id} href={`/investigations/${inv.id}`} className="chip hover:text-accent">
              {inv.searchTitle}
            </Link>
          ))}
          {concepts.map((c) => (
            <Link key={c.id} href={`/concepts/${c.id}`} className="chip-flat hover:text-ink">
              {c.title}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

/** A compact list of sources, for the pages that cite them. */
export function SourceList({ writeups }: { writeups: readonly Writeup[] }) {
  return (
    <ul className="space-y-4">
      {writeups.map((w) => (
        <li key={w.id}>
          <WriteupMeta writeup={w} showCompany />
          <p className="mt-1 text-[0.875rem] font-medium leading-snug">
            <OriginalLink writeup={w} />
          </p>
          <ul className="mt-1.5 space-y-1 text-[0.8125rem] leading-relaxed text-ink-2">
            {w.takeaways.slice(0, 2).map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="mt-[0.55rem] h-px w-2 shrink-0 bg-ink-3" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
