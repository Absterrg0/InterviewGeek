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
import {
  ASSESSMENTS,
  CLAIM_VERDICTS,
  COMPONENT_KINDS,
  CONCEPT_DOMAINS,
  DIMENSIONS,
  FLOW_KINDS,
  PHASES,
  SLUG_RE,
} from "./taxonomy";

// The shared vocabulary is defined in `taxonomy.ts` (no zod) so client
// components can import it without pulling these schemas into their bundle.
export * from "./taxonomy";

export const slug = z.string().regex(SLUG_RE, "must be a kebab-case slug");

const prose = z.string().min(1);

// ---------------------------------------------------------------------------
// Dimensions of understanding
// ---------------------------------------------------------------------------

export const dimension = z.enum(DIMENSIONS);

// ---------------------------------------------------------------------------
// Architecture model (shared with user projects)
// ---------------------------------------------------------------------------

export const componentKind = z.enum(COMPONENT_KINDS);

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

export const architectureFlow = z.object({
  id: slug,
  from: slug,
  to: slug,
  label: z.string().min(1),
  kind: z.enum(FLOW_KINDS),
});
export type ArchitectureFlow = z.infer<typeof architectureFlow>;

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

export const assessment = z.enum(ASSESSMENTS);

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

export const claimVerdict = z.enum(CLAIM_VERDICTS);

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

export const phase = z.enum(PHASES);

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

export const conceptDomain = z.enum(CONCEPT_DOMAINS);

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
