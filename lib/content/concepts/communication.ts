import type { ConceptInput } from "@/lib/domain/content";
import { md } from "../md";

export const communicationConcepts: ConceptInput[] = [
  {
    id: "asynchronous-processing",
    title: "Asynchronous processing",
    domain: "communication",
    summary:
      "Accepting a request, recording the work durably, and doing it later in another process, so the work can outlive the request.",
    problem: md`
      A request has a deadline: the client's patience, the load balancer's timeout, the lifetime of the process serving it. Some work does not fit inside that deadline: a 15-minute transcode, a report over a year of data, a call to a slow partner API. Some work does not need to finish before you answer, such as sending a receipt.

      If that work runs inside the request, every deploy, crash or timeout loses it, and the client cannot tell whether it happened. Meanwhile the server's request capacity is tied up waiting.
    `,
    mechanism: md`
      The request does only what is needed to **accept** the work: validate it, record it durably (a job row, a message in a queue), and respond, typically \`202 Accepted\` with a way to check status later. A separate process, the worker, picks the work up and carries it out.

      Three things change when you do this:

      - **The work needs an identity and a state.** "Is my video ready?" requires a record that says \`queued\`, \`processing\`, \`ready\` or \`failed\`. That record is a [[state-machines|state machine]] and becomes the contract between the API, the worker and the client.
      - **Someone has to own the work while it runs.** If the worker dies, something must notice and hand the work to another worker. That is a lease or a visibility timeout; see [[leases-and-fencing]].
      - **The work may run more than once.** Recovery from crashes means re-running work whose first execution may or may not have completed, so the work must be [[idempotency|idempotent]] or guarded.

      The client learns the outcome by polling the status, by a push channel ([[server-push]]), or by a callback such as an email or a [[webhooks|webhook]].
    `,
    lesson: [
      {
        kind: "read",
        body: md`
          Some work doesn't fit inside a request: a 15-minute video transcode, a large report, a call to a slow partner API. Some work just doesn't need to finish before you answer, like sending a receipt email.

          If that work runs inside the request, a deploy, crash or timeout loses it, and the client can't tell whether it happened.
        `,
      },
      {
        kind: "read",
        body: md`
          Doing it asynchronously: the request **records** the work durably (a row in a jobs table or a message in a queue) and responds \`202 Accepted\` with an id. A separate **worker** picks up the work and does it later. The client checks the status with the id, or is notified when it's done.
        `,
      },
      {
        kind: "choice",
        id: "when-202",
        prompt: "When is it safe to respond 202 Accepted?",
        options: [
          {
            id: "durable",
            label: "Once the job is committed to the database or acknowledged by the queue.",
            correct: true,
            why: "\"Accepted\" is a promise. It's only safe to make once the work is stored somewhere that survives this process crashing.",
          },
          {
            id: "thread",
            label: "Once the job is handed to a background thread.",
            why: "If the process dies, the thread and the job die with it, but the client was already told it was accepted.",
          },
          {
            id: "immediately",
            label: "Immediately, and save the job right after, to keep the response fast.",
            why: "A crash between the response and the save loses work the client thinks is safe.",
          },
        ],
      },
      {
        kind: "predict",
        id: "worker-dies",
        prompt: "A worker is halfway through a job when its machine dies. What has to exist so that the job isn't stuck as \"processing\" forever?",
        answer: md`
          Something that notices the worker is gone and hands the job to another worker. Usually it's a **lease** (or visibility timeout): a worker claims a job for, say, five minutes. If it doesn't finish or renew the claim in time, the job becomes available again. See [[leases-and-fencing]].
        `,
      },
      {
        kind: "choice",
        id: "idempotent",
        prompt: "Because of that recovery, what must be true of the job?",
        options: [
          {
            id: "rerun",
            label: "It must be safe to run more than once.",
            correct: true,
            why: "The first worker may have finished part or all of the job before it died. A worker that's just slow also looks dead, so two can even run at once. See [[idempotency]].",
          },
          {
            id: "fast",
            label: "It must finish within the lease time.",
            why: "Long jobs can renew their lease. What can't be avoided is the job sometimes running twice.",
          },
          {
            id: "ordered",
            label: "Jobs must run in the order they were submitted.",
            why: "Recovery doesn't require ordering, and most job queues don't guarantee it.",
          },
        ],
      },
      {
        kind: "choice",
        id: "faster",
        prompt: "Does moving work to a queue make the work finish faster?",
        options: [
          {
            id: "no",
            label: "No. The response is faster; the work takes as long as before, plus time waiting in the queue.",
            correct: true,
            why: "What you gain is a request path protected from the work's duration and failures.",
          },
          {
            id: "yes",
            label: "Yes, because workers run in parallel.",
            why: "You could run the work in parallel without a queue too. The queue changes when the client gets an answer, not how long the work takes.",
          },
        ],
      },
      {
        kind: "read",
        body: md`
          One thing to monitor: if jobs arrive faster than workers finish them, nothing errors. The queue just grows, and work gets later and later. Alert on the **age of the oldest waiting job**, since that's what users experience.
        `,
      },
    ],
    assumptions: [
      "The caller can tolerate not knowing the result when the request returns.",
      "The accepted work is recorded durably before the response is sent; otherwise \"accepted\" is a lie.",
      "There is a way for the caller to learn the eventual outcome.",
    ],
    alternatives: [
      {
        name: "Do it inside the request",
        when: "The work reliably finishes well within the request deadline and losing it on a crash is acceptable, because the client will retry.",
      },
      {
        name: "Streaming the response",
        when: "The work is long but the client must watch it happen and can stay connected, as in a build log or an LLM response.",
      },
      {
        name: "Scheduled batch processing",
        when: "Results are needed periodically rather than per request, and throughput matters more than latency.",
      },
    ],
    failureModes: [
      {
        name: "Accepted but not recorded",
        description:
          "The API responds 202 and enqueues the work in memory or after the response. A crash in between loses work the client was told was accepted.",
      },
      {
        name: "Stranded work",
        description: "A worker dies mid-job and nothing reassigns it; the status says processing forever.",
      },
      {
        name: "Silent backlog",
        description:
          "Work arrives faster than workers finish it. Nothing errors; latency just grows until users notice. Queue age, not queue length, is the metric to alert on.",
      },
      {
        name: "Duplicate side effects",
        description: "Retried work charges, emails or writes twice because it was not designed to run more than once.",
      },
    ],
    implementations: [
      { name: "Background thread in the same process", note: "Not durable: fine only for work you are happy to lose." },
      { name: "Jobs table in the primary database", note: "Durable and transactional with your data; good up to moderate throughput." },
      { name: "Managed queue (SQS, Cloud Tasks, etc.)", note: "Durable delivery with visibility timeouts and dead-letter handling built in." },
      { name: "Workflow engines (Temporal, Step Functions)", note: "For multi-step processes that need durable state between steps." },
    ],
    claims: [
      {
        id: "faster",
        statement: "Moving work to a background queue makes it finish faster.",
        verdict: "fails",
        explanation:
          "The work takes as long as it takes, plus queueing delay. What gets faster is the *response*, and the request path is protected from the work's duration and failures.",
      },
      {
        id: "must-be-idempotent",
        statement: "Work processed asynchronously with crash recovery must tolerate running more than once.",
        verdict: "holds",
        explanation:
          "Recovery means re-running work whose first attempt may have partly or fully completed. A slow worker is indistinguishable from a dead one, so the second run can even overlap the first.",
      },
      {
        id: "202-means-done",
        statement: "Returning 202 Accepted is safe as soon as the work has been handed to a worker thread.",
        verdict: "fails",
        explanation:
          "\"Accepted\" is a promise. It is only safe once the work is recorded somewhere that survives this process dying, such as a committed row or a durably acknowledged message.",
      },
      {
        id: "always-better",
        statement: "Making an endpoint asynchronous is an improvement for any operation that takes more than a second.",
        verdict: "depends",
        explanation:
          "It adds a state machine, a status channel, a worker fleet and duplicate handling. For a two-second operation the client is happy to wait for, a synchronous call with a sensible timeout is simpler and easier to reason about.",
      },
    ],
    explain: {
      prompt:
        "Explain what has to be true before an API can safely respond \"accepted\" to work it will do later, and what new problems that creates.",
      rubric: [
        { id: "durable-before-ack", text: "The work must be recorded durably before the response is sent." },
        { id: "state", text: "The work needs an identity and a state the client can query or be notified about." },
        { id: "ownership", text: "Something must reassign the work if the process running it dies (lease or visibility timeout)." },
        { id: "duplicates", text: "Recovery implies the work may run more than once, so it must be idempotent.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["message-queues", "idempotency", "leases-and-fencing", "state-machines", "backpressure"],
  },
  {
    id: "message-queues",
    title: "Message queues",
    domain: "communication",
    summary:
      "A durable buffer between producers and consumers that hands each message to one consumer at a time and redelivers it unless acknowledged.",
    problem: md`
      A producer has work for some consumer, but the two run at different speeds, fail independently, and should not have to know about each other. Calling the consumer directly couples them: if the consumer is slow or down, the producer stalls or loses the work.
    `,
    mechanism: md`
      A queue stores messages durably and hands them out. The core loop in most work queues:

      1. A consumer **receives** a message. The queue hides it from other consumers for a *visibility timeout* (a lease) instead of deleting it.
      2. The consumer processes it, then **acknowledges** (deletes) it.
      3. If the acknowledgement does not arrive before the timeout, because the consumer crashed, hung or was slow, the message becomes visible again and another consumer receives it.

      That loop is why queues are **at-least-once**: a consumer that processed the message but died before acknowledging causes a redelivery. See [[delivery-guarantees]].

      Other properties vary by system and matter more than the brand:

      - **Ordering:** most work queues do not preserve order across consumers; FIFO queues and partitioned logs offer order per key at the cost of parallelism; see [[ordering]].
      - **Dead-lettering:** after N failed receives, a message moves to a separate queue so a poison message stops consuming capacity.
      - **Retention model:** work queues delete acknowledged messages; logs (Kafka-style) retain them and let each consumer track its own offset, so many independent consumers can read the same stream.

      Getting a message *into* a queue atomically with a database change is its own problem; see [[transactional-outbox]].
    `,
    lesson: [

      {
        kind: "read",
        body: md`
          A producer has work for a consumer, but the two run at different speeds and fail independently. If the producer calls the consumer directly, a slow or down consumer stalls the producer or loses the work.

          A **queue** sits between them: it stores messages durably and hands each one to one consumer at a time.
        `,
      },
      {
        kind: "read",
        body: md`
          The core loop of a work queue:

          1. A consumer **receives** a message. The queue hides it from others for a **visibility timeout** (a lease) instead of deleting it.
          2. The consumer processes it, then **acknowledges** it, which deletes it.
          3. If no acknowledgement arrives before the timeout (crash, hang, slowness), the message becomes visible again and another consumer receives it.
        `,
      },
      {
        kind: "choice",
        id: "crash-after",
        prompt: "A consumer finishes processing a message and crashes before acknowledging it. What does the queue do?",
        options: [
          {
            id: "redeliver",
            label: "Redelivers it after the visibility timeout: the work is done twice.",
            correct: true,
            why: "The queue can't tell 'crashed before processing' from 'crashed after'. That's why work queues are at least once, and consumers must tolerate repeats. See [[delivery-guarantees]].",
          },
          {
            id: "delete",
            label: "Deletes it, since it was processed",
            why: "Only the acknowledgement tells the queue that. Without it, the message comes back.",
          },
          {
            id: "lost",
            label: "Loses it",
            why: "Keeping unacknowledged messages is exactly what the visibility timeout is for.",
          },
        ],
      },
      {
        kind: "read",
        body: md`
          Other properties vary by system, and matter more than the brand:

          - **Ordering:** most work queues don't preserve order across consumers. FIFO queues and partitioned logs give order per key, at the cost of parallelism. See [[ordering]].
          - **Dead-lettering:** after N failed receives, a message moves aside so a poison message stops consuming capacity.
          - **Retention:** work queues delete acknowledged messages; logs (Kafka-style) keep them and let each consumer track its own offset, so many consumers can read the same stream.

          Getting a message *into* a queue atomically with a database change is its own problem; see [[transactional-outbox]].
        `,
      },
      {
        kind: "choice",
        id: "poison",
        prompt: "One message crashes every consumer that receives it. Without a dead-letter queue, what happens?",
        options: [
          {
            id: "loop",
            label: "It's redelivered forever, crashing a consumer each time and taking their other work down with it.",
            correct: true,
            why: "The queue faithfully redelivers it. A cap on receives that moves it aside breaks the loop and keeps it for inspection.",
          },
          {
            id: "dropped",
            label: "The queue eventually drops it automatically.",
            why: "Not without a configured limit; by default it keeps redelivering.",
          },
          {
            id: "harmless",
            label: "Nothing much; other messages keep flowing.",
            why: "Each crash also kills whatever else that consumer was holding.",
          },
        ],
      },
    ],
    assumptions: [
      "Consumers can tolerate redelivery: processing is idempotent or deduplicated.",
      "The visibility timeout exceeds the normal processing time, or is extended by heartbeats.",
      "Something watches queue age and the dead-letter queue.",
    ],
    alternatives: [
      {
        name: "Jobs table with SKIP LOCKED",
        when: "Throughput is modest and you want enqueueing to be transactional with your other writes.",
      },
      {
        name: "Partitioned log (Kafka, Kinesis)",
        when: "Many independent consumers need the same events, or you need replay and per-key ordering at high throughput.",
      },
      {
        name: "Direct RPC with retries",
        when: "The caller needs the result now and both sides are reliably up.",
      },
    ],
    failureModes: [
      {
        name: "Timeout shorter than processing",
        description: "Slow messages become visible again while still being processed, so two consumers work on them concurrently.",
      },
      {
        name: "Poison message",
        description: "A message that always crashes its consumer is redelivered forever unless it is dead-lettered.",
      },
      {
        name: "Ack before work",
        description: "Acknowledging on receipt turns at-least-once into at-most-once: a crash after the ack loses the message.",
      },
      {
        name: "Lost on publish",
        description: "Publishing after a database commit, without an outbox, loses messages when the process dies in between.",
      },
    ],
    implementations: [
      { name: "In-process queue", note: "A bounded channel in memory: buffering without durability." },
      { name: "Postgres / MySQL jobs table", note: "SELECT … FOR UPDATE SKIP LOCKED plus a lease column." },
      { name: "SQS, Cloud Tasks, RabbitMQ", note: "Managed work queues with visibility timeouts or acks, and dead-letter queues." },
      { name: "Kafka, Kinesis, Redis Streams", note: "Retained logs with consumer offsets and per-partition order." },
    ],
    claims: [
      {
        id: "exactly-once",
        statement: "A queue configured correctly delivers each message to your consumer exactly once.",
        verdict: "fails",
        explanation:
          "Delivery is at-least-once because the queue cannot distinguish a consumer that crashed before processing from one that crashed after processing but before acknowledging. \"Exactly-once\" features cover narrower cases, such as dedupe windows or transactional reads and writes within the same system. Your side effects still need idempotency.",
      },
      {
        id: "kafka-high-traffic",
        statement: "Kafka is the right choice whenever traffic is high.",
        verdict: "fails",
        explanation:
          "Kafka is a log: it shines when several consumers read the same events, when you need replay, or when you need per-key ordering at high throughput. A work queue with competing consumers is a different shape, and \"high traffic\" alone says nothing about which shape you need.",
      },
      {
        id: "queue-absorbs-spikes",
        statement: "A queue lets a system absorb a traffic spike that exceeds its processing capacity.",
        verdict: "depends",
        explanation:
          "It absorbs a spike *temporarily*, by turning excess load into waiting time. If the spike is longer than the backlog can drain before latency becomes unacceptable, or arrivals stay above capacity, the queue only delays the failure. See [[backpressure]].",
      },
      {
        id: "visibility-is-lease",
        statement: "A visibility timeout is a lease on the message.",
        verdict: "holds",
        explanation:
          "Receiving a message grants temporary, expiring ownership. Like any lease, the old owner may still be working when it expires, which is why consumers should also guard their final writes.",
      },
    ],
    explain: {
      prompt: "Walk through what a work queue does when a consumer crashes halfway through a message, and why that implies at-least-once delivery.",
      rubric: [
        { id: "hidden", text: "On receipt the message is hidden for a visibility timeout rather than deleted." },
        { id: "reappears", text: "Without an acknowledgement before the timeout it becomes visible again and is redelivered." },
        { id: "ambiguity", text: "The queue cannot tell 'crashed before processing' from 'crashed after processing, before ack', so redelivery can repeat completed work." },
        { id: "dlq", text: "Repeated failures should end in a dead-letter queue instead of looping.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["delivery-guarantees", "transactional-outbox", "leases-and-fencing", "asynchronous-processing", "ordering"],
  },
  {
    id: "delivery-guarantees",
    title: "Delivery guarantees",
    domain: "communication",
    summary:
      "At-most-once, at-least-once, and why 'exactly-once' is achieved by making duplicates harmless rather than by preventing them.",
    problem: md`
      A sender transmits a message and waits for an acknowledgement. The acknowledgement does not come. Either the message was lost, or it arrived and the acknowledgement was lost. **The sender cannot tell which.** Every messaging system has to choose what to do about that.
    `,
    mechanism: md`
      There are two honest choices:

      - **At-most-once:** never retry. Some messages are lost; none are duplicated. Fine for metrics samples, cursor positions and other data where the next message supersedes the last.
      - **At-least-once:** retry until acknowledged. None are lost (while the sender survives); some are duplicated. This is what queues, webhooks and most RPC retries provide.

      **Exactly-once delivery** across an unreliable network is not achievable, for the reason in the problem statement. What systems actually build is **effectively-once processing**: at-least-once delivery plus a receiver that makes repeats harmless. It does that by:

      - recording processed message IDs and skipping repeats (deduplication, with a retention window);
      - making the operation itself idempotent (\`SET status = 'paid'\` rather than \`balance = balance - 10\`);
      - conditioning the write on state (\`… WHERE status = 'processing'\`), so only the first application changes anything.

      The deduplication record and the effect must be committed **together**. If you record "processed" and then crash before applying the effect, the message is lost. If you apply the effect and crash before recording, it is repeated. See [[idempotency]] and [[transactions]].
    `,
    lesson: [

      {
        kind: "read",
        body: md`
          A sender transmits a message and waits for an acknowledgement. None comes. Either the message was lost, or it arrived and the acknowledgement was lost. **The sender can't tell which.** Every messaging system has to decide what to do about that.
        `,
      },
      {
        kind: "read",
        body: md`
          There are two honest choices:

          - **At-most-once:** never retry. Some messages are lost; none are duplicated. Fine for metric samples or cursor positions, where the next message replaces the last.
          - **At-least-once:** retry until acknowledged. None are lost; some are duplicated. This is what queues, webhooks and most RPC retries give you.
        `,
      },
      {
        kind: "choice",
        id: "typing",
        prompt: "Which guarantee suits 'Bob is typing…' indicators?",
        options: [
          {
            id: "at-most",
            label: "At-most-once: a lost update is replaced by the next one moments later.",
            correct: true,
            why: "Retrying a stale typing indicator is pointless. Losing one costs nothing.",
          },
          {
            id: "at-least",
            label: "At-least-once: every indicator must arrive.",
            why: "A retried indicator arrives late and wrong. Nothing depends on each one.",
          },
          {
            id: "exactly",
            label: "Exactly-once",
            why: "That's not achievable over an unreliable network, and unnecessary here.",
          },
        ],
      },
      {
        kind: "read",
        body: md`
          **Exactly-once delivery** isn't achievable over an unreliable network, for the reason above. What systems build instead is **effectively-once processing**: at-least-once delivery plus a receiver that makes repeats harmless, by:

          - recording processed message IDs and skipping repeats;
          - making the operation idempotent (\`SET status = 'paid'\`, not \`balance = balance - 10\`);
          - conditioning the write on state (\`… WHERE status = 'processing'\`).

          See [[idempotency]].
        `,
      },
      {
        kind: "predict",
        id: "record-order",
        prompt: "A receiver records 'message 812 processed', then crashes before applying the effect. The message is redelivered. What happens?",
        answer: md`
          The receiver sees 812 as processed and skips it, so the effect never happens: the message is lost. If it had applied the effect first and crashed before recording, the effect would repeat instead.

          The processed-ID record and the effect must commit **together**, in one [[transactions|transaction]].
        `,
      },
    ],
    assumptions: [
      "Receivers can identify a message (an ID or a natural key) across redeliveries.",
      "The dedupe record lives at least as long as the sender may keep retrying.",
    ],
    alternatives: [
      {
        name: "At-most-once (fire and forget)",
        when: "Loss is acceptable and newer data supersedes older, as with telemetry, presence and cursor positions.",
      },
      {
        name: "Transactional exactly-once within one system",
        when: "Consumer and producer state live in the same system (for example Kafka transactions for read-process-write between topics), and no external side effects occur.",
      },
    ],
    failureModes: [
      {
        name: "Dedupe window too short",
        description: "IDs are forgotten before the sender stops retrying, so a late retry is processed again.",
      },
      {
        name: "Dedupe not atomic with the effect",
        description: "A crash between recording the ID and applying the effect loses or duplicates the message.",
      },
      {
        name: "Assuming order",
        description: "Retries reorder messages: message 2 can be applied before a retried message 1.",
      },
    ],
    implementations: [
      { name: "Unique constraint on message ID", note: "Insert-or-ignore in the same transaction as the effect." },
      { name: "Idempotency keys on APIs", note: "The caller supplies the ID; the server stores the result under it." },
      { name: "Conditional state transitions", note: "The state machine itself rejects repeats." },
      { name: "Broker dedupe windows", note: "e.g. SQS FIFO deduplication: helpful, but bounded in time." },
    ],
    claims: [
      {
        id: "two-generals",
        statement: "If a sender gets no acknowledgement, it cannot know whether the receiver processed the message.",
        verdict: "holds",
        explanation:
          "The message or the acknowledgement could have been lost, and both look identical to the sender. Everything in this concept follows from that ambiguity.",
      },
      {
        id: "exactly-once-network",
        statement: "With enough retries and acknowledgements, a protocol can guarantee exactly-once delivery over an unreliable network.",
        verdict: "fails",
        explanation:
          "Retries turn loss into duplication; they cannot eliminate both. Exactly-once *effects* are built at the receiver through deduplication or idempotency.",
      },
      {
        id: "at-most-once-ok",
        statement: "At-most-once delivery is a reasonable choice for live cursor positions in a collaborative editor.",
        verdict: "holds",
        explanation:
          "A lost cursor update is superseded by the next one a few milliseconds later. Retrying old positions would only waste bandwidth and could show stale positions.",
      },
      {
        id: "dedupe-anywhere",
        statement: "It does not matter whether the processed-ID record is written before or after the side effect, as long as both happen.",
        verdict: "fails",
        explanation:
          "A crash between the two either loses the message (recorded, not applied) or repeats it (applied, not recorded). They must commit atomically, or the effect itself must be idempotent.",
      },
    ],
    explain: {
      prompt: "Explain why exactly-once delivery is impossible over an unreliable network, and how systems achieve exactly-once effects anyway.",
      rubric: [
        { id: "ambiguity", text: "A missing acknowledgement cannot be distinguished from a lost message." },
        { id: "tradeoff", text: "Retrying gives at-least-once (duplicates); not retrying gives at-most-once (loss)." },
        { id: "receiver", text: "Exactly-once effects come from receiver-side deduplication or idempotent operations." },
        { id: "atomic", text: "The dedupe record and the effect must commit atomically.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["idempotency", "message-queues", "webhooks", "retries-and-backoff", "transactions"],
  },
  {
    id: "server-push",
    title: "Server push: polling, long polling, SSE, WebSockets",
    domain: "communication",
    summary:
      "The ways a server can tell a client that something changed, and how update rate, latency needs and who-knows-what decide between them.",
    problem: md`
      HTTP is request-response: the client asks, the server answers. When state changes on the server (a job finished, a message arrived), the client does not know to ask. The question is how the change reaches the client, how quickly, and at what cost.
    `,
    mechanism: md`
      - **Polling.** The client asks every *n* seconds. Latency averages *n*/2; cost is one request per client per interval whether or not anything changed. Stateless, cacheable, survives every proxy and deploy.
      - **Long polling.** The client asks; the server holds the request open until something changes or a timeout passes, then the client asks again. Near-instant delivery with plain HTTP, but each waiting client holds a connection, and messages between polls need buffering.
      - **Server-Sent Events (SSE).** One long-lived HTTP response streams events from server to client. One-directional, auto-reconnects with a \`Last-Event-ID\` so the server can resume. Text only.
      - **WebSockets.** A long-lived, full-duplex connection after an HTTP upgrade. Low-overhead messages in both directions; you own reconnection, heartbeats and resumption. See [[persistent-connections]].

      The choice is rarely about the protocol. It is about three questions:

      1. **How often does state change, and how quickly must the client see it?** Four updates over twenty minutes favours polling; fifty keystrokes a second favours a persistent connection.
      2. **Does the client send a stream too?** Only then does full duplex matter.
      3. **Who knows about the change?** If a worker changes the database and the client is connected to an API server, that server must learn of the change via [[publish-subscribe|pub/sub]] or by polling the database itself. Push moves polling to the server; it does not remove the need to find out.
    `,
    lesson: [

      {
        kind: "read",
        body: md`
          HTTP is request-response: the client asks, the server answers. When something changes on the server (a job finished, a message arrived), the client doesn't know to ask. The question is how the change reaches the client, how quickly, and at what cost.
        `,
      },
      {
        kind: "read",
        body: md`
          | Method | How it works | Cost and character |
          | --- | --- | --- |
          | Polling | client asks every *n* seconds | average delay *n*/2; one request per client per interval; stateless and deploy-proof |
          | Long polling | server holds the request until something changes | near-instant, but each waiting client holds a connection |
          | Server-Sent Events | one long HTTP response streams events | one direction; reconnects with \`Last-Event-ID\` |
          | WebSockets | full-duplex connection after an upgrade | cheap messages both ways; you own reconnects and heartbeats |

          See [[persistent-connections]].
        `,
      },
      {
        kind: "estimate",
        id: "poll-delay",
        prompt: "A client polls every 8 seconds. On average, how many seconds after a change does it notice?",
        answer: 4,
        unit: "seconds",
        working: md`
          A change happens at a random moment within the interval, so on average halfway through it: 8 ÷ 2 = **4 seconds** (plus the request time).
        `,
      },
      {
        kind: "read",
        body: md`
          The choice is rarely about the protocol. Three questions decide it:

          1. How often does state change, and how quickly must the client see it?
          2. Does the client also stream data to the server? Only then does full duplex matter.
          3. **Who knows about the change?** If a worker updates the database and the client is connected to an API server, that server must find out via [[publish-subscribe|pub/sub]] or by polling the database itself.
        `,
      },
      {
        kind: "choice",
        id: "status-page",
        prompt: "A status page changes about 4 times over 20 minutes, and a few seconds' delay is fine. What fits best?",
        options: [
          {
            id: "poll",
            label: "Polling every few seconds",
            correct: true,
            why: "Updates are rare and latency-tolerant, so polling's simplicity wins: no connection state, nothing special at deploys.",
          },
          {
            id: "ws",
            label: "A WebSocket",
            why: "It works, but adds reconnection and deploy handling for no benefit at this update rate.",
          },
          {
            id: "long-poll",
            label: "Long polling",
            why: "Near-instant delivery isn't needed, and it holds a connection per client.",
          },
        ],
      },
    ],
    assumptions: [
      "Persistent connections require infrastructure (load balancers, proxies) that supports them and does not cut idle connections.",
      "Clients reconnect, so the server must be able to resume or resynchronize.",
    ],
    alternatives: [
      { name: "Email or mobile push notification", when: "The user is probably not looking at the page when the event happens." },
      { name: "Webhooks", when: "The client is another server that can receive HTTP requests." },
    ],
    failureModes: [
      {
        name: "Missed events on reconnect",
        description: "Events sent while the client was disconnected are lost unless the protocol can resume from a position.",
      },
      {
        name: "Polling storms",
        description: "Thousands of clients polling in sync, for example after a deploy, create load spikes. Jitter and backoff help.",
      },
      {
        name: "Fan-out gap",
        description: "The process that changed state is not the one holding the client's connection, and nothing bridges them.",
      },
    ],
    implementations: [
      { name: "setInterval + GET", note: "Polling; add jitter and stop when the tab is hidden." },
      { name: "EventSource (SSE)", note: "Built-in browser reconnect with Last-Event-ID." },
      { name: "WebSocket", note: "Bring your own heartbeats, reconnection and resume protocol." },
      { name: "Managed realtime services", note: "Hosted pub/sub with client SDKs; they own connections and fan-out." },
    ],
    claims: [
      {
        id: "websocket-modern",
        statement: "WebSockets are always better than polling because they are real-time.",
        verdict: "fails",
        explanation:
          "For infrequent updates, polling is cheaper to build and operate and its latency is acceptable. WebSockets add connection state, reconnection logic and a fan-out path. They earn that cost with frequent, latency-sensitive or bidirectional traffic.",
      },
      {
        id: "sse-one-way",
        statement: "SSE is a poor fit for a chat client because the client also needs to send messages.",
        verdict: "depends",
        explanation:
          "SSE for receiving plus ordinary POSTs for sending works well for many chat products, especially behind HTTP/2. It becomes awkward when the client sends a high-rate stream, as in collaborative editing, where per-message HTTP overhead and ordering across separate requests matter.",
      },
      {
        id: "push-removes-polling",
        statement: "Switching from client polling to server push removes polling from the system entirely.",
        verdict: "depends",
        explanation:
          "Only if the server holding the connection is notified of changes through pub/sub or an in-process event. If it has to check the database for changes, the polling has just moved to the server.",
      },
      {
        id: "polling-latency",
        statement: "Polling every 5 seconds gives an average notification delay of about 2.5 seconds.",
        verdict: "holds",
        explanation: "A change is equally likely to happen at any point in the interval, so on average it waits half an interval, plus the request time.",
      },
    ],
    explain: {
      prompt: "Explain how you would choose between polling and a persistent connection for a status page, naming the properties of the problem that decide it.",
      rubric: [
        { id: "rate", text: "Considers how often state changes and how much latency is acceptable." },
        { id: "direction", text: "Considers whether the client also streams data to the server." },
        { id: "who-knows", text: "Notes that push requires the connection-holding server to learn about changes from wherever they happen." },
        { id: "ops", text: "Mentions operational costs of persistent connections: reconnects, deploys, load balancing.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["persistent-connections", "publish-subscribe", "webhooks"],
  },
  {
    id: "persistent-connections",
    title: "Persistent connections",
    domain: "communication",
    summary:
      "Long-lived connections such as WebSockets turn a stateless request tier into one that holds per-client state, with consequences for routing, deploys and failure detection.",
    problem: md`
      A stateless HTTP server forgets each client after the response, so any server can handle any request and deploys are trivial. A long-lived connection breaks that: a specific server now holds a specific client for minutes or days, along with buffers, subscriptions and session state.
    `,
    mechanism: md`
      Once you hold connections, you inherit several responsibilities:

      - **Liveness.** TCP does not tell you promptly that the other side vanished (a laptop lid closing sends nothing). Applications send **heartbeats** (ping/pong every ~15-30 s) and consider a connection dead after a few missed ones.
      - **Routing.** Messages for a client must reach the server holding its connection. Either route related clients to the same server (sticky routing, or [[partitioning]] by room or document) or connect servers through [[publish-subscribe]].
      - **Resumption.** Connections drop constantly on mobile networks. The client reconnects, possibly to a different server, and must not miss anything. That needs a position: a sequence number or last event ID from which the server can replay.
      - **Deploys.** Draining does not end long-lived connections by itself. Servers must tell clients to reconnect, with jittered delays so the new fleet is not hit by every client at once.
      - **Flow control.** A slow client's outbound buffer grows on the server. Without a bound, one slow client can exhaust memory; see [[backpressure]].

      Connection count by itself is usually cheap: an idle WebSocket costs kilobytes of memory. The cost comes from message rate, per-connection buffers and the coordination above.
    `,
    lesson: [

      {
        kind: "read",
        body: md`
          A stateless HTTP server forgets each client after responding, so any server can handle any request and deploys are trivial. A long-lived connection (a WebSocket) changes that: a specific server now holds a specific client for minutes or days, with buffers, subscriptions and session state.
        `,
      },
      {
        kind: "read",
        body: md`
          Holding connections brings responsibilities:

          - **Liveness.** TCP doesn't tell you promptly that the other side vanished. A laptop lid closing sends nothing. Applications send **heartbeats** every 15–30 s and treat a few missed ones as dead.
          - **Routing.** Messages for a client must reach the server holding its connection: route related clients together ([[partitioning]] by room or document), or connect servers with [[publish-subscribe]].
          - **Resumption.** Connections drop constantly on mobile networks. The client reconnects, maybe elsewhere, and needs a **position** (a sequence number or last event ID) to resume from.
        `,
      },
      {
        kind: "choice",
        id: "power-loss",
        prompt: "A phone's battery dies mid-session. When does the server notice?",
        options: [
          {
            id: "heartbeat",
            label: "When a few heartbeats are missed, tens of seconds later",
            correct: true,
            why: "The phone sends nothing as it dies, so the TCP connection looks open until something tests it. Heartbeats are that test.",
          },
          {
            id: "immediately",
            label: "Immediately: the TCP connection closes.",
            why: "Closing needs a packet, and a dead phone sends none.",
          },
          {
            id: "never",
            label: "Never, until the server restarts",
            why: "TCP keepalives would eventually notice, but far too slowly; application heartbeats are the practical answer.",
          },
        ],
      },
      {
        kind: "read",
        body: md`
          Two more:

          - **Deploys.** Draining doesn't end long-lived connections. Servers must tell clients to reconnect, with **jittered** delays so the new fleet isn't hit by every client at once.
          - **Flow control.** A slow client's outbound buffer grows on the server. Without a bound, one slow client can exhaust memory; see [[backpressure]].

          Connection count alone is usually cheap: an idle WebSocket costs kilobytes. The cost is message rate, buffers, and the coordination above.
        `,
      },
      {
        kind: "estimate",
        id: "memory",
        prompt: "50,000 idle WebSockets at about 30 KB each. About how many megabytes of memory?",
        answer: 1500,
        unit: "MB",
        working: md`
          50,000 × 30 KB = 1,500,000 KB ≈ **1.5 GB**. One ordinary server can hold that; connections themselves are rarely the bottleneck.
        `,
      },
    ],
    assumptions: [
      "Load balancers and proxies support upgrade and long idle times, or heartbeats keep connections from being cut.",
      "Clients implement reconnection with backoff and resumption.",
    ],
    alternatives: [
      { name: "Polling or SSE", when: "Updates are infrequent or one-directional and statelessness is worth more than latency." },
      { name: "Managed realtime service", when: "You want the protocol benefits without operating connection-holding servers." },
    ],
    failureModes: [
      { name: "Ghost connections", description: "Without heartbeats, dead clients look connected and receive messages into a void." },
      { name: "Thundering herd on deploy", description: "Every client reconnects at the same instant and overloads the remaining servers." },
      { name: "Lost messages across reconnects", description: "No resume position means anything sent during the gap is gone." },
      { name: "Unbounded send buffers", description: "A slow reader causes the server to queue its messages until memory runs out." },
    ],
    implementations: [
      { name: "WebSocket server with heartbeat", note: "ws, uWebSockets, Go's gorilla/nhooyr libraries; you build resumption." },
      { name: "Socket.IO and similar", note: "Adds reconnection, rooms and fallbacks on top of WebSockets." },
      { name: "Managed realtime platforms", note: "Ably, Pusher, Firebase and others: hosted connections and fan-out." },
    ],
    claims: [
      {
        id: "tcp-detects",
        statement: "If a client's device loses power, the server's TCP connection closes promptly.",
        verdict: "fails",
        explanation:
          "Nothing is sent when a device disappears, so the server learns only when a write fails or a keepalive times out, which by default can take a very long time. Application-level heartbeats exist for this.",
      },
      {
        id: "connections-expensive",
        statement: "Each open WebSocket consumes a thread, so a server can hold at most a few thousand.",
        verdict: "depends",
        explanation:
          "That is true of thread-per-connection servers. Event-driven servers hold tens or hundreds of thousands of mostly idle connections on one machine, and message throughput and buffer memory become the limits instead.",
      },
      {
        id: "sticky-enough",
        statement: "Sticky load balancing is enough to make a multi-server WebSocket system work.",
        verdict: "fails",
        explanation:
          "Stickiness keeps one client on one server, but users who need to see each other's messages may be on different servers. You still need pub/sub between servers or routing of whole rooms or documents to one server.",
      },
    ],
    explain: {
      prompt: "What changes about running a server fleet once clients hold long-lived connections instead of making stateless requests?",
      rubric: [
        { id: "liveness", text: "Liveness must be detected with heartbeats; TCP alone does not tell you promptly." },
        { id: "routing", text: "Messages must be routed to whichever server holds the recipient's connection." },
        { id: "resume", text: "Reconnects need a resume position so nothing sent during the gap is lost." },
        { id: "deploys", text: "Deploys must actively move clients, with jitter to avoid a reconnect storm.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["server-push", "publish-subscribe", "backpressure", "partitioning", "soft-state"],
  },
  {
    id: "webhooks",
    title: "Webhooks",
    domain: "communication",
    summary:
      "HTTP callbacks from another system: delivered at least once, possibly out of order, possibly never. Handle them as hints, not truth.",
    problem: md`
      Another system, such as a payment provider or a transcoder, does work on your behalf and finishes later. You need to learn the outcome without polling them constantly.
    `,
    mechanism: md`
      You register a URL. When something happens, the provider sends an HTTP request describing the event; your endpoint responds \`2xx\` to acknowledge. If it does not, the provider retries with backoff, usually for hours or days, and then gives up.

      From that contract follow the rules for handling them:

      - **Verify the sender.** Anyone can POST to your URL. Check the signature (an HMAC of the body with a shared secret) and a timestamp to reject replays.
      - **Deduplicate.** Retries mean the same event can arrive more than once, even after you responded 200, if your response was lost. Record the event ID in the same transaction as its effect; see [[delivery-guarantees]].
      - **Do not trust order.** Event 2 can arrive before event 1. Apply transitions that only move forward ([[state-machines]]), or treat the webhook as a nudge and fetch the object's current state from the provider's API.
      - **Acknowledge fast.** Persist the event and return; do slow side effects (emails, provisioning) asynchronously. Slow handlers cause timeouts, which cause retries, which cause duplicates.
      - **Do not rely on delivery.** Endpoints break, secrets rotate and providers exhaust retries. A [[reconciliation]] job that periodically asks the provider about anything still unresolved turns "probably" into "eventually certainly".
    `,
    lesson: [

      {
        kind: "read",
        body: md`
          Another system (a payment provider, a transcoder) does work for you and finishes later. A **webhook** lets it tell you: you register a URL, and when something happens it sends an HTTP request describing the event. Your endpoint replies \`2xx\` to acknowledge; otherwise the provider retries with backoff, usually for hours or days, then gives up.
        `,
      },
      {
        kind: "read",
        body: md`
          From that contract follow the rules:

          - **Verify the sender.** Anyone can POST to your URL. Check the signature (an HMAC of the body with a shared secret) and a timestamp to reject replays.
          - **Deduplicate.** The same event can arrive again, even after you replied 200, if your response was lost. Record the event ID with its effect; see [[delivery-guarantees]].
          - **Don't trust order.** Event 2 can arrive before event 1. Apply only forward transitions ([[state-machines]]), or fetch the object's current state from the provider.
        `,
      },
      {
        kind: "choice",
        id: "after-200",
        prompt: "Your endpoint processes an event and returns 200, but the response is lost on the way back. What does the provider do?",
        options: [
          {
            id: "retry",
            label: "Retries, so you receive the same event again",
            correct: true,
            why: "From the provider's side, no acknowledgement arrived. Handlers must deduplicate by event ID.",
          },
          {
            id: "nothing",
            label: "Nothing; you returned 200",
            why: "The provider never saw the 200.",
          },
          {
            id: "error",
            label: "Marks the event as failed permanently",
            why: "It retries with backoff first, often for days.",
          },
        ],
      },
      {
        kind: "read",
        body: md`
          And two more:

          - **Acknowledge fast.** Persist the event and return; do slow side effects asynchronously. Slow handlers cause timeouts, timeouts cause retries, retries cause duplicates.
          - **Don't rely on delivery.** Endpoints break, secrets rotate and providers exhaust their retries. A [[reconciliation]] job that asks the provider about anything unresolved turns "probably" into "eventually certainly".
        `,
      },
      {
        kind: "predict",
        id: "rotation",
        prompt: "A secret rotation breaks signature verification for four days. The provider retries for three. What's lost, and what recovers it?",
        answer: md`
          Every event from the first day of the outage: the provider stopped retrying them. Only a reconciler that queries the provider for unresolved records recovers them. Alerting on the age of unresolved records would have caught the break on day one.
        `,
      },
    ],
    assumptions: [
      "The provider signs payloads and includes a stable event ID.",
      "The provider offers an API to fetch the current state of an object, which reconciliation needs.",
    ],
    alternatives: [
      { name: "Polling the provider's API", when: "Volume is low, or the provider's webhooks are unreliable or unavailable." },
      { name: "Provider-hosted event streams or queues", when: "The provider offers a pull-based event feed with cursors, which makes replay simpler." },
    ],
    failureModes: [
      { name: "Unverified endpoint", description: "An attacker POSTs a fake 'payment succeeded' event." },
      { name: "Duplicate side effects", description: "A redelivered event provisions or emails twice." },
      { name: "Regression by reordering", description: "A late 'processing' event overwrites a 'succeeded' state." },
      { name: "Silent gap", description: "Webhooks stop arriving due to a bug or expired secret; nothing notices for days." },
    ],
    implementations: [
      { name: "Inbox table", note: "Store event ID and payload with a unique constraint, then process asynchronously." },
      { name: "Thin events + fetch", note: "Use the event only as a trigger, then read the authoritative state from the API." },
      { name: "Reconciliation sweep", note: "Periodically query the provider for unresolved objects." },
    ],
    claims: [
      {
        id: "200-once",
        statement: "Once your endpoint returns 200 for an event, you will not receive that event again.",
        verdict: "fails",
        explanation:
          "If your 200 is lost or arrives after the provider's timeout, the provider retries. Many providers also document that duplicates can occur regardless. Deduplicate by event ID.",
      },
      {
        id: "order",
        statement: "Webhook events for the same object can arrive in a different order from the one they occurred in.",
        verdict: "holds",
        explanation:
          "Each delivery is an independent HTTP request with its own retries. A failed first attempt of event 1 can be retried after event 2 has succeeded.",
      },
      {
        id: "enough",
        statement: "With retries for three days, webhooks alone are a complete record of outcomes.",
        verdict: "fails",
        explanation:
          "Retries end, endpoints can be misconfigured for longer than that, and \"not yet received\" is indistinguishable from \"never sent\". Reconciliation against the provider's API closes the gap.",
      },
    ],
    explain: {
      prompt: "List the properties of webhook delivery and explain how each one shapes the handler you write.",
      rubric: [
        { id: "auth", text: "Requests must be authenticated via signature verification." },
        { id: "dupes", text: "At-least-once delivery requires deduplication or idempotent handling." },
        { id: "order", text: "Unordered delivery requires forward-only transitions or fetching current state." },
        { id: "gaps", text: "Possible non-delivery requires reconciliation against the provider." },
        { id: "fast-ack", text: "Handlers should acknowledge quickly and move side effects out of the request.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["delivery-guarantees", "reconciliation", "idempotency", "state-machines"],
  },
  {
    id: "publish-subscribe",
    title: "Publish/subscribe",
    domain: "communication",
    summary:
      "Decoupling senders from receivers by topic: a publisher sends once and every current subscriber receives a copy.",
    problem: md`
      Several processes need to react to the same event, such as every server holding a connection for a chat room or every service that cares that an order was paid. Making the producer call each one couples it to all of them and to their availability.
    `,
    mechanism: md`
      Publishers send messages to a **topic** (or channel); subscribers register interest in topics; the broker delivers a copy to each subscriber. The publisher does not know who, or how many, receive it.

      The crucial distinction is **what happens to subscribers who are not listening:**

      - **Ephemeral pub/sub** (Redis PUBLISH/SUBSCRIBE, most in-memory buses): if you are disconnected when a message is published, you never get it. It is ideal for fan-out of live data where a missed message is recovered some other way (a reload, a resync from a log), and wrong as the only path for anything that must not be lost.
      - **Durable pub/sub** (Kafka consumer groups, SNS → SQS fan-out, Google Pub/Sub subscriptions): each subscription has its own retained backlog, so a subscriber that was down catches up. You pay with storage and with tracking per-subscriber position.

      Pub/sub fans out *messages*; it does not order them across publishers, and it does not make the subscribers' handling idempotent. Those remain the receivers' problems.
    `,
    lesson: [

      {
        kind: "read",
        body: md`
          Several processes need to react to the same event: every server holding a connection for a chat room, every service that cares that an order was paid. If the producer calls each one, it's coupled to all of them and to their availability.

          **Publish/subscribe** decouples them: publishers send to a **topic**, subscribers register interest, and the broker delivers a copy to each. The publisher doesn't know who receives it.
        `,
      },
      {
        kind: "choice",
        id: "new-consumer",
        prompt: "A new analytics service wants to know when orders are paid. With pub/sub, what changes in the order service?",
        options: [
          {
            id: "nothing",
            label: "Nothing: the analytics service subscribes to the existing topic.",
            correct: true,
            why: "That decoupling is the point: consumers come and go without the publisher knowing.",
          },
          {
            id: "call",
            label: "It must add a call to the analytics service.",
            why: "That's direct coupling, which pub/sub removes.",
          },
          {
            id: "topic",
            label: "It must publish to a new topic for analytics.",
            why: "One topic can have any number of subscribers.",
          },
        ],
      },
      {
        kind: "read",
        body: md`
          The crucial difference between systems is **what happens to subscribers who aren't listening**:

          - **Ephemeral** pub/sub (Redis PUBLISH/SUBSCRIBE, most in-memory buses): if you're disconnected when a message is published, you never get it. Good for live fan-out where a miss is recovered another way (a reload, a resync from a log).
          - **Durable** pub/sub (Kafka consumer groups, SNS → SQS, Google Pub/Sub): each subscription keeps its own backlog, so a subscriber that was down catches up. You pay in storage and per-subscriber position tracking.
        `,
      },
      {
        kind: "predict",
        id: "ephemeral-use",
        prompt: "Collaborative-editor servers use ephemeral pub/sub to forward each document's operations. A server misses a message during a 2-second network blip. How does it recover?",
        answer: md`
          Not from pub/sub, which won't replay it. It notices a gap in sequence numbers and catches up from the durable operation log. Ephemeral pub/sub is safe here precisely because something else holds the truth.
        `,
      },
      {
        kind: "read",
        body: md`
          Pub/sub fans out messages. It doesn't order them across publishers, and it doesn't make subscribers' handling idempotent. Those remain the receivers' problems.
        `,
      },
    ],
    assumptions: [
      "Subscribers either tolerate missing messages (ephemeral) or the broker retains them per subscriber (durable).",
      "The set of topics and their fan-out is bounded enough for the broker to handle.",
    ],
    alternatives: [
      { name: "Direct calls", when: "There is exactly one consumer and you need its answer." },
      { name: "Routing all participants to one process", when: "Fan-out is within a small group, such as one document's editors, and one owner can deliver locally." },
      { name: "Work queue", when: "Each message should be handled by exactly one of several workers, not by all of them." },
    ],
    failureModes: [
      { name: "Missed while disconnected", description: "With ephemeral pub/sub, a subscriber that reconnects has a gap it does not know about." },
      { name: "Slow subscriber", description: "One subscriber falls behind; depending on the broker it is dropped, buffered without limit, or slows the publisher." },
      { name: "Hot topic", description: "A single topic with enormous fan-out concentrates load on one broker node." },
    ],
    implementations: [
      { name: "Redis Pub/Sub", note: "Fire-and-forget fan-out between servers; no retention." },
      { name: "Postgres LISTEN/NOTIFY", note: "Lightweight notifications tied to transactions; no retention, small payloads." },
      { name: "SNS → SQS, Google Pub/Sub", note: "Durable per-subscriber delivery." },
      { name: "Kafka topics with consumer groups", note: "Retained log; each group tracks its own offset." },
    ],
    claims: [
      {
        id: "redis-durable",
        statement: "A server that reconnects to Redis Pub/Sub after a 2-second blip receives the messages it missed.",
        verdict: "fails",
        explanation:
          "Redis Pub/Sub has no retention. Anything published during the blip is gone for that subscriber. If that matters, recover from a log or use Redis Streams or another durable mechanism.",
      },
      {
        id: "decouples",
        statement: "Pub/sub lets you add a new consumer of an event without changing the publisher.",
        verdict: "holds",
        explanation: "The publisher addresses a topic, not a recipient. This is the main architectural benefit.",
      },
      {
        id: "ordered",
        statement: "Subscribers to a topic see messages from different publishers in the same order.",
        verdict: "depends",
        explanation:
          "Some brokers give a single total order per topic or partition. Many give no cross-publisher ordering guarantees at all. If order matters, sequence messages at a single point; see [[ordering]].",
      },
    ],
    explain: {
      prompt: "Explain the difference between ephemeral and durable pub/sub, and give a use for each.",
      rubric: [
        { id: "ephemeral", text: "Ephemeral delivers only to currently connected subscribers; messages are lost for anyone offline." },
        { id: "durable", text: "Durable keeps a backlog per subscription so offline subscribers catch up." },
        { id: "uses", text: "Gives a fitting use for each, e.g. live fan-out vs. events that must not be lost." },
      ],
    },
    relatedConceptIds: ["message-queues", "persistent-connections", "server-push", "ordering"],
  },
];
