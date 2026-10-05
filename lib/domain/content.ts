/**
 * Curated content model.
 *
 * Content is authored as TypeScript data and validated with these schemas when
 * the content index loads. Cross-references (concept ids, component ids,
 * related investigations) are plain ids; their integrity is checked by
 * `lib/content/integrity.ts` and its test, not by the schemas themselves.
 *
 * Prose fields use a small markdown subset rendered by `components/prose.tsx`:
 * paragraphs, `- ` lists, fenced code, `inline code`, **bold**, *emphasis*, and
 * concept references written as [[concept-id]] or [[concept-id|label]].
 */
import { z } from "zod";

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a kebab-case slug");

const prose = z.string().min(1);

// ---------------------------------------------------------------------------
// Dimensions of understanding
// ---------------------------------------------------------------------------

export const DIMENSIONS = ["trace", "explain", "defend", "change", "break", "implement"] as const;
export const dimension = z.enum(DIMENSIONS);
export type Dimension = z.infer<typeof dimension>;

// ---------------------------------------------------------------------------
// Architecture model (shared with user projects)
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
export const componentKind = z.enum(COMPONENT_KINDS);
export type ComponentKind = z.infer<typeof componentKind>;

/** A pointer into source code. Curated systems rarely use it; repository analysis will. */
export const codeLocation = z.object({
  path: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});
export type CodeLocation = z.infer<typeof codeLocation>;

export const architectureComponent = z.object({
  id: slug,
  label: z.string().min(1),
  kind: componentKind,
  responsibility: z.string().min(1),
  /** What durable state, if any, this component owns. */
  durableState: z.string().optional(),
  evidence: z.array(codeLocation).optional(),
});
export type ArchitectureComponent = z.infer<typeof architectureComponent>;

export const FLOW_KINDS = ["request", "async", "data", "push"] as const;
export const architectureFlow = z.object({
  id: slug,
  from: slug,
  to: slug,
  label: z.string().min(1),
  kind: z.enum(FLOW_KINDS),
});
export type ArchitectureFlow = z.infer<typeof architectureFlow>;
export type FlowKind = ArchitectureFlow["kind"];

export const invariant = z.object({
  id: slug,
  statement: z.string().min(1),
  /** Components that are responsible for keeping this true. */
  enforcedBy: z.array(slug).min(1),
  /** How it is enforced: the mechanism, not the technology. */
  mechanism: z.string().min(1),
  evidence: z.array(codeLocation).optional(),
});
export type Invariant = z.infer<typeof invariant>;

/** Grid placement for drawing curated system maps. */
const position = z.object({
  col: z.number().int().min(0).max(5),
  row: z.number().int().min(0).max(5),
});

export const placedComponent = architectureComponent.extend({ position });
export type PlacedComponent = z.infer<typeof placedComponent>;

export const systemModel = z.object({
  components: z.array(placedComponent).min(1),
  flows: z.array(architectureFlow),
  invariants: z.array(invariant),
});
export type SystemModel = z.infer<typeof systemModel>;

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/** A specific point a good answer covers. Used for self-assessment after writing. */
export const rubricPoint = z.object({
  id: slug,
  text: z.string().min(1),
  /** Core points decide the signal; supporting points refine it. */
  weight: z.enum(["core", "supporting"]).default("core"),
});
export type RubricPoint = z.infer<typeof rubricPoint>;

export const ASSESSMENTS = ["sound", "defensible", "flawed"] as const;
/**
 * sound: preferable under the stated constraints.
 * defensible: workable, and the right call under different constraints — the feedback says which.
 * flawed: violates a stated requirement or a correctness property.
 */
export const assessment = z.enum(ASSESSMENTS);
export type Assessment = z.infer<typeof assessment>;

const writtenRationale = z.object({
  prompt: z.string().min(1),
  rubric: z.array(rubricPoint).min(1),
});

export const decisionInteraction = z.object({
  kind: z.literal("decision"),
  prompt: z.string().min(1),
  options: z
    .array(
      z.object({
        id: slug,
        label: z.string().min(1),
        detail: z.string().optional(),
        assessment,
        feedback: prose,
      }),
    )
    .min(2),
  rationale: writtenRationale,
});

export const CLAIM_VERDICTS = ["holds", "fails", "depends"] as const;
export const claimVerdict = z.enum(CLAIM_VERDICTS);
export type ClaimVerdict = z.infer<typeof claimVerdict>;

export const claim = z.object({
  id: slug,
  statement: z.string().min(1),
  verdict: claimVerdict,
  explanation: prose,
});
export type Claim = z.infer<typeof claim>;

export const claimsInteraction = z.object({
  kind: z.literal("claims"),
  prompt: z.string().min(1),
  claims: z.array(claim).min(2),
});

export const orderingInteraction = z.object({
  kind: z.literal("ordering"),
  prompt: z.string().min(1),
  /** Authored in the correct order. Presented in a fixed shuffled order. */
  items: z
    .array(z.object({ id: slug, label: z.string().min(1), detail: z.string().optional() }))
    .min(3),
  explanation: prose,
});

export const diagnosisInteraction = z.object({
  kind: z.literal("diagnosis"),
  prompt: z.string().min(1),
  artifact: z.object({
    type: z.enum(["code", "timeline", "log"]),
    language: z.string().optional(),
    caption: z.string().optional(),
    lines: z
      .array(
        z.object({
          text: z.string(),
          /** Present only on lines that are part of the problem; explains why. */
          fault: z.string().optional(),
        }),
      )
      .min(3),
  }),
  rationale: writtenRationale,
});

export const openInteraction = z.object({
  kind: z.literal("open"),
  prompt: z.string().min(1),
  placeholder: z.string().optional(),
  rubric: z.array(rubricPoint).min(2),
  reference: prose,
});

export const implementationInteraction = z.object({
  kind: z.literal("implementation"),
  prompt: z.string().min(1),
  language: z.string().min(1),
  starter: z.string(),
  rubric: z.array(rubricPoint).min(2),
  reference: z.object({ code: z.string().min(1), notes: prose }),
});

/**
 * Adding an interaction type means: a schema here, a response schema in
 * `learner.ts`, an evaluator in `evaluate.ts`, and an input/feedback pair in
 * `components/stage/interactions`. Nothing else switches on the kind.
 */
export const interaction = z.discriminatedUnion("kind", [
  decisionInteraction,
  claimsInteraction,
  orderingInteraction,
  diagnosisInteraction,
  openInteraction,
  implementationInteraction,
]);
export type Interaction = z.infer<typeof interaction>;
export type InteractionKind = Interaction["kind"];
export type InteractionOf<K extends InteractionKind> = Extract<Interaction, { kind: K }>;

// ---------------------------------------------------------------------------
// Investigations
// ---------------------------------------------------------------------------

export const PHASES = ["model", "decide", "break", "change", "defend"] as const;
export const phase = z.enum(PHASES);
export type Phase = z.infer<typeof phase>;

export const tradeoff = z.object({
  choice: z.string().min(1),
  gains: z.string().min(1),
  costs: z.string().min(1),
});
export type Tradeoff = z.infer<typeof tradeoff>;

/** A failure injected or a requirement changed at the start of a stage. */
export const stageEvent = z.object({
  kind: z.enum(["failure", "requirement-change", "scale"]),
  title: z.string().min(1),
  detail: z.string().min(1),
});
export type StageEvent = z.infer<typeof stageEvent>;

export const stage = z.object({
  id: slug,
  title: z.string().min(1),
  phase,
  dimensions: z.array(dimension).min(1),
  conceptIds: z.array(slug),
  competencyIds: z.array(slug).min(1),
  event: stageEvent.optional(),
  context: prose,
  interaction,
  reveal: z.object({
    reasoning: prose,
    tradeoffs: z.array(tradeoff).optional(),
    /** Where another engineer could reasonably land differently, and why. */
    otherwise: z.string().optional(),
  }),
  /** Parts of the system map that exist once this stage is understood. */
  reveals: z
    .object({
      components: z.array(slug).default([]),
      flows: z.array(slug).default([]),
    })
    .optional(),
});
export type Stage = z.infer<typeof stage>;

export const competency = z.object({
  id: slug,
  label: z.string().min(1),
  description: z.string().min(1),
});
export type Competency = z.infer<typeof competency>;

export const investigation = z.object({
  id: slug,
  title: z.string().min(1),
  /** The phrase people search for, e.g. "Design a URL shortener". Used in page titles, not headings. */
  searchTitle: z.string().min(1).max(48),
  premise: z.string().min(1),
  difficulty: z.enum(["foundational", "intermediate", "advanced"]),
  estimatedMinutes: z.number().int().positive(),
  scenario: prose,
  objectives: z.array(z.string().min(1)).min(2),
  prerequisites: z.array(slug),
  requirements: z.object({
    functional: z.array(z.string().min(1)).min(1),
    nonFunctional: z.array(z.string().min(1)).min(1),
  }),
  constraints: z.array(z.string().min(1)).min(1),
  assumptions: z.array(z.string().min(1)).min(1),
  competencies: z.array(competency).min(2),
  system: systemModel,
  stages: z.array(stage).min(3),
  synthesis: z.object({
    whyItWorks: prose,
    reliesOn: z.array(z.string().min(1)).min(1),
    alternatives: z
      .array(z.object({ design: z.string().min(1), preferWhen: z.string().min(1) }))
      .min(1),
    tradeoffs: z.array(tradeoff).min(1),
    breaksWhen: z.array(z.string().min(1)).min(1),
  }),
  interviewVariants: z.array(z.string().min(1)).min(1),
  relatedInvestigationIds: z.array(slug),
});
export type Investigation = z.infer<typeof investigation>;
export type InvestigationInput = z.input<typeof investigation>;

// ---------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------

export const CONCEPT_DOMAINS = [
  "communication",
  "storage",
  "reliability",
  "concurrency",
  "distribution",
  "performance",
] as const;
export const conceptDomain = z.enum(CONCEPT_DOMAINS);
export type ConceptDomain = z.infer<typeof conceptDomain>;

export const concept = z.object({
  id: slug,
  title: z.string().min(1),
  domain: conceptDomain,
  /** One sentence. Shown in inline references. */
  summary: z.string().min(1).max(240),
  problem: prose,
  mechanism: prose,
  assumptions: z.array(z.string().min(1)).min(1),
  alternatives: z.array(z.object({ name: z.string().min(1), when: z.string().min(1) })).min(1),
  failureModes: z
    .array(z.object({ name: z.string().min(1), description: z.string().min(1) }))
    .min(1),
  /** Concrete realisations, from simplest to most specialised. */
  implementations: z.array(z.object({ name: z.string().min(1), note: z.string().min(1) })).min(1),
  claims: z.array(claim).min(2),
  explain: z.object({
    prompt: z.string().min(1),
    rubric: z.array(rubricPoint).min(2),
  }),
  relatedConceptIds: z.array(slug),
});
export type Concept = z.infer<typeof concept>;
export type ConceptInput = z.input<typeof concept>;

// ---------------------------------------------------------------------------
// Sources: what real companies have published about their systems
// ---------------------------------------------------------------------------

export const company = z.object({
  id: slug,
  name: z.string().min(1),
  /** The one idea this company is here for, e.g. "Redirects at the edge". */
  topic: z.string().min(1).max(48),
  /** One sentence: the problem, in plain terms. */
  summary: z.string().min(1).max(240),
  /** Our own explanation of the idea and how they approached it. Never a paraphrase of one post. */
  context: prose,
  blogUrl: z.url(),
});
export type Company = z.infer<typeof company>;
export type CompanyInput = z.input<typeof company>;

export const WRITEUP_FORMATS = ["post", "paper", "talk", "code"] as const;

/**
 * A primary source: an engineering blog post, paper, talk or code by the people
 * who built the system. Investigations and concepts cite these; company pages list them.
 */
export const writeup = z.object({
  id: slug,
  companyId: slug,
  title: z.string().min(1),
  url: z.url(),
  authors: z.array(z.string().min(1)).min(1),
  /** Year and month, e.g. "2017-01", or just the year when the month is not known. */
  published: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/),
  format: z.enum(WRITEUP_FORMATS),
  /** Why to read it, in a sentence or two of our own. The original is the content. */
  note: z.string().min(1).max(320),
  investigationIds: z.array(slug),
  conceptIds: z.array(slug),
});
export type Writeup = z.infer<typeof writeup>;
export type WriteupInput = z.input<typeof writeup>;

export const DOMAIN_LABELS: Record<ConceptDomain, string> = {
  communication: "Communication",
  storage: "Storage & state",
  reliability: "Reliability",
  concurrency: "Concurrency",
  distribution: "Distribution",
  performance: "Performance & scale",
};

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

export const PHASE_LABELS: Record<Phase, string> = {
  model: "Model",
  decide: "Decide",
  break: "Break it",
  change: "Change it",
  defend: "Defend it",
};
