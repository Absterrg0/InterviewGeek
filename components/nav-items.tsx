import type { ReactNode } from "react";
import {
  CompaniesIcon,
  ConceptsIcon,
  InterviewIcon,
  InvestigationsIcon,
  PracticeIcon,
  ProjectsIcon,
  UnderstandingIcon,
} from "@/components/icons";

export type NavItem = { href: string; label: string; icon: ReactNode; description: string };

/** Pages linked from the footer only. */
export const ABOUT: NavItem[] = [
  {
    href: "/system-design-interview",
    label: "Interview guide",
    icon: null,
    description: "How the system design interview works",
  },
  { href: "/about", label: "About", icon: null, description: "How the practice is built" },
];

export const LEARN: NavItem[] = [
  {
    href: "/investigations",
    label: "Investigations",
    icon: <InvestigationsIcon />,
    description: "Whole systems, designed stage by stage",
  },
  { href: "/concepts", label: "Concepts", icon: <ConceptsIcon />, description: "The mechanisms, and how they fail" },
  { href: "/companies", label: "Companies", icon: <CompaniesIcon />, description: "One idea each, in their own words" },
  { href: "/practice", label: "Practice", icon: <PracticeIcon />, description: "Short drills on claims and dimensions" },
];

export const YOURS: NavItem[] = [
  { href: "/interview", label: "Mock interview", icon: <InterviewIcon />, description: "A timed session and a debrief" },
  { href: "/projects", label: "Your projects", icon: <ProjectsIcon />, description: "Questions about what you built" },
  {
    href: "/understanding",
    label: "Your progress",
    icon: <UnderstandingIcon />,
    description: "What your answers demonstrate",
  },
];
