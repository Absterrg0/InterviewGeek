/**
 * The vocabulary the content schemas and the browser UI share: dimensions,
 * phases, claim verdicts, component kinds and their labels.
 *
 * It lives outside `content.ts` so client components can import these values
 * without pulling the content schemas (and zod) into their bundle.
 */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

// ---------------------------------------------------------------------------
// Dimensions of understanding
// ---------------------------------------------------------------------------

export const DIMENSIONS = ["trace", "explain", "defend", "change", "break", "implement"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, { label: string; verb: string; description: string }> = {
  trace: {
    label: "Trace",
    verb: "Trace what actually happens",
    description: "Following a request or event across every boundary it crosses.",
  },
  explain: {
    label: "Explain",
    verb: "Explain the mechanism",
    description: "Describing how a mechanism works, not just what it is called.",
  },
  defend: {
    label: "Defend",
    verb: "Defend a decision",
    description: "Choosing between alternatives from the constraints, and naming the cost.",
  },
  change: {
    label: "Change",
    verb: "Adapt to new constraints",
    description: "Finding the new bottleneck when requirements or scale shift.",
  },
  break: {
    label: "Break",
    verb: "Reason about failure",
    description: "Predicting what happens when a component, message, or network misbehaves.",
  },
  implement: {
    label: "Implement",
    verb: "Connect it to code",
    description: "Turning a guarantee into code that actually enforces it.",
  },
};

// ---------------------------------------------------------------------------
// Architecture model
// ---------------------------------------------------------------------------

export const COMPONENT_KINDS = [
  "client",
  "edge",
  "service",
  "worker",
  "database",
  "queue",
  "object-store",
  "cache",
  "stream",
  "external",
] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const FLOW_KINDS = ["request", "async", "data", "push"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

// ---------------------------------------------------------------------------
// Interactions and phases
// ---------------------------------------------------------------------------

export const ASSESSMENTS = ["sound", "defensible", "flawed"] as const;
/**
 * sound: preferable under the stated constraints.
 * defensible: workable, and the right call under different constraints — the feedback says which.
 * flawed: violates a stated requirement or a correctness property.
 */
export type Assessment = (typeof ASSESSMENTS)[number];

export const CLAIM_VERDICTS = ["holds", "fails", "depends"] as const;
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number];

export const PHASES = ["model", "decide", "break", "change", "defend"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  model: "Model",
  decide: "Decide",
  break: "Break it",
  change: "Change it",
  defend: "Defend it",
};

// ---------------------------------------------------------------------------
// Concept domains
// ---------------------------------------------------------------------------

export const CONCEPT_DOMAINS = [
  "communication",
  "storage",
  "reliability",
  "concurrency",
  "distribution",
  "performance",
] as const;
export type ConceptDomain = (typeof CONCEPT_DOMAINS)[number];

export const DOMAIN_LABELS: Record<ConceptDomain, string> = {
  communication: "Communication",
  storage: "Storage & state",
  reliability: "Reliability",
  concurrency: "Concurrency",
  distribution: "Distribution",
  performance: "Performance & scale",
};
