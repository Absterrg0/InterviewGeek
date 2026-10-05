"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { Brand, SiteNav, type NavInvestigation } from "@/components/site-nav";

type Props = {
  investigations: NavInvestigation[];
  /** Page titles by path, for the breadcrumb trail. */
  titles: Record<string, string>;
};

const SECTION_TITLES: Record<string, string> = {
  "/investigations": "Investigations",
  "/concepts": "Concepts",
  "/companies": "Companies",
  "/practice": "Practice",
  "/interview": "Mock interview",
  "/interview/session": "Session",
  "/projects": "Your projects",
  "/understanding": "Your progress",
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

/** The sidebar on wide screens: the brand and the navigation, nothing else. */
export function SiteSidebar(props: Omit<Props, "titles">) {
  return (
    <aside className="hidden border-r border-rule-soft bg-well lg:block">
      <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto px-3 pt-6 pb-8">
        <div className="mb-7 px-2">
          <Brand />
        </div>
        <SiteNav {...props} />
      </div>
    </aside>
  );
}

/** Above the main column: where you are, and on small screens the menu. */
export function SiteHeader({ titles, ...navProps }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trail = crumbs(pathname, titles);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-rule-soft bg-paper lg:static lg:border-0 lg:bg-transparent">
      <div className="mx-auto flex h-12 w-full max-w-[56rem] items-center justify-between gap-4 px-4 sm:px-6 lg:h-14 lg:px-10">
        <div className="lg:hidden">
          <Brand onNavigate={() => setOpen(false)} />
        </div>
        <nav aria-label="Breadcrumb" className={trail.length === 0 ? "hidden" : "hidden min-w-0 lg:block"}>
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
                    className={i === trail.length - 1 ? "text-ink-2" : "text-ink-3 hover:text-ink"}
                  >
                    {c.label}
                  </Link>
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>
        <button
          type="button"
          className="btn btn-secondary h-8 min-h-0 px-3 text-[0.8125rem] lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="h-[calc(100dvh-3rem)] overflow-y-auto border-t border-rule-soft px-3 py-5 lg:hidden">
          <SiteNav {...navProps} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </header>
  );
}
