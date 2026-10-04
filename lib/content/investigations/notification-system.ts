import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const notificationSystem = {
  id: "notification-system",
  title: "Notifications without spam or silence",
  premise:
    "Product events become emails, push notifications and inbox items for millions of users. Respect every preference immediately, never notify twice, survive provider outages, and get the security alert out while a five-million-email announcement is in flight.",
  difficulty: "intermediate",
  estimatedMinutes: 50,
  scenario: md`
    You own notifications for a project-management product with five million users. People are notified when they are mentioned, assigned an issue, or someone comments on something they follow. Security events (a new login, a password change) must reach them quickly. Marketing occasionally announces features to everyone.

    Notifications go out by email (through a provider with a 500 sends/second account limit), mobile push (APNs and FCM) and an in-app inbox. Users choose, per notification type and channel, what they want, and set quiet hours.

    Today, each product service sends its own emails inline. Last week an email-provider outage made commenting fail for twenty minutes, and users regularly complain about duplicate notifications.
  `,
  objectives: [
    "Decouple notification delivery from the product action that causes it.",
    "Apply preferences at the right moment so changes take effect immediately.",
    "Make duplicates structurally impossible where you can, and rare where you cannot.",
    "Isolate urgent traffic from bulk traffic under a shared provider limit.",
    "Degrade gracefully when providers slow down, fail, or reject you.",
  ],
  prerequisites: ["asynchronous-processing", "idempotency", "message-queues"],
  requirements: {
    functional: [
      "Mentions, assignments and comments notify the affected users on their preferred channels.",
      "Security notifications are always sent by email, immediately, regardless of preferences.",
      "Users set per-type, per-channel preferences and quiet hours.",
      "An in-app inbox lists every notification with read state.",
      "Marketing can announce to all users.",
    ],
    nonFunctional: [
      "A user is not sent the same notification twice on the same channel.",
      "Security emails go out within 30 seconds, even during a full-audience announcement.",
      "Provider outages delay notifications but never lose them.",
      "Unsubscribes and preference changes take effect immediately.",
      "Notification failures never slow down or fail the product action that triggered them.",
    ],
  },
  constraints: [
    "About 2 million product events a day fan out to ~8 million notifications, with work-hour peaks around 10x the average rate.",
    "Email provider: 500 sends/second account-wide, no idempotency keys, responses take 50 ms to several seconds.",
    "Push providers accept high throughput but report invalid device tokens per send.",
    "A managed queue, Postgres and Redis are available; product services already write events through a transactional outbox.",
  ],
  assumptions: [
    "Each product event has a unique, stable id.",
    "Users may have several devices, each with its own push token.",
    "Legal unsubscribe handling for marketing email is required in addition to in-app preferences.",
  ],
  competencies: [
    { id: "decoupling", label: "Decoupling from the product", description: "Keeping notification failures out of the user's action." },
    { id: "policy", label: "Preferences and policy", description: "Deciding who gets what, and when that decision is made." },
    { id: "dedupe", label: "Deduplication", description: "Identity for each notification, and honesty about what cannot be deduplicated." },
    { id: "isolation", label: "Priority and isolation", description: "Urgent traffic that bulk traffic cannot starve." },
    { id: "provider-failure", label: "Provider failure", description: "Outages, rate limits and permanent rejections." },
  ],
  system: {
    components: [
      { id: "product", label: "Product services", kind: "service", responsibility: "Write domain events to their outbox in the same transaction as the action.", position: { col: 0, row: 1 } },
      { id: "events", label: "Event stream", kind: "stream", responsibility: "Relays outbox events to consumers, at least once.", position: { col: 1, row: 1 } },
      {
        id: "planner",
        label: "Notification planner",
        kind: "worker",
        responsibility: "Turns an event into notifications: resolves recipients, applies preferences and quiet hours, inserts one row per user and channel under a dedupe key.",
        position: { col: 2, row: 1 },
      },
      {
        id: "store",
        label: "Notifications DB",
        kind: "database",
        responsibility: "Notifications, deliveries and preferences. The source of truth for what was sent and what the inbox shows.",
        durableState: "notifications (dedupe_key unique), deliveries (channel, status, attempts), preferences, device tokens",
        position: { col: 2, row: 0 },
      },
      {
        id: "queues",
        label: "Delivery queues",
        kind: "queue",
        responsibility: "Separate queues per priority class (critical, transactional, bulk) and channel.",
        position: { col: 3, row: 1 },
      },
      {
        id: "senders",
        label: "Channel senders",
        kind: "worker",
        responsibility: "Claim a delivery, re-check preferences, take a token from the class's provider quota, send, and record the outcome.",
        position: { col: 4, row: 1 },
      },
      { id: "email", label: "Email provider", kind: "external", responsibility: "Delivers email; 500/s account limit.", position: { col: 5, row: 0 } },
      { id: "push", label: "Push services", kind: "external", responsibility: "APNs and FCM; report invalid tokens.", position: { col: 5, row: 2 } },
      { id: "inbox", label: "Inbox API", kind: "service", responsibility: "Serves the in-app inbox and read state from the notifications DB.", position: { col: 3, row: 0 } },
      { id: "apps", label: "Web and mobile apps", kind: "client", responsibility: "Show the inbox and receive push.", position: { col: 4, row: 0 } },
    ],
    flows: [
      { id: "publish", from: "product", to: "events", label: "Domain events via outbox", kind: "async" },
      { id: "consume", from: "events", to: "planner", label: "Events, at least once", kind: "async" },
      { id: "plan", from: "planner", to: "store", label: "Insert notifications under dedupe keys", kind: "request" },
      { id: "enqueue", from: "planner", to: "queues", label: "Deliveries by priority class", kind: "async" },
      { id: "claim", from: "senders", to: "queues", label: "Claim deliveries", kind: "request" },
      { id: "send-email", from: "senders", to: "email", label: "Send within quota", kind: "request" },
      { id: "send-push", from: "senders", to: "push", label: "Send to each device", kind: "request" },
      { id: "read-inbox", from: "apps", to: "inbox", label: "Inbox and read state", kind: "request" },
      { id: "inbox-data", from: "inbox", to: "store", label: "Read notifications", kind: "request" },
    ],
    invariants: [
      {
        id: "one-notification",
        statement: "At most one notification exists per (user, event, channel).",
        enforcedBy: ["store", "planner"],
        mechanism: "A unique dedupe key built from those three parts; redelivered events hit the constraint and create nothing.",
      },
      {
        id: "preferences-at-send",
        statement: "Nothing is sent that the user's current preferences forbid.",
        enforcedBy: ["senders", "planner"],
        mechanism: "Preferences are applied when planning and re-checked immediately before each provider call.",
      },
      {
        id: "critical-isolated",
        statement: "Bulk traffic cannot delay critical notifications.",
        enforcedBy: ["queues", "senders"],
        mechanism: "Separate queues and a reserved slice of the provider quota per priority class.",
      },
      {
        id: "never-lost",
        statement: "A planned delivery eventually succeeds, fails permanently with a reason, or is cancelled by preference.",
        enforcedBy: ["store", "senders"],
        mechanism: "Delivery rows with a state machine; retries with backoff for transient errors; permanent errors terminate.",
      },
    ],
  },
  stages: [
    {
      id: "notification-numbers",
      title: "What the numbers say",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["backpressure", "rate-limiting", "delivery-guarantees"],
      competencyIds: ["isolation", "provider-failure"],
      context: md`
        Start with arithmetic and the provider's contract. Eight million notifications a day, a 500/s email limit, a five-million-user announcement, and a 30-second promise for security alerts.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "blast-duration",
            statement: "Sending a marketing email to all 5 million users takes nearly three hours at the provider's limit.",
            verdict: "holds",
            explanation: "5,000,000 / 500 per second = 10,000 seconds, about 2.8 hours. For that long, the account's entire send capacity is in use.",
          },
          {
            id: "security-during-blast",
            statement: "If security alerts share a FIFO queue with the announcement, they can wait hours.",
            verdict: "holds",
            explanation:
              "A security alert enqueued just after the announcement waits behind millions of messages draining at 500/s. The 30-second promise requires isolation from bulk traffic, both in queueing and in quota.",
          },
          {
            id: "inline-fine",
            statement: "Sending notifications inside the request that created the comment is fine, since each comment notifies only a few people.",
            verdict: "fails",
            explanation:
              "The count is small but the dependency is the problem: provider latency becomes comment latency, and provider outages become comment failures, which is last week's incident. The product action must succeed without the notification having been sent.",
          },
          {
            id: "exactly-once-email",
            statement: "With careful engineering, every email can be guaranteed to be delivered exactly once.",
            verdict: "fails",
            explanation:
              "The provider accepts no idempotency key. If a send times out, you cannot know whether it went out; retrying risks a duplicate and not retrying risks silence. You can make duplicates rare, but not impossible. See [[delivery-guarantees]].",
          },
          {
            id: "average-rate",
            statement: "Eight million notifications a day is about 93 a second, so peak capacity is not a concern.",
            verdict: "fails",
            explanation:
              "Averages hide peaks. Work hours run around 10x the average, roughly 900 a second, which already exceeds the email limit if most notifications are email. Size for peaks, and decide what waits.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          The provider's limit makes email capacity a **shared, scarce resource**, and the announcement can consume all of it for hours. Most of the design is about who gets that capacity and when.

          The missing idempotency key is the other defining fact: for email, "exactly once" is off the table, so the goal becomes *at most once per notification, with the residual duplicate window as small as possible*.
        `,
      },
    },
    {
      id: "decouple-from-the-action",
      title: "Decouple from the product action",
      phase: "decide",
      dimensions: ["defend"],
      conceptIds: ["asynchronous-processing", "transactional-outbox"],
      competencyIds: ["decoupling"],
      context: md`
        Someone comments on an issue. Three followers should be notified. The comment must save quickly and reliably whatever the email provider is doing.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should a comment lead to notifications?",
        options: [
          {
            id: "inline",
            label: "The comment endpoint sends the notifications before responding",
            assessment: "flawed",
            feedback: "This couples the comment's latency and availability to every provider, which was last week's incident.",
          },
          {
            id: "in-process-async",
            label: "After saving the comment, start a background task in the same process to send notifications",
            assessment: "flawed",
            feedback: "The comment is fast now, but the background task dies with the process. A deploy right after the commit silently drops notifications, with no record that any were owed.",
          },
          {
            id: "event-planner",
            label: "Save the comment and a comment-created event in one transaction; a notification planner consumes events asynchronously",
            assessment: "sound",
            feedback:
              "The comment succeeds whenever the database does. The event is durable from the same commit, so notifications are owed even if every process dies a millisecond later. Product services know nothing about channels, preferences or providers; the notification system owns all of that.",
          },
          {
            id: "sync-service-call",
            label: "Call a notification service's API synchronously, which queues the work internally",
            assessment: "defensible",
            feedback:
              "Better than sending inline, because the service queues the work. But the comment still fails when the notification service is down, and a crash between saving the comment and calling the service loses the notification. It is a dual write, which the outbox exists to remove.",
          },
        ],
        rationale: {
          prompt: "What does your choice guarantee about the comment, and about the notification?",
          rubric: [
            { id: "isolation", text: "The product action's success and latency must not depend on notification delivery." },
            { id: "durable-intent", text: "The intent to notify must be recorded durably and atomically with the action (outbox/event)." },
            { id: "ownership", text: "Channel, preference and provider logic belong to the notification system, not each product service.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          This is the [[transactional-outbox]] used as an **architectural boundary**. Product services emit facts ("comment 991 was created"); the notification system decides what those facts mean for whom. Adding a channel, changing a template or switching providers then touches one system, not twenty.

          The event stream delivers at least once, so the planner must tolerate seeing the same event twice. That is the next problem.
        `,
      },
    },
    {
      id: "one-notification-per-event",
      title: "One notification per event, per channel",
      phase: "decide",
      dimensions: ["defend", "break"],
      conceptIds: ["idempotency", "delivery-guarantees", "concurrency-control"],
      competencyIds: ["dedupe"],
      context: md`
        The event stream redelivers events after consumer restarts. Two planner instances can process the same event concurrently. Each must produce the same notifications, once.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should the planner avoid creating duplicate notifications?",
        options: [
          {
            id: "dedupe-key",
            label: "Insert each notification with a unique key of (user, event id, channel); conflicts are ignored",
            assessment: "sound",
            feedback:
              "The identity of a notification is derived from what caused it, so any number of replays converge on the same rows. The database's unique constraint does the deduplication atomically, even with concurrent planners.",
          },
          {
            id: "redis-ttl",
            label: "Record processed event ids in Redis with a 24-hour TTL and skip events already seen",
            assessment: "defensible",
            feedback:
              "It catches most replays, but the check and the insert are separate steps (two planners can both pass the check), the record can be lost on a Redis failover, and replays after 24 hours slip through. Useful as an optimization, not as the guarantee.",
          },
          {
            id: "exactly-once-stream",
            label: "Configure the event stream for exactly-once delivery",
            assessment: "flawed",
            feedback: "Exactly-once features cover the stream's own bookkeeping, not your database writes. A planner that inserts notifications and crashes before committing its offset will see the event again.",
          },
          {
            id: "content-hash",
            label: "Skip a notification if one with identical text was sent to the user in the last 5 minutes",
            assessment: "defensible",
            feedback:
              "It suppresses some duplicates, but two genuinely different events can render identical text (two people commenting \"+1\"), and a replay six minutes later gets through. Similarity is a spam-control tool, not an identity.",
          },
        ],
        rationale: {
          prompt: "What makes a notification's identity, and where is uniqueness enforced?",
          rubric: [
            { id: "derived-identity", text: "The notification's identity is derived from its cause (event id), recipient and channel, so replays produce the same identity." },
            { id: "atomic", text: "Uniqueness is enforced atomically (unique constraint), not by a separate check." },
            { id: "why-not-stream", text: "The stream's delivery guarantee cannot cover side effects in your database.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          A **derived key** is the most robust form of [[idempotency]]: nobody has to remember an id, because the id *is* the cause. \`INSERT … ON CONFLICT (dedupe_key) DO NOTHING\` makes replays free.

          This deduplicates **notifications**. It does not yet deduplicate **sends**, because a sender can still crash between calling the provider and recording the result. That gap is where duplicates actually come from, and stage 6 deals with it.
        `,
      },
      reveals: { components: ["store"], flows: ["plan"] },
    },
    {
      id: "when-to-apply-preferences",
      title: "When are preferences applied?",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["caching", "state-machines"],
      competencyIds: ["policy"],
      context: md`
        A user turns off comment emails. Notifications already planned for them are sitting in a queue behind an announcement and may not be sent for an hour. The requirement says preference changes take effect immediately.
      `,
      interaction: {
        kind: "decision",
        prompt: "Where should preferences be enforced?",
        options: [
          {
            id: "plan-only",
            label: "Only when planning: deliveries are created for channels the user allowed at that moment",
            assessment: "defensible",
            feedback:
              "It avoids planning unwanted work, which matters at fan-out scale. But anything already queued when the user changes their mind is sent anyway, possibly an hour later, which breaks 'immediately'.",
          },
          {
            id: "plan-and-send",
            label: "Filter when planning, and re-check the current preference just before each provider call",
            assessment: "sound",
            feedback:
              "Planning-time filtering keeps unwanted work out of the queues; the send-time check makes changes effective immediately for anything still queued. Deliveries cancelled at send time get a terminal `suppressed` state, so the history still explains what happened.",
          },
          {
            id: "cached-hour",
            label: "Senders cache preferences for an hour to avoid database load",
            assessment: "flawed",
            feedback:
              "An unsubscribe can be ignored for up to an hour, possibly a legal problem for marketing email. If preference reads are expensive, cache with explicit invalidation on change, or keep the TTL in seconds.",
          },
          {
            id: "provider-suppression",
            label: "Rely on the email provider's suppression list for unsubscribes",
            assessment: "defensible",
            feedback:
              "You need the provider's suppression list for legal unsubscribe links and bounces anyway. But it knows nothing about per-type preferences, quiet hours or push, so it is a backstop, not the policy engine.",
          },
        ],
        rationale: {
          prompt: "Why enforce preferences where you chose to?",
          rubric: [
            { id: "time-gap", text: "Recognizes the gap between planning and sending, during which preferences can change." },
            { id: "send-time-check", text: "A check at send time is required for changes to take effect immediately." },
            { id: "record", text: "Suppressed deliveries are recorded as such, not silently dropped.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Any decision made at one time and acted on later can be stale by the time it is acted on. The fix is to **re-validate at the point of action**, the same move as checking a lease token at completion.

          Security notifications bypass this check by type, which is a policy rule written down in one place, not an exception buried in a sender.
        `,
      },
    },
    {
      id: "trace-a-mention",
      title: "Trace a mention to a phone",
      phase: "model",
      dimensions: ["trace"],
      conceptIds: ["transactional-outbox", "idempotency", "message-queues"],
      competencyIds: ["decoupling", "dedupe"],
      context: md`
        Alice mentions Bob in a comment. Put the steps from her click to the push notification on Bob's phone in order.
      `,
      interaction: {
        kind: "ordering",
        prompt: "Order the life of a mention notification.",
        items: [
          { id: "commit", label: "Comment and mention event commit in one transaction; Alice's request returns" },
          { id: "relay", label: "Outbox relay publishes the event to the stream" },
          { id: "plan", label: "Planner resolves Bob, applies his preferences and quiet hours" },
          { id: "insert", label: "Planner inserts the push and inbox notifications under dedupe keys" },
          { id: "enqueue", label: "Planner enqueues the push delivery on the transactional queue" },
          { id: "claim", label: "A push sender claims the delivery and marks it sending" },
          { id: "recheck", label: "Sender re-checks Bob's current preferences" },
          { id: "send", label: "Sender calls APNs for each of Bob's devices" },
          { id: "record", label: "Sender records the outcome and removes any token APNs reports invalid" },
        ],
        explanation: md`
          - Alice's request ends at the **first** step. Everything after it can fail and retry without her knowing.
          - Notifications exist (and appear in Bob's inbox) **before** any delivery is attempted. The inbox does not depend on push succeeding.
          - The preference check happens twice: once to avoid planning unwanted work, and once at the last moment before the irreversible step.
          - Invalid tokens are cleaned up as a side effect of sending, which keeps the device list honest without a separate process.
        `,
      },
      reveal: {
        reasoning: md`
          Notice the pattern repeated at every hop: **record durably, then act, then record the outcome**. The comment records the event; the planner records notifications; the sender records the delivery state. Each record lets the next step be retried safely, and lets the inbox and support tools answer "what happened to this notification?"
        `,
      },
      reveals: {
        components: ["queues", "senders", "email", "push", "inbox", "apps"],
        flows: ["enqueue", "claim", "send-email", "send-push", "read-inbox", "inbox-data"],
      },
    },
    {
      id: "duplicate-emails",
      title: "Why users got two emails",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["delivery-guarantees", "timeouts", "leases-and-fencing"],
      competencyIds: ["dedupe", "provider-failure"],
      event: {
        kind: "failure",
        title: "\"I got this email twice\"",
        detail: "Notifications are deduplicated at planning time, yet duplicate emails keep happening. Here is one, reconstructed from sender logs.",
      },
      context: md`
        The notification row is unique. The duplicate happened later, in sending. Find the design decisions that produced it.
      `,
      interaction: {
        kind: "diagnosis",
        prompt: "Select the lines where the design is at fault.",
        artifact: {
          type: "log",
          caption: "delivery d-5521 (email, user 88)",
          lines: [
            { text: "09:00:00.000  sender-2 receives d-5521 from queue (visibility timeout 5 s)" },
            {
              text: "09:00:00.010  sender-2 calls email provider (client timeout 30 s)",
              fault:
                "The visibility timeout (5 s) is shorter than the provider call can take (30 s). The message becomes visible again while the first send is still in flight. Extend the visibility timeout while working, or make it longer than the call's own timeout.",
            },
            { text: "09:00:05.000  d-5521 visible again (no ack yet)" },
            {
              text: "09:00:05.040  sender-7 receives d-5521 and calls email provider",
              fault:
                "The second sender does not check the delivery's state. A 'sending' state recorded before the call (with an attempt token) would show another attempt is in progress.",
            },
            { text: "09:00:06.900  provider accepts sender-2's request: msg-a" },
            { text: "09:00:07.300  provider accepts sender-7's request: msg-b" },
            {
              text: "09:00:07.310  sender-2 marks d-5521 sent; sender-7 marks d-5521 sent",
              fault:
                "Both completions succeed because the update is unconditional. Conditioning it on the attempt token would at least detect, and record, the duplicate.",
            },
          ],
        },
        rationale: {
          prompt: "Explain how the duplicate happened, and what you can and cannot guarantee for email.",
          rubric: [
            { id: "lease-shorter", text: "The queue lease expired while the send was still in flight, so a second sender received the same delivery." },
            { id: "state-before-send", text: "Recording a 'sending' state with an attempt token before calling the provider lets other senders see and skip in-flight work." },
            { id: "residual", text: "Without provider idempotency, a send whose outcome is unknown can still produce a duplicate on retry: the goal is to make that rare, not impossible." },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Two separate ideas apply. **Leases** must outlive the work they protect, or be extended by heartbeats; this is the video pipeline's lesson again. **State before side effect**: mark the delivery \`sending\` with an attempt token, and treat an existing \`sending\` that is recent as "someone else has it".

          What remains is honest uncertainty. If a send times out, the email may or may not have gone out. You choose: retry (risking a duplicate) or not (risking silence). For a security alert, retry; for a comment notification, perhaps not. That choice is a product decision, not a technical one. See [[delivery-guarantees]] and [[leases-and-fencing]].
        `,
      },
    },
    {
      id: "provider-outage",
      title: "The email provider is failing",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["retries-and-backoff", "backpressure", "rate-limiting"],
      competencyIds: ["provider-failure"],
      event: {
        kind: "failure",
        title: "Provider returns 503s and 429s for 25 minutes",
        detail: "About 70% of send attempts fail. The email queue is growing by ~400 messages a second.",
      },
      context: md`
        The requirement: outages delay notifications but never lose them. Nothing about the outage is under your control except how you respond to it.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should senders behave during the outage?",
        options: [
          {
            id: "retry-immediately",
            label: "Retry each failed send immediately, up to 10 times",
            assessment: "flawed",
            feedback: "Every failure multiplies into ten requests against a provider that is already overloaded and rate-limiting you, which prolongs the outage and burns through attempts that could have succeeded later.",
          },
          {
            id: "breaker-and-quota",
            label: "Trip a circuit breaker for the email channel: pause sending, probe periodically, keep work queued, then resume within the rate limit",
            assessment: "sound",
            feedback:
              "Senders stop hammering a failing provider and let the queue absorb the outage. Deliveries keep their place and their state, so nothing is lost. On recovery, the shared rate limiter meters the backlog out at 500/s, critical class first.",
          },
          {
            id: "fail-after-retries",
            label: "Retry with exponential backoff per message, and mark it failed after 5 attempts",
            assessment: "defensible",
            feedback:
              "Backoff is right for an individual message's transient errors. But during a 25-minute outage every message burns its attempts and fails, so notifications are lost, which the requirement forbids. Channel-wide outages need channel-wide handling.",
          },
          {
            id: "failover-provider",
            label: "Fail over to a second email provider immediately",
            assessment: "defensible",
            feedback:
              "A real option, which many large senders keep warm. But sends whose outcome was unknown at the first provider may be duplicated at the second, and a cold sending domain can land in spam. It works as a planned capability, not a reflex.",
          },
        ],
        rationale: {
          prompt: "How does your approach keep notifications from being lost without making the outage worse?",
          rubric: [
            { id: "channel-level", text: "Treats a provider-wide outage at the channel level (circuit breaker) rather than per message." },
            { id: "no-amplification", text: "Avoids amplifying load on a failing dependency (backoff, pause, probe)." },
            { id: "durable-backlog", text: "Work stays durably queued, so the backlog drains on recovery." },
            { id: "drain-rate", text: "The recovery drain respects the rate limit and priority classes.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Per-message retry policies assume failures are independent. Provider outages are the opposite: **every message fails for the same reason at the same time**. The right unit of response is the channel. Stop, wait, probe, then drain at a controlled rate; see [[retries-and-backoff]] and [[backpressure]].

          Classify errors too: a 429 or 503 is transient; "invalid address" or "unsubscribed" are permanent and terminal; a timeout is unknown.
        `,
      },
    },
    {
      id: "announcement-versus-alerts",
      title: "The announcement and the security alert",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["rate-limiting", "message-queues", "backpressure"],
      competencyIds: ["isolation"],
      event: {
        kind: "requirement-change",
        title: "Marketing schedules a 5-million-user announcement",
        detail: "It will occupy the email account's full capacity for nearly three hours. Security alerts must still go out within 30 seconds.",
      },
      context: md`
        Same provider, same account, same 500/s.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you keep security alerts fast during the announcement?",
        options: [
          {
            id: "one-fifo",
            label: "One queue in arrival order; the announcement goes first because it was scheduled first",
            assessment: "flawed",
            feedback: "Alerts wait behind millions of messages for hours.",
          },
          {
            id: "priority-field",
            label: "One queue with a priority field; senders pick the highest priority first",
            assessment: "defensible",
            feedback:
              "Ordering improves, but quota is the bottleneck: if bulk sends have already used this second's 500 tokens, the alert still waits, and many queues cannot do priority efficiently at millions of messages. Priority changes order; it does not reserve capacity.",
          },
          {
            id: "classes-and-quota",
            label: "Separate queues per class (critical, transactional, bulk) with a reserved share of the provider quota for critical and transactional",
            assessment: "sound",
            feedback:
              "Bulk can never consume the capacity reserved for critical, so an alert waits at most for its own class's small queue. Unused reserved capacity can be lent to bulk each second. The cost is a slightly slower announcement.",
          },
          {
            id: "separate-account",
            label: "Send marketing through a separate provider account or subdomain",
            assessment: "sound",
            feedback:
              "Physically separate quotas and sender reputation: a spam complaint about marketing cannot hurt delivery of password-reset emails. Many teams do this alongside class-based queues.",
          },
        ],
        rationale: {
          prompt: "Why does your design guarantee the 30-second promise, and what does it cost?",
          rubric: [
            { id: "capacity-not-order", text: "The constraint is shared capacity, so the fix must reserve capacity, not only reorder work." },
            { id: "isolation", text: "Bulk and critical traffic are isolated in queueing and quota (or accounts)." },
            { id: "cost", text: "Names the cost: slower bulk sends, unused reserved capacity, or extra accounts.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          This is the fast-lane problem from the video pipeline in a different system: **a latency guarantee under saturation needs reserved capacity**. Here the capacity is a provider's rate limit rather than workers, and the mechanism is a [[rate-limiting|token bucket]] per class drawing from the account's 500/s.

          Separate accounts add another kind of isolation, of *reputation*: bulk email gets spam complaints, and you do not want those to affect password resets.
        `,
      },
    },
    {
      id: "digests-and-quiet-hours",
      title: "Digests and quiet hours",
      phase: "change",
      dimensions: ["change", "explain"],
      conceptIds: ["idempotency", "state-machines"],
      competencyIds: ["policy", "dedupe"],
      event: {
        kind: "requirement-change",
        title: "Users want fewer emails",
        detail:
          "Product adds a 'digest' option: batch comment notifications into one email per issue per hour, and hold everything non-urgent during each user's quiet hours.",
      },
      context: md`
        Batching changes notifications from "send when it happens" to "send what accumulated". Evaluate these statements about the new behaviour.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "digest-idempotent",
            statement: "A digest job that runs twice for the same user and hour must not send two digests.",
            verdict: "holds",
            explanation:
              "Scheduled jobs are retried and overlap like everything else. Give the digest a derived identity, such as (user, issue, hour window), with a unique constraint, exactly like individual notifications.",
          },
          {
            id: "digest-membership",
            statement: "Notifications included in a digest must be marked as included in the same transaction that creates the digest.",
            verdict: "holds",
            explanation:
              "Otherwise a crash between the two either sends a notification twice (in two digests) or never (marked but the digest is lost). Membership and the digest record commit together; sending follows.",
          },
          {
            id: "quiet-hours-server-time",
            statement: "Quiet hours can be evaluated in the server's time zone.",
            verdict: "fails",
            explanation: "Quiet hours are the user's night, not the data centre's. Store a time zone per user and evaluate their local time, including daylight-saving transitions.",
          },
          {
            id: "security-quiet",
            statement: "Security alerts should be held until a user's quiet hours end.",
            verdict: "fails",
            explanation: "A new-login alert at 3 a.m. may be the only chance to stop an account takeover. Policy rules by type, such as 'critical ignores quiet hours', must be explicit.",
          },
          {
            id: "delay-tradeoff",
            statement: "A longer digest window always produces a better user experience.",
            verdict: "depends",
            explanation:
              "Fewer emails, but each one is later. For a busy issue, hourly batching is a relief; for an assignment with a deadline, an hour can be too long. That is why digests are usually per type and user-configurable.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          Digests introduce **aggregation**, and aggregation needs the same care as everything else: a derived identity for the aggregate, atomic membership, and the side effect only after the record. The time-related claims are reminders that "when" is a user-facing concept: quiet hours and digest windows live in each user's local time.
        `,
      },
    },
    {
      id: "write-the-sender",
      title: "Write the sender",
      phase: "change",
      dimensions: ["implement", "break"],
      conceptIds: ["state-machines", "rate-limiting", "retries-and-backoff"],
      competencyIds: ["provider-failure", "dedupe", "policy"],
      context: md`
        Write the core loop of an email sender: claim a delivery, check it is still wanted, respect the class's quota, send, and record the outcome. Handle transient, permanent and unknown outcomes differently.
      `,
      interaction: {
        kind: "implementation",
        prompt: "Implement processDelivery for the email channel.",
        language: "typescript",
        starter: md`
          // deliveries(id, notification_id, channel, class, status, attempt, attempt_token, next_attempt_at, last_error)
          // status: queued | sending | sent | suppressed | failed

          async function processDelivery(deliveryId: string) {
            // …
          }
        `,
        rubric: [
          { id: "claim-sending", text: "Atomically moves the delivery to 'sending' with a fresh attempt token, and skips it if another attempt is in progress or it is no longer queued." },
          { id: "recheck", text: "Re-checks current preferences (and type policy) before sending, recording 'suppressed' if no longer wanted." },
          { id: "quota", text: "Takes a token from the class's rate limit before calling the provider." },
          { id: "classify", text: "Treats transient errors (retry later with backoff), permanent errors (terminal failure) and timeouts (unknown) differently." },
          { id: "conditional-record", text: "Records the outcome conditioned on its attempt token.", weight: "supporting" },
        ],
        reference: {
          code: md`
            async function processDelivery(deliveryId: string) {
              const token = crypto.randomUUID();
              const d = await db.oneOrNone(\`
                UPDATE deliveries SET status = 'sending', attempt = attempt + 1,
                       attempt_token = $2, updated_at = now()
                WHERE id = $1 AND status = 'queued' AND next_attempt_at <= now()
                RETURNING *\`, [deliveryId, token]);
              if (!d) return; // someone else has it, or it is finished

              const n = await notifications.load(d.notification_id);
              if (!(await policy.allows(n.user_id, n.type, "email"))) {
                return finish(d, token, "suppressed", "preference changed");
              }

              await quotas.take(\`email:\${d.class}\`); // waits for a token from the class's bucket

              try {
                await email.send(render(n), { timeoutMs: 10_000 });
                return finish(d, token, "sent");
              } catch (err) {
                if (isPermanent(err)) return finish(d, token, "failed", err.code); // bad address, unsubscribed
                if (isTimeout(err) && d.class !== "critical") {
                  // Unknown outcome: for non-critical mail, prefer silence to a likely duplicate.
                  return finish(d, token, "failed", "unknown outcome after timeout");
                }
                // Transient (or critical and unknown): try again later.
                const delay = backoffWithJitter(d.attempt);
                await db.none(\`
                  UPDATE deliveries SET status = 'queued', next_attempt_at = now() + $3 * interval '1 second',
                         last_error = $4
                  WHERE id = $1 AND attempt_token = $2\`, [d.id, token, delay, String(err)]);
              }
            }

            async function finish(d: Delivery, token: string, status: string, reason?: string) {
              await db.none(\`
                UPDATE deliveries SET status = $3, last_error = $4
                WHERE id = $1 AND attempt_token = $2\`, [d.id, token, status, reason ?? null]);
            }
          `,
          notes: md`
            - The **claim** is a conditional update: \`queued → sending\` with a fresh token. Concurrent senders and redelivered queue messages fall through harmlessly.
            - The **preference check** is the last thing before the irreversible step.
            - **Unknown outcomes** get a deliberate policy: critical mail is retried (a duplicate password-change alert beats a missing one); routine mail is not (a missing comment email beats a duplicate). Making that choice explicit in code is the point.
            - A reaper re-queues deliveries stuck in \`sending\` far longer than any send could take, which covers senders that crashed mid-call.
          `,
        },
      },
      reveal: {
        reasoning: md`
          The sender is a small [[state-machines|state machine]] with a policy at each transition: whether a send is still wanted, whether quota is available, and what kind of failure occurred. Most of the sender's correctness lives in the **WHERE clauses**, which is where it lives in every system in this course.
        `,
      },
    },
    {
      id: "defend-at-most-once",
      title: "Defend the duplicate policy",
      phase: "defend",
      dimensions: ["defend", "explain"],
      conceptIds: ["delivery-guarantees", "idempotency", "timeouts"],
      competencyIds: ["dedupe", "provider-failure", "policy"],
      context: md`
        The product manager asks for a simple promise in the help centre: "We never send the same notification twice." Explain what you can promise, what you cannot, and why.
      `,
      interaction: {
        kind: "open",
        prompt: "Explain to a non-engineer what the system guarantees about duplicates and missed notifications, and why a stronger promise is not possible.",
        placeholder: "We can guarantee that…",
        rubric: [
          { id: "can", text: "States what is guaranteed: one notification per event per channel (dedupe keys), and no concurrent duplicate sends (claims)." },
          { id: "cannot", text: "Explains the residual case plainly: when the email provider does not confirm a send, we cannot know whether it was delivered." },
          { id: "choice", text: "Explains the deliberate choice per type: retry critical alerts (risking a duplicate), do not retry routine ones (risking a miss)." },
          { id: "promise", text: "Proposes an honest public promise, e.g. 'duplicates are rare and only occur when a provider fails mid-send'.", weight: "supporting" },
        ],
        reference: md`
          **What we guarantee:** each event produces at most one notification per person per channel, however many times our systems process it. Two of our servers never send the same notification at the same time.

          **What we cannot guarantee:** when the email provider does not confirm a send (a timeout, a dropped connection), we cannot know whether the email went out. The provider offers no way to ask "did you already send this?". At that moment there are only two options: send again and risk a duplicate, or do not and risk the person never getting it.

          **What we chose:** for security alerts we resend, because a duplicate is better than a missing warning. For everything else we do not, because a missing comment notification is better than an annoying duplicate, and the inbox still shows it.

          **The honest promise:** "Duplicate notifications are rare; they can happen only when an email provider fails in the middle of sending. Security alerts are always retried." It is less catchy than "never", but it stays true during incidents.
        `,
      },
      reveal: {
        reasoning: md`
          The point is that **"never" is a claim about every failure mode**, including ones in systems you do not control. Engineers earn trust by making promises they can keep and explaining the trade they chose in terms the business can weigh. That is the same skill as defending a design in an interview, aimed at a different audience.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      Product actions emit **events**, durably and atomically, and never wait for delivery. A planner turns events into **notifications with derived identities**, so replays cannot multiply them. Each delivery is a **state machine** claimed with a token, re-checked against current preferences at the last moment, metered by a **per-class quota**, and classified on failure as transient, permanent or unknown.

      Isolation comes from capacity rather than ordering: critical traffic has its own queue and reserved share of the provider limit. Duplicates are structurally impossible up to the provider boundary, and beyond it they are a deliberate, per-type trade between duplicate and silence.
    `,
    reliesOn: [
      "Product services write events through an outbox, with stable event ids.",
      "The notifications database enforces dedupe keys and conditional transitions.",
      "Provider rate limits are known and enforced by a shared limiter across senders.",
      "Queue leases (visibility timeouts) are longer than the slowest send, or are extended.",
    ],
    alternatives: [
      { design: "Notification-as-a-service platform", preferWhen: "Channels, templates and preferences are standard and you would rather configure than build. You still own the event boundary and idempotency." },
      { design: "Per-channel microservices", preferWhen: "Channels have very different scale or teams; a shared planner still owns identity and policy." },
      { design: "Inbox-first (pull) model", preferWhen: "Most notifications are low-urgency: write to the inbox only and send email digests on a schedule, which removes most real-time sends." },
    ],
    tradeoffs: [
      { choice: "Event-driven decoupling", gains: "Product actions never fail because of notifications.", costs: "Notifications are eventually sent, seconds later, and the pipeline needs monitoring." },
      { choice: "Send-time preference checks", gains: "Changes take effect immediately.", costs: "A preference read per send." },
      { choice: "Reserved quota per class", gains: "Critical alerts meet their deadline under any bulk load.", costs: "Bulk sends finish later; reserved capacity sometimes idles." },
      { choice: "No retry on unknown outcomes for routine mail", gains: "Fewer duplicates.", costs: "Occasional missed emails, mitigated by the inbox." },
    ],
    breaksWhen: [
      "Providers change their limits or semantics without notice, so quotas need monitoring and configuration, not constants.",
      "A single event fans out to millions of recipients, such as a workspace-wide announcement, so planning itself must be batched and paged.",
      "Regulatory requirements demand a proof of delivery the providers cannot give.",
      "Users expect cross-device read sync in real time, which turns the inbox into a real-time sync problem.",
    ],
  },
  interviewVariants: [
    "Design a notification system.",
    "How would you send an email to every user without affecting transactional email?",
    "Users are getting duplicate push notifications. How do you investigate and fix it?",
    "Design a system that respects user notification preferences at scale.",
  ],
  relatedInvestigationIds: ["video-processing-pipeline", "api-rate-limiter"],
} satisfies InvestigationInput;
