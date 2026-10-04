"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { Brand, SiteNav, type NavInvestigation } from "@/components/site-nav";
import { latestEvidence } from "@/lib/domain/understanding";
import { useLearnerState } from "@/lib/store/learner-store";

type Props = {
  investigations: NavInvestigation[];
  conceptCount: number;
  claimCount: number;
  /** Page titles by path, for the breadcrumb trail. */
  titles: Record<string, string>;
};

const SECTION_TITLES: Record<string, string> = {
  "/investigations": "Investigations",
  "/concepts": "Concepts",
  "/practice": "Practice",
  "/interview": "Interview",
  "/interview/session": "Session",
  "/projects": "Your projects",
  "/understanding": "Understanding",
};

function crumbs(pathname: string, titles: Record<string, string>) {
  const parts = pathname.split("/").filter(Boolean);
  const trail: { href: string; label: string }[] = [];
  let href = "";
  for (const part of parts) {
    href += `/${part}`;
    const label =
      SECTION_TITLES[href] ?? titles[href] ?? (href.startsWith("/projects/") ? "Project" : decodeURIComponent(part));
    trail.push({ href, label });
  }
  return trail;
}

/** The sidebar on wide screens: brand, navigation, and a note about where progress lives. */
export function SiteSidebar(props: Omit<Props, "titles">) {
  return (
    <aside className="hidden lg:block border-r border-dashed border-rule">
      <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto px-4 pt-7 pb-5">
        <div className="px-2">
          <Brand />
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink">
            Free system design interview practice: decide, explain, break it, defend it.
          </p>
        </div>
        <div className="my-6 border-t border-dashed border-rule" />
        <SiteNav {...props} />
        <div className="mt-auto pt-8">
          <div className="border-t border-dashed border-rule pt-4 px-2">
            <p className="text-[0.75rem] leading-relaxed text-ink-3">
              Progress stays in this browser. No accounts, no cookies, no AI grading.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** The toolbar above the main column: where you are, and on small screens the menu. */
export function SiteHeader({ titles, ...navProps }: Props) {
  const pathname = usePathname();
  const state = useLearnerState();
  const [open, setOpen] = useState(false);
  const trail = crumbs(pathname, titles);
  const answered = state ? latestEvidence(state.attempts).size : null;

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-dashed border-rule bg-paper">
      <div className="flex h-12 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="lg:hidden">
          <Brand onNavigate={() => setOpen(false)} />
        </div>
        <nav aria-label="Breadcrumb" className="hidden min-w-0 lg:block">
          <ol className="flex min-w-0 items-center gap-1.5 text-[0.8125rem]">
            <li>
              <Link href="/" className={trail.length === 0 ? "text-ink" : "text-ink-3 hover:text-ink"}>
                Home
              </Link>
            </li>
            {trail.map((c, i) => (
              <Fragment key={c.href}>
                <li aria-hidden="true" className="text-rule-strong">
                  /
                </li>
                <li className="min-w-0 truncate">
                  <Link
                    href={c.href}
                    aria-current={i === trail.length - 1 ? "page" : undefined}
                    className={i === trail.length - 1 ? "text-ink" : "text-ink-3 hover:text-ink"}
                  >
                    {c.label}
                  </Link>
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {answered !== null && (
            <Link href="/understanding" className="chip-flat hidden sm:inline-flex hover:text-ink">
              <span className={`led size-1.5 ${answered > 0 ? "led-strong" : "led-off"}`} aria-hidden="true" />
              {answered} answered
            </Link>
          )}
          <Link href="/interview" className="btn btn-secondary hidden h-7 min-h-0 px-2.5 text-[0.75rem] sm:inline-flex">
            Mock interview
          </Link>
          <button
            type="button"
            className="btn btn-secondary h-7 min-h-0 px-2.5 text-[0.75rem] lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="h-[calc(100dvh-3rem)] overflow-y-auto border-t border-dashed border-rule px-4 py-5 lg:hidden">
          <SiteNav {...navProps} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </header>
  );
}
