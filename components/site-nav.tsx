"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CompaniesIcon,
  ConceptsIcon,
  InterviewIcon,
  InvestigationsIcon,
  PixelMark,
  PracticeIcon,
  ProjectsIcon,
  UnderstandingIcon,
} from "@/components/icons";
import { InvestigationProgress, StageOutline, type StageLink } from "@/components/investigation/progress";

export type NavInvestigation = { id: string; title: string; stages: StageLink[] };

const LEARN = [
  { href: "/investigations", label: "Investigations", icon: <InvestigationsIcon /> },
  { href: "/concepts", label: "Concepts", icon: <ConceptsIcon /> },
  { href: "/companies", label: "Companies", icon: <CompaniesIcon /> },
  { href: "/practice", label: "Practice", icon: <PracticeIcon /> },
];

const YOURS = [
  { href: "/interview", label: "Mock interview", icon: <InterviewIcon /> },
  { href: "/projects", label: "Your projects", icon: <ProjectsIcon /> },
  { href: "/understanding", label: "Your progress", icon: <UnderstandingIcon /> },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  href,
  icon,
  label,
  active,
  onNavigate,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[0.875rem] transition-colors ${
        active ? "bg-hover font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
      }`}
    >
      <span className={active ? "text-ink" : "text-ink-3"}>{icon}</span>
      {label}
    </Link>
  );
}

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex w-fit items-center gap-2.5 rounded-lg">
      <PixelMark size={26} />
      <span className="font-pixel text-[1.0625rem] leading-none">
        sys<span className="text-ink-3">geeks</span>
      </span>
    </Link>
  );
}

/** The main sections and, inside an investigation, its stages. */
export function SiteNav({ investigations, onNavigate }: { investigations: NavInvestigation[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const match = pathname.match(/^\/investigations\/([^/]+)(?:\/([^/]+))?/);
  const open = match ? investigations.find((inv) => inv.id === match[1]) : undefined;
  const stageId = match?.[2];

  const row = (item: (typeof LEARN)[number]) => (
    <li key={item.href}>
      <NavRow {...item} active={isActive(pathname, item.href) && !open} onNavigate={onNavigate} />
    </li>
  );

  return (
    <div>
      <nav aria-label="Primary">
        <ul className="space-y-0.5">{LEARN.map(row)}</ul>
        <ul className="mt-4 space-y-0.5">{YOURS.map(row)}</ul>
      </nav>

      {open && (
        <nav aria-label={open.title} className="mt-7 border-t border-rule-soft pt-6">
          <Link
            href={`/investigations/${open.id}`}
            onClick={onNavigate}
            aria-current={stageId ? undefined : "page"}
            className="block px-2 font-display text-[0.9375rem] leading-snug text-ink hover:text-accent"
          >
            {open.title}
          </Link>
          <div className="mt-2 px-2">
            <InvestigationProgress investigationId={open.id} stages={open.stages} />
          </div>
          <div className="mt-4">
            <StageOutline
              investigationId={open.id}
              stages={open.stages}
              currentId={stageId}
              withReview
              onNavigate={onNavigate}
            />
          </div>
        </nav>
      )}
    </div>
  );
}
