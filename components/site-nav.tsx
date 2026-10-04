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
import { StageOutline, type StageLink } from "@/components/investigation/progress";
import { latestEvidence } from "@/lib/domain/understanding";
import { useLearnerState } from "@/lib/store/learner-store";

export type NavInvestigation = { id: string; title: string; stages: StageLink[] };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  href,
  icon,
  label,
  count,
  active,
  onNavigate,
}: {
  href: string;
  icon?: ReactNode;
  label: string;
  count?: number | null;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex h-[30px] items-center gap-2 rounded-lg px-2 text-[0.8125rem] transition-colors ${
        active ? "plate rounded-lg font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-auto font-mono text-[0.625rem] tabular-nums text-ink-3">{count}</span>}
    </Link>
  );
}

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex w-fit items-center gap-2.5 rounded-lg">
      <PixelMark size={28} />
      <span className="font-pixel text-[1.0625rem] leading-none">
        sys<span className="text-ink-3">geeks</span>
      </span>
    </Link>
  );
}

/** Primary navigation, the systems to investigate, and the stages of the one you are in. */
export function SiteNav({
  investigations,
  conceptCount,
  companyCount,
  claimCount,
  onNavigate,
}: {
  investigations: NavInvestigation[];
  conceptCount: number;
  companyCount: number;
  claimCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const state = useLearnerState();
  const answered = state ? latestEvidence(state.attempts).size : null;
  const stageMatch = pathname.match(/^\/investigations\/([^/]+)(?:\/([^/]+))?/);
  const openId = stageMatch?.[1];
  const currentStage = stageMatch?.[2];

  const nav = [
    { href: "/investigations", label: "Investigations", icon: <InvestigationsIcon />, count: investigations.length },
    { href: "/concepts", label: "Concepts", icon: <ConceptsIcon />, count: conceptCount },
    { href: "/companies", label: "Companies", icon: <CompaniesIcon />, count: companyCount },
    { href: "/practice", label: "Practice", icon: <PracticeIcon />, count: claimCount },
    { href: "/interview", label: "Interview", icon: <InterviewIcon />, count: state ? state.interviews.length : null },
    { href: "/projects", label: "Your projects", icon: <ProjectsIcon />, count: state ? state.projects.length : null },
    { href: "/understanding", label: "Understanding", icon: <UnderstandingIcon />, count: answered },
  ];

  return (
    <div className="space-y-7">
      <nav aria-label="Primary">
        <p className="eyebrow mb-2 px-2">Navigation</p>
        <ul className="space-y-px">
          {nav.map((item) => (
            <li key={item.href}>
              <NavRow
                {...item}
                active={isActive(pathname, item.href) && !(item.href === "/investigations" && openId)}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Systems">
        <p className="eyebrow mb-2 px-2">Systems</p>
        <ul className="space-y-px">
          {investigations.map((inv) => {
            const open = inv.id === openId;
            return (
              <li key={inv.id}>
                <NavRow
                  href={`/investigations/${inv.id}`}
                  label={inv.title}
                  count={inv.stages.length}
                  active={open && !currentStage}
                  onNavigate={onNavigate}
                />
                {open && (
                  <div className="mb-2 ml-3 mt-1 border-l border-dashed border-rule pl-2" onClick={onNavigate}>
                    <StageOutline investigationId={inv.id} stages={inv.stages} currentId={currentStage} dense />
                    <Link
                      href={`/investigations/${inv.id}/review`}
                      aria-current={currentStage === "review" ? "page" : undefined}
                      className={`mt-px flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.8125rem] ${
                        currentStage === "review" ? "plate rounded-lg text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
                      }`}
                    >
                      <span className="w-4 shrink-0" />
                      The design, defended
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
