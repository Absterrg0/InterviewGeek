import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const rateLimiter = {
  id: "api-rate-limiter",
  title: "Rate limiting a public API",
  searchTitle: "Design an API Rate Limiter",
  premise:
    "A public API must hold every customer to their plan across thirty stateless servers, absorb honest bursts, stop abuse, and never let the limiter itself become the outage.",
  difficulty: "intermediate",
  estimatedMinutes: 40,
  scenario: md`
    You run the public REST API of a developer platform. Customers authenticate with API keys and buy plans: **Free** at 60 requests a minute, **Pro** at 600, and **Enterprise** at whatever sales negotiated. Last month a Pro customer shipped a client with a tight retry loop, and the flood of requests pinned the primary database for forty minutes. Every customer was affected.

    The API runs as 20-60 stateless instances behind a load balancer that cannot do custom limiting. A Redis cluster is available in the same region. Your task is a rate limiter that the business can trust and customers can understand.
  `,
  objectives: [
    "Choose a limiting algorithm from how good and bad traffic actually behave.",
    "Keep a shared limit correct when thirty processes update it concurrently.",
    "Decide what happens when the limiter's own dependency fails.",
    "Handle hot keys and adversaries that the simple design does not anticipate.",
    "Limit by cost when requests are not equally expensive.",
  ],
  prerequisites: ["rate-limiting", "concurrency-control"],
  requirements: {
    functional: [
      "Enforce per-API-key limits according to each customer's plan.",
      "Reject over-limit requests with 429, a Retry-After header, and remaining-quota headers.",
      "Apply stricter limits to the login endpoint, per IP and per account.",
      "Change a customer's plan without a deploy.",
    ],
    nonFunctional: [
      "The limiter adds under 2 ms at p99.",
      "A client sending at twice its limit is held near its limit, not allowed thirty times it by the fleet.",
      "If the limiter's state store fails, the API stays up.",
      "Honest bursts, such as a dashboard firing 20 requests on load, are not punished.",
    ],
  },
  constraints: [
    "20-60 API instances (autoscaled), about 40,000 requests a second at peak across ~50,000 active keys.",
    "Redis cluster in-region with ~0.3 ms round trips.",
    "The API's p99 latency budget is 150 ms; the primary database is the resource being protected.",
  ],
  assumptions: [
    "Authenticated requests carry an API key; unauthenticated ones can only be identified by IP.",
    "IPs are shared (corporate NAT, mobile carriers) and can be rotated by attackers.",
    "Instance clocks are NTP-synchronized to within milliseconds but can still disagree.",
  ],
  competencies: [
    { id: "algorithm", label: "Choosing the algorithm", description: "Bursts, sustained rates, memory and precision." },
    { id: "shared-state", label: "Shared counters", description: "Correct read-modify-write across many processes." },
    { id: "limiter-failure", label: "When the limiter fails", description: "Fail open, fail closed, and degrading gracefully." },
    { id: "hot-keys", label: "Hot keys and cost", description: "Limits that hold for the largest customer and the most expensive request." },
    { id: "adversaries", label: "Adversarial traffic", description: "Abuse that does not look like one heavy client." },
  ],
  system: {
    components: [
      { id: "clients", label: "API clients", kind: "client", responsibility: "Customer integrations, scripts and dashboards.", position: { col: 0, row: 1 } },
      { id: "lb", label: "Load balancer", kind: "edge", responsibility: "Spreads requests across instances; no custom limiting.", position: { col: 1, row: 1 } },
      {
        id: "api",
        label: "API instances",
        kind: "service",
        responsibility:
          "Authenticate the key, check the limit with one atomic Redis call, then handle or reject with 429 and Retry-After. Fall back to local buckets if Redis is unavailable.",
        position: { col: 2, row: 1 },
      },
      {
        id: "redis",
        label: "Redis",
        kind: "cache",
        responsibility: "Token buckets per key, updated by an atomic script; expire when idle.",
        durableState: "None that matters: buckets rebuild as full after a loss.",
        position: { col: 3, row: 0 },
      },
      {
        id: "postgres",
        label: "Postgres",
        kind: "database",
        responsibility: "API keys and plans; the resource the limiter protects.",
        durableState: "keys, plans, per-key overrides",
        position: { col: 3, row: 1 },
      },
      {
        id: "search",
        label: "Search cluster",
        kind: "service",
        responsibility: "Expensive queries whose cost varies by three orders of magnitude.",
        position: { col: 3, row: 2 },
      },
    ],
    flows: [
      { id: "requests", from: "clients", to: "lb", label: "Requests with API key", kind: "request" },
      { id: "balance", from: "lb", to: "api", label: "Round-robin across instances", kind: "request" },
      { id: "check", from: "api", to: "redis", label: "Atomic take-tokens script", kind: "request" },
      { id: "queries", from: "api", to: "postgres", label: "Admitted requests; plan lookups (cached)", kind: "request" },
      { id: "search-queries", from: "api", to: "search", label: "Admitted searches, cost-weighted", kind: "request" },
    ],
    invariants: [
      {
        id: "fleet-wide-limit",
        statement: "A key's admitted rate stays near its plan regardless of how many instances serve it.",
        enforcedBy: ["redis", "api"],
        mechanism: "One shared bucket per key, updated by a single atomic script that reads, refills and takes tokens in one step using Redis's clock.",
      },
      {
        id: "limiter-not-outage",
        statement: "A Redis failure degrades limiting precision, never API availability.",
        enforcedBy: ["api"],
        mechanism: "A short timeout on the limit check, then local per-instance buckets sized to the plan divided by the instance count.",
      },
      {
        id: "explainable-rejections",
        statement: "Every rejection tells the client when it may retry.",
        enforcedBy: ["api"],
        mechanism: "429 responses carry Retry-After computed from the bucket's deficit and refill rate.",
      },
    ],
  },
  stages: [
    {
      id: "numbers-first",
      title: "What the numbers say",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["rate-limiting", "backpressure"],
      competencyIds: ["algorithm", "shared-state"],
      context: md`
        Thirty instances, 40,000 requests a second, plans measured per minute. Before choosing a design, check which simple ideas the arithmetic already rules out.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A rate limit is a promise per key: "this API key gets 600 requests a minute". The hard part is that the key's requests don't arrive at one place. The load balancer spreads them round-robin over every instance, so with 30 instances each one sees about **1/30th** of any key's traffic.
          `,
        },
        {
          kind: "estimate",
          id: "per-instance-share",
          prompt: "A Pro key sends 600 requests a minute, spread evenly over 30 instances. About how many of them does one instance see per minute?",
          answer: 20,
          unit: "per minute",
          working: md`
            600 ÷ 30 = **20 a minute** per instance.

            So an instance that counts only its own traffic sees 20 requests from a key that is already at its limit. It has no way to tell, from what it sees, that the key is at 600 fleet-wide.
          `,
        },
        {
          kind: "read",
          body: md`
            The simplest limiter counts requests per key in fixed calendar windows: "requests in 12:00:00–12:00:59". At the start of each minute the counter resets to zero.

            That counts an **average over the window**. It says nothing about how the requests are spread inside the window, or across the boundary between two windows.
          `,
        },
        {
          kind: "predict",
          id: "boundary",
          prompt: "Limit: 60 per calendar minute. A client sends 60 requests at 12:00:59 and 60 more at 12:01:00. What does a fixed-window counter do?",
          answer: md`
            It admits all 120. The first 60 land in the 12:00 window, which still had room; the next 60 land in a fresh 12:01 window that just reset to zero.

            120 requests in about one second, from a client "limited" to 60 a minute.
          `,
        },
        {
          kind: "read",
          body: md`
            Two numbers to keep in mind for anything on the request path:

            | Operation | Rough cost |
            | --- | --- |
            | Redis round trip in the same region | ~0.3 ms |
            | Simple Redis operations, one shard | ~100,000 per second |
            | This API's latency budget for the limiter | 2 ms at p99 |

            A check that touches shared state on every request is affordable here. The question is what happens to every request when that shared state is slow or gone.
          `,
        },
        {
          kind: "choice",
          id: "shared-state-cost",
          prompt: "Every request now makes one Redis call. Which concern is the real one?",
          options: [
            {
              id: "throughput",
              label: "Redis can't handle 40,000 operations a second.",
              why: "One shard does around 100,000 simple operations a second, and a cluster spreads keys over several shards. Throughput is comfortably within range.",
            },
            {
              id: "critical-path",
              label: "Redis is now on the path of every request, so its latency and failures become the API's.",
              correct: true,
              why: "Before, a Redis problem was a Redis problem. Now every request waits for it. That is the design question the rest of this investigation keeps returning to.",
            },
            {
              id: "memory",
              label: "Storing state for 50,000 keys uses too much memory.",
              why: "A counter or bucket is a few dozen bytes. 50,000 of them is a few megabytes.",
            },
          ],
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "per-instance",
            statement: "If each of 30 instances enforces 600 requests/minute per key in its own memory, a Pro customer can make up to 18,000 requests a minute.",
            verdict: "holds",
            explanation:
              "The load balancer spreads the customer's requests over every instance, and each instance gives them a full allowance. The effective limit scales with the fleet, and autoscaling makes it move.",
          },
          {
            id: "fixed-window-burst",
            statement: "A fixed one-minute window with a limit of 60 can admit 120 requests within two seconds.",
            verdict: "holds",
            explanation:
              "60 in the last second of one window, 60 in the first second of the next. Fixed windows enforce an average over the window, not a maximum over any interval.",
          },
          {
            id: "redis-load",
            statement: "Checking every request against Redis means about 40,000 Redis operations a second, which is a problem.",
            verdict: "depends",
            explanation:
              "A single Redis shard handles on the order of 100,000 simple operations a second, and a cluster spreads keys over shards, so throughput is fine. What matters is that Redis is now on the **critical path** of every request: its latency and availability become the API's. That is the real design question.",
          },
          {
            id: "ip-enough",
            statement: "Limiting by client IP is sufficient for the authenticated API.",
            verdict: "fails",
            explanation:
              "One corporate NAT can hide hundreds of honest developers behind one IP, while one customer can spread a script across many machines. The plan belongs to the API key, so the limit must too. IP limits are for traffic with no better identity, such as login.",
          },
          {
            id: "exactness",
            statement: "The limiter must be exact: admitting the 601st request in a minute is a bug.",
            verdict: "depends",
            explanation:
              "Plans are commercial promises, and protecting the database is an engineering goal. Neither is harmed by a few percent of imprecision. Insisting on exactness costs coordination and latency on every request; a limiter that is approximately right and always fast is usually the better product.",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Per-instance limits multiply by the number of instances, so a fleet-wide limit needs shared state.",
          "Fixed windows enforce an average per window and allow double bursts at the boundary.",
          "Shared state on every request puts its latency and availability on the API's critical path.",
        ],
        reasoning: md`
          Two conclusions shape everything after this:

          - **The state must be shared.** Per-instance limits multiply by the fleet size, so a key's counter has to live in one place every instance consults, or be split deliberately.
          - **The shared state is now on the hot path.** Every request waits for it, so its latency budget is the 2 ms requirement and its failure mode is the API's failure mode, unless you design otherwise.

          And one framing: rate limiting is a [[backpressure]] mechanism. It turns "more load than the database can take" into "a clear signal to the client that sent it".
        `,
      },
    },
    {
      id: "choose-the-algorithm",
      title: "Choose the algorithm",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["rate-limiting"],
      competencyIds: ["algorithm"],
      context: md`
        Good clients are bursty: a dashboard loads and fires 20 requests at once, then nothing for a minute. Bad clients are sustained: a loop that never stops. You want to allow the first and stop the second, with little memory per key across ~50,000 keys.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            There are four common rate-limiting algorithms. They differ in what they remember per key:

            | Algorithm | State per key | Enforces |
            | --- | --- | --- |
            | Fixed window | one counter | N per calendar window |
            | Sliding log | every accepted timestamp | N in any window-length span |
            | Sliding window counter | two counters | an estimate of N in the last window |
            | Token bucket | tokens and a timestamp | a burst of B, then a steady rate r |
          `,
        },
        {
          kind: "simulation",
          simulation: "rate-limit-windows",
          body: md`
            Try each pattern below. Watch the **most in any 10 s** figure for each algorithm: that is how much traffic the limiter really lets through in a short span, whatever the plan says.
          `,
        },
        {
          kind: "choice",
          id: "what-boundary-shows",
          prompt: "With the burst at the boundary, which algorithm lets through twice the limit in under four seconds?",
          options: [
            {
              id: "fixed",
              label: "Fixed window",
              correct: true,
              why: "Five requests fall at the end of the first window and five at the start of the second. Each window sees only five, so all ten pass.",
            },
            {
              id: "log",
              label: "Sliding log",
              why: "The sliding log counts accepted requests in the last 10 seconds from each request's own time, so it never lets more than five through in any 10-second span.",
            },
            {
              id: "bucket",
              label: "Token bucket",
              why: "The bucket holds five tokens and refills one every two seconds. The first five drain it, and only refilled tokens let more through.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            A **token bucket** has two parameters. The capacity *B* is how big a burst the key may send at once. The refill rate *r* is the sustained rate. Each request takes a token; tokens refill continuously at *r* up to *B*.

            When the bucket is empty, the time until the next token is \`(1 − tokens) ÷ r\`. That number is what a rejection can send back as \`Retry-After\`.
          `,
        },
        {
          kind: "estimate",
          id: "log-memory",
          prompt: "A sliding log stores one 8-byte timestamp per accepted request. An Enterprise key allowed 100,000 requests a minute keeps how many kilobytes of timestamps?",
          answer: 800,
          unit: "KB",
          working: md`
            100,000 × 8 bytes = 800,000 bytes ≈ **800 KB** for one key, rewritten as it slides.

            A token bucket for the same key is two numbers, about 16 bytes. Sliding logs are exact, but their memory grows with the limit, and the biggest limits belong to the busiest keys.
          `,
        },
        {
          kind: "choice",
          id: "dashboard",
          prompt: "An honest dashboard fires 20 requests on page load, then nothing for a minute. The plan is 600 a minute. Under a token bucket with r = 10/s, what decides whether the dashboard gets 429s?",
          options: [
            {
              id: "capacity",
              label: "The capacity B: if B is at least 20, the burst fits.",
              correct: true,
              why: "A full bucket absorbs a burst up to B at once. The rate r only matters once the bucket is empty.",
            },
            {
              id: "rate",
              label: "The rate r: 20 requests is more than 10 a second.",
              why: "The rate limits sustained traffic. A burst is served from tokens already in the bucket, so a full bucket of 20 or more lets all 20 through immediately.",
            },
            {
              id: "minute",
              label: "Nothing: 20 is under 600, so it always passes.",
              why: "A token bucket doesn't count per minute. With B = 5, the sixth request would be rejected even though the minute's total is tiny.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "Which algorithm should enforce plan limits?",
        options: [
          {
            id: "fixed-window",
            label: "Fixed window: count requests per key per calendar minute",
            assessment: "defensible",
            feedback:
              "One counter per key and trivially cheap, which is why many systems start here. But it allows double-rate bursts at window boundaries, and every client's allowance resets at the same instant, which synchronizes retrying clients into a spike at the top of each minute.",
          },
          {
            id: "sliding-log",
            label: "Sliding log: store every request's timestamp and count those in the last 60 s",
            assessment: "defensible",
            feedback:
              "Exact over any interval, but memory grows with the limit: an Enterprise key at 100,000 a minute keeps 100,000 timestamps. Precise where precision is not required, and expensive where you have the most traffic.",
          },
          {
            id: "token-bucket",
            label: "Token bucket: capacity B for bursts, refilling at the plan's rate",
            assessment: "sound",
            feedback: md`
              Two numbers per key (tokens and last-refill time) express exactly what the requirements say: allow a burst up to *B*, then hold the client to the sustained rate *r*. A dashboard's 20-request burst fits in the bucket; a loop drains it and then gets *r* per second. Retry-After falls out of the arithmetic: the deficit divided by *r*.
            `,
          },
          {
            id: "concurrency-only",
            label: "Limit concurrent in-flight requests per key instead of rate",
            assessment: "defensible",
            feedback:
              "Concurrency limits are excellent at protecting a backend from slow, expensive work, and you will want one later. But plans are sold as requests per minute, and a client making fast requests one at a time can still exceed its plan many times over.",
          },
        ],
        rationale: {
          prompt: "Why does this algorithm fit both the honest bursts and the abusive loop?",
          rubric: [
            { id: "burst-sustained", text: "Separates burst allowance from sustained rate, so short bursts pass and long ones are held to the plan." },
            { id: "memory", text: "Considers memory per key: constant state vs. state that grows with the limit." },
            { id: "boundary", text: "Recognizes the fixed window's boundary effect or synchronized resets.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "A token bucket separates the burst a key may send (capacity B) from the rate it may sustain (refill r).",
          "Sliding logs are exact but store state proportional to the limit; buckets store two numbers.",
          "Fixed windows are cheap but admit double bursts at boundaries and reset everyone at the same instant.",
        ],
        reasoning: md`
          A token bucket encodes a **contract**: "you may burst up to *B*, and sustain *r*". For Pro, *r* = 10/s and *B* = 50 might be right: a dashboard's burst passes, while a loop gets 10 a second, which is 600 a minute as sold.

          *B* is a product decision dressed up as a parameter. Too small and well-behaved clients get 429s on page load; too large and an abusive client gets a big free burst every time it pauses. Pick it from observed honest bursts, not from the plan.
        `,
        tradeoffs: [
          { choice: "Token bucket", gains: "Constant memory; bursts and sustained rate both expressed.", costs: "Two parameters to tune; harder to explain than 'N per minute'." },
        ],
      },
    },
    {
      id: "where-the-count-lives",
      title: "Where does the count live?",
      phase: "decide",
      dimensions: ["defend"],
      conceptIds: ["rate-limiting", "partitioning", "concurrency-control"],
      competencyIds: ["shared-state"],
      context: md`
        Thirty instances, autoscaling between 20 and 60, round-robin load balancing. Every instance must agree, closely enough, on how many tokens each key has left.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Wherever the bucket lives, three properties matter:

            - **Shared:** every instance must consult the same bucket for a key, or the limit multiplies by the number of instances.
            - **Fast:** the check runs on every request, inside a 2 ms budget.
            - **Atomic:** many instances update the same key at the same moment, so the read-refill-take-write sequence must not interleave.

            Durability matters much less. If bucket state is lost, buckets start full, which briefly admits a little extra traffic.
          `,
        },
        {
          kind: "choice",
          id: "lost-state",
          prompt: "The store holding every token bucket loses all its data. What happens?",
          options: [
            {
              id: "full",
              label: "Every key gets a full bucket again: a short burst of extra traffic, then normal limiting.",
              correct: true,
              why: "A missing bucket is treated as a full one. The worst case is one extra burst of B per key. That is why rate-limit state is a good fit for an in-memory store without strong durability.",
            },
            {
              id: "blocked",
              label: "Every key is blocked until the counts are rebuilt.",
              why: "There is nothing to rebuild: the bucket's job is to remember recent usage. Starting full is a safe default.",
            },
            {
              id: "billing",
              label: "Customers are billed incorrectly.",
              why: "A limiter is not a meter. If you bill by usage, count it separately in durable storage.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Consider where else the count could live:

            - **Each instance's memory** costs nothing, but it isn't shared.
            - **Sticky routing**, sending every request for a key to one instance, makes local memory shared again. It needs a load balancer that can route by key, and every scale event moves keys between instances.
            - **The primary database** is shared and durable, but every request would write to the very database the limiter exists to protect.
            - **Redis** is shared, about 0.3 ms away, and can run a small script atomically.
          `,
        },
        {
          kind: "predict",
          id: "postgres-hot-row",
          prompt: "If the bucket were a Postgres row updated in a transaction, what happens when one key receives 500 requests a second from 30 instances?",
          answer: md`
            500 transactions a second all try to lock the **same row**. They queue behind each other on the row lock, latency climbs, and the primary database (the thing being protected) spends its capacity on limiter writes.

            The limiter turns a traffic spike into exactly the database overload it was supposed to prevent.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "Where should token buckets live?",
        options: [
          {
            id: "local-memory",
            label: "In each instance's memory",
            assessment: "flawed",
            feedback: "Zero latency and the wrong answer: as the first stage showed, the effective limit becomes the plan times the instance count, and it changes as the fleet scales.",
          },
          {
            id: "sticky-routing",
            label: "Route each key to one instance (consistent hashing) and keep its bucket there",
            assessment: "defensible",
            feedback:
              "Correct while the fleet is stable, with no network hop. But the load balancer cannot do it, every scale event reshuffles keys and resets their buckets, and the largest customer's traffic all lands on one instance. It is a good design for a gateway built for it, and an awkward one here.",
          },
          {
            id: "redis-atomic",
            label: "In Redis, updated by one atomic script per request",
            assessment: "sound",
            feedback:
              "One bucket per key, shared by every instance, updated in a single round trip (~0.3 ms). The script reads, refills, takes and writes as one atomic step, so concurrent requests from thirty instances cannot interleave. Redis is now on the critical path, which the failure stage deals with.",
          },
          {
            id: "postgres-row",
            label: "In a Postgres row per key, updated in a transaction",
            assessment: "flawed",
            feedback:
              "Every request now writes to the very database you are protecting, and the hottest keys become lock-contended rows. The limiter becomes the overload it was meant to prevent.",
          },
        ],
        rationale: {
          prompt: "Why is this the right home for the counters?",
          rubric: [
            { id: "shared", text: "All instances must see one counter per key, or the limit multiplies." },
            { id: "atomic", text: "Updates must be atomic, because many instances modify the same key concurrently." },
            { id: "critical-path", text: "Notes the new dependency on the request path and its latency budget.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Rate-limit state must be shared across instances and updated atomically, but it doesn't need to be durable.",
          "Losing a bucket means it starts full: a short burst of extra admissions, not an outage.",
          "Keeping counters in the database you are protecting turns the limiter into a source of load.",
        ],
        reasoning: md`
          Rate-limit state is unusually forgiving: losing it means buckets start full, which briefly admits a little extra traffic. That makes an in-memory store like Redis a good fit: fast, shared, and without durability that nobody needs. See [[soft-state]].

          What is not forgiving is **concurrency**. Thirty instances touching the same key at the same moment is the normal case, and the next stage is what happens when the update is not atomic.
        `,
      },
      reveals: { components: ["redis"], flows: ["check"] },
    },
    {
      id: "the-leaky-limiter",
      title: "The limiter that leaks",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["concurrency-control", "rate-limiting", "retries-and-backoff"],
      competencyIds: ["shared-state"],
      event: {
        kind: "failure",
        title: "A Free customer made 4,000 requests in one minute",
        detail: "Their limit is 60. Monitoring shows their requests spread evenly over all 30 instances. This is the limiter that let it happen.",
      },
      context: md`
        The buckets are in Redis, as decided. The logic is a direct translation of the token bucket. Find the lines that let a 60/minute key make 4,000 requests, and the line that made the incident worse.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A **read-modify-write** reads a value, computes a new one, and writes it back. If it takes two round trips (a \`GET\`, then a \`SET\`), other clients can read the same old value in between.

            Each of them computes its own update from the same starting point, and the last write wins. The other updates are **lost**.
          `,
        },
        {
          kind: "choice",
          id: "lost-update",
          prompt: "A bucket holds 1 token. Three instances each GET it at the same moment, see 1 token, allow their request and SET the bucket to 0. How many requests were admitted, and how many tokens were spent?",
          options: [
            {
              id: "three-one",
              label: "Three admitted, one token spent.",
              correct: true,
              why: "All three acted on the same stale read. Three SETs of 0 leave the bucket at 0, as if one request had run. Across 30 instances this is how a 60-a-minute key makes thousands of requests.",
            },
            {
              id: "one-one",
              label: "One admitted; Redis rejects the other two writes.",
              why: "A plain SET doesn't check what was there before. It overwrites whatever value is stored.",
            },
            {
              id: "three-three",
              label: "Three admitted, three tokens spent: the bucket goes to −2.",
              why: "Each instance writes the value it computed (0), not a decrement of the current value. The decrements don't accumulate.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Two more details decide whether a limiter behaves:

            - **Whose clock?** Refilling needs "seconds since the last refill". If each instance uses its own clock, one running ahead refills tokens that were never earned. One clock for every caller fixes that, for example the store's own clock.
            - **What does a rejection say?** Most HTTP clients retry failed requests. A 429 with no hint about when to come back is usually retried at once, so every rejection produces another request.
          `,
        },
        {
          kind: "predict",
          id: "retry-amplification",
          prompt: "A client retries every failed request immediately, and its limiter rejects 90% of its requests. What happens to the number of requests the limiter has to handle?",
          answer: md`
            It multiplies. Each rejected request comes straight back, and most of those are rejected again. A client that wanted 100 requests can generate around 1,000 attempts.

            A \`Retry-After\` header tells well-behaved clients how long to wait, which turns a retry storm into a pause.
          `,
        },
      ],
      interaction: {
        kind: "diagnosis",
        prompt: "Select the faulty lines.",
        artifact: {
          type: "code",
          language: "typescript",
          caption: "limit.ts",
          lines: [
            { text: "async function allow(key: string, plan: Plan): Promise<boolean> {" },
            { text: "  const raw = await redis.get(`rl:${key}`);" },
            { text: "  const state = raw ? JSON.parse(raw) : { tokens: plan.burst, ts: Date.now() };" },
            {
              text: "  const elapsed = (Date.now() - state.ts) / 1000;",
              fault:
                "Each instance uses its own clock. An instance whose clock runs ahead computes extra elapsed time and refills tokens that do not exist. Use one clock: Redis's TIME, inside the script.",
            },
            { text: "  const tokens = Math.min(plan.burst, state.tokens + elapsed * plan.perSecond);" },
            {
              text: "  if (tokens < 1) return false;",
              fault:
                "The rejection carries no Retry-After. The customer's client, like most, retried immediately, so every 429 caused another request. Rejections must tell clients when capacity returns.",
            },
            {
              text: "  await redis.set(`rl:${key}`, JSON.stringify({ tokens: tokens - 1, ts: Date.now() }));",
              fault:
                "Read-modify-write across two round trips. Thirty instances read the same state, each subtracts one, and each writes back: 30 requests cost one token. The whole update must be one atomic operation (a Lua script), and the key needs a TTL so idle keys disappear.",
            },
            { text: "  return true;" },
            { text: "}" },
          ],
        },
        rationale: {
          prompt: "Explain how 60 became 4,000, and what the fix guarantees.",
          rubric: [
            { id: "lost-updates", text: "Concurrent read-modify-write from many instances loses updates, so many requests share one token." },
            { id: "atomic", text: "The fix is a single atomic operation on the server (script or transaction), not a check in application code." },
            { id: "one-clock", text: "Refill time must come from one clock, not each instance's." },
            { id: "retry-after", text: "429s without Retry-After invite immediate retries that amplify the load.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "A read-modify-write in two round trips lets concurrent callers act on the same stale value: updates are lost.",
          "Move the whole decision into one atomic operation next to the data, using one clock.",
          "Rejections without Retry-After invite immediate retries that multiply the load.",
        ],
        reasoning: md`
          The token-bucket arithmetic was correct; the **concurrency** was not. "Read the counter, decide, write the counter" is the check-then-act pattern from every other investigation, and it breaks the same way here: two readers act on the same stale value. See [[concurrency-control]].

          The fix moves the whole decision into Redis, where a Lua script runs atomically with respect to other commands on that shard. That makes it one round trip, one clock and one consistent answer.
        `,
      },
    },
    {
      id: "write-the-script",
      title: "Write the atomic bucket",
      phase: "break",
      dimensions: ["implement"],
      conceptIds: ["rate-limiting", "concurrency-control", "soft-state"],
      competencyIds: ["shared-state", "algorithm"],
      context: md`
        Write the Redis-side logic (Lua, or pseudo-code for "runs atomically on the server") that refills, takes tokens and reports the result, plus the caller that sets the response headers.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Redis runs a **Lua script** as one atomic step: no other command on that shard runs while the script is running. So a script can read a bucket, refill it, take tokens and write it back without anyone else seeing it half-updated.

            Inside a script, \`redis.call('TIME')\` returns the server's clock as seconds and microseconds. Every instance that calls the script shares that one clock.
          `,
        },
        {
          kind: "read",
          body: md`
            The refill arithmetic, for a bucket with capacity \`capacity\` and refill \`rate\` tokens per second:

            \`\`\`
            tokens = min(capacity, tokens + (now − last) × rate)
            \`\`\`

            If \`tokens ≥ cost\`, subtract the cost and allow. Otherwise reject, and the wait until enough tokens exist is \`(cost − tokens) ÷ rate\`.
          `,
        },
        {
          kind: "estimate",
          id: "retry-after",
          prompt: "A bucket refills at 10 tokens a second and holds 0.4 tokens. A request costs 1. How many seconds until it can be admitted?",
          answer: 0.06,
          unit: "seconds",
          working: md`
            (1 − 0.4) ÷ 10 = **0.06 seconds**. As a \`Retry-After\` header, round up to whole seconds: 1.
          `,
        },
        {
          kind: "choice",
          id: "ttl",
          prompt: "Why give each bucket key an expiry (TTL)?",
          options: [
            {
              id: "idle",
              label: "So idle keys disappear; a missing bucket is just a full one.",
              correct: true,
              why: "After capacity ÷ rate seconds without requests, a bucket is full again. Deleting it then loses nothing and keeps memory proportional to active keys.",
            },
            {
              id: "reset",
              label: "To reset every key's limit once a minute.",
              why: "That would turn the bucket back into a fixed window. The refill arithmetic already handles time passing.",
            },
            {
              id: "security",
              label: "So attackers can't fill Redis with keys.",
              why: "Expiry does help bound memory, but the main reason is that an idle bucket carries no information worth keeping.",
            },
          ],
        },
        {
          kind: "choice",
          id: "lua-numbers",
          prompt: "Redis converts Lua numbers to integers when a script returns them. A bucket holds 4.7 tokens. What should the script return?",
          options: [
            {
              id: "string",
              label: "The value as a string, parsed by the caller.",
              correct: true,
              why: "Strings pass through unchanged, so fractional tokens and wait times survive. Returning the raw number would truncate 4.7 to 4 and 0.06 seconds to 0.",
            },
            {
              id: "round",
              label: "Round it first, so nothing is lost.",
              why: "Rounding still loses the fraction. A wait of 0.06 s would become 0, and the caller would tell the client to retry immediately.",
            },
            {
              id: "nothing",
              label: "Nothing special; Lua numbers come back as floats.",
              why: "They don't: Redis converts Lua numbers to integer replies, silently dropping the fraction.",
            },
          ],
        },
      ],
      interaction: {
        kind: "implementation",
        prompt: "Implement an atomic token bucket and its caller.",
        language: "lua / typescript",
        starter: md`
          -- KEYS[1]: bucket key   ARGV[1]: capacity   ARGV[2]: refill per second   ARGV[3]: cost
          -- Return: allowed (0/1), tokens remaining, seconds until enough tokens

          // Caller (TypeScript)
          async function checkLimit(key: string, plan: Plan, cost = 1) {
            // run the script; set X-RateLimit-Remaining and Retry-After
          }
        `,
        rubric: [
          { id: "single-script", text: "Read, refill, take and write happen in one server-side atomic script." },
          { id: "server-clock", text: "Time comes from the server (Redis TIME), not the caller." },
          { id: "cap", text: "Refill is capped at capacity, and tokens are only taken when enough are available." },
          { id: "retry-after", text: "Returns the time until enough tokens exist, used for Retry-After." },
          { id: "ttl", text: "Sets a TTL so idle buckets expire (a missing bucket is simply full).", weight: "supporting" },
          { id: "cost", text: "Supports a cost per request rather than assuming 1.", weight: "supporting" },
        ],
        reference: {
          code: md`
            -- token_bucket.lua
            local capacity = tonumber(ARGV[1])
            local rate     = tonumber(ARGV[2])
            local cost     = tonumber(ARGV[3])
            local t   = redis.call('TIME')
            local now = tonumber(t[1]) + tonumber(t[2]) / 1e6

            local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
            local tokens = tonumber(b[1]) or capacity
            local ts     = tonumber(b[2]) or now
            tokens = math.min(capacity, tokens + math.max(0, now - ts) * rate)

            local allowed = 0
            local wait = 0
            if tokens >= cost then
              tokens = tokens - cost
              allowed = 1
            else
              wait = (cost - tokens) / rate
            end

            redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
            redis.call('EXPIRE', KEYS[1], math.ceil(capacity / rate) + 1)
            return { allowed, tostring(tokens), tostring(wait) }

            // limit.ts
            async function checkLimit(key: string, plan: Plan, cost = 1) {
              const [allowed, tokens, wait] = await redis.evalsha(
                SCRIPT_SHA, 1, \`rl:{\${key}}\`, plan.burst, plan.perSecond, cost);
              return {
                allowed: allowed === 1,
                headers: {
                  "X-RateLimit-Limit": String(plan.perMinute),
                  "X-RateLimit-Remaining": String(Math.floor(Number(tokens))),
                  ...(allowed === 1 ? {} : { "Retry-After": String(Math.ceil(Number(wait))) }),
                },
              };
            }
          `,
          notes: md`
            - Redis runs a script without interleaving other commands on that shard, so concurrent callers are serialized. This is the atomicity the leaky version lacked.
            - \`TIME\` is read inside the script: every instance shares one clock.
            - The TTL is the time to refill completely. After that, a missing key and a full bucket are the same thing, so expiry loses nothing. This is [[soft-state]] at work.
            - Numbers are returned as strings because Redis truncates Lua numbers to integers on the way out.
          `,
        },
      },
      reveal: {
        takeaways: [
          "A Lua script runs atomically on its Redis shard, so read, refill, take and write happen as one step.",
          "Read the time inside the script (Redis TIME) so every caller shares one clock.",
          "Expire idle buckets after they would have refilled; a missing bucket is a full bucket.",
        ],
        reasoning: md`
          The script is short because the hard part is not the arithmetic. It is putting the arithmetic **where it can run atomically**, next to the data, with one clock. Most distributed counters, quotas and inventory checks end up with the same shape.
        `,
      },
    },
    {
      id: "redis-goes-down",
      title: "Redis goes down",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["timeouts", "rate-limiting", "backpressure"],
      competencyIds: ["limiter-failure"],
      event: {
        kind: "failure",
        title: "The Redis primary fails over",
        detail: "For about 40 seconds, limit checks time out or error. Then for a few minutes latency to Redis is erratic while replicas resync.",
      },
      context: md`
        The limiter now sits on every request. The requirement is explicit: if its state store fails, the API stays up.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            When a dependency on the request path fails, every request has to do *something*. There are two broad choices:

            - **Fail closed:** treat "I can't check" as "no". Safe for the thing being protected, but the dependency's outage becomes your outage.
            - **Fail open:** treat "I can't check" as "yes". The service stays up, but the protection is gone for as long as the dependency is.

            The right choice depends on what the check protects. A payment fraud check might fail closed. A limiter whose job is availability usually shouldn't.
          `,
        },
        {
          kind: "read",
          body: md`
            A dependency that is **slow** is often worse than one that is down. A down Redis returns errors in microseconds. A Redis in the middle of a failover may take seconds to answer, and every request waits that long.

            A [[timeouts|timeout]] turns slow into failed. It needs to be shorter than the latency the caller can afford to add, here a few milliseconds.
          `,
        },
        {
          kind: "estimate",
          id: "pile-up",
          prompt: "The API handles 40,000 requests a second. Redis stops answering and each limit check waits for a 2-second client timeout. About how many requests are stuck waiting at once?",
          answer: 80000,
          unit: "requests",
          working: md`
            Requests in flight = arrival rate × time each one waits = 40,000 × 2 = **80,000**.

            That is far more concurrent requests than the instances' thread pools or connection limits can hold. The API stops answering everything, including requests that never needed Redis.
          `,
        },
        {
          kind: "predict",
          id: "local-share",
          prompt: "Redis is unavailable, and each of 30 instances must limit a Pro key (600 a minute) using only its own memory. What limit should each instance apply so the fleet stays near the plan?",
          answer: md`
            About **600 ÷ 30 = 20 a minute** per instance. The load balancer spreads the key's requests roughly evenly, so 30 local limits of 20 add up to about 600.

            It's approximate: if the spread is uneven, some instances reject early while others have room. But the database stays protected and the API stays up.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What should an instance do when the limit check fails or is slow?",
        options: [
          {
            id: "fail-closed",
            label: "Fail closed: reject requests with 503 until Redis is back",
            assessment: "flawed",
            feedback: "The limiter becomes a single point of failure for the whole API, which violates the requirement. Every customer is down because a cache failed over.",
          },
          {
            id: "fail-open-local",
            label: "Fail open after a ~5 ms timeout, enforcing local buckets sized to the plan divided by the instance count",
            assessment: "sound",
            feedback:
              "The API stays up and stays protected, approximately: each instance allows about 1/30th of a key's plan, so the fleet-wide total stays near the limit while Redis is unavailable. The short timeout keeps a slow Redis from adding latency to every request. Precision drops for a few minutes; availability does not.",
          },
          {
            id: "fail-open-unlimited",
            label: "Fail open: skip limiting until Redis recovers",
            assessment: "defensible",
            feedback:
              "Availability is preserved, and for a short failover this is often acceptable. But the window is exactly when an abusive client faces no limit at all, and the original incident shows what one client can do to the database in a few minutes.",
          },
          {
            id: "wait",
            label: "Retry the Redis call until it succeeds before handling the request",
            assessment: "flawed",
            feedback: "Every request now waits for the failover. Thread pools fill, timeouts cascade, and the API goes down slowly instead of quickly. A dependency on the hot path needs a strict timeout and a fallback, not patience.",
          },
        ],
        rationale: {
          prompt: "Why is your failure mode the right one for a limiter?",
          rubric: [
            { id: "not-spof", text: "The limiter must not take down the thing it protects; failing closed makes it a single point of failure." },
            { id: "timeout", text: "A strict timeout bounds the latency a slow Redis can add." },
            { id: "approximate", text: "Some protection should remain during the failure, e.g. local limits of plan / instances." },
          ],
        },
      },
      reveal: {
        takeaways: [
          "A limiter must not take down the service it protects: failing closed makes it a single point of failure.",
          "Bound the latency a slow dependency can add with a strict timeout, then fall back.",
          "Degrade precision, not availability: local limits of plan ÷ instances keep rough protection during the outage.",
        ],
        reasoning: md`
          A limiter exists to protect availability, so it must never cost more availability than it saves. The design principle is **degrade precision, not service**: fall back from a shared, exact-ish limit to a local, approximate one, with a [[timeouts|timeout]] tight enough that the fallback triggers quickly.

          Local fallback needs the instance count, which autoscaling changes. Each instance can read the current count from the orchestrator or the load balancer's target list; being off by a few instances only changes the limit by a few percent.
        `,
        tradeoffs: [
          { choice: "Fail open with local buckets", gains: "API stays up and roughly protected.", costs: "Limits are approximate, and uneven load across instances can admit somewhat more than the plan." },
        ],
      },
    },
    {
      id: "the-biggest-customer",
      title: "The biggest customer",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["partitioning", "rate-limiting"],
      competencyIds: ["hot-keys"],
      event: {
        kind: "scale",
        title: "An Enterprise key at 15,000 requests a second",
        detail: "One customer's bucket key now receives 15,000 script calls a second. Its Redis shard is at 90% CPU while the others idle.",
      },
      context: md`
        Partitioning Redis by key spreads 50,000 keys nicely, except when one key is most of the traffic.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Redis Cluster splits keys over shards by hashing the key name. 50,000 keys spread evenly, and adding shards spreads them further.

            But all commands for **one key** go to one shard, and each shard runs commands on a single thread. A key that receives most of the traffic stays on one shard however many shards exist. That is a **hot key**.
          `,
        },
        {
          kind: "choice",
          id: "more-shards",
          prompt: "One key gets 15,000 script calls a second and its shard is at 90% CPU. What does doubling the number of shards do for that key?",
          options: [
            {
              id: "nothing",
              label: "Nothing: the key still lives on exactly one shard.",
              correct: true,
              why: "More shards spread more keys. They can't split one key's traffic, because every call for that key must reach the shard that holds it.",
            },
            {
              id: "half",
              label: "Halves its load: the key's calls are spread over twice as many shards.",
              why: "Hashing assigns each key to one shard. Its calls can't be spread without changing the key itself.",
            },
            {
              id: "worse",
              label: "Makes it worse, because of resharding.",
              why: "Resharding moves keys briefly, but afterwards the hot key is on one shard, just as before.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Two ways to take load off one key:

            - **Batch:** an instance takes many tokens at once (say 200) and spends them locally. One Redis call now covers 200 requests.
            - **Split:** store the key as N sub-buckets on different shards, each holding 1/N of the limit. Each request picks one sub-bucket.

            Both reduce coordination per request. Both make the limit slightly less exact.
          `,
        },
        {
          kind: "estimate",
          id: "batched-calls",
          prompt: "15,000 requests a second for one key, with instances taking tokens 200 at a time. About how many Redis calls a second does that key need?",
          answer: 75,
          unit: "calls per second",
          working: md`
            15,000 ÷ 200 = **75 calls a second**, down from 15,000.

            The cost: tokens an instance has taken but not yet used are invisible to everyone else. At most 200 per instance are "stranded" at a time, which is about 1% of this key's per-second traffic.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should the limiter handle this key?",
        options: [
          {
            id: "bigger-node",
            label: "Move to larger Redis nodes",
            assessment: "defensible",
            feedback: "It buys time, but one key's commands still run on one shard's single thread. The next customer twice this size hits the same wall.",
          },
          {
            id: "token-leases",
            label: "Let instances take tokens in batches (say 200 at a time) and spend them locally",
            assessment: "sound",
            feedback:
              "Redis calls for this key drop by two orders of magnitude, from 15,000 a second to ~75. The cost is precision: tokens leased to an instance that then sees no traffic are briefly stranded. At 15,000 a second, being off by a few hundred is noise.",
          },
          {
            id: "split-key",
            label: "Split the key into N sub-buckets on different shards, each with 1/N of the limit, chosen at random per request",
            assessment: "sound",
            feedback:
              "Spreads the load over shards with no local state. Random choice makes each sub-bucket see roughly 1/N of the traffic, though the variance means the customer may hit one sub-bucket's limit slightly early. Fine for large keys; pointless for small ones.",
          },
          {
            id: "exempt",
            label: "Exempt Enterprise keys from limiting; they pay for capacity",
            assessment: "flawed",
            feedback: "The incident that started this came from a paying customer's retry loop. Paying for a higher limit is not the same as paying to remove the database's protection.",
          },
        ],
        rationale: {
          prompt: "Why does adding shards not fix this, and what does your fix trade away?",
          rubric: [
            { id: "hot-key", text: "A single hot key stays on one shard however many shards exist." },
            { id: "reduce-coordination", text: "The fix reduces per-request coordination for that key (batching or splitting)." },
            { id: "precision", text: "Names the precision lost, and why it is acceptable at this volume." },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Partitioning spreads many keys; it can't spread one hot key, which always lives on one shard.",
          "Reduce coordination for hot keys by leasing tokens in batches or splitting the key into sub-buckets.",
          "The precision lost is tiny relative to a very large key's traffic, so the trade gets cheaper as the key grows.",
        ],
        reasoning: md`
          [[partitioning|Partitioning]] scales *many keys*, not *one hot key*. For hot keys you split the **work**: lease tokens in batches so most requests are decided locally, or split the key so the coordination spreads out.

          Both trade precision for throughput, and the trade gets cheaper as the key gets bigger: being off by 200 tokens matters for a 60/minute key and is invisible for a 15,000/second one. Hybrid limiters apply the batched path only above a traffic threshold.
        `,
      },
    },
    {
      id: "credential-stuffing",
      title: "Credential stuffing on login",
      phase: "change",
      dimensions: ["change", "break", "explain"],
      conceptIds: ["rate-limiting"],
      competencyIds: ["adversaries"],
      event: {
        kind: "requirement-change",
        title: "Security asks for login protection",
        detail: "Attackers are testing leaked email/password pairs against the login endpoint from about 8,000 residential IPs, a few attempts per IP per hour.",
      },
      context: md`
        Login is unauthenticated, so there is no API key. The traffic is not one heavy client; it is thousands of light ones.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            **Credential stuffing** tests leaked email–password pairs from other sites against your login page. Attackers spread the attempts over thousands of IPs, often residential proxies, so each IP makes only a few attempts an hour.

            A rate limit catches abuse that is **concentrated** in the key it counts by. Distributed attacks are built to stay under every per-key limit.
          `,
        },
        {
          kind: "estimate",
          id: "attempts",
          prompt: "8,000 IPs each try 4 passwords an hour. About how many login attempts is that per day?",
          answer: 768000,
          unit: "attempts per day",
          working: md`
            8,000 × 4 × 24 = **768,000 attempts a day**, while each IP stays at 4 an hour, below any per-IP limit you could set without blocking an office behind a shared NAT.
          `,
        },
        {
          kind: "read",
          body: md`
            So login protection counts by several keys at once:

            | Key | Catches |
            | --- | --- |
            | Per IP | one machine hammering |
            | Per account | many guesses at one user's password |
            | Per IP + account | one source retrying one user |
            | Global failure rate | a distributed attack, visible only in aggregate |

            And the response can escalate (add a delay, require a CAPTCHA) instead of hard-blocking.
          `,
        },
        {
          kind: "predict",
          id: "lockout",
          prompt: "You lock any account for an hour after 5 failed logins. What can an attacker who only knows a victim's email address do?",
          answer: md`
            Lock the victim out on purpose: 5 wrong passwords and the real owner can't log in for an hour. Repeated every hour, it's a denial of service against that user.

            That's why per-account limits usually slow down or challenge further attempts rather than blocking the account outright.
          `,
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements hold for protecting login?",
        claims: [
          {
            id: "per-ip-stops",
            statement: "A limit of 5 attempts per IP per minute stops this attack.",
            verdict: "fails",
            explanation:
              "Each attacking IP makes a few attempts an hour, far below any per-IP limit you could set without hurting offices behind one NAT. Distributed attacks are designed to sit under per-source limits.",
          },
          {
            id: "account-lockout-dos",
            statement: "Locking an account after 5 failed attempts lets an attacker lock out real users on purpose.",
            verdict: "holds",
            explanation:
              "Anyone who knows an email address can trigger the lockout. Per-account limits are useful, but their response should slow down or add challenges (delays, CAPTCHA, email verification) rather than block the real owner.",
          },
          {
            id: "global-signal",
            statement: "A sudden rise in the global failed-login rate is a useful signal even when no single IP or account exceeds its limit.",
            verdict: "holds",
            explanation:
              "Distributed attacks are invisible per key and obvious in aggregate. Global limits and alerts, such as stepping up challenges for everyone when failures spike, catch what per-key limits cannot.",
          },
          {
            id: "rate-limit-is-security",
            statement: "With good rate limits, breached-password checks and MFA are unnecessary.",
            verdict: "fails",
            explanation:
              "Rate limiting slows guessing; it does not make a leaked password safe. An attacker with 8,000 IPs and patience still gets through eventually. Limits are one layer of defence.",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Distributed attacks stay under per-source limits by design; count by several keys and watch the aggregate.",
          "Hard lockouts let attackers lock real users out; escalate with delays and challenges instead.",
          "Rate limits slow guessing but don't make leaked passwords safe; they are one layer among several.",
        ],
        reasoning: md`
          Rate limits assume that abuse is **concentrated** in a key. Adversaries deliberately spread it out. Protecting login takes keys at several granularities (IP, account, IP-and-account pair, global), responses that escalate (delay, challenge) rather than hard-block, and signals in aggregate. The same token-bucket mechanism serves all of them; what changes is the key you count by.
        `,
      },
    },
    {
      id: "expensive-requests",
      title: "Not all requests cost the same",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["rate-limiting", "backpressure"],
      competencyIds: ["hot-keys", "algorithm"],
      event: {
        kind: "requirement-change",
        title: "Search launches",
        detail:
          "A new search endpoint costs anywhere from 2 ms to 2 s of cluster time depending on the query. Three customers running wide queries within their request limits saturated the search cluster.",
      },
      context: md`
        Every customer stayed inside their requests-per-minute plan. The cluster went down anyway.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A request-count limit assumes requests cost roughly the same. When one request can take 1,000 times longer than another, counting requests says little about load.

            What the backend runs out of is **time**: how many query-seconds it can serve per second. That's the resource to limit.
          `,
        },
        {
          kind: "estimate",
          id: "cluster-seconds",
          prompt: "A customer's plan allows 10 searches a second, and each of their searches takes 2 seconds of cluster time. How many search-seconds of work do they add every second?",
          answer: 20,
          unit: "search-seconds",
          working: md`
            10 × 2 s = **20 seconds of work per second**. On average about 20 of their queries are running at any moment.

            Another customer with the same plan whose queries take 2 ms adds 0.02 search-seconds per second. Same request limit, a thousand times the load.
          `,
        },
        {
          kind: "read",
          body: md`
            Three tools, each limiting something different:

            - **Cost-weighted tokens:** a request takes tokens in proportion to its estimated cost, so the bucket measures work rather than requests.
            - **Concurrency limit per key:** at most N requests from one key running at once, which bounds how much of the backend one client can occupy.
            - **Global [[load-shedding|load shedding]]:** when the backend's queue grows, reject or defer work from everyone, even clients within their own limits.
          `,
        },
        {
          kind: "choice",
          id: "everyone-within",
          prompt: "Every customer is within their own per-key limits, yet together they exceed what the cluster can serve. Which tool still protects it?",
          options: [
            {
              id: "global",
              label: "A global limit or load shedding based on the cluster's own state",
              correct: true,
              why: "Per-key limits each look fine; only something that watches total load can notice that the sum is too much.",
            },
            {
              id: "per-key",
              label: "Lower every customer's per-key limit",
              why: "That throttles everyone all the time to protect against a peak that happens occasionally. A global signal reacts only when it's needed.",
            },
            {
              id: "concurrency",
              label: "Per-key concurrency limits",
              why: "They stop one customer from occupying the cluster, but many customers each within their concurrency cap can still add up to too much.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should search be protected?",
        options: [
          {
            id: "lower-limit",
            label: "Give search a lower requests-per-minute limit",
            assessment: "defensible",
            feedback: "It reduces the damage, but a request count cannot tell a 2 ms query from a 2 s one. Cheap queries get throttled unnecessarily, and a few expensive ones can still saturate the cluster.",
          },
          {
            id: "cost-and-concurrency",
            label: "Charge tokens by estimated cost, cap concurrent searches per key, and shed load globally when the cluster's queue grows",
            assessment: "sound",
            feedback:
              "Cost-weighted tokens make the bucket measure the scarce resource rather than the request count. A per-key concurrency cap stops one customer occupying the cluster with slow queries. A global shed protects the cluster when everyone is busy at once. Each layer covers a different failure.",
          },
          {
            id: "bigger-cluster",
            label: "Scale the search cluster until it copes",
            assessment: "defensible",
            feedback: "Capacity helps the average case. But query cost is unbounded on the customer's side, so a few pathological queries can always outrun capacity. You need a limit on the input, not just more output.",
          },
          {
            id: "timeout-only",
            label: "Kill any query that runs longer than 500 ms",
            assessment: "defensible",
            feedback: "A sensible complement that bounds the worst case per query. On its own, many 450 ms queries still saturate the cluster, and the work done before the timeout is wasted.",
          },
        ],
        rationale: {
          prompt: "What does your design measure, and why is that the right thing to limit?",
          rubric: [
            { id: "cost", text: "Limits should measure the scarce resource (cost or time), not just request count." },
            { id: "concurrency", text: "Concurrency limits bound how much of the backend one client can occupy at once." },
            { id: "global", text: "A global limit or load shedding protects the backend when every client is within its own limit.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "When request costs vary widely, limit the scarce resource (cost or time), not the request count.",
          "Per-key concurrency caps stop one client from occupying a slow backend.",
          "A global shed protects the backend when every client is within its own limit at once.",
        ],
        reasoning: md`
          Request counts are a proxy for load, and they stop working when requests differ in cost. The fix is to **count what is scarce**: tokens weighted by estimated cost (refunded when the actual cost is lower), concurrency per key, and a global [[backpressure|load-shedding]] valve. The bucket script already takes a \`cost\` argument; the investment is in estimating cost before running the query.
        `,
      },
      reveals: { components: ["search"], flows: ["search-queries"] },
    },
    {
      id: "defend-the-429",
      title: "Defend a 429",
      phase: "defend",
      dimensions: ["defend", "explain", "trace"],
      conceptIds: ["rate-limiting", "retries-and-backoff", "timeouts"],
      competencyIds: ["limiter-failure", "shared-state", "algorithm"],
      context: md`
        A Pro customer files a ticket: "Our logs show we sent 540 requests in the last minute, under our 600 limit, and we got 429s. Your limiter is broken."

        Respond as the engineer who built it: how can that happen, which cases are bugs, and what would you check?
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Customers read plans as "600 requests a minute". A token bucket enforces something slightly different: a burst of up to *B* at once, then a refill of *r* per second. Over a long period those agree. Over a few seconds they can differ.
          `,
        },
        {
          kind: "predict",
          id: "burst-under-total",
          prompt: "Pro has B = 50 and r = 10 per second. A client sends 200 requests in the first 5 seconds of a minute, then 340 spread over the remaining 55 seconds. Does it get any 429s?",
          answer: md`
            Yes, in the first 5 seconds. The bucket starts with 50 tokens and refills 50 more over 5 seconds, so about 100 of the 200 get through and about 100 are rejected. The rest of the minute is fine: 340 over 55 seconds is about 6 a second, under the refill rate.

            The minute's total is 540, under 600. The client is well within its "per minute" plan and still saw 429s, because the bucket limits bursts.
          `,
        },
        {
          kind: "read",
          body: md`
            Other reasons a client's count and the limiter's count disagree:

            - The limiter ran in **degraded mode** (local limits during a Redis failure).
            - The client's HTTP library **retried** requests that its own logs don't show.
            - **Other services** share the same API key.
            - The client counts by **send time**, the server by **arrival time**.

            Each of these is checkable if the limiter records its decisions: per key, whether a request was allowed, the tokens remaining, and whether degraded mode was on.
          `,
        },
        {
          kind: "choice",
          id: "bug-signal",
          prompt: "Which observation would point to a real bug rather than expected behaviour?",
          options: [
            {
              id: "remaining-high",
              label: "429s returned while the X-RateLimit-Remaining header on the previous response was well above zero",
              correct: true,
              why: "The limiter told the client it had tokens left and then rejected it. Either the header or the decision is wrong.",
            },
            {
              id: "burst",
              label: "429s during a burst at the start of the minute",
              why: "That's exactly what a token bucket does when a burst exceeds B plus what refills during the burst.",
            },
            {
              id: "failover",
              label: "429s during a Redis failover",
              why: "Local fallback limits are approximate by design, so some early rejections on busy instances are expected.",
            },
          ],
        },
      ],
      interaction: {
        kind: "open",
        prompt: "Explain how a client under its per-minute limit can legitimately receive 429s, which explanations would indicate a bug, and how you would find out which happened.",
        placeholder: "A token bucket does not count per minute…",
        rubric: [
          { id: "bucket-not-window", text: "A token bucket enforces burst capacity and refill rate, not 'N per calendar minute': a burst can exhaust it below the per-minute total." },
          { id: "degraded-mode", text: "During a Redis failure, local fallback limits are approximate and can reject earlier on unevenly loaded instances." },
          { id: "client-counting", text: "The client's count may differ from the server's: retries, other services sharing the key, or counting by send time vs. arrival time." },
          { id: "investigate", text: "Proposes evidence: per-key limiter logs or metrics, the remaining-tokens header at each 429, whether degraded mode was active." },
          { id: "contract", text: "Suggests making the contract explicit to customers (document burst and refill; expose headers) so behaviour is predictable.", weight: "supporting" },
        ],
        reference: md`
          It is probably not a bug, but you should prove that rather than assert it.

          **Legitimate causes:**

          - **Burst, not total.** Pro might be "50 burst, 10/s refill". If the customer sends 200 requests in the first five seconds of a minute, the bucket empties after ~100 and later requests are rejected, even though the minute's total ends up at 540. The plan says 600 a minute; the mechanism enforces a burst and a rate.
          - **Degraded mode.** If Redis was failing over, each instance enforced plan / instance count locally. With uneven distribution, some instances reject while others have spare capacity.
          - **Different counts.** The customer's logs may miss retries their HTTP library made, or other services using the same key; they count when they *sent*, and the limiter counts when requests *arrived*, so a minute's boundary differs.

          **Bugs would look like:** rejections while \`X-RateLimit-Remaining\` was well above zero; rejections for a key whose plan was changed but whose cached plan was stale; a clock or script error refilling too slowly.

          **How to find out:** pull the key's limiter decisions for that minute (allowed, tokens remaining, degraded flag), compare with the response headers the customer received, and check Redis health for the period.

          **What to change:** make the contract visible. Document burst and refill rates, return remaining tokens on every response, and send Retry-After on every 429. A limiter customers can predict generates fewer tickets than an exact one they cannot.
        `,
      },
      reveal: {
        takeaways: [
          "A token bucket enforces a burst and a rate, not 'N per calendar minute'; make that contract visible to clients.",
          "Record each limiter decision (allowed, tokens left, degraded mode) so disputes are settled with evidence.",
          "A predictable limiter with clear headers produces fewer complaints than an exact one clients can't reason about.",
        ],
        reasoning: md`
          A rate limiter is a **contract with clients**, and the hardest part of a contract is making it legible. Every mechanism in this investigation (bursts, approximation under failure, token leases for big keys) is a place where "600 per minute" stops being literally true. Defending the design means being able to explain each of those departures, show why it serves the customer, and produce the evidence when asked.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      Each key gets **one token bucket** in a shared store, updated by **one atomic script** that uses **one clock**. That gives every instance the same answer without coordinating with each other: the coordination happens in a single, fast, atomic step next to the data.

      The rest of the design is about where that ideal bends. Under Redis failure the limiter **degrades to local approximation** rather than failing the API. For hot keys it **batches or splits** coordination. For adversaries it counts by **several keys at once**. For expensive endpoints it counts **cost and concurrency** rather than requests. Each bend trades precision for availability, throughput or relevance, deliberately and visibly to clients through headers.
    `,
    reliesOn: [
      "Redis script execution is atomic per shard, and its round-trip latency stays well under the 2 ms budget.",
      "Losing bucket state is acceptable: buckets restart full.",
      "Clients honour Retry-After well enough that rejections do not turn into retry storms.",
      "Plan changes reach instances within seconds via a short-lived local cache.",
    ],
    alternatives: [
      { design: "API gateway with built-in limiting (Envoy, Kong, a cloud gateway)", preferWhen: "Your load balancer or gateway layer supports it: one less component to build, at the cost of flexibility in keys and costs." },
      { design: "Sticky routing with local buckets", preferWhen: "A gateway can route consistently by key and the fleet is stable, which removes the network hop entirely." },
      { design: "Approximate distributed counting (gossiped local counts)", preferWhen: "Global volume is extreme and a few percent of over-admission is fine everywhere." },
    ],
    tradeoffs: [
      { choice: "Shared Redis bucket per key", gains: "Fleet-wide correctness with one round trip.", costs: "A dependency on every request's critical path." },
      { choice: "Fail open to local limits", gains: "The limiter never causes an outage.", costs: "Approximate limits during failures." },
      { choice: "Token leases for hot keys", gains: "Two orders of magnitude fewer Redis calls.", costs: "Stranded tokens and small over- or under-admission." },
      { choice: "Cost-weighted tokens", gains: "Limits track the scarce resource.", costs: "Cost must be estimated before work is done." },
    ],
    breaksWhen: [
      "The latency budget shrinks below a network round trip, which forces local or gateway-level limiting.",
      "Limits must be exact for billing, which calls for metering after the fact rather than limiting.",
      "Abuse comes from many keys that look individually normal, which needs anomaly detection rather than limits.",
      "Multi-region deployment requires global limits, which bring cross-region coordination or explicit per-region quotas.",
    ],
  },
  interviewVariants: [
    "Design a rate limiter.",
    "How would you enforce API quotas across a fleet of stateless servers?",
    "Design protection against credential stuffing on a login endpoint.",
    "Your rate limiter's Redis goes down. What happens to your API?",
  ],
  relatedInvestigationIds: ["payment-workflow", "notification-system"],
} satisfies InvestigationInput;
