import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const paymentWorkflow = {
  id: "payment-workflow",
  title: "A payment workflow that never double-charges",
  searchTitle: "Design a Payment System",
  premise:
    "Checkout calls a payment provider that can be slow, can time out after it succeeded, and sends webhooks more than once and out of order. Keep every order's payment state correct through retries, crashes and uncertainty.",
  difficulty: "advanced",
  estimatedMinutes: 60,
  scenario: md`
    You run checkout for a marketplace that sells online courses. Buyers enter card details into the payment provider's hosted fields, so your servers only ever see a short-lived payment token, never card numbers. Your backend creates an order, asks the provider to charge it, and, once the money has moved, grants the course and emails a receipt.

    The provider behaves like every real one. Most charges finish in a second or two, a few take ten, and occasionally a request hangs until something times out. Some cards require a 3-D Secure challenge that completes minutes later. The provider accepts an **idempotency key** on every write and remembers it for 24 hours, sends signed **webhooks** for every state change, and lets you look up payments by your own reference.

    Buyers double-click. Mobile connections drop mid-request. Your app servers are redeployed during business hours. Finance reconciles every day against the provider's settlement report, and they have found discrepancies before.
  `,
  objectives: [
    "Treat a timeout as an unknown outcome and give it a state, instead of guessing.",
    "Use idempotency keys and atomic claims so retries and double-clicks converge on one charge.",
    "Handle at-least-once, unordered webhooks with forward-only state transitions.",
    "Decouple side effects from state changes with a transactional outbox.",
    "Design reconciliation that resolves what messages could not.",
    "Explain what the design guarantees, and the residual risks it does not cover.",
  ],
  prerequisites: ["idempotency", "transactions", "state-machines"],
  requirements: {
    functional: [
      "A buyer pays for an order; the order shows paid and the course is granted.",
      "Declined payments show a reason, and the buyer can try a different card.",
      "Payments needing 3-D Secure complete asynchronously after the buyer's challenge.",
      "Admins can refund a paid order.",
      "Finance can reconcile every order against the provider's records daily.",
    ],
    nonFunctional: [
      "A buyer is never charged twice for the same order.",
      "An order is never marked paid, and a course never granted, unless the provider captured the money.",
      "Payment state survives a process crash or deploy at any instant.",
      "Every state change is auditable: what changed it, when, and based on which provider event.",
      "The buyer gets either an answer or a clear 'processing' state within about 10 seconds.",
    ],
  },
  constraints: [
    "Provider latency: p50 1.5 s, p99 10 s; occasional hangs past 30 s. Rate limit 100 requests/second.",
    "Provider idempotency keys are retained for 24 hours.",
    "Webhooks are signed, delivered at least once, in no guaranteed order, retried with backoff for up to 3 days; the endpoint must answer within 10 s.",
    "Stateless app servers behind a load balancer with a 30-second request timeout; one Postgres database.",
    "About 5,000 orders a day, peaking at 50 a minute during course launches.",
  ],
  assumptions: [
    "Card data is tokenized by the provider's client SDK; you are out of scope for storing card numbers.",
    "The provider is the source of truth for whether money moved.",
    "The provider's API can look up a payment by your idempotency key or metadata reference.",
    "Server clocks are roughly synchronized but are not used to order events.",
  ],
  competencies: [
    {
      id: "uncertain-outcomes",
      label: "Reasoning about unknown outcomes",
      description: "Recognizing when you cannot know what happened, and designing a way to find out.",
    },
    {
      id: "idempotency",
      label: "Idempotency and deduplication",
      description: "Making retries, double-clicks and redeliveries converge on a single effect.",
    },
    {
      id: "state-machine",
      label: "Payment state machine",
      description: "States, valid transitions, and enforcing them against concurrent and stale actors.",
    },
    {
      id: "atomicity",
      label: "Atomicity across systems",
      description: "What one transaction can and cannot cover, and how side effects follow commits.",
    },
    {
      id: "event-handling",
      label: "Handling external events",
      description: "Webhooks as at-least-once, unordered hints rather than commands.",
    },
    {
      id: "reconciliation",
      label: "Reconciliation and audit",
      description: "Resolving what messages could not, and proving what happened afterwards.",
    },
  ],
  system: {
    components: [
      {
        id: "buyer",
        label: "Buyer's browser",
        kind: "client",
        responsibility:
          "Collects card details in the provider's hosted fields, completes 3-D Secure, and submits checkout with an idempotency key; polls for status.",
        position: { col: 0, row: 0 },
      },
      {
        id: "api",
        label: "Checkout API",
        kind: "service",
        responsibility:
          "Claims the attempt by idempotency key, calls the provider with the same key, and applies results as conditional transitions.",
        position: { col: 1, row: 1 },
      },
      {
        id: "postgres",
        label: "Postgres",
        kind: "database",
        responsibility: "System of record for orders, payment attempts, the event ledger and the outbox.",
        durableState:
          "orders, payment_attempts (idempotency key, status, provider id), payment_events (append-only), outbox, processed webhook ids.",
        position: { col: 2, row: 1 },
      },
      {
        id: "provider",
        label: "Payment provider",
        kind: "external",
        responsibility: "Moves the money. Source of truth for every charge and refund.",
        position: { col: 3, row: 0 },
      },
      {
        id: "webhooks",
        label: "Webhook receiver",
        kind: "service",
        responsibility:
          "Verifies signatures, records the event id, and applies forward-only transitions; acknowledges within a second.",
        position: { col: 4, row: 1 },
      },
      {
        id: "fulfillment",
        label: "Fulfillment worker",
        kind: "worker",
        responsibility: "Processes outbox rows: grants enrollment, revokes it on refund, sends receipts. Every handler is idempotent.",
        position: { col: 1, row: 2 },
      },
      {
        id: "email",
        label: "Email provider",
        kind: "external",
        responsibility: "Delivers receipts.",
        position: { col: 0, row: 2 },
      },
      {
        id: "reconciler",
        label: "Reconciler",
        kind: "worker",
        responsibility:
          "Resolves attempts stuck in processing by asking the provider, and diffs the daily settlement report against the ledger.",
        position: { col: 3, row: 2 },
      },
    ],
    flows: [
      { id: "tokenize", from: "buyer", to: "provider", label: "Card entry and 3-D Secure in hosted fields", kind: "request" },
      { id: "checkout", from: "buyer", to: "api", label: "Pay (Idempotency-Key header); poll status", kind: "request" },
      { id: "charge", from: "api", to: "provider", label: "Create payment with the attempt's key", kind: "request" },
      { id: "record", from: "api", to: "postgres", label: "Claim attempt; conditional transitions", kind: "request" },
      { id: "events", from: "provider", to: "webhooks", label: "Signed events: at least once, unordered", kind: "async" },
      { id: "apply-event", from: "webhooks", to: "postgres", label: "Dedupe by event id; forward-only transition", kind: "request" },
      { id: "outbox", from: "fulfillment", to: "postgres", label: "Claim outbox rows; record completion", kind: "request" },
      { id: "receipt", from: "fulfillment", to: "email", label: "Send receipt with idempotency key", kind: "request" },
      { id: "find-stuck", from: "reconciler", to: "postgres", label: "Attempts processing too long; ledger", kind: "request" },
      { id: "lookup", from: "reconciler", to: "provider", label: "Look up by reference; settlement report", kind: "request" },
    ],
    invariants: [
      {
        id: "one-charge-per-attempt",
        statement: "At most one charge exists for each payment attempt.",
        enforcedBy: ["postgres", "api", "provider"],
        mechanism:
          "The attempt row is claimed with a unique idempotency key before any provider call, and every call for that attempt carries the same key, so both your database and the provider deduplicate.",
      },
      {
        id: "paid-means-captured",
        statement: "An order is paid only if the provider reported the payment as succeeded.",
        enforcedBy: ["api", "webhooks", "reconciler"],
        mechanism:
          "Only provider-originated facts (synchronous response, verified webhook, reconciliation lookup) can drive processing → succeeded, through the same conditional update.",
      },
      {
        id: "no-regression",
        statement: "Terminal states never move backwards.",
        enforcedBy: ["postgres"],
        mechanism:
          "Every transition is an UPDATE conditioned on the allowed previous states; late or duplicate events match zero rows.",
      },
      {
        id: "effects-follow-state",
        statement: "Enrollment and receipts happen if and only if the payment succeeded, eventually and without duplicates.",
        enforcedBy: ["postgres", "fulfillment"],
        mechanism:
          "The transition and its outbox rows commit in one transaction; fulfillment handlers are idempotent (unique enrollment per user and course, email keyed by attempt).",
      },
    ],
  },
  stages: [
    // -----------------------------------------------------------------------
    {
      id: "what-the-provider-implies",
      title: "What the provider's behaviour implies",
      phase: "model",
      dimensions: ["explain", "break"],
      conceptIds: ["timeouts", "webhooks", "idempotency"],
      competencyIds: ["uncertain-outcomes", "event-handling"],
      context: md`
        The provider's documentation is a list of facts. A design starts by turning each one into a consequence. Before you write any code, decide which of these statements follow from the constraints.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements follow from how the provider behaves?",
        claims: [
          {
            id: "timeout-failed",
            statement: "If the call to create a payment times out, the buyer was not charged.",
            verdict: "fails",
            explanation:
              "The request may have reached the provider and succeeded, with only the response lost or late. A timeout ends *your waiting*, not the provider's work. The outcome is unknown; see [[timeouts]].",
          },
          {
            id: "same-key",
            statement: "Repeating a create-payment request with the same idempotency key within 24 hours returns the original result instead of charging again.",
            verdict: "holds",
            explanation:
              "That is the contract the provider offers, and the foundation of the whole design. It also implies that a retry *after* 24 hours, or with a new key, is a brand-new charge.",
          },
          {
            id: "webhooks-complete",
            statement: "Because webhooks are retried for three days, they are a complete record of every outcome.",
            verdict: "fails",
            explanation:
              "If your endpoint is broken for longer than the retry window, misconfigured, or rejecting signatures after a secret rotation, events are lost for good. And until one arrives, you cannot tell \"not yet\" from \"never\". Something has to ask the provider; see [[reconciliation]].",
          },
          {
            id: "unordered",
            statement: "A `payment.processing` webhook can arrive after the `payment.succeeded` webhook for the same payment.",
            verdict: "holds",
            explanation:
              "Each event is delivered and retried independently. If the first delivery of `processing` failed, its retry can land after `succeeded`. Handlers must never let an older event regress newer state.",
          },
          {
            id: "rate-limit",
            statement: "At 50 orders a minute, the provider's 100 requests/second limit constrains the design.",
            verdict: "fails",
            explanation:
              "50 a minute is under one request per second, two orders of magnitude below the limit, even with retries and lookups. It is worth knowing the limit exists, but it does not shape this design. It will at 100x.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          Three facts drive everything that follows:

          - **Outcomes can be unknown.** Any call can end without telling you what happened. The design needs a state for "we asked and do not know yet" and a way to find out.
          - **The provider deduplicates by key, for 24 hours.** Every retry of the same intent must carry the same key, and the key must be tied to a record you write *before* calling.
          - **Events are hints, not commands.** Webhooks arrive late, twice or out of order, and sometimes not at all. They must be applied in a way that tolerates all four.

          Notice what is absent: nothing in the brief is a scale problem. The difficulty in payments is almost entirely **uncertainty and concurrency**, not throughput.
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "wait-for-the-provider",
      title: "Should checkout wait for the provider?",
      phase: "decide",
      dimensions: ["defend"],
      conceptIds: ["asynchronous-processing", "timeouts", "state-machines"],
      competencyIds: ["uncertain-outcomes", "state-machine"],
      context: md`
        The buyer clicks **Pay**. Most charges complete in 1-2 seconds, a few take 10, some hang, and 3-D Secure payments complete only after the buyer finishes a challenge. The load balancer cuts requests at 30 seconds. The buyer should get an answer or a clear "processing" state within about 10 seconds.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should the checkout request relate to the provider call?",
        options: [
          {
            id: "fully-sync",
            label: "Call the provider inside the request and wait up to 25 seconds for the result",
            assessment: "defensible",
            feedback:
              "It works for the common case, and most simple integrations start here. But a hang that reaches the load balancer's timeout leaves the buyer with an error page while the charge may still succeed, and 3-D Secure cannot complete inside a request at all. You still need everything the asynchronous path needs; you have just hidden the need until the first incident.",
          },
          {
            id: "bounded-wait",
            label: "Record the attempt, call the provider with an ~8 s timeout; return the result if it arrives, otherwise return 'processing' and resolve it later",
            assessment: "sound",
            feedback: md`
              The common case gets an immediate, honest answer. The uncommon case (slow, hung, or awaiting 3-D Secure) gets an equally honest one: "processing", with the page polling the status. The attempt is already recorded, so webhooks or reconciliation can resolve it whenever the outcome becomes known.
            `,
          },
          {
            id: "fully-async",
            label: "Enqueue a charge job and return 'processing' immediately; a worker calls the provider",
            assessment: "defensible",
            feedback:
              "This is robust, and appropriate when charges are not interactive (subscription renewals, batch payouts). For a buyer staring at checkout, it adds a queue hop and a polling delay to a call that usually finishes in 1.5 seconds, and 3-D Secure needs the buyer present anyway.",
          },
          {
            id: "client-confirms",
            label: "The browser confirms the payment with the provider's SDK, then tells the API the order is paid",
            assessment: "flawed",
            feedback:
              "Confirming in the browser is common and fine. Trusting the browser's *report* is not. A buyer can forge the call, and a tab that closes after paying never tells you at all. The server must learn the outcome from the provider directly (API response, verified webhook or lookup).",
          },
        ],
        rationale: {
          prompt: "Why is this the right relationship between the request and the charge?",
          rubric: [
            {
              id: "common-case",
              text: "Most charges finish in seconds, so a short bounded wait gives most buyers an immediate answer.",
            },
            {
              id: "unknown-state",
              text: "When the wait ends without a result the outcome is unknown, so the design needs an explicit processing state resolved later by a source of truth.",
            },
            {
              id: "server-truth",
              text: "The server learns outcomes from the provider, never from the client's claim.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          This is a hybrid of synchronous and asynchronous: **synchronous when it can be, asynchronous when it must be.** The request is a fast path layered over a design that would be correct without it.

          The 8-second bound is chosen from the requirement ("an answer within about 10 seconds") and the provider's latency (p99 of 10 seconds means about 1-2% of buyers see "processing" briefly). The request timeout must be shorter than the load balancer's, so *your* code decides what the buyer sees rather than the load balancer's generic 504.

          Most importantly, the attempt row exists **before** the provider call. Whatever happens next, whether a crash, a timeout or a deploy, there is a durable record that a charge may be in flight; see [[asynchronous-processing]].
        `,
        tradeoffs: [
          {
            choice: "Bounded wait with processing fallback",
            gains: "Immediate answers for ~98% of buyers; correct for the rest.",
            costs: "Two code paths for outcomes, and a status page the buyer may have to wait on.",
          },
        ],
        otherwise:
          "For off-session charges such as renewals, the fully asynchronous design is simpler and better: nobody is waiting.",
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "where-payment-state-lives",
      title: "Where does payment state live?",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["state-machines", "event-log", "transactions"],
      competencyIds: ["state-machine", "reconciliation"],
      context: md`
        A buyer may try one card, get declined, and pay with another. A payment may sit in "processing" for minutes. Finance needs to know exactly which provider event made an order paid, and support needs to answer "why was I charged?" months later.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should payment state be modelled?",
        options: [
          {
            id: "paid-boolean",
            label: "A paid boolean on the orders table",
            assessment: "flawed",
            feedback:
              "There is nowhere to represent \"we asked and don't know yet\", a decline reason, a second attempt, or a refund, and no record of what made it true. The first timeout forces you to guess between true and false, and both guesses can be wrong.",
          },
          {
            id: "order-status",
            label: "A status enum on the order (pending, paid, failed, refunded), updated in place",
            assessment: "defensible",
            feedback:
              "Much better: it is a real state machine. But a declined attempt followed by a new card overwrites the first attempt's history, there is one place for one idempotency key, and \"why is this paid?\" has no answer beyond the current value. It works for simple stores where each order gets exactly one attempt.",
          },
          {
            id: "attempts-and-ledger",
            label: "A payment_attempts table (one row per attempt, its own key and state machine) plus an append-only payment_events ledger",
            assessment: "sound",
            feedback: md`
              Each attempt has its own identity, idempotency key and lifecycle (\`created → processing → succeeded | failed\`, \`succeeded → refunded\`). The order's status is derived from its attempts, and every transition appends an event recording the cause (API response, webhook \`evt_…\`, reconciliation). That makes it auditable and debuggable.
            `,
          },
          {
            id: "ask-provider",
            label: "Store only the provider's payment id; ask the provider whenever you need the status",
            assessment: "flawed",
            feedback:
              "The provider is the source of truth for money, but not a database for your product. Every order page becomes a remote call subject to rate limits and outages. And you cannot record the attempt *before* calling the provider, because you have no ID yet, which is exactly when you most need a record.",
          },
        ],
        rationale: {
          prompt: "What does your model represent that the alternatives cannot?",
          rubric: [
            {
              id: "per-attempt",
              text: "Each attempt (e.g. a declined card, then a new one) needs its own record and its own idempotency key.",
            },
            {
              id: "unknown-state",
              text: "The model includes an explicit state for outcomes that are not yet known.",
            },
            {
              id: "audit",
              text: "An append-only record of transitions and their causes makes the state auditable.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Two tables, two jobs:

          - **\`payment_attempts\`** holds *current* state, optimized for decisions: is this attempt still processing? What key did we use? Transitions are conditional updates; see [[state-machines]].
          - **\`payment_events\`** holds *history*: one row per transition, with the cause and the provider's event or request ID. It is written in the same transaction as the state change, so they can never disagree; see [[event-log]].

          The order's status is a function of its attempts: paid if any attempt succeeded and was not refunded. A unique partial index (\`ON payment_attempts (order_id) WHERE status IN ('processing', 'succeeded')\`) makes "one live attempt per order" a database invariant rather than a hope.
        `,
        tradeoffs: [
          {
            choice: "Attempts plus an append-only ledger",
            gains: "Per-attempt idempotency, an explicit unknown state, and a full audit trail.",
            costs: "More tables, plus derived order status that every query must compute or maintain.",
          },
        ],
      },
      reveals: { components: [], flows: ["record"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "valid-transitions",
      title: "Which transitions can happen?",
      phase: "model",
      dimensions: ["explain", "break"],
      conceptIds: ["state-machines", "webhooks", "timeouts"],
      competencyIds: ["state-machine", "uncertain-outcomes"],
      context: md`
        An attempt's states are \`created\`, \`processing\`, \`succeeded\`, \`failed\` and \`refunded\`. Information about it arrives from three directions: the provider's synchronous response, webhooks, and the reconciler. Decide which of these statements about transitions are true.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements about the attempt's lifecycle hold?",
        claims: [
          {
            id: "failed-after-timeout",
            statement: "An attempt marked failed because the provider call timed out can later turn out to have succeeded.",
            verdict: "holds",
            explanation:
              "That is exactly why a timeout must *not* lead to `failed`. Only a definitive answer (a decline, an error the provider documents as final) may. A timeout leaves the attempt in `processing`.",
          },
          {
            id: "succeeded-to-failed",
            statement: "A succeeded attempt may move to failed if a later webhook reports a failure.",
            verdict: "fails",
            explanation:
              "Succeeded is terminal for the charge. A later `failed` event for the same payment is an older event arriving late. Money coming back is a *new* transition (`refunded`, or a dispute), recorded as such, never an overwrite of history.",
          },
          {
            id: "apply-in-arrival-order",
            statement: "Applying each webhook's status to the attempt in the order webhooks arrive keeps the state correct.",
            verdict: "fails",
            explanation:
              "Arrival order is not event order. Either restrict transitions to forward moves (`processing → succeeded` matches only from `processing`), or treat each webhook as a nudge and fetch the payment's current state from the provider.",
          },
          {
            id: "refund-from-succeeded",
            statement: "Refunded can only follow succeeded.",
            verdict: "holds",
            explanation: "You cannot return money you never captured. Enforce it in the transition's WHERE clause, not only in UI logic.",
          },
          {
            id: "decline-final",
            statement: "A card-declined response is a definitive answer that may move the attempt straight to failed.",
            verdict: "holds",
            explanation:
              "The provider has told you the outcome: nothing was charged. The buyer can start a new attempt, with a new key, using another card.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          The rule underneath all five: **transitions move forward only, and only on facts.**

          \`\`\`
          created ──▶ processing ──▶ succeeded ──▶ refunded
                          │
                          └────────▶ failed      (only on a definitive answer)
          \`\`\`

          Each arrow is an \`UPDATE … WHERE status = <from>\`. Every source of information (API response, webhook, reconciler) uses the same transitions. Whichever learns the truth first moves the state; the rest match zero rows and change nothing. That is how three independent, unordered, possibly duplicated channels converge on one answer; see [[state-machines]].
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "diagnose-the-double-charge",
      title: "A buyer was charged twice",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["idempotency", "concurrency-control", "timeouts"],
      competencyIds: ["idempotency", "uncertain-outcomes"],
      event: {
        kind: "failure",
        title: "Support ticket: \"I was charged twice\"",
        detail:
          "During a launch, the provider slowed down. A buyer's first click hung, they clicked again, and both charges went through. Below is the endpoint that handled it.",
      },
      context: md`
        This is the prototype's checkout handler. It looks reasonable. Find every line that contributes to double charges or inconsistent state.
      `,
      interaction: {
        kind: "diagnosis",
        prompt: "Select the lines responsible.",
        artifact: {
          type: "code",
          language: "typescript",
          caption: "POST /orders/:id/pay",
          lines: [
            { text: "app.post(\"/orders/:id/pay\", async (req, res) => {" },
            { text: "  const order = await db.orders.find(req.params.id);" },
            {
              text: "  if (order.status === \"paid\") return res.json({ status: \"paid\" });",
              fault:
                "Check-then-act: two concurrent requests both read 'unpaid' before either finishes. Deduplication must be an atomic claim, such as a unique idempotency key, not a read.",
            },
            {
              text: "  const charge = await provider.payments.create({",
              fault:
                "Nothing is recorded before calling the provider. If this request times out or the process dies here, there is no trace that a charge may exist.",
            },
            { text: "    amount: order.total," },
            { text: "    currency: order.currency," },
            {
              text: "    paymentToken: req.body.token,",
              fault:
                "No idempotency key is sent. The provider cannot recognize the second click (or a retry after a timeout) as the same intent, so it creates a second charge.",
            },
            { text: "  });" },
            { text: "  if (charge.status === \"succeeded\") {" },
            { text: "    await db.orders.update(order.id, { status: \"paid\" });" },
            {
              text: "    await enrollments.grant(order.userId, order.courseId);",
              fault:
                "Enrollment and email run after the commit with nothing recording that they are owed. A crash here leaves a paid order with no course, and no process will ever finish it.",
            },
            { text: "    await email.sendReceipt(order);" },
            { text: "  }" },
            { text: "  res.json({ status: charge.status });" },
            { text: "});" },
          ],
        },
        rationale: {
          prompt: "Explain how the double charge happened, and what the fix has to guarantee.",
          rubric: [
            {
              id: "unknown-retry",
              text: "The first request's outcome was unknown to the buyer; retrying without a stable idempotency key created a second charge.",
            },
            {
              id: "atomic-dedupe",
              text: "The status check races with concurrent requests; dedupe must be an atomic claim (unique key / insert-if-absent).",
            },
            {
              id: "record-first",
              text: "The attempt must be durably recorded, with its key, before the provider is called.",
            },
            {
              id: "effects",
              text: "Follow-up effects need to be recorded in the same transaction as the status change (outbox) so a crash cannot drop them.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Two clicks, both reading \`status = 'pending'\`, both calling the provider with no key. The provider saw two unrelated requests and did exactly what it was asked.

          Every line flagged is a version of one mistake: **acting as though the request is the unit of reliability.** The request can be duplicated, cut off, or abandoned at any line. The unit of reliability has to be something durable that every duplicate can find: an attempt row, created atomically under a key, before anything irreversible happens; see [[idempotency]].
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "write-the-idempotent-endpoint",
      title: "Write the idempotent checkout",
      phase: "break",
      dimensions: ["implement"],
      conceptIds: ["idempotency", "state-machines", "timeouts"],
      competencyIds: ["idempotency", "state-machine", "uncertain-outcomes"],
      context: md`
        Rewrite the handler. The client sends an \`Idempotency-Key\` header that it generates once per checkout attempt and reuses on every retry of that attempt. Use whatever mix of SQL and TypeScript you like. What matters is which operations are atomic, what is recorded when, and what each path returns.
      `,
      interaction: {
        kind: "implementation",
        prompt: "Implement the checkout handler so retries, double-clicks and timeouts cannot produce a second charge.",
        language: "typescript",
        starter: md`
          // payment_attempts(id, order_id, idempotency_key UNIQUE, amount, currency,
          //                  status, provider_payment_id, failure_reason, created_at)
          // payment_events(attempt_id, kind, cause, provider_ref, created_at)
          // outbox(id, kind, payload, created_at, sent_at)

          app.post("/orders/:id/pay", async (req, res) => {
            const key = req.header("Idempotency-Key");
            // …
          });
        `,
        rubric: [
          {
            id: "atomic-claim",
            text: "The attempt is inserted under a unique idempotency key in one atomic statement; a duplicate finds the existing attempt instead of creating one.",
          },
          {
            id: "same-key-downstream",
            text: "The provider call carries the attempt's key, so the provider deduplicates retries too.",
          },
          {
            id: "timeout-unknown",
            text: "A timeout or network error leaves the attempt in processing and returns 202, never failed.",
          },
          {
            id: "conditional-apply",
            text: "Results are applied with a conditional transition from processing, together with a ledger event and outbox rows in one transaction.",
          },
          {
            id: "payload-mismatch",
            text: "Reusing a key with a different order or amount is rejected.",
            weight: "supporting",
          },
          {
            id: "in-flight-duplicate",
            text: "A duplicate arriving while the first is still processing returns the current state rather than calling again.",
            weight: "supporting",
          },
        ],
        reference: {
          code: md`
            app.post("/orders/:id/pay", async (req, res) => {
              const key = req.header("Idempotency-Key");
              if (!key) return res.status(400).json({ error: "Idempotency-Key required" });
              const order = await db.orders.find(req.params.id);

              // 1. Atomic claim: exactly one request creates the attempt for this key.
              const inserted = await db.oneOrNone(\`
                INSERT INTO payment_attempts (order_id, idempotency_key, amount, currency, status)
                VALUES ($1, $2, $3, $4, 'processing')
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING *\`, [order.id, key, order.total, order.currency]);

              if (!inserted) {
                const existing = await db.one(
                  \`SELECT * FROM payment_attempts WHERE idempotency_key = $1\`, [key]);
                if (existing.order_id !== order.id || existing.amount !== order.total) {
                  return res.status(422).json({ error: "Key reused with different parameters" });
                }
                return res.status(existing.status === "processing" ? 202 : 200).json(view(existing));
              }

              // 2. Call the provider with the same key. Bounded wait.
              let result;
              try {
                result = await provider.payments.create(
                  { amount: order.total, currency: order.currency,
                    paymentToken: req.body.token, metadata: { attempt: inserted.id } },
                  { idempotencyKey: inserted.idempotency_key, timeoutMs: 8000 });
              } catch (err) {
                if (isDefinitiveDecline(err)) {
                  await applyTransition(inserted.id, "failed", { cause: "api", reason: err.code });
                  return res.status(200).json({ status: "failed", reason: err.code });
                }
                // Timeout or network error: the outcome is unknown. Leave it processing.
                return res.status(202).json({ status: "processing" });
              }

              await applyTransition(inserted.id, result.status, { cause: "api", providerRef: result.id });
              return res.status(result.status === "processing" ? 202 : 200).json({ status: result.status });
            });

            // Shared by the API, the webhook receiver and the reconciler.
            async function applyTransition(attemptId, to, cause) {
              const from = { succeeded: ["processing"], failed: ["processing"], refunded: ["succeeded"] }[to];
              if (!from) return false; // "processing" again: nothing to do
              return db.tx(async (tx) => {
                const moved = await tx.result(\`
                  UPDATE payment_attempts SET status = $2, provider_payment_id = COALESCE($3, provider_payment_id)
                  WHERE id = $1 AND status = ANY($4)\`, [attemptId, to, cause.providerRef, from]);
                if (moved.rowCount === 0) return false; // already moved by another path
                await tx.none(\`INSERT INTO payment_events (attempt_id, kind, cause, provider_ref)
                               VALUES ($1, $2, $3, $4)\`, [attemptId, to, cause.cause, cause.providerRef]);
                if (to === "succeeded") await enqueue(tx, ["grant-enrollment", "send-receipt"], attemptId);
                if (to === "refunded") await enqueue(tx, ["revoke-enrollment"], attemptId);
                return true;
              });
            }
          `,
          notes: md`
            - The **unique key and \`ON CONFLICT DO NOTHING\`** make the claim atomic. Two simultaneous clicks race on an index, not on application logic, and exactly one wins.
            - The attempt is created as \`processing\` *before* the provider call. From that moment, a durable record says "a charge may exist". Webhooks, the reconciler and the buyer's retries all find it.
            - **Timeouts never produce \`failed\`.** Only a definitive answer does. Everything else is resolved later through \`applyTransition\`, the single function every source of truth uses, so they cannot conflict.
            - Side effects (\`grant-enrollment\`, \`send-receipt\`) are outbox rows inserted in the **same transaction** as the transition. The next stages explain why.
          `,
        },
      },
      reveal: {
        reasoning: md`
          Notice what the handler no longer depends on: the request completing. If the process dies after the insert, the attempt sits in \`processing\` and gets resolved. If it dies after the provider call, the provider holds the key and will return the same result to any retry, and the webhook will arrive anyway. If the buyer clicks five times, four of the clicks read an existing row.

          The request is now just **one of several ways to learn an outcome** that is defined by durable state.
        `,
      },
      reveals: { components: [], flows: ["charge"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "who-owns-the-key",
      title: "Who owns the idempotency key?",
      phase: "decide",
      dimensions: ["defend", "break"],
      conceptIds: ["idempotency"],
      competencyIds: ["idempotency"],
      context: md`
        The key decides which requests count as "the same". If it is too broad, legitimate new attempts get the old answer. If it is too narrow, retries become new charges. A buyer whose card was declined must be able to pay with a different card. A buyer whose connection dropped must not pay twice.
      `,
      interaction: {
        kind: "decision",
        prompt: "What should the idempotency key identify, and who generates it?",
        options: [
          {
            id: "client-per-attempt",
            label: "The browser generates a UUID when the buyer starts a checkout attempt, reuses it on retries, and generates a new one after a definitive decline",
            assessment: "sound",
            feedback:
              "The key matches the *intent*: this attempt at paying. Network retries and double-clicks reuse it; a new card after a decline is a new intent and gets a new key. The server still enforces uniqueness, so a misbehaving client cannot cause a double charge, only confusing errors.",
          },
          {
            id: "order-id",
            label: "Use the order id as the key",
            assessment: "flawed",
            feedback:
              "Too broad. After a decline the buyer tries another card, sends the same key, and the provider, honouring its contract, returns the cached decline. The buyer can never pay for this order through this path within 24 hours.",
          },
          {
            id: "order-and-attempt",
            label: "Server-derived: order id plus an attempt counter that increments only after a definitive failure",
            assessment: "sound",
            feedback:
              "This works without trusting the client: while an attempt is processing, every request maps to it; once it has definitively failed, the next request opens attempt n+1. The server must make that \"current attempt\" decision atomically, which is what the unique partial index on live attempts gives you.",
          },
          {
            id: "hash-of-request",
            label: "A hash of the request body: order, amount and payment token",
            assessment: "flawed",
            feedback:
              "Too narrow. Payment tokens are single-use, so a buyer who re-enters the same card after a timeout gets a new token, a new hash, and a second charge. A key must identify intent, not bytes.",
          },
        ],
        rationale: {
          prompt: "What must the key's scope be, and what goes wrong if it is wider or narrower?",
          rubric: [
            {
              id: "intent",
              text: "The key identifies one payment attempt: retries of it share the key, and a genuinely new attempt gets a new one.",
            },
            {
              id: "too-broad-narrow",
              text: "Explains a concrete failure of a key that is too broad (stuck on a cached decline) or too narrow (new key on retry, so a double charge).",
            },
            {
              id: "server-enforces",
              text: "The server's own uniqueness checks must not depend solely on the client behaving.",
              weight: "supporting",
            },
            {
              id: "retention",
              text: "Retries arriving after the provider's 24-hour retention would bypass its dedupe, so your own record must catch them.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          An idempotency key is a name for an **intent**, and getting its scope right is the whole problem. There are two ways to get it wrong:

          - **Too broad** turns new intents into replays. The buyer is stuck on a cached decline.
          - **Too narrow** turns replays into new intents. The buyer is charged twice.

          With money, too narrow is the dangerous direction; too broad is a support ticket.

          Note the 24-hour retention. A buyer whose browser retries a request from yesterday's tab will pass the provider's dedupe. Your own attempt row, keyed by the same value and retained indefinitely, is what catches it.
        `,
        otherwise:
          "Native mobile apps often prefer server-derived keys, because a reinstall or a crash can lose a client-generated key that was never persisted.",
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "webhooks-twice-and-late",
      title: "Webhooks arrive twice, and out of order",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["webhooks", "delivery-guarantees", "state-machines"],
      competencyIds: ["event-handling", "state-machine"],
      event: {
        kind: "failure",
        title: "The event log looks wrong",
        detail:
          "For one payment, `payment.succeeded` was delivered twice, 40 seconds apart. A `payment.processing` event for the same payment arrived after both. The current handler sent two receipts and left the attempt in processing.",
      },
      context: md`
        The provider's documentation says it all plainly: events can be delivered more than once, in any order, and your endpoint must respond within 10 seconds or the delivery is retried.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should the webhook receiver handle events?",
        options: [
          {
            id: "set-status",
            label: "Set the attempt's status to whatever the event says, then run the side effects for that status",
            assessment: "flawed",
            feedback:
              "This is the handler that produced the incident: the duplicate re-ran side effects (two receipts) and the late `processing` event moved a succeeded payment backwards.",
          },
          {
            id: "dedupe-forward",
            label: "Verify the signature, record the event id under a unique constraint, apply the transition only if it moves forward from the current state, and respond 200",
            assessment: "sound",
            feedback: md`
              Duplicates hit the unique event-ID constraint, or match zero rows in the forward-only transition. Late events cannot regress state. Side effects are not triggered by the *event* at all: they are outbox rows created by the *transition*, so they happen exactly when the state actually changes, once.
            `,
          },
          {
            id: "fetch-current",
            label: "Treat the event as a nudge: verify it, then fetch the payment's current state from the provider and apply that",
            assessment: "sound",
            feedback:
              "Ordering stops mattering, because you always apply the provider's latest view. The cost is one API call per webhook, trivial at 50 orders a minute but significant against a 100 requests/second limit at much larger scale. You still need forward-only transitions, because two fetches can race.",
          },
          {
            id: "do-it-all-inline",
            label: "Grant the enrollment and send the receipt inside the webhook request, then respond 200",
            assessment: "flawed",
            feedback:
              "Slow side effects risk the 10-second deadline, a missed deadline causes a redelivery, and the redelivery runs the side effects again. A failing email provider would also make the payment provider retry webhooks for three days.",
          },
        ],
        rationale: {
          prompt: "Explain how your handler stays correct under duplicates and reordering.",
          rubric: [
            {
              id: "dedupe",
              text: "Repeated events are deduplicated by event id, or the transition itself is idempotent.",
            },
            {
              id: "forward-only",
              text: "Out-of-order events cannot regress state, either through forward-only transitions or by fetching current state.",
            },
            {
              id: "effects-from-transition",
              text: "Side effects are triggered by the state transition, not by receiving the event, and run outside the webhook request.",
            },
            {
              id: "verify",
              text: "Signatures are verified so forged events cannot mark payments succeeded.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          A webhook is a **hint that something may have changed**, not a command to do something. Handling it means:

          1. Verify the signature and timestamp.
          2. \`INSERT INTO processed_events (event_id) … ON CONFLICT DO NOTHING\`; if it already exists, respond 200 and stop.
          3. Call \`applyTransition\`, the same function the API uses, in the same transaction.
          4. Respond 200 within milliseconds.

          The receipt duplication was not really a webhook bug. It was a **side effect attached to the wrong thing**. Attach effects to transitions, which happen once, rather than to messages, which can arrive any number of times; see [[webhooks]] and [[delivery-guarantees]].
        `,
        tradeoffs: [
          {
            choice: "Apply the event's payload",
            gains: "No extra API calls.",
            costs: "Must reason carefully about which transitions each event type may trigger.",
          },
          {
            choice: "Fetch current state on each event",
            gains: "Immune to ordering; simple handler logic.",
            costs: "An API call per event, which counts against rate limits at scale.",
          },
        ],
      },
      reveals: { components: ["webhooks"], flows: ["events", "apply-event"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "commit-then-crash",
      title: "The commit nobody acted on",
      phase: "break",
      dimensions: ["break", "explain"],
      conceptIds: ["transactional-outbox", "transactions", "idempotency"],
      competencyIds: ["atomicity"],
      event: {
        kind: "failure",
        title: "Paid, but no course",
        detail:
          "A buyer's attempt moved to succeeded. The process was killed by a deploy 20 ms later, before it called the enrollment service and the email provider. The buyer has a receipt from their bank and no access to the course.",
      },
      context: md`
        The payment state is right. What is missing is everything that was supposed to *follow* from it. The state change and the follow-up actions live in different systems.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should side effects follow a successful payment?",
        options: [
          {
            id: "after-commit-log",
            label: "Run them right after the commit; if one fails, log an error for an engineer",
            assessment: "flawed",
            feedback:
              "A deploy, an OOM kill or a crash between the commit and the call leaves no log line, because the process is gone. Nothing records that work is owed, so nothing ever does it.",
          },
          {
            id: "outbox",
            label: "In the same transaction as the transition, insert outbox rows; a worker processes them at least once with idempotent handlers",
            assessment: "sound",
            feedback: md`
              The transition and the obligation to act on it commit together, or not at all. A worker claims outbox rows, performs each effect, and marks it done; a crash means the row is retried. Handlers are idempotent: enrollment is an upsert on \`(user_id, course_id)\`, and the receipt carries an idempotency key derived from the attempt.
            `,
          },
          {
            id: "publish-after-commit",
            label: "Publish a payment-succeeded message to a queue after the commit",
            assessment: "flawed",
            feedback:
              "The same gap, moved: a crash between the commit and the publish loses the message. A queue is a fine *transport* for outbox rows, but something durable has to remember the message was owed until it is sent.",
          },
          {
            id: "two-phase",
            label: "Use a distributed transaction across Postgres, the enrollment service and the email provider",
            assessment: "flawed",
            feedback:
              "The email provider will not join your transaction, and an email cannot be rolled back once sent. Two-phase commit needs every participant's cooperation, and it would block your database whenever any of them is slow.",
          },
        ],
        rationale: {
          prompt: "Why does your approach guarantee the effects happen, and what does it require of them?",
          rubric: [
            {
              id: "dual-write",
              text: "The state change and the notification are writes to different systems; a crash between them loses one.",
            },
            {
              id: "same-tx",
              text: "Recording the obligation in the same transaction as the state change makes them atomic.",
            },
            {
              id: "idempotent-handlers",
              text: "Delivery from the outbox is at-least-once, so each effect must be idempotent.",
            },
            {
              id: "irreversible",
              text: "External effects like email cannot be rolled back, which is why they come after the commit, not inside it.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The [[transactional-outbox]] turns "do these things after the commit" into "**record that these things are owed, as part of the commit**". The worker then makes the record true, retrying until it is.

          The guarantee is *eventually, at least once*. That is why each handler has its own deduplication:

          - **Enrollment:** \`INSERT … ON CONFLICT (user_id, course_id) DO NOTHING\`.
          - **Receipt:** the email provider's idempotency key, set to \`receipt:{attempt_id}\`.

          Grant the course *before* sending the receipt in the worker's sequence, so the worst case of a crash is a buyer with access but no email. Ordering effects so that partial completion is the less harmful partial state is the same habit as in every other investigation.
        `,
      },
      reveals: { components: ["fulfillment", "email"], flows: ["outbox", "receipt"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "stuck-in-processing",
      title: "Thirty-seven payments stuck in processing",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["reconciliation", "timeouts", "webhooks"],
      competencyIds: ["reconciliation", "uncertain-outcomes"],
      event: {
        kind: "failure",
        title: "A webhook endpoint returned 500 for four days",
        detail:
          "A bad config change made signature verification fail. The provider retried for three days, then gave up. Thirty-seven attempts are still processing; some buyers have been charged, some have not.",
      },
      context: md`
        Every component behaved as designed: the provider retried as documented, your handler rejected what it could not verify, and the attempts stayed in \`processing\` instead of guessing. Now the system needs a way to finish what messages could not.
      `,
      interaction: {
        kind: "open",
        prompt: "Design the reconciliation process: what it looks for, how it decides each case, how it applies what it learns, and what it must never decide on its own.",
        placeholder: "Every few minutes, the reconciler…",
        rubric: [
          {
            id: "find-stuck",
            text: "Periodically finds attempts in processing older than a threshold and looks each up at the provider by its key or reference.",
          },
          {
            id: "same-transitions",
            text: "Applies the provider's authoritative state through the same conditional transitions as the API and webhooks, so they cannot conflict.",
          },
          {
            id: "undecidable",
            text: "Treats 'provider has no record' carefully: waits until no in-flight request could still land before failing it, and escalates true anomalies to a human.",
          },
          {
            id: "full-diff",
            text: "Also compares the daily settlement report with the ledger in both directions (charged but not recorded, recorded but not charged).",
            weight: "supporting",
          },
          {
            id: "alerting",
            text: "Alerts on the number and age of unresolved attempts, which would have caught the broken endpoint within hours.",
            weight: "supporting",
          },
        ],
        reference: md`
          **Targeted sweep, every few minutes:**

          \`\`\`sql
          SELECT * FROM payment_attempts
          WHERE status = 'processing' AND created_at < now() - interval '15 minutes';
          \`\`\`

          For each attempt, look it up at the provider by the idempotency key or the \`metadata.attempt\` reference:

          - **Succeeded or failed at the provider:** call \`applyTransition\` with \`cause: 'reconciliation'\`. If a webhook gets there first, one of them matches zero rows. No conflict is possible.
          - **Still processing at the provider** (for example, waiting on 3-D Secure): leave it; after a policy timeout, cancel it at the provider, then fail it here.
          - **No record at the provider:** the request may never have arrived, or may still be in flight. Once well past your own request timeout (minutes), it cannot land, so mark it failed with the reason "not received by provider". Because the provider remembers keys for 24 hours, a retry with the same key would still deduplicate even if you were wrong.

          **Daily full reconciliation:** compare the provider's settlement report with \`payment_events\`, in both directions. "Captured at provider, not succeeded here" and "succeeded here, not captured there" each go to a human queue with full context. These are the cases where something outside the design happened, such as manual dashboard actions or provider bugs.

          **Alerting:** the age of the oldest \`processing\` attempt is a single metric that would have paged someone on day one instead of day four. The reconciler's output is a report on the health of every other path; see [[reconciliation]].
        `,
      },
      reveal: {
        reasoning: md`
          Reconciliation is not an admission that the design failed. It is the part of the design that handles **the messages no design can guarantee**. Webhooks make resolution fast; reconciliation makes it certain.

          The essential property is that the reconciler has no special powers: it learns a fact from the source of truth and submits it through the same door as everyone else.
        `,
      },
      reveals: { components: ["reconciler"], flows: ["find-stuck", "lookup"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "refunds",
      title: "Adding refunds",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["idempotency", "state-machines", "transactional-outbox"],
      competencyIds: ["state-machine", "idempotency", "atomicity"],
      event: {
        kind: "requirement-change",
        title: "New requirement: admins can refund paid orders",
        detail:
          "Support needs a Refund button. A refunded buyer loses course access. Partial refunds are planned for later.",
      },
      context: md`
        A refund is money moving the other way, through the same provider, with the same latency and the same uncertainty.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should a refund be performed?",
        options: [
          {
            id: "status-first",
            label: "Set the attempt to refunded, revoke access, then call the provider's refund endpoint",
            assessment: "flawed",
            feedback:
              "If the provider call fails or times out, your records say the buyer was refunded when they were not. The state machine has moved on a hope rather than a fact.",
          },
          {
            id: "provider-then-status",
            label: "Call the provider's refund endpoint; if it returns success, set the attempt to refunded",
            assessment: "defensible",
            feedback:
              "The order is right, but there is no idempotency key, so an admin double-clicking or a retry after a timeout can issue two refunds, and nothing durable records that a refund may be in flight. It works most of the time, which is the most dangerous kind of payment code.",
          },
          {
            id: "refund-entity",
            label: "Record a refund request (its own row, key and state machine) in a transaction, call the provider with that key, and apply the outcome through the usual transitions",
            assessment: "sound",
            feedback:
              "A refund is a new money movement, so it gets the full treatment: a durable record before the call, an idempotency key, an unknown state, resolution by response, webhook or reconciliation, and access revocation as an outbox effect of the `succeeded → refunded` transition. Partial refunds later are just multiple refund rows.",
          },
          {
            id: "dashboard",
            label: "Have support refund in the provider's dashboard; the refund webhook updates your state",
            assessment: "defensible",
            feedback:
              "It works at low volume, and your webhook handling and reconciliation will catch it. But nothing in your system records who refunded or why, and access revocation now depends entirely on webhook delivery. It is a fine stopgap, but not a design.",
          },
        ],
        rationale: {
          prompt: "Why is your approach safe against retries and uncertainty?",
          rubric: [
            {
              id: "same-problem",
              text: "A refund has the same uncertainty as a charge: it needs its own record, idempotency key and unknown state.",
            },
            {
              id: "facts-only",
              text: "State changes to refunded only on a confirmed provider outcome.",
            },
            {
              id: "append",
              text: "History is appended (a refund event), never rewritten.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The design absorbed a new requirement by **reusing its own pattern**: new entity, key, conditional transitions, outbox effects, reconciliation. That is the test of whether a design captured the problem or just the first feature. Refunds did not need a new idea; they needed the old idea applied again.

          The ledger now tells the full story: \`processing → succeeded (evt_A) → refund requested (admin 14) → refunded (evt_B)\`.
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "second-provider-and-scale",
      title: "100x volume and a second provider",
      phase: "change",
      dimensions: ["change", "break"],
      conceptIds: ["rate-limiting", "retries-and-backoff", "idempotency", "timeouts"],
      competencyIds: ["uncertain-outcomes", "idempotency"],
      event: {
        kind: "scale",
        title: "International launch",
        detail:
          "Volume grows to 500,000 orders a day, with flash sales reaching 5,000 orders a minute. Some currencies must be routed to a second provider, B.",
      },
      context: md`
        The patterns hold. The question is what new pressure appears, and which tempting shortcuts would quietly break the guarantees.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold at the new scale?",
        claims: [
          {
            id: "rate-limit-binds",
            statement: "During flash sales, the provider's 100 requests/second limit becomes a real constraint.",
            verdict: "holds",
            explanation:
              "5,000 orders a minute is about 83 creates per second before any retries, lookups or refunds. You need a shared outbound limiter, queueing for non-interactive calls, and a conversation with the provider about raising the limit. See [[rate-limiting]].",
          },
          {
            id: "retry-storm",
            statement: "During a provider brownout, aggressive retries can make the outage worse for everyone.",
            verdict: "holds",
            explanation:
              "Retries multiply load exactly when the provider is least able to absorb it, and they consume your own rate limit. Use backoff with jitter, a retry budget, and a circuit breaker that stops sending new charges and shows buyers a clear message. See [[retries-and-backoff]].",
          },
          {
            id: "failover",
            statement: "If provider A times out, immediately retrying the charge with provider B is a safe failover.",
            verdict: "fails",
            explanation:
              "A's outcome is unknown: the buyer may already have been charged. Failing over without resolving it creates exactly the double charge the design exists to prevent. Each attempt is bound to one provider; a new attempt with B is only allowed once A's attempt is definitively failed or cancelled.",
          },
          {
            id: "distributed-tx",
            statement: "Supporting two providers requires a distributed transaction between them.",
            verdict: "fails",
            explanation:
              "Each attempt goes to exactly one provider, recorded on the attempt row along with its key. There is nothing to coordinate *between* providers, only per-attempt state, as before.",
          },
          {
            id: "postgres-bottleneck",
            statement: "Postgres becomes the first bottleneck at this volume.",
            verdict: "fails",
            explanation:
              "Peak is roughly 100-300 small writes per second across attempts, events and outbox rows, comfortably within one Postgres primary. The provider's rate limit binds long before your database does.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          At scale, the biggest risk is not throughput. It is **operational shortcuts that bypass uncertainty**: failing over on a timeout, retrying harder during an outage, or treating "slow" as "failed" to keep queues moving. Each is tempting during an incident, and each reintroduces double charges.

          The scalable additions are the boring ones: a shared outbound rate limiter, circuit breakers, per-provider routing recorded on the attempt, and reconciliation run separately for each provider.
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "defend-no-double-charge",
      title: "Defend the guarantee",
      phase: "defend",
      dimensions: ["defend", "explain"],
      conceptIds: ["idempotency", "state-machines", "reconciliation"],
      competencyIds: ["idempotency", "uncertain-outcomes", "reconciliation", "state-machine"],
      context: md`
        A new engineer joins the payments team and asks: "How do we *know* we can't double-charge? And is there any way we still could?"

        Answer in one page, the way you would in a design review or an interview.
      `,
      interaction: {
        kind: "open",
        prompt: "Explain why the system cannot double-charge, which mechanism covers each failure, and the residual risks it does not cover.",
        placeholder: "Every charge is tied to…",
        rubric: [
          {
            id: "key-before-call",
            text: "Every charge is made under an idempotency key belonging to an attempt that is durably recorded before the call.",
          },
          {
            id: "converge",
            text: "Duplicate requests, retries and events converge through unique constraints and conditional transitions.",
          },
          {
            id: "resolve-not-guess",
            text: "Unknown outcomes are resolved from the source of truth (webhooks, lookup, reconciliation), never guessed.",
          },
          {
            id: "residual",
            text: "Names residual risks honestly, e.g. retries after the provider's key retention, manual dashboard actions, failover to another provider, or a client generating new keys on retry.",
          },
          {
            id: "scope",
            text: "Distinguishes the guarantee (no double charge) from what is not guaranteed (instant resolution, emails exactly once).",
            weight: "supporting",
          },
        ],
        reference: md`
          **The mechanism.** A charge can only be created by the checkout handler, and only after it has inserted a \`payment_attempts\` row under a unique idempotency key. Every provider call for that attempt carries the same key. So:

          - **Double-clicks and client retries** hit the unique index: one request inserts, the others read the existing attempt.
          - **Retries after a timeout** reuse the attempt's key, so the provider returns the original result instead of charging again.
          - **Crashes at any point** leave a \`processing\` attempt, which webhooks or the reconciler resolve; nothing ever needs to "try again from scratch".
          - **Duplicate or late webhooks** cannot regress or repeat anything, because transitions are forward-only conditional updates and side effects hang off transitions via the outbox.

          **Residual risks**, stated honestly:

          - A client that generates a *new* key for what is really a retry is indistinguishable from a new attempt; the unique partial index on live attempts per order is the second line of defence.
          - A retry arriving more than 24 hours later passes the provider's dedupe; our own attempt row catches it only if it carries the same key.
          - Charges made outside the system (dashboard, scripts) bypass all of this. Daily reconciliation detects them after the fact.
          - Failing over to a second provider while the first is unresolved would break the guarantee. It is forbidden by design, and that rule needs defending in every incident review.

          **What is not guaranteed:** that the outcome is known immediately (it may take minutes), or that a receipt email is sent exactly once (it is sent at least once, deduplicated by the email provider where possible).
        `,
      },
      reveal: {
        reasoning: md`
          The strongest defence of a design names its own limits. "It can't double-charge" invites disbelief; "it can't double-charge through any path that goes through the attempt table, and here are the three paths that don't" invites trust, and tells the reader exactly where to look during an incident.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      The design never lets **a request** be the unit of reliability. Requests are duplicated, cut off and abandoned. The unit is the **attempt**: a durable row created atomically under an idempotency key *before* anything irreversible happens, carrying that key into every call that could move money.

      From there, every source of information (the synchronous response, webhooks, reconciliation) feeds the same forward-only, conditional transitions. They can arrive in any order, any number of times, and the state still converges on what the provider knows. Side effects are recorded in the same transaction as the transitions that cause them, so they happen at least once and are deduplicated where they land.

      Uncertainty is a first-class state. The system never guesses whether a timed-out charge succeeded; it waits to be told, and reconciliation guarantees that it eventually is.
    `,
    reliesOn: [
      "The provider honours idempotency keys for 24 hours and allows lookup by your reference.",
      "Clients reuse the same key when retrying the same attempt.",
      "All money movement goes through the attempt table; dashboard actions are caught only by reconciliation.",
      "Postgres is available for claims and transitions. When it is down, checkout fails closed rather than charging unrecorded.",
      "Fulfillment handlers are idempotent.",
    ],
    alternatives: [
      {
        design: "Fully asynchronous charging through a job queue",
        preferWhen: "Charges are off-session (renewals, payouts) and nobody is waiting at a checkout page.",
      },
      {
        design: "Provider-hosted checkout pages with webhook-only integration",
        preferWhen:
          "You want the smallest possible payment surface: the provider owns the payment UI and retries, and you own only webhook handling and reconciliation.",
      },
      {
        design: "Workflow engine (Temporal, Step Functions) orchestrating each payment",
        preferWhen: "Payments involve many steps, timers and human approvals, such as marketplaces with escrow and payouts.",
      },
    ],
    tradeoffs: [
      {
        choice: "Bounded synchronous wait plus a processing state",
        gains: "Immediate answers for most buyers; correctness for the rest.",
        costs: "Two resolution paths and a status page to build.",
      },
      {
        choice: "Attempts plus an append-only ledger",
        gains: "Per-attempt idempotency, auditability, room for refunds and retries.",
        costs: "More schema, and derived order status.",
      },
      {
        choice: "Transactional outbox for side effects",
        gains: "No lost enrollments or receipts after crashes.",
        costs: "A worker to run, and idempotency required in every handler.",
      },
      {
        choice: "Reconciliation as a permanent component",
        gains: "Certainty that every attempt resolves; early detection of broken paths.",
        costs: "Ongoing API usage, and a human queue for true anomalies.",
      },
    ],
    breaksWhen: [
      "Clients generate a new idempotency key for every retry, turning retries into new attempts.",
      "Engineers fail over to another provider, or mark attempts failed, while outcomes are still unknown.",
      "Money moves outside the system (dashboard refunds, scripts) faster than reconciliation catches it.",
      "Provider idempotency semantics differ from the assumed contract, for example keys scoped per API version or retained for a shorter time.",
    ],
  },
  interviewVariants: [
    "Design a payment system for an e-commerce checkout.",
    "How do you make an API endpoint idempotent?",
    "Your service called a payment API and the request timed out. What do you do?",
    "Design a wallet or ledger service that must never lose or duplicate money.",
    "How would you handle webhooks from Stripe reliably?",
  ],
  relatedInvestigationIds: ["video-processing-pipeline", "realtime-collaboration"],
} satisfies InvestigationInput;
