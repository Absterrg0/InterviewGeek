import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const jobQueue = {
  id: "job-queue",
  title: "A job queue that survives its own backlog",
  searchTitle: "Design a Distributed Job Queue",
  premise:
    "Built from Slack's account of the outage that made it rebuild its job queue, with lessons from Dropbox's task framework and Amazon's Builders' Library: make enqueues safe when workers fall behind, keep one slow job type from starving the rest, and drain a backlog without causing the next outage.",
  difficulty: "intermediate",
  estimatedMinutes: 45,
  scenario: md`
    A team messaging app does a lot of work outside web requests: push notifications, link previews, search indexing, billing events, exports. Web servers enqueue a job and return; workers pick jobs up and run them.

    Today, jobs are pushed onto lists in a set of Redis clusters, and a fleet of workers pops them off. At peak the system handles about **33,000 jobs a second**, 1.4 billion a day. It has worked for years, and engineers use it for everything.

    Then a database slowed down. Workers that wrote to it slowed down too, jobs piled up, and Redis ran out of memory. Dequeuing a job also needed a little free memory, so when Redis filled up the queue could not drain at all, and every feature built on jobs stopped. Slack wrote about this outage, and the system they built afterwards, in "Scaling Slack's Job Queue". This investigation follows their reasoning.
  `,
  objectives: [
    "Calculate how fast a backlog grows and where it can safely live.",
    "Diagnose why a full queue stopped draining.",
    "Add a durable buffer without rewriting every worker.",
    "Isolate job types so one slow type cannot starve the rest.",
    "Define delivery semantics, retries and dead-lettering, and drain a backlog safely.",
  ],
  prerequisites: ["message-queues", "backpressure"],
  requirements: {
    functional: [
      "Enqueue a job from any web request.",
      "Run every job at least once, retrying failures.",
      "Keep job types (and priorities) separate, with per-type throttling.",
      "Show how far behind each job type is.",
    ],
    nonFunctional: [
      "Enqueueing keeps working when workers are slow; jobs wait instead of failing.",
      "Once enqueue returns, the job is not lost.",
      "A backlog in one job type does not delay the others.",
      "Interactive jobs (notifications) still run within seconds while batch work is backlogged.",
    ],
  },
  constraints: [
    "About 1.4 billion jobs a day, peaking at about 33,000 a second.",
    "Thousands of job handlers and the worker fleet talk to Redis; they cannot all be rewritten at once.",
    "A Kafka cluster can be provisioned.",
  ],
  assumptions: [
    "Jobs are small: a few kilobytes of JSON.",
    "Most jobs finish in milliseconds; a few take seconds or minutes.",
    "Jobs call downstream databases and services that have their own limits.",
  ],
  competencies: [
    { id: "capacity", label: "Backlog arithmetic", description: "How fast backlogs grow, and what it costs to hold them." },
    { id: "durability", label: "Durable enqueue", description: "Accepting work safely when the consumers cannot keep up." },
    { id: "isolation", label: "Isolation", description: "Keeping job types from interfering with each other." },
    { id: "semantics", label: "Delivery semantics", description: "At-least-once, retries, leases and dead letters." },
    { id: "operations", label: "Operating through backlogs", description: "Draining safely and rolling out changes to a critical path." },
  ],
  system: {
    components: [
      { id: "web", label: "Web servers", kind: "service", responsibility: "Enqueue jobs during requests and return.", position: { col: 0, row: 1 } },
      { id: "gateway", label: "Enqueue gateway", kind: "service", responsibility: "Stateless HTTP service that appends jobs to Kafka; keeps broker connections warm.", position: { col: 1, row: 1 } },
      { id: "kafka", label: "Kafka", kind: "stream", responsibility: "Durable, disk-backed log of jobs; a topic per job group; days of retention.", durableState: "every enqueued job, for two days", position: { col: 2, row: 1 } },
      { id: "relay", label: "Relay", kind: "worker", responsibility: "Moves jobs from Kafka into Redis at a configurable rate per job type; one owner per topic.", position: { col: 3, row: 1 } },
      { id: "redis", label: "Redis queues", kind: "queue", responsibility: "Per-type queues the existing workers already know how to consume.", position: { col: 3, row: 2 } },
      { id: "workers", label: "Workers", kind: "worker", responsibility: "Lease a job, run its handler, acknowledge or schedule a retry.", position: { col: 2, row: 2 } },
      { id: "downstream", label: "Databases and services", kind: "database", responsibility: "What the jobs actually change.", position: { col: 1, row: 2 } },
    ],
    flows: [
      { id: "enqueue", from: "web", to: "gateway", label: "Enqueue job", kind: "request" },
      { id: "append", from: "gateway", to: "kafka", label: "Append to topic", kind: "request" },
      { id: "read", from: "relay", to: "kafka", label: "Read topics", kind: "request" },
      { id: "feed", from: "relay", to: "redis", label: "Push at a controlled rate", kind: "request" },
      { id: "take", from: "workers", to: "redis", label: "Lease jobs", kind: "request" },
      { id: "work", from: "workers", to: "downstream", label: "Do the work", kind: "request" },
    ],
    invariants: [
      {
        id: "enqueue-survives",
        statement: "Enqueueing succeeds even when workers are slow or Redis is full.",
        enforcedBy: ["gateway", "kafka"],
        mechanism: "Jobs land in a disk-backed log with days of retention; the relay only moves them into Redis as fast as Redis and workers can take them.",
      },
      {
        id: "isolation",
        statement: "One job type's backlog cannot starve the others.",
        enforcedBy: ["relay", "redis", "workers"],
        mechanism: "Separate topics, queues, rate limits and worker pools per job type or priority.",
      },
      {
        id: "at-least-once",
        statement: "Every enqueued job runs at least once.",
        enforcedBy: ["kafka", "relay", "workers"],
        mechanism: "The log is durable; the relay retries Redis failures; workers lease jobs and acknowledge only after success.",
      },
    ],
  },
  stages: [
    {
      id: "size-it",
      title: "What the numbers say",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["backpressure", "message-queues"],
      competencyIds: ["capacity"],
      context: md`
        Use 86,400 seconds in a day, and about 2 KB per job.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements follow?",
        claims: [
          {
            id: "average",
            statement: "1.4 billion jobs a day is about 16,000 jobs a second on average, so the peak is about twice the average.",
            verdict: "holds",
            explanation: "1,400,000,000 / 86,400 ≈ 16,200. The 33,000 a second peak is about 2×.",
          },
          {
            id: "ten-minutes",
            statement: "If workers stop completely for ten minutes at peak, about 20 million jobs pile up, roughly 40 GB.",
            verdict: "holds",
            explanation: "33,000 × 600 ≈ 19.8 million jobs; at 2 KB each, about 40 GB. In RAM, that is a lot of headroom to keep permanently free for a bad ten minutes.",
          },
          {
            id: "queue-forever",
            statement: "A queue lets producers outpace consumers indefinitely.",
            verdict: "fails",
            explanation: "A queue absorbs bursts. If arrivals stay above completions, the backlog grows until something runs out. See [[backpressure]].",
          },
          {
            id: "memory-buffer",
            statement: "Since Redis is in memory, it is the best place to hold a large backlog.",
            verdict: "fails",
            explanation: "Memory is the most expensive and least elastic place to hold a backlog. A disk-backed log holds days of jobs cheaply; memory is for the small working set workers are about to take.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          A job queue has two jobs that pull in different directions: **hand work to workers quickly** (which suits memory) and **hold a backlog safely when workers fall behind** (which suits disk). The original design asked Redis to do both, so its worst day was decided by how much RAM happened to be free.
        `,
      },
    },
    {
      id: "the-outage",
      title: "Why the queue stopped draining",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["backpressure", "message-queues"],
      competencyIds: ["capacity", "isolation"],
      event: {
        kind: "failure",
        title: "Every feature built on jobs stops",
        detail: "A database cluster slowed down. Twenty minutes later, nothing could be enqueued or dequeued. Here is the incident timeline.",
      },
      context: md`
        Select the lines that describe causes in the design, not just symptoms.
      `,
      interaction: {
        kind: "diagnosis",
        prompt: "Select the faulty lines.",
        artifact: {
          type: "timeline",
          caption: "Incident timeline",
          lines: [
            { text: "14:02  db-cluster-7 p99 latency 40 ms → 900 ms (lock contention)" },
            {
              text: "14:03  search.index jobs now take 1.1 s instead of 30 ms; all workers busy, most of them on search.index",
              fault: "All job types share one worker pool, so one slow type occupies every worker and starves the rest. Job types need separate pools or limits.",
            },
            { text: "14:05  enqueue 31,000/s, dequeue 9,000/s" },
            { text: "14:19  redis-jobs-3 used_memory at 98% of maxmemory" },
            {
              text: "14:20  web: LPUSH jobs:notify failed: OOM command not allowed",
              fault: "Enqueue is a synchronous write to the memory-bound queue, so a full queue fails user requests. Enqueue needs a durable buffer that does not depend on consumers keeping up.",
            },
            {
              text: "14:20  worker: RPOPLPUSH jobs:search processing:search failed: OOM",
              fault: "Dequeuing copies the job into a processing list, which needs free memory. A full queue therefore cannot drain: the one action that would free memory is the one that is refused.",
            },
            { text: "14:21  dequeue rate 0/s; queue frozen" },
            {
              text: "14:24  ops: +200 workers to drain faster",
              fault: "Every worker connects to every Redis instance, so adding workers adds load to the component that is already failing, and they cannot dequeue anyway.",
            },
            { text: "14:58  db-cluster-7 recovered; Redis memory manually freed; queue resumes" },
          ],
        },
        rationale: {
          prompt: "Explain the chain from a slow database to a frozen queue, and the design changes that break it.",
          rubric: [
            { id: "chain", text: "Slow downstream → slow jobs → dequeue slower than enqueue → memory fills." },
            { id: "deadlock", text: "Dequeue needed memory, so a full queue could not drain." },
            { id: "durable", text: "Enqueue should land in a durable, disk-backed buffer that does not depend on workers." },
            { id: "isolation", text: "Job types should not share one worker pool." },
            { id: "workers", text: "Adding workers increased load on Redis, because of all-to-all connections.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The outage was not one bug but a chain, and the worst link was a **drain that required the resource that was exhausted**. Systems that fail this way are common: disks too full to delete files, out-of-memory processes that need memory to shut down cleanly. When designing a buffer, ask what happens when it is completely full, and make sure the way out does not need more of what has run out.
        `,
      },
    },
    {
      id: "durable-buffer",
      title: "A buffer that can hold a bad day",
      phase: "decide",
      dimensions: ["defend", "change"],
      conceptIds: ["message-queues", "event-log", "backpressure"],
      competencyIds: ["durability"],
      context: md`
        Thousands of job handlers and the worker fleet consume from Redis. Rewriting all of them at once would be a risky project on the most critical async path in the company.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you make enqueueing safe?",
        options: [
          {
            id: "more-memory",
            label: "Give the Redis clusters several times more memory",
            assessment: "defensible",
            feedback: "It moves the cliff further away, at a high cost for capacity that sits idle on normal days. The next long downstream incident finds the new edge.",
          },
          {
            id: "kafka-only",
            label: "Replace Redis with Kafka and rewrite workers to consume from Kafka directly",
            assessment: "defensible",
            feedback:
              "Kafka can hold the backlog, but it is a different consumption model: per-partition order with offsets, where a slow job blocks those behind it in the partition and per-job retries need extra machinery. Rewriting every worker at once is a big-bang change to a critical system.",
          },
          {
            id: "kafka-in-front",
            label: "Put Kafka in front of Redis: web servers enqueue to Kafka through a small gateway, and a relay moves jobs into Redis at a controlled rate; workers stay unchanged",
            assessment: "sound",
            feedback:
              "Enqueues land on disk, with days of retention, whatever the workers are doing. Redis now holds only what workers are about to take, and the relay decides how fast it fills. No handler changes. This is what Slack built: a Go gateway (Kafkagate) and a relay (JQRelay), with one relay owning each topic.",
          },
          {
            id: "block-web",
            label: "Make web servers block and retry when Redis is full",
            assessment: "flawed",
            feedback: "It moves the backlog into user requests: pages hang while web servers wait for the queue, and the outage spreads from background jobs to the whole product.",
          },
        ],
        rationale: {
          prompt: "What does each part of your design hold, and what does that protect against?",
          rubric: [
            { id: "disk", text: "The backlog lives in a durable, disk-backed log, so enqueue does not depend on consumers." },
            { id: "controlled", text: "Redis holds only a small working set, filled at a controlled rate." },
            { id: "incremental", text: "Workers are unchanged, so the change can be rolled out incrementally." },
            { id: "gateway", text: "A gateway keeps web servers from needing Kafka clients and connections.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The new design gives each store the job it is good at: **Kafka holds the backlog** (durable, cheap, days long), **Redis hands out work** (fast, small). The relay between them is where flow control lives, which is exactly what the old design lacked: nothing ever said "Redis is full, stop filling it".

          Keeping the workers unchanged was not a compromise; it was the design. It turned a rewrite into a rollout. See [[event-log]] and [[backpressure]].
        `,
        otherwise: "Starting from scratch, a managed queue (SQS, Cloud Tasks) or a database-backed job table can serve the same role with far less to operate.",
      },
      reveals: { components: ["gateway", "kafka", "relay"], flows: ["enqueue", "append", "read", "feed"] },
    },
    {
      id: "isolation",
      title: "One slow job type",
      phase: "decide",
      dimensions: ["defend", "break"],
      conceptIds: ["message-queues", "load-shedding", "rate-limiting"],
      competencyIds: ["isolation"],
      event: {
        kind: "scale",
        title: "Search indexing slows to a crawl",
        detail: "The search cluster is degraded. Indexing jobs take 40 times longer than usual. Notification jobs, which users notice within seconds, are queued behind them.",
      },
      context: md`
        Dropbox's task framework gives each combination of task type and priority its own queue. Slack's relay can rate-limit each job type independently.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you stop slow indexing from delaying notifications?",
        options: [
          {
            id: "more-workers",
            label: "Keep one shared queue and add workers",
            assessment: "flawed",
            feedback: "New workers also fill up with slow indexing jobs, and every one of them adds load to the degraded search cluster. Notifications still wait in the same line.",
          },
          {
            id: "separate",
            label: "Separate queues and worker pools per job type (or priority), with per-type rate limits in the relay",
            assessment: "sound",
            feedback:
              "Indexing can only occupy its own workers, and its rate limit stops it hammering the degraded search cluster. Notifications have their own queue and workers, so they keep flowing. A failure in one dependency stays in one lane.",
          },
          {
            id: "priority-field",
            label: "Add a priority to each job; workers always take the highest priority first",
            assessment: "defensible",
            feedback: "Notifications jump the line, but slow indexing jobs already running still hold workers, and under sustained load low-priority work can starve completely. Priorities help; separate capacity isolates.",
          },
          {
            id: "drop-index",
            label: "Drop indexing jobs while search is degraded",
            assessment: "flawed",
            feedback: "Messages would be missing from search permanently. Shedding is right for work that can be lost; indexing must be delayed, not discarded.",
          },
        ],
        rationale: {
          prompt: "Why does sharing capacity fail here, and what does your design isolate?",
          rubric: [
            { id: "shared", text: "In a shared pool, slow jobs accumulate in the workers and starve fast ones." },
            { id: "separate", text: "Separate queues and pools give each type its own capacity." },
            { id: "throttle", text: "Per-type rate limits protect the degraded dependency from its own jobs." },
            { id: "delay-vs-drop", text: "Distinguishes work that can be delayed from work that can be dropped.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Isolation is how you stop a **local** failure becoming a **global** one. In a shared pool, the slowest job type always wins, because slow jobs are exactly the ones that stay in the workers. Give each type its own capacity and its own throttle, and a degraded dependency only slows the work that depends on it.
        `,
      },
    },
    {
      id: "delivery",
      title: "What 'at least once' commits you to",
      phase: "break",
      dimensions: ["explain", "break"],
      conceptIds: ["delivery-guarantees", "idempotency", "retries-and-backoff"],
      competencyIds: ["semantics"],
      context: md`
        Workers lease a job (it becomes invisible to other workers until the lease expires), run it, then acknowledge. Some jobs fail; some workers crash mid-job.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "crash-lost",
            statement: "With leases, a worker crashing mid-job does not lose the job.",
            verdict: "holds",
            explanation: "The job was never acknowledged, so its lease expires and another worker takes it. That is the point of leasing instead of popping.",
          },
          {
            id: "idempotent",
            statement: "Because a crashed or timed-out job runs again, handlers must be idempotent or deduplicate.",
            verdict: "holds",
            explanation: "The first worker may have finished the work and died before acknowledging. Use the job ID as an idempotency key. See [[idempotency]].",
          },
          {
            id: "tight-retry",
            statement: "Retrying a failed job immediately, in a loop, gets work done fastest.",
            verdict: "fails",
            explanation: "If the failure is a struggling dependency, immediate retries multiply its load. Retry with exponential backoff and jitter. See [[retries-and-backoff]].",
          },
          {
            id: "poison",
            statement: "A job that crashes every worker that runs it is harmless if it is retried forever, since each attempt is cheap.",
            verdict: "fails",
            explanation: "A poison job crashes workers repeatedly and takes their in-flight work with them. Cap attempts and move the job to a dead-letter queue for a human to inspect.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          At-least-once is the practical guarantee, and it has two obligations attached: **handlers must tolerate repeats**, and **retries must be bounded and spaced out**. Everything that goes wrong with job systems in production is one of those obligations being skipped. See [[delivery-guarantees]].
        `,
      },
    },
    {
      id: "drain-backlog",
      title: "Twenty million jobs waiting",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["backpressure", "load-shedding", "message-queues"],
      competencyIds: ["operations", "isolation"],
      event: {
        kind: "failure",
        title: "The database is back, and the backlog is huge",
        detail:
          "After a 40-minute downstream outage, Kafka holds about 20 million jobs. Workers are healthy. The database that caused the outage is still warming up its caches.",
      },
      context: md`
        Amazon's Builders' Library describes how backlogs turn one outage into two: the recovery itself overloads the dependency that just recovered.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you drain it?",
        options: [
          {
            id: "full-speed",
            label: "Remove all rate limits and drain as fast as the workers can go",
            assessment: "flawed",
            feedback:
              "The recovering database receives several times its normal write load at once and falls over again. Meanwhile new jobs wait behind 40 minutes of old ones, so even fresh notifications arrive late.",
          },
          {
            id: "throttle-prioritise",
            label: "Drain each job type at a rate its downstream can take; let fresh interactive work go first; skip jobs whose usefulness has expired",
            assessment: "sound",
            feedback:
              "The dependency recovers instead of collapsing again. New notifications are not stuck behind old ones. And a job like 'push a typing indicator' or 'notify about a message the user has already read' is dropped at the start of processing because it is past its deadline, which frees capacity for work that still matters.",
          },
          {
            id: "lifo",
            label: "Process the newest jobs first for interactive types, and the old ones afterwards",
            assessment: "defensible",
            feedback: "Fresh work gets fresh latency, which is often what users notice. It breaks job types that rely on order, and old jobs still need throttling when their turn comes.",
          },
          {
            id: "purge",
            label: "Purge the backlog and start fresh",
            assessment: "flawed",
            feedback: "Billing events, exports and search indexing would be lost forever. Purging is only acceptable for job types designed to be lossy.",
          },
        ],
        rationale: {
          prompt: "How does your plan keep the recovery from causing a second outage?",
          rubric: [
            { id: "throttle", text: "Drain at the downstream's capacity, not the workers' capacity." },
            { id: "fresh-first", text: "New interactive work is not stuck behind old work." },
            { id: "deadlines", text: "Jobs past their usefulness are dropped cheaply instead of run." },
            { id: "measure", text: "Watches the age of the oldest job per type, not just queue length.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          A backlog is **work promised to the past**. Some of it still matters (billing), some has expired (a typing indicator), and all of it competes with the present. Draining well means deciding, per job type, how fast, in what order, and whether at all. See [[load-shedding]].

          The durable buffer is what makes these choices possible: with the backlog safely on disk, you can afford to drain it slowly.
        `,
      },
    },
    {
      id: "write-the-worker",
      title: "Write the worker loop",
      phase: "break",
      dimensions: ["implement"],
      conceptIds: ["delivery-guarantees", "retries-and-backoff", "idempotency"],
      competencyIds: ["semantics"],
      context: md`
        Write the loop each worker runs for one job type. The queue supports leases, acknowledgements, delayed retries and a dead-letter queue.
      `,
      interaction: {
        kind: "implementation",
        prompt: "Implement runWorker.",
        language: "typescript",
        starter: md`
          type Job = { id: string; type: string; payload: unknown; attempts: number; enqueuedAt: number; expiresAfterMs?: number };

          declare const queue: {
            lease(type: string, ms: number): Promise<Job | null>; // invisible to others until the lease ends
            ack(job: Job): Promise<void>;
            retryLater(job: Job, delayMs: number): Promise<void>; // increments attempts
            deadLetter(job: Job, reason: string): Promise<void>;
          };
          declare const handlers: Record<string, (payload: unknown, jobId: string) => Promise<void>>;

          export async function runWorker(type: string): Promise<never> {
            // lease, run, ack / retry / dead-letter
          }
        `,
        rubric: [
          { id: "lease-ack", text: "Leases a job and acknowledges only after the handler succeeds." },
          { id: "backoff", text: "Retries failures with exponential backoff and jitter." },
          { id: "cap", text: "Caps attempts and dead-letters jobs that keep failing." },
          { id: "expiry", text: "Drops (acknowledges without running) jobs past their expiry." },
          { id: "idempotency", text: "Passes the job ID to the handler for idempotency." },
          { id: "idle", text: "Sleeps briefly when the queue is empty instead of spinning.", weight: "supporting" },
        ],
        reference: {
          code: md`
            const MAX_ATTEMPTS = 8;
            const LEASE_MS = 60_000;
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

            export async function runWorker(type: string): Promise<never> {
              const handler = handlers[type];
              if (!handler) throw new Error(\`no handler for \${type}\`);

              for (;;) {
                const job = await queue.lease(type, LEASE_MS);
                if (!job) {
                  await sleep(200 + Math.random() * 200);
                  continue;
                }

                if (job.expiresAfterMs !== undefined && Date.now() - job.enqueuedAt > job.expiresAfterMs) {
                  await queue.ack(job); // nobody needs it any more
                  continue;
                }

                try {
                  await handler(job.payload, job.id); // handlers dedupe on job.id
                  await queue.ack(job);
                } catch (err) {
                  if (job.attempts + 1 >= MAX_ATTEMPTS) {
                    await queue.deadLetter(job, String(err));
                  } else {
                    const base = Math.min(1_000 * 2 ** job.attempts, 10 * 60_000);
                    await queue.retryLater(job, base / 2 + Math.random() * (base / 2));
                  }
                }
              }
            }
          `,
          notes: md`
            - The acknowledgement comes after the handler. A crash between the two means the job runs again when the lease expires, which is why the handler receives the job ID to deduplicate.
            - Backoff doubles per attempt up to ten minutes, with "equal jitter" (half fixed, half random) so retries from a burst of failures spread out.
            - After eight attempts the job goes to the dead-letter queue with the error, rather than retrying forever.
            - Leases must outlast the slowest normal run of the handler; long jobs should extend their lease while they work.
          `,
        },
      },
      reveal: {
        reasoning: md`
          A worker loop is a small state machine: leased → done, retry later, dead-lettered or expired. Each transition answers a failure the previous stages raised: crashes (leases), repeats (idempotency keys), struggling dependencies (backoff), poison jobs (dead letters), stale work (expiry).
        `,
      },
    },
    {
      id: "rollout",
      title: "Switch over without an outage",
      phase: "change",
      dimensions: ["change", "trace"],
      conceptIds: ["online-migrations", "delivery-guarantees"],
      competencyIds: ["operations", "durability"],
      event: {
        kind: "requirement-change",
        title: "Move 1.4 billion jobs a day to the new path",
        detail: "The gateway, Kafka and relay are built. The job queue cannot have an outage during the switch, and every step must be reversible.",
      },
      context: md`
        Slack's rollout used a shadow mode in which the relay read jobs from Kafka and discarded them instead of pushing them to Redis.
      `,
      interaction: {
        kind: "ordering",
        prompt: "Put the rollout steps in order.",
        items: [
          { id: "deploy", label: "Deploy the gateway, Kafka and relay; send heartbeat jobs through every partition and alert if any stops arriving" },
          { id: "double-write", label: "Enqueue every job both the old way and through the gateway; the relay runs in shadow mode, discarding jobs" },
          { id: "compare", label: "Compare job counts at every stage of both paths until they match" },
          { id: "first-types", label: "Move a few low-risk job types to the new path: stop the old enqueue for them and turn off shadow mode" },
          { id: "all-types", label: "Move the remaining job types in batches, keeping the old path available to switch back" },
        ],
        explanation: md`
          The new path carries real traffic long before anything depends on it: heartbeats prove every partition is alive, and shadow mode proves the gateway and relay keep up with the full load while the old path still does the real work. Counts at each stage are the verification. Only then do job types move, a few at a time, each one reversible. It is the same pattern as a data migration, applied to a pipeline. See [[online-migrations]].
        `,
      },
      reveal: {
        reasoning: md`
          You cannot test a critical path's new version with synthetic load alone. Running it in parallel with the old one, on real traffic, with its output thrown away, is how Slack (and many others) gained confidence before the switch.
        `,
      },
    },
    {
      id: "defend-hybrid",
      title: "Defend keeping Redis",
      phase: "defend",
      dimensions: ["defend"],
      conceptIds: ["message-queues", "backpressure", "event-log"],
      competencyIds: ["durability", "isolation", "capacity"],
      context: md`
        Your interviewer: "You now run Kafka and Redis and two new services. Kafka alone could be the queue, or you could have used SQS. Why this?"
      `,
      interaction: {
        kind: "open",
        prompt: "Defend the hybrid, concede what the alternatives offer, and say when you would choose them.",
        placeholder: "The constraint that decided it was…",
        rubric: [
          { id: "incremental", text: "The existing workers and handlers stay unchanged, so the change could ship incrementally with no big-bang rewrite." },
          { id: "roles", text: "Explains each part's role: Kafka durable backlog, Redis fast per-job handout, relay flow control." },
          { id: "kafka-only", text: "Explains what Kafka-only costs: per-partition head-of-line blocking and per-job retry machinery." },
          { id: "concede", text: "Concedes the operational cost and names when a managed queue or Kafka-only design would be better." },
        ],
        reference: md`
          **The deciding constraint** was not technical purity but risk: thousands of handlers and the whole worker fleet already spoke Redis. Putting a durable log in front changed what happens on a bad day without touching any of them, and it could be rolled out job type by job type.

          **Each part has one job.** Kafka holds the backlog on disk for days. Redis hands individual jobs to workers fast, with per-job leases and retries the handlers already understood. The relay is flow control between them: rate limits per job type, and the place a backlog is drained deliberately.

          **Why not Kafka alone?** Kafka consumers track an offset per partition. A slow or failing job blocks the jobs behind it in that partition unless you build retry topics and out-of-order acknowledgement on top. That is solvable, and some companies run job systems that way, but it is a rewrite of every consumer.

          **What I concede.** Two more services and a Kafka cluster are real operational load. Starting from scratch, a managed queue (SQS, Cloud Tasks) with per-type queues, visibility timeouts and dead-letter queues would give most of this with far less to run, and a small system could use a jobs table in its main database.
        `,
      },
      reveal: {
        reasoning: md`
          A good defence is honest about why the design looks the way it does, including history. "We kept Redis because the workers depended on it, and it let us ship safely" is a better engineering argument than pretending the hybrid is what anyone would design from scratch.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      The redesign separates **holding a backlog** from **handing out work**. Web servers enqueue through a stateless gateway into **Kafka**, which keeps days of jobs on disk whatever the workers are doing. A **relay** feeds each job type into **Redis** at a rate its workers and downstream systems can take, so Redis only ever holds a small working set and can never fill up and freeze.

      Job types get **separate queues, worker pools and rate limits**, so one slow dependency slows only its own jobs. Workers **lease** jobs, acknowledge after success, retry with backoff, dead-letter poison jobs and drop expired ones, and handlers deduplicate on the job ID because delivery is at least once. Backlogs are drained deliberately, and the new path was rolled out in shadow mode with heartbeats and stage-by-stage counts before any job depended on it.
    `,
    reliesOn: [
      "Handlers are idempotent on the job ID.",
      "Each job type's downstream capacity is known well enough to set rate limits.",
      "Kafka retention exceeds the longest outage you expect to drain.",
      "Job types declare whether they can expire.",
    ],
    alternatives: [
      { design: "Managed queue (SQS, Cloud Tasks, Pub/Sub)", preferWhen: "Building fresh, or the team does not want to operate Kafka and Redis." },
      { design: "Kafka-only with retry topics", preferWhen: "Consumers can be written for Kafka, and per-partition ordering is useful." },
      { design: "Jobs table in the main database", preferWhen: "Volume is modest and enqueuing must be transactional with the data change (an outbox)." },
    ],
    tradeoffs: [
      { choice: "Kafka in front of Redis", gains: "Durable backlog; unchanged workers; incremental rollout.", costs: "Two systems and two services to operate." },
      { choice: "Per-type isolation", gains: "Failures stay in one lane.", costs: "More queues and pools to size and monitor." },
      { choice: "At-least-once with idempotent handlers", gains: "No lost jobs through crashes.", costs: "Every handler must deduplicate." },
    ],
    breaksWhen: [
      "A backlog outlasts Kafka's retention.",
      "Jobs need strict global ordering across types.",
      "Enqueueing must be atomic with a database write (which calls for an outbox).",
    ],
  },
  interviewVariants: [
    "Design a distributed job queue or task scheduler.",
    "Design a background job system like Sidekiq, Celery or SQS.",
    "Your queue is backing up. What do you do?",
    "How do you guarantee a background job runs exactly once?",
  ],
  relatedInvestigationIds: ["video-processing-pipeline", "notification-system"],
} satisfies InvestigationInput;
