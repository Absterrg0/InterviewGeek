"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/investigations", label: "Investigations" },
  { href: "/concepts", label: "Concepts" },
  { href: "/practice", label: "Practice" },
  { href: "/interview", label: "Interview" },
  { href: "/projects", label: "Your projects" },
  { href: "/understanding", label: "Understanding" },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-14 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setOpen(false)}>
          <Mark />
          <span className="font-serif text-[1.0625rem] font-semibold tracking-tight">InterviewGeek</span>
        </Link>
        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active ? "text-ink bg-sunken" : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <button
          type="button"
          className="lg:hidden btn btn-ghost -mr-2"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Primary" className="lg:hidden border-t border-rule">
          <ul className="mx-auto max-w-6xl px-3 py-2">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`block rounded-md px-3 py-2.5 text-[0.9375rem] ${
                      active ? "bg-sunken text-ink" : "text-ink-2"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}

/** Three linked boxes: a system, drawn as small as it can be. */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="text-ink">
      <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="11.5" width="7" height="7" rx="1.5" fill="currentColor" />
      <path d="M8.5 5h3.5a3 3 0 0 1 3 3v3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
