/**
 * A design round: one system, a blank page, and the learner driving, the way
 * a system design interview actually runs. The learner writes each section,
 * then compares it with a reference assembled from the investigation and
 * ticks what their answer covered.
 *
 * Plain types and helpers only, so client components can use them.
 */

export const DESIGN_SECTIONS = [
  {
    id: "requirements",
    title: "Requirements",
    minutes: 5,
    prompt:
      "What does the system have to do, and how well? List the functional requirements, then the non-functional ones (latency, availability, consistency, scale), and the questions you would ask the interviewer.",
    placeholder: "Functional: …\nNon-functional: …\nI would ask: …",
  },
  {
    id: "estimates",
    title: "Estimates",
    minutes: 5,
    prompt:
      "Turn the volumes into the numbers that drive the design: requests per second at peak, storage, bandwidth, and anything else that decides whether one machine is enough.",
    placeholder: "Writes: … per second at peak\nReads: …\nStorage: … per year",
  },
  {
    id: "design",
    title: "High-level design",
    minutes: 10,
    prompt:
      "Name the components and what each one is responsible for. Then trace the main request through them, and say where the durable state lives.",
    placeholder: "Components: …\nA request goes: client → … → …\nState lives in: …",
  },
  {
    id: "deep-dives",
    title: "Deep dives",
    minutes: 15,
    prompt:
      "Pick the hardest decisions in this design and make them: what you chose, what you rejected, and which constraint decided it.",
    placeholder: "Decision: …\nChose … over … because …",
  },
  {
    id: "failures",
    title: "Failure and change",
    minutes: 10,
    prompt:
      "What breaks? Walk through crashes, duplicates, slow dependencies and overload, and what the design does in each. Then: what changes at ten times the load, or with a new requirement?",
    placeholder: "If … fails: …\nAt 10× load: …",
  },
] as const;

export type DesignSectionId = (typeof DESIGN_SECTIONS)[number]["id"];
export const DESIGN_SECTION_IDS = DESIGN_SECTIONS.map((s) => s.id) as readonly DesignSectionId[];

export const DESIGN_ROUND_MINUTES = DESIGN_SECTIONS.reduce((sum, s) => sum + s.minutes, 0);

export type DesignRound = {
  id: string;
  investigationId: string;
  startedAt: string;
  finishedAt: string;
  /** What the learner wrote, by section. */
  answers: Partial<Record<DesignSectionId, string>>;
  /** Reference items the learner ticked as covered, by section. */
  covered: Partial<Record<DesignSectionId, string[]>>;
};

/** The reference a round is compared against: item ids by section. */
export type ReferenceIds = Record<DesignSectionId, readonly string[]>;

export type Coverage = { covered: number; total: number };

/**
 * How much of the reference a round covered, by section and overall. Ticks on
 * items that no longer exist in the reference (the content changed) are
 * ignored rather than counted.
 */
export function roundCoverage(
  round: Pick<DesignRound, "covered">,
  reference: ReferenceIds,
): { sections: Record<DesignSectionId, Coverage>; overall: Coverage } {
  const sections = {} as Record<DesignSectionId, Coverage>;
  let covered = 0;
  let total = 0;
  for (const id of DESIGN_SECTION_IDS) {
    const items = new Set(reference[id]);
    const ticked = new Set((round.covered[id] ?? []).filter((item) => items.has(item)));
    sections[id] = { covered: ticked.size, total: items.size };
    covered += ticked.size;
    total += items.size;
  }
  return { sections, overall: { covered, total } };
}

/** "12:05" for 725 seconds; hours roll into minutes. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
