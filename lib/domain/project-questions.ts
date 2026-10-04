/**
 * Questions about the learner's own system, generated from its architecture
 * model. The same templates will apply unchanged when the model comes from
 * repository analysis instead of a hand-written description; code evidence
 * will then let answers point at real files.
 *
 * Pure and client-safe: no content library imports.
 */
import type { ArchitectureComponent, ArchitectureFlow, Dimension, InteractionOf, RubricPoint } from "./content";
import type { ExerciseTags } from "./evaluate";
import type { Project, ProjectInvariant } from "./learner";

export const QUESTION_GROUPS = ["trace", "state", "failure", "concurrency", "change", "defend"] as const;
export type QuestionGroup = (typeof QUESTION_GROUPS)[number];

export const QUESTION_GROUP_LABELS: Record<QuestionGroup, { label: string; description: string }> = {
  trace: { label: "Trace", description: "What actually happens, hop by hop." },
  state: { label: "State and durability", description: "What survives a restart, and what does not." },
  failure: { label: "Failure", description: "Slow dependencies, crashes and duplicates." },
  concurrency: { label: "Concurrency and invariants", description: "What must always be true, and what enforces it." },
  change: { label: "Change", description: "Where the system bends under new constraints." },
  defend: { label: "Defend", description: "Why the boundaries are where they are." },
};

export type ProjectQuestion = {
  id: string;
  group: QuestionGroup;
  title: string;
  interaction: InteractionOf<"open">;
  tags: ExerciseTags;
};

const CODE_POINT: RubricPoint = {
  id: "points-to-code",
  text: "Points to where this happens in the code or configuration (file, function, constraint), not just to the idea.",
  weight: "supporting",
};

function question(input: {
  id: string;
  group: QuestionGroup;
  title: string;
  prompt: string;
  rubric: RubricPoint[];
  reference: string;
  dimensions: Dimension[];
  conceptIds: string[];
}): ProjectQuestion {
  return {
    id: input.id,
    group: input.group,
    title: input.title,
    interaction: {
      kind: "open",
      prompt: input.prompt,
      placeholder: "Answer about your system as it is today, not as it should be…",
      rubric: [...input.rubric, CODE_POINT],
      reference: input.reference,
    },
    tags: { dimensions: input.dimensions, conceptIds: input.conceptIds, competencyIds: [] },
  };
}

const core = (id: string, text: string): RubricPoint => ({ id, text, weight: "core" });
const supporting = (id: string, text: string): RubricPoint => ({ id, text, weight: "supporting" });

function traceQuestion(flow: ArchitectureFlow, name: (id: string) => string): ProjectQuestion {
  return question({
    id: `trace.${flow.id}`,
    group: "trace",
    title: `Trace "${flow.label}"`,
    prompt: `Trace "${flow.label}" from ${name(flow.from)} to ${name(flow.to)}. Name every boundary it crosses, what each hop waits on, and what has been durably recorded at the moment the caller gets a response.`,
    rubric: [
      core("boundaries", "Names each process and network boundary the request crosses, in order."),
      core("durable-at-response", "States what is durable when the response is sent, and what is not yet."),
      supporting("waits", "Says which hops are synchronous (the caller waits) and which are not."),
    ],
    reference: `A strong trace reads like a timeline, not a component list: "the browser sends…, the API validates…, opens a transaction…, commits…, enqueues…, responds 201". The most revealing part is the moment of the response: everything the caller is told must already be true, so anything still in memory or in flight at that moment is a guarantee you are not actually making. See [[durability]].`,
    dimensions: ["trace"],
    conceptIds: ["durability"],
  });
}

function durableQuestion(component: ArchitectureComponent): ProjectQuestion {
  const holds = component.durableState ? `holds ${component.durableState}` : "holds state";
  return question({
    id: `durable.${component.id}`,
    group: "state",
    title: `What ${component.label} keeps`,
    prompt: `${component.label} ${holds}. What exactly makes that state durable, and what happens to work in progress if ${component.label} restarts mid-operation?`,
    rubric: [
      core("survives", "Distinguishes state that survives a restart from state held only in memory or buffers."),
      core("in-flight", "Describes what happens to operations in progress at the moment of the restart."),
      supporting("commit-point", "Identifies the commit point: the write, flush or acknowledgement after which data is safe."),
    ],
    reference: `"It's in the database" is where a good answer starts, not where it ends. Which write is the commit point? What was acknowledged to a caller before that point? If the process dies between two writes, which half survives? A strong answer names a specific operation that would be lost or duplicated on a restart, or explains why none can be. See [[durability]] and [[transactions]].`,
    dimensions: ["explain", "break"],
    conceptIds: ["durability", "transactions"],
  });
}

function dependencyQuestion(component: ArchitectureComponent): ProjectQuestion {
  return question({
    id: `dependency.${component.id}`,
    group: "failure",
    title: `When ${component.label} is slow`,
    prompt: `${component.label} becomes slow (not down, just slow: every call takes 20 seconds). Which requests wait on it, what timeouts apply, and what does a user see? Then answer the same for when it is completely unavailable.`,
    rubric: [
      core("synchronous-dependents", `Identifies which operations depend on ${component.label} synchronously.`),
      core("timeouts", "Names the actual timeout values (or admits there are none) and what happens when they fire."),
      supporting("retry-effects", "Considers whether a retry could repeat a side effect."),
      supporting("degrade", "Describes any degraded mode: cached data, queued work, a clear error."),
    ],
    reference: `Slow is usually worse than down. A dependency that is down fails fast, while one that is slow holds threads, connections and users while timeouts tick. A strong answer follows the slowness upstream: which pool fills first, whether your timeout is longer than your caller's (so you keep working for nobody), and whether a timed-out write leaves an unknown outcome. See [[timeouts]] and [[retries-and-backoff]].`,
    dimensions: ["break"],
    conceptIds: ["timeouts", "retries-and-backoff"],
  });
}

function redeliveryQuestion(flow: ArchitectureFlow, name: (id: string) => string): ProjectQuestion {
  return question({
    id: `redelivery.${flow.id}`,
    group: "failure",
    title: `"${flow.label}" twice`,
    prompt: `"${flow.label}" goes from ${name(flow.from)} to ${name(flow.to)} asynchronously. Can it be delivered or processed twice? What makes processing it twice harmless, or what breaks if nothing does?`,
    rubric: [
      core("guarantee", "States the delivery guarantee actually provided (at-most-once or at-least-once) and why."),
      core("dedupe-mechanism", "Names the mechanism that makes a duplicate harmless (idempotency key, unique constraint, conditional update), or admits there is none."),
      supporting("ordering", "Considers what happens if two messages for the same entity are processed out of order."),
    ],
    reference: `Almost every asynchronous path is at-least-once: retries, redeliveries after crashes, and visibility timeouts all produce duplicates. The question is never "can it happen?" but "what happens when it does?". A strong answer names the line of code or the constraint that turns a duplicate into a no-op. See [[delivery-guarantees]] and [[idempotency]].`,
    dimensions: ["break", "explain"],
    conceptIds: ["delivery-guarantees", "idempotency"],
  });
}

function invariantQuestion(invariant: ProjectInvariant, name: (id: string) => string): ProjectQuestion {
  const owners = invariant.enforcedBy.map(name).join(" and ");
  return question({
    id: `invariant.${invariant.id}`,
    group: "concurrency",
    title: `Enforcing: ${invariant.statement}`,
    prompt: `Your system relies on: "${invariant.statement}". Where exactly is this enforced${owners ? ` (you said ${owners})` : ""}, and what concurrent interleaving or failure would break it if that enforcement were removed?`,
    rubric: [
      core("location", "Points to the specific mechanism: a constraint, transaction, lock or conditional write."),
      core("counterexample", "Describes a concrete interleaving or failure that would violate it without that mechanism."),
      supporting("placement", "Explains why enforcement lives where it does rather than elsewhere."),
    ],
    reference: `Invariants enforced by "the code checks first" usually are not enforced: two requests can both check before either writes. Strong answers point at something atomic, such as a unique index, a conditional UPDATE, a row lock or a serializable transaction, and can describe the race it prevents. If you cannot find the mechanism, that is the finding. See [[concurrency-control]].`,
    dimensions: ["implement", "break"],
    conceptIds: ["concurrency-control", "transactions"],
  });
}

function boundaryQuestion(component: ArchitectureComponent): ProjectQuestion {
  return question({
    id: `boundary.${component.id}`,
    group: "defend",
    title: `Why ${component.label} is separate`,
    prompt: `Why does ${component.label} run separately from the request path? What would be different, better and worse, if this work happened inside the request?`,
    rubric: [
      core("why-separate", "Gives the concrete reason tied to a constraint: duration, failure isolation, scaling, or retries."),
      core("cost", "Names what the separation costs: a state to track, duplicates to handle, latency, operational load."),
      supporting("alternative", "Says when doing it inline would be the better choice."),
    ],
    reference: `"For scalability" is not an answer; it names a word, not a constraint. A strong answer says which property forced the boundary (this takes 3 minutes; this calls an unreliable API; this must survive a deploy) and what it cost (a status to poll, retries to make idempotent). See [[asynchronous-processing]].`,
    dimensions: ["defend"],
    conceptIds: ["asynchronous-processing"],
  });
}

const SYSTEM_QUESTIONS: ProjectQuestion[] = [
  question({
    id: "retry",
    group: "failure",
    title: "A retried write",
    prompt: "Pick the most important write in your system. The client times out and retries it. Walk through exactly what your server does with the second request.",
    rubric: [
      core("unknown", "Recognizes the timeout leaves the outcome unknown to the client; the first request may have succeeded."),
      core("server-behaviour", "Describes concretely what the server does on the duplicate: rejects, deduplicates, or repeats the effect."),
      supporting("scope", "Names the deduplication key and its lifetime, if there is one."),
    ],
    reference: `If the honest answer is "it does it again", you have found a real bug, and a common one. The fix is an idempotency key scoped to the intent, claimed atomically before the effect, with the result stored for repeats. See [[idempotency]] and [[timeouts]].`,
    dimensions: ["break"],
    conceptIds: ["idempotency", "timeouts"],
  }),
  question({
    id: "concurrency-model",
    group: "concurrency",
    title: "The concurrency model",
    prompt: "What is your system's concurrency model? Where can two operations on the same data run at the same time, and what decides the outcome when they do?",
    rubric: [
      core("where", "Identifies at least one place where concurrent operations touch the same data."),
      core("decides", "Explains what resolves the conflict: a lock, a constraint, a conditional write, or nothing (last write wins)."),
      supporting("runtime", "Describes the runtime's own model (event loop, threads, multiple instances) and how it affects this."),
    ],
    reference: `Single-threaded runtimes such as Node.js still have concurrency: two requests interleave at every await, and several instances run behind the load balancer. A strong answer finds a real read-modify-write in the system and says what stops two of them from interleaving. See [[concurrency-control]].`,
    dimensions: ["explain", "break"],
    conceptIds: ["concurrency-control"],
  }),
  question({
    id: "scale",
    group: "change",
    title: "100x traffic",
    prompt: "Traffic grows 100x. Which component saturates first, which resource does it run out of, and what is the smallest change that moves that bottleneck?",
    rubric: [
      core("bottleneck", "Names a specific component and the resource it exhausts (connections, CPU, write throughput, memory, a rate limit)."),
      core("targeted", "Proposes a change aimed at that bottleneck rather than a general rewrite."),
      supporting("cost", "Says what the change costs: consistency, complexity, money."),
      supporting("numbers", "Uses rough numbers (requests per second, Little's law) rather than adjectives."),
    ],
    reference: `"Add microservices" and "use Kafka" are not answers. Start with arithmetic: requests per second at 100x, the cost per request on each component, and the first one whose capacity you cross. It is often the database's connection count or a third-party rate limit, rarely the application servers. See [[backpressure]], [[partitioning]] and [[caching]].`,
    dimensions: ["change"],
    conceptIds: ["backpressure", "partitioning", "caching"],
  }),
  question({
    id: "rebuild",
    group: "defend",
    title: "Keep one, revisit one",
    prompt: "If you rebuilt this system today with the same requirements, which architectural decision would you keep, and which would you revisit? Defend both.",
    rubric: [
      core("keep", "Defends a decision with the constraint that justified it, not just by saying it worked."),
      core("revisit", "Identifies a decision whose cost has become visible, and what it should be traded for."),
      supporting("context", "Acknowledges what was reasonable about the original choice given what was known then."),
    ],
    reference: `This is the question interviewers ask to see whether you understand your own trade-offs. A strong answer is specific ("I'd keep Postgres as the queue because enqueueing is transactional with the order; I'd revisit storing uploads on the app server's disk because it blocks horizontal scaling") and fair to the past ("at the time we had one server").`,
    dimensions: ["defend", "change"],
    conceptIds: [],
  }),
];

const STATEFUL_KINDS = new Set(["database", "object-store", "queue", "stream", "cache"]);
const DEPENDENCY_KINDS = new Set(["external", "database", "cache", "queue"]);

/** Every question that applies to this project's model, in a stable order. */
export function projectQuestions(project: Project): ProjectQuestion[] {
  const byId = new Map(project.components.map((c) => [c.id, c]));
  const name = (id: string) => byId.get(id)?.label ?? id;
  const questions: ProjectQuestion[] = [];

  // Trace the paths users start; internal hops are covered by tracing those.
  const requests = project.flows.filter((f) => f.kind === "request");
  const entry = requests.filter((f) => byId.get(f.from)?.kind === "client");
  for (const flow of entry.length > 0 ? entry : requests) questions.push(traceQuestion(flow, name));
  for (const c of project.components) {
    if (c.durableState || STATEFUL_KINDS.has(c.kind)) questions.push(durableQuestion(c));
  }
  for (const c of project.components) {
    if (DEPENDENCY_KINDS.has(c.kind)) questions.push(dependencyQuestion(c));
  }
  for (const flow of project.flows) {
    if (flow.kind === "async") questions.push(redeliveryQuestion(flow, name));
  }
  for (const inv of project.invariants) questions.push(invariantQuestion(inv, name));
  for (const c of project.components) {
    if (c.kind === "worker") questions.push(boundaryQuestion(c));
  }
  questions.push(...SYSTEM_QUESTIONS);
  return questions;
}

export function findProjectQuestion(project: Project, questionId: string): ProjectQuestion | undefined {
  return projectQuestions(project).find((q) => q.id === questionId);
}

/** Concept ids referenced by templates, for content integrity checks. */
export function templateConceptIds(): string[] {
  const sample: Project = {
    id: "sample",
    name: "Sample",
    summary: "",
    source: { type: "manual" },
    components: [
      { id: "db", label: "DB", kind: "database", responsibility: "x", durableState: "rows" },
      { id: "ext", label: "Ext", kind: "external", responsibility: "x" },
      { id: "w", label: "Worker", kind: "worker", responsibility: "x" },
    ],
    flows: [
      { id: "r", from: "w", to: "db", label: "r", kind: "request" },
      { id: "a", from: "w", to: "ext", label: "a", kind: "async" },
    ],
    invariants: [{ id: "i", statement: "x", enforcedBy: ["db"], mechanism: "" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const ids = new Set<string>();
  for (const q of projectQuestions(sample)) {
    q.tags.conceptIds.forEach((id) => ids.add(id));
    for (const m of q.interaction.reference.matchAll(/\[\[([a-z0-9-]+)/g)) ids.add(m[1] as string);
  }
  return [...ids];
}
