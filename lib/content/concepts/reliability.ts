import type { ConceptInput } from "@/lib/domain/content";
import { md } from "../md";

export const reliabilityConcepts: ConceptInput[] = [
  {
    id: "idempotency",
    title: "Idempotency",
    domain: "reliability",
    summary:
      "Designing an operation so that performing it twice has the same effect as performing it once, which is what makes retries safe.",
    problem: md`
      Networks drop responses, clients retry, queues redeliver, workers crash and restart. Every reliable system retries, and every retry risks doing the thing twice: charging twice, emailing twice, inserting two rows. You cannot reliably prevent the duplicate attempt, so you make the duplicate harmless.
    `,
    mechanism: md`
      Some operations are naturally idempotent: \`SET status = 'shipped'\`, \`PUT /avatar\`, \`DELETE /item/7\`. Others are not: \`balance = balance - 10\`, \`POST /charges\`, "send an email". Making those safe needs an **identity for the intent**:

      1. The caller attaches an **idempotency key**: a unique ID for *this* intent (this checkout attempt, this message), reused on every retry of it.
      2. The server **atomically claims** the key, for example \`INSERT INTO requests (key, …) ON CONFLICT DO NOTHING\`. Whoever inserts first does the work; anyone else finds the existing record.
      3. The server stores the **outcome** under the key and returns it to repeats, so a retry gets the same answer the first call produced.

      The details are where implementations fail:

      - **Scope.** The key must identify the intent, not the request bytes. A retried click reuses it; a genuinely new attempt (a different card after a decline) needs a new one.
      - **In-flight duplicates.** A retry can arrive while the first call is still running. The record needs a "processing" state, and the duplicate should wait or return 409/202 rather than start again.
      - **Payload mismatch.** The same key with different parameters is a client bug and should be rejected, not silently answered with the old result.
      - **Retention.** Keys must outlive the period during which retries can arrive.
      - **Atomicity with the effect.** Recording the key and performing the effect must commit together, or the effect must itself be conditional ([[state-machines]]). When the effect is an external call, pass the same key downstream so the next system deduplicates too.
    `,
    assumptions: [
      "Callers generate the key once per intent and reuse it across retries.",
      "The store that records keys supports an atomic insert-if-absent.",
      "Downstream systems either accept idempotency keys or their operations are naturally idempotent.",
    ],
    alternatives: [
      { name: "Natural keys and unique constraints", when: "The intent already has a unique identity, such as one enrollment per (user, course)." },
      { name: "Conditional state transitions", when: "The operation is a state change that can be guarded by the current state." },
      { name: "Accept duplicates and reconcile", when: "Duplicates are cheap and rare, and periodic cleanup is simpler than prevention." },
    ],
    failureModes: [
      { name: "Check-then-insert", description: "Two concurrent requests both see no key and both proceed. The claim must be atomic." },
      { name: "Key per request, not per intent", description: "Generating a new key on each retry defeats the purpose." },
      { name: "Key expires too soon", description: "A late retry, after the record has been purged, executes again." },
      { name: "Effect not covered", description: "The key is recorded, but the side effect (an email, a downstream call) can still repeat." },
    ],
    implementations: [
      { name: "Idempotency-Key HTTP header", note: "Stripe-style: the server stores the response by key for a retention period." },
      { name: "Unique constraint + ON CONFLICT", note: "The database performs the atomic claim." },
      { name: "Message ID dedupe table", note: "For consumers of at-least-once queues and webhooks." },
      { name: "Conditional writes (compare-and-set, ETags)", note: "Effects that only apply from an expected prior state." },
    ],
    claims: [
      {
        id: "get-safe",
        statement: "An HTTP endpoint is idempotent as long as it uses PUT instead of POST.",
        verdict: "fails",
        explanation:
          "HTTP method semantics are a promise the implementation must keep. A PUT handler that appends a row or sends an email is not idempotent because of its verb.",
      },
      {
        id: "retry-same-key",
        statement: "A client that times out and retries must send the same idempotency key as the original request.",
        verdict: "holds",
        explanation: "The key identifies the intent. A new key makes the retry look like a new intent, which is exactly the duplicate you are trying to prevent.",
      },
      {
        id: "unique-constraint-enough",
        statement: "A unique constraint on the idempotency key column is sufficient to make a charge endpoint safe.",
        verdict: "depends",
        explanation:
          "It handles concurrent duplicates arriving at your server. It does not stop the external charge from repeating unless you pass the same key to the provider, and it does not tell a duplicate what to return while the first call is still in flight.",
      },
      {
        id: "idempotent-equals-exactly-once",
        statement: "If every handler is idempotent, at-least-once delivery produces exactly-once effects.",
        verdict: "holds",
        explanation: "That is the standard construction: delivery may repeat, but repeats change nothing. See [[delivery-guarantees]].",
      },
    ],
    explain: {
      prompt: "Explain how you would make a non-idempotent operation, such as creating a charge, safe to retry.",
      rubric: [
        { id: "key", text: "An idempotency key identifies the intent and is reused across retries." },
        { id: "atomic-claim", text: "The server claims the key atomically (unique constraint or insert-if-absent), not check-then-insert." },
        { id: "outcome", text: "The outcome is stored under the key and returned to repeats; in-flight duplicates are handled." },
        { id: "downstream", text: "The key (or a derived one) is passed to downstream systems so external effects are deduplicated too.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["delivery-guarantees", "retries-and-backoff", "state-machines", "concurrency-control", "timeouts"],
  },
  {
    id: "retries-and-backoff",
    title: "Retries, backoff and jitter",
    domain: "reliability",
    summary:
      "Retrying transient failures with growing, randomized delays and a budget, so recovery does not become the next outage.",
    problem: md`
      Many failures are transient: a dropped connection, a 503 during a deploy, a lock timeout. Retrying fixes them. Retrying badly creates new failures: synchronized retry waves, amplified load on a struggling dependency, and duplicate side effects.
    `,
    mechanism: md`
      A sound retry policy answers four questions:

      1. **Is this retryable?** Transient errors (timeouts, 503, connection resets) yes. Permanent ones (400, validation errors, "card declined") no; retrying only wastes time. Unknown outcomes (a timeout on a non-idempotent call) only if the operation is [[idempotency|idempotent]].
      2. **How long to wait?** Exponential backoff (e.g. 100 ms, 200 ms, 400 ms… up to a cap) gives the dependency room to recover.
      3. **With jitter.** If a thousand clients fail at the same moment and all wait exactly 400 ms, they all return at the same moment. Randomizing the delay, for example "full jitter" (a random value between 0 and the backoff), spreads them out.
      4. **How many, in total?** A cap on attempts per request, and ideally a **retry budget** per client (retries may be at most, say, 10% of requests). Without it, a dependency at 50% errors receives up to 3x load from three-attempt retries, precisely when it can least handle it.

      Retries multiply through layers: three layers that each retry three times can produce 27 calls to the bottom service. Retry at one layer, usually the one closest to the user intent, and fail fast elsewhere. Pair retries with [[timeouts]] and, under sustained failure, a circuit breaker that stops calling the dependency for a while.
    `,
    assumptions: [
      "The operation being retried is idempotent or deduplicated.",
      "Failures are often transient and uncorrelated with the retry itself.",
      "Someone observes retry rates; a rising retry rate is an early warning.",
    ],
    alternatives: [
      { name: "Fail fast and surface the error", when: "A human or upstream caller is better placed to decide whether to retry." },
      { name: "Queue for later processing", when: "The work can wait; a durable queue retries without holding a request open." },
      { name: "Hedged requests", when: "Tail latency matters and duplicate reads are cheap: send a second request if the first is slow." },
    ],
    failureModes: [
      { name: "Retry storm", description: "Synchronized retries without jitter hit a recovering service in waves and knock it over again." },
      { name: "Amplification across layers", description: "Nested retries multiply load on the deepest dependency." },
      { name: "Retrying permanent errors", description: "Wastes capacity and delays the user's real feedback." },
      { name: "Retrying non-idempotent calls", description: "Duplicates charges, emails or records." },
    ],
    implementations: [
      { name: "Exponential backoff with full jitter", note: "sleep = random(0, min(cap, base × 2^attempt))." },
      { name: "Retry budgets / token buckets", note: "Retries consume tokens that refill with successful requests." },
      { name: "Circuit breakers", note: "Stop calling a failing dependency for a cooldown period, then probe." },
    ],
    claims: [
      {
        id: "more-retries",
        statement: "Increasing the retry count makes a system more reliable.",
        verdict: "depends",
        explanation:
          "For rare, independent blips, yes. For an overloaded dependency, more retries mean more load and a longer outage. Retries help with transient faults and hurt with saturation.",
      },
      {
        id: "jitter",
        statement: "Without jitter, clients that failed together tend to retry together.",
        verdict: "holds",
        explanation: "Deterministic backoff preserves their synchronization, so each retry round arrives as a spike. Jitter spreads them out.",
      },
      {
        id: "declined",
        statement: "A 'card declined' response from a payment provider should be retried with backoff.",
        verdict: "fails",
        explanation: "It is a definitive answer, not a transient failure. Retrying will not change it and may trigger fraud controls. Surface it to the user.",
      },
      {
        id: "nested",
        statement: "Three layers that each retry up to 3 times can send up to 27 requests to the bottom service for one user action.",
        verdict: "holds",
        explanation: "3 × 3 × 3. This is why retries belong at one layer.",
      },
    ],
    explain: {
      prompt: "Describe a retry policy for calls to a dependency that occasionally returns 503, and explain each part of it.",
      rubric: [
        { id: "classify", text: "Retries only transient or retryable errors, and only idempotent operations." },
        { id: "backoff", text: "Uses exponential backoff with a cap." },
        { id: "jitter", text: "Adds jitter to avoid synchronized retries." },
        { id: "budget", text: "Limits total retries (attempt cap, budget, or circuit breaker) so retries cannot amplify an outage." },
      ],
    },
    relatedConceptIds: ["timeouts", "idempotency", "backpressure", "rate-limiting"],
  },
  {
    id: "timeouts",
    title: "Timeouts and unknown outcomes",
    domain: "reliability",
    summary:
      "A timeout bounds how long you wait. It tells you nothing about what happened, so the operation's outcome becomes unknown.",
    problem: md`
      Without a timeout, a call to a hung dependency waits forever while holding a thread, a connection and the user. With a timeout, you stop waiting, but the request may have reached the other side and succeeded. "Timed out" is not "failed".
    `,
    mechanism: md`
      A timeout is a local decision to stop waiting. When it fires, the remote operation is in one of three states: **never started**, **still running**, or **completed with the response lost**. You cannot tell which.

      Handling that well:

      - **Set timeouts deliberately.** Base them on the dependency's latency distribution (a little above its p99.9) and on the caller's own deadline. A timeout longer than the caller's means you keep working on something nobody is waiting for. Propagate deadlines downstream so inner calls give up when the outer request has.
      - **Treat the outcome as unknown.** For reads, retry freely. For writes, retry only if the operation is [[idempotency|idempotent]] (the same key or a conditional write); otherwise record an explicit *unknown* state.
      - **Resolve unknowns from the source of truth.** Look the operation up by its key, wait for a callback ([[webhooks]]), or reconcile later ([[reconciliation]]). Never resolve uncertainty by assuming the convenient answer.
      - **Bound everything.** Connection timeouts, read timeouts and overall deadlines are different; a slow trickle of bytes can defeat a read timeout that resets on each byte.
    `,
    assumptions: [
      "There is a way to learn the true outcome later: a lookup, a callback, or an idempotent retry.",
      "Callers can represent \"pending\" or \"unknown\" to users.",
    ],
    alternatives: [
      { name: "No timeout (wait indefinitely)", when: "Practically never in network code; acceptable only for in-process work with its own guarantees." },
      { name: "Asynchronous request with status polling", when: "The operation is legitimately long; the caller stops waiting by design rather than by timeout." },
    ],
    failureModes: [
      { name: "Timeout treated as failure", description: "A succeeded charge is recorded as failed; the user pays again." },
      { name: "Timeouts longer than the caller's", description: "Work continues for requests nobody is waiting for, wasting capacity during incidents." },
      { name: "Missing timeouts", description: "One slow dependency exhausts every thread or connection pool upstream." },
    ],
    implementations: [
      { name: "Per-call timeouts in HTTP clients", note: "Connect, read and total deadline: set all three." },
      { name: "Deadline propagation (gRPC deadlines, context cancellation)", note: "Downstream calls inherit the remaining time." },
      { name: "Unknown/pending states in data models", note: "Make uncertainty representable." },
    ],
    claims: [
      {
        id: "timeout-failed",
        statement: "If a request to create a payment times out, the payment was not created.",
        verdict: "fails",
        explanation: "It may have been created and the response lost, or it may still be in progress. The outcome is unknown until you check.",
      },
      {
        id: "retry-read",
        statement: "Retrying a timed-out read is generally safe.",
        verdict: "holds",
        explanation: "Reads have no side effects, so repeating one changes nothing, though it does add load.",
      },
      {
        id: "long-timeout",
        statement: "Generous timeouts make a system more robust because fewer requests fail.",
        verdict: "depends",
        explanation:
          "Up to a point. Beyond the caller's own deadline they just hold resources, and when a dependency degrades, long timeouts let requests pile up until the caller's pools are exhausted and it fails too.",
      },
    ],
    explain: {
      prompt: "Explain what you know, and what you do not know, after a write request times out, and how a well-designed system proceeds.",
      rubric: [
        { id: "three-states", text: "The operation may not have started, may be running, or may have completed with the response lost." },
        { id: "unknown", text: "The outcome is recorded as unknown, not as failure." },
        { id: "resolve", text: "It is resolved via an idempotent retry, a lookup by key, a callback, or reconciliation." },
      ],
    },
    relatedConceptIds: ["idempotency", "retries-and-backoff", "reconciliation", "state-machines"],
  },
  {
    id: "reconciliation",
    title: "Reconciliation",
    domain: "reliability",
    summary:
      "Periodically comparing your records with an authoritative source and repairing differences, the backstop for every message that was lost.",
    problem: md`
      Your system's view of the world is assembled from messages: API responses, webhooks, queue events. Some of them get lost, duplicated past their dedupe windows, or misapplied by bugs. Without a way to compare against the truth, those errors are permanent and invisible.
    `,
    mechanism: md`
      A reconciler periodically asks: **for each thing I am unsure about, or for everything in a period, does my record match the source of truth?**

      Two common forms:

      - **Targeted sweeps.** Find records stuck in non-terminal states longer than expected (\`processing\` for over 10 minutes, \`uploading\` for over a day). Look each one up at the source, such as the payment provider's API by your reference, and apply the authoritative state through the **same conditional transitions** as every other path, so the reconciler and a late webhook cannot conflict.
      - **Full comparisons.** Compare everything in a period against an authoritative report (a provider's daily settlement file, a bank statement), in both directions: things they have that you do not, and things you have that they do not.

      Rules that keep reconcilers honest:

      - Reconcile toward the **source of truth** for each fact. For money movement that is the provider, not your database.
      - Some differences cannot be decided automatically: a record the provider has never heard of might be a request still in flight. Wait out the in-flight window before concluding anything, and send what remains to a human queue.
      - **Alert on the output.** The reconciler's findings are bug reports about the rest of the system; a rising count means something upstream is broken.
    `,
    assumptions: [
      "An authoritative source exists and can be queried by your identifiers.",
      "The reconciler applies changes through the same idempotent, conditional paths as normal processing.",
    ],
    alternatives: [
      { name: "Trust the event stream", when: "Delivery is transactional end to end, within one system, and loss is impossible by construction." },
      { name: "Manual review", when: "Volume is tiny and discrepancies are rare enough for a person to check." },
    ],
    failureModes: [
      { name: "Reconciler fights the main path", description: "It writes state unconditionally and overwrites a newer transition made by a webhook." },
      { name: "Premature conclusions", description: "It marks an in-flight request failed because the provider has not recorded it yet." },
      { name: "Nobody reads the output", description: "Discrepancies are logged and ignored, so the bug causing them persists." },
    ],
    implementations: [
      { name: "Scheduled sweep of stale states", note: "WHERE status = 'processing' AND updated_at < now() - interval '10 minutes'." },
      { name: "Settlement file comparison", note: "Daily batch job diffing provider reports against your ledger." },
      { name: "Anti-entropy between replicas", note: "The same idea in distributed databases: compare and repair (Merkle trees)." },
    ],
    claims: [
      {
        id: "only-for-bugs",
        statement: "Reconciliation is only needed when the system has bugs.",
        verdict: "fails",
        explanation:
          "Correct systems still lose messages: webhooks stop after their retry window, processes crash between steps, networks partition. Reconciliation is how a correct design handles those cases, and it also catches the bugs.",
      },
      {
        id: "no-record",
        statement: "If the provider has no record of a payment we attempted, it is safe to mark it failed immediately.",
        verdict: "fails",
        explanation:
          "The request may still be in flight or queued at the provider. Wait until no in-flight request could still land, typically well past your own request timeouts, and ideally until the idempotency window has passed, before concluding.",
      },
      {
        id: "same-paths",
        statement: "The reconciler should apply corrections through the same conditional transitions as webhooks and API responses.",
        verdict: "holds",
        explanation: "Then the three paths cannot conflict: whichever learns the truth first transitions the state, and the others see zero rows changed.",
      },
    ],
    explain: {
      prompt: "Explain why a payment system needs reconciliation even if its webhook handling is correct, and how the reconciler should apply what it learns.",
      rubric: [
        { id: "loss", text: "Messages can be lost or never sent even when every component is correct." },
        { id: "truth", text: "The reconciler compares against the authoritative source (the provider) by your identifiers." },
        { id: "same-path", text: "Corrections go through the same conditional transitions, so they cannot conflict with other paths." },
        { id: "undecidable", text: "Some cases (no record yet) need waiting or a human.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["webhooks", "timeouts", "state-machines", "event-log"],
  },
  {
    id: "transactional-outbox",
    title: "Transactional outbox",
    domain: "reliability",
    summary:
      "Recording outgoing messages in the same database transaction as the state change, then delivering them separately, to avoid the dual-write problem.",
    problem: md`
      After a state change you must tell another system: publish an event, enqueue a job, send an email. That is **two writes to two systems** (your database and a broker or API), and no transaction spans both. Commit first and crash before publishing: the message is lost. Publish first and the commit fails: you announced something that never happened.
    `,
    mechanism: md`
      Make the second write part of the first:

      1. In the same transaction as the state change, \`INSERT\` a row into an \`outbox\` table describing the message.
      2. Commit. Now the state change and the intent to notify are durable together, or neither exists.
      3. A **relay** (a polling worker, or change-data-capture on the table) reads unsent outbox rows, delivers them, and marks them sent.

      Delivery is **at-least-once**: the relay can deliver and crash before marking the row sent, then deliver again. So every consumer must be [[idempotency|idempotent]], which in practice means including a unique message ID in each outbox row.

      The same trick works in reverse as an **inbox**: a consumer records incoming message IDs in the same transaction as their effects, deduplicating at-least-once input. Outbox plus inbox gives effectively-once processing between services without distributed transactions.

      Ordering: a single relay processing rows in insertion order preserves order per source; parallel relays need ordering per key if consumers care.
    `,
    assumptions: [
      "The state change lives in a database that can also hold the outbox table.",
      "Consumers deduplicate by message ID or are idempotent.",
      "Some delay between commit and delivery (typically sub-second to seconds) is acceptable.",
    ],
    alternatives: [
      { name: "Publish after commit and reconcile", when: "Occasional loss is detected and repaired by a sweep anyway." },
      { name: "Change data capture on business tables", when: "Consumers can work from row changes directly, without explicit messages." },
      { name: "Jobs table as the queue", when: "The consumer is your own worker; the 'outbox' row simply is the job." },
    ],
    failureModes: [
      { name: "Relay without dedupe downstream", description: "Redelivery after a relay crash duplicates effects." },
      { name: "Outbox growth", description: "Sent rows are never deleted, and the relay's scan slows down." },
      { name: "Stuck relay", description: "Messages accumulate unsent; alert on the age of the oldest unsent row." },
    ],
    implementations: [
      { name: "Outbox table + polling relay", note: "SELECT … FOR UPDATE SKIP LOCKED over unsent rows." },
      { name: "Debezium / logical replication", note: "Stream outbox inserts from the database log." },
      { name: "Framework support", note: "Many service frameworks ship outbox and inbox implementations." },
    ],
    claims: [
      {
        id: "publish-after-commit",
        statement: "Publishing to the queue immediately after the transaction commits is reliable as long as the publish call is retried on failure.",
        verdict: "fails",
        explanation:
          "Retries do not help if the process dies between the commit and the publish: nothing remembers that a publish was owed. The outbox row is that memory.",
      },
      {
        id: "exactly-once",
        statement: "The outbox pattern delivers each message exactly once.",
        verdict: "fails",
        explanation: "It guarantees no loss, not no duplicates. The relay can deliver and then crash before marking the row sent.",
      },
      {
        id: "jobs-table",
        statement: "If the consumer is a worker reading a jobs table in the same database, you already have an outbox.",
        verdict: "holds",
        explanation: "Inserting the job in the same transaction as the state change is exactly the outbox guarantee, with the relay step removed.",
      },
    ],
    explain: {
      prompt: "Explain the dual-write problem and how the transactional outbox solves it, including what it does not guarantee.",
      rubric: [
        { id: "dual", text: "State change and notification are writes to two systems with no shared transaction; a crash between them loses or invents a message." },
        { id: "same-tx", text: "The outbox row is written in the same transaction as the state change." },
        { id: "relay", text: "A relay delivers outbox rows separately and marks them sent." },
        { id: "at-least-once", text: "Delivery is at-least-once, so consumers must be idempotent." },
      ],
    },
    relatedConceptIds: ["transactions", "message-queues", "idempotency", "delivery-guarantees"],
  },
];
