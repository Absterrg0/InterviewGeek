"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PixelMark } from "@/components/icons";
import { LEARN, YOURS, type NavItem } from "@/components/nav-items";

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" prefetch={false} onClick={onNavigate} className="flex w-fit shrink-0 items-center gap-2.5 rounded-lg">
      <PixelMark size={26} />
      <span className="font-pixel text-[1.0625rem] leading-none">
        sys<span className="text-ink-3">geeks</span>
      </span>
    </Link>
  );
}

/** The top bar's links on wide screens: the library on the left of the bar, your own work on the right. */
export function DesktopNav() {
  const pathname = usePathname();
  const link = (item: NavItem, label = item.label) => (
    <li key={item.href}>
      <Link href={item.href} prefetch={false} aria-current={isActive(pathname, item.href) ? "page" : undefined} className="nav-link">
        {label}
      </Link>
    </li>
  );
  const [interview, projects, progress] = YOURS as [NavItem, NavItem, NavItem];

  return (
    <nav aria-label="Primary" className="hidden min-w-0 flex-1 items-center justify-between gap-6 lg:flex">
      <ul className="flex items-center gap-0.5">{LEARN.map((item) => link(item))}</ul>
      <ul className="flex items-center gap-0.5">
        {link(projects, "Projects")}
        {link(progress, "Progress")}
        <li className="ml-2">
          <Link
            href={interview.href}
            prefetch={false}
            aria-current={isActive(pathname, interview.href) ? "page" : undefined}
            className="btn btn-primary h-8 min-h-0 px-3.5"
          >
            Mock interview
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** The menu on small screens: every section, with a line saying what is there. */
export function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const group = (title: string, items: NavItem[]) => (
    <div>
      <p className="eyebrow mb-2 px-1 text-ink-3">{title}</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={`flex items-start gap-3 rounded-xl px-3 py-3 transition-colors ${
                  active ? "bg-hover" : "hover:bg-hover"
                }`}
              >
                <span className={`mt-0.5 ${active ? "text-ink" : "text-ink-3"}`}>{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-medium leading-snug">{item.label}</span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-2">{item.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <nav aria-label="Primary" className="space-y-6">
      {group("Learn", LEARN)}
      {group("Yours", YOURS)}
    </nav>
  );
}
