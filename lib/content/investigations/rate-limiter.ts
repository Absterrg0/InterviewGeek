import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const rateLimiter = {
  id: "api-rate-limiter",
  title: "Rate limiting a public API",
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
