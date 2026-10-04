import type { ConceptInput } from "@/lib/domain/content";
import { md } from "../md";

export const performanceConcepts: ConceptInput[] = [
  {
    id: "backpressure",
    title: "Backpressure and capacity",
    domain: "performance",
    summary:
      "When work arrives faster than it can be done, something has to give: the queue grows, the producer slows, or work is shed. Choose which on purpose.",
    problem: md`
      Every component has a maximum throughput. When arrivals exceed it, the excess accumulates somewhere: in a queue, in memory buffers, in open connections, in threads waiting on locks. Accumulation is invisible until latency explodes or memory runs out, and then the whole system fails rather than just the excess.
    `,
    mechanism: md`
      Two pieces of arithmetic explain most capacity problems:

      - **Little's law:** items in the system = arrival rate × time each spends in it (L = λW). At 0.12 jobs/s × 750 s per job, about 90 jobs are in flight. If you only have 20 workers, the rest wait.
      - **Utilization:** as a server approaches 100% busy, queueing delay grows sharply, roughly in proportion to 1 / (1 - utilization). At 50% utilization a request waits about one service time; at 90% it waits about nine; at 99% about ninety.

      When arrivals exceed capacity, there are only three responses:

      1. **Buffer** (queue the excess). Turns overload into latency. Fine for short bursts if the backlog can drain before latency becomes unacceptable; disastrous if it cannot.
      2. **Backpressure** (slow the producer). Bounded buffers that block or reject when full push the problem upstream, toward something that can decide: a client that retries later, a user who sees "busy", a producer that slows down. TCP flow control and bounded channels are backpressure.
      3. **Shed load** (drop or reject work). Return 429 or 503 early, drop low-priority work, disconnect clients that cannot keep up. Keeps the system fast for the work it does accept.

      The design rule: **every queue and buffer needs a bound and a policy for when it is full.** Unbounded buffers do not avoid the choice; they defer it until the process runs out of memory.
    `,
    assumptions: [
      "You can measure arrival rate, service time and queue age.",
      "Upstream callers can handle rejection or slow-down signals sensibly.",
    ],
    alternatives: [
      { name: "Add capacity (autoscaling)", when: "Load grows predictably or slowly enough for new capacity to arrive in time." },
      { name: "Reduce work per request", when: "Caching, batching or coarser updates cut the service time itself." },
    ],
    failureModes: [
      { name: "Unbounded queue", description: "Latency grows without limit; by the time work is processed, nobody wants it." },
      { name: "Slow consumer, fast producer", description: "Per-connection send buffers grow until the server runs out of memory." },
      { name: "Retry amplification", description: "Rejected work is retried immediately, increasing the very load that caused rejection." },
      { name: "Running hot", description: "Provisioning for 95% utilization means small bursts cause large latency spikes." },
    ],
    implementations: [
      { name: "Bounded channels and queues", note: "Block or reject when full." },
      { name: "HTTP 429/503 with Retry-After", note: "Explicit load shedding with guidance for clients." },
      { name: "TCP and HTTP/2 flow control", note: "Receivers advertise how much they can accept." },
      { name: "Per-connection buffer limits", note: "Disconnect or degrade clients that fall too far behind." },
    ],
    claims: [
      {
        id: "queue-solves",
        statement: "Putting a queue in front of a slow service solves overload.",
        verdict: "depends",
        explanation:
          "It solves bursts that are shorter than the time the backlog takes to drain. Sustained arrivals above capacity make the queue grow without bound; the queue changes how the overload shows up, not whether it exists.",
      },
      {
        id: "utilization",
        statement: "Running servers at 90% utilization is efficient and has little effect on latency.",
        verdict: "fails",
        explanation: "Queueing delay rises steeply near saturation. At 90%, average waiting is several times what it is at 50%, and small bursts push it far higher.",
      },
      {
        id: "littles-law",
        statement: "If requests arrive at 200 per second and each takes 50 ms, about 10 are in flight on average.",
        verdict: "holds",
        explanation: "L = λW = 200/s × 0.05 s = 10. It is the quickest way to size connection pools, worker counts and buffers.",
      },
    ],
    explain: {
      prompt: "Explain what happens when work arrives faster than a system can process it, and the three ways a design can respond.",
      rubric: [
        { id: "accumulates", text: "Excess accumulates in queues or buffers, turning into latency and memory growth." },
        { id: "three", text: "Names buffering, backpressure (slowing producers) and load shedding." },
        { id: "bounded", text: "Every buffer needs a bound and a policy when full." },
        { id: "littles", text: "Uses Little's law or utilization to reason quantitatively.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["message-queues", "rate-limiting", "retries-and-backoff", "asynchronous-processing"],
  },
  {
    id: "caching",
    title: "Caching",
    domain: "performance",
    summary:
      "Keeping a copy of data closer to where it is used, trading freshness and complexity for speed and reduced load on the source.",
    problem: md`
      The same data is read far more often than it changes: a product page, a user's permissions, a video segment. Fetching it from the source of truth every time costs latency and load. Caching removes both, and adds a second copy that can disagree with the first.
    `,
    mechanism: md`
      A cache answers reads from a copy; on a **miss** it fetches from the source and stores the result. Caches exist at every layer: CPU, process memory, Redis, CDN edge, browser.

      The design questions are all about the copy:

      - **How stale may it be?** A TTL bounds staleness by time. Explicit invalidation on write gives fresher data but is hard to do reliably across processes, because invalidations can be lost or race with re-population.
      - **Can the data change at all?** Immutable data (content-addressed assets, versioned keys like \`renditions/812/attempt-3/seg_001.ts\`) never goes stale, so it can be cached forever. Making data immutable by giving each version a new key is the most reliable cache-invalidation strategy.
      - **What happens on a miss storm?** When a popular entry expires, many requests miss at once and stampede the source. Request coalescing (one fetch, many waiters), stale-while-revalidate, and jittered TTLs prevent it.
      - **What is the hit ratio?** A cache that rarely hits adds latency and complexity for nothing. Data with long-tail access patterns may not be worth caching.

      A cache is a performance tool, not a correctness tool. The system must still behave correctly on a cold or empty cache, though perhaps more slowly.
    `,
    assumptions: [
      "Reads substantially outnumber writes for the cached data.",
      "Bounded staleness is acceptable, or invalidation is reliable.",
      "The source can survive the load of a cold cache.",
    ],
    alternatives: [
      { name: "Read replicas", when: "Staleness of seconds is fine and queries are too varied to cache by key." },
      { name: "Precomputation / materialized views", when: "The expensive part is computing the result, and it can be refreshed on write." },
      { name: "Make the source faster", when: "An index or a query fix removes the need for a second copy." },
    ],
    failureModes: [
      { name: "Stale reads after writes", description: "A user updates data and immediately sees the old version." },
      { name: "Thundering herd", description: "A hot key expires and every request hits the source simultaneously." },
      { name: "Cache as source of truth", description: "Data that exists only in the cache is lost on eviction or restart." },
      { name: "Purge does not reach every edge", description: "Deleted or private content remains cached at CDN edges." },
    ],
    implementations: [
      { name: "In-process LRU", note: "Fastest; per-instance and inconsistent across instances." },
      { name: "Redis / Memcached", note: "Shared across instances; a network hop." },
      { name: "CDN", note: "Edge caching for static and immutable content; purge APIs for removal." },
      { name: "HTTP caching headers", note: "Cache-Control, ETag; immutable for versioned assets." },
    ],
    claims: [
      {
        id: "redis-faster",
        statement: "Adding Redis makes an application faster.",
        verdict: "depends",
        explanation:
          "Only for reads that hit, and only if the network hop to Redis is much cheaper than the work it replaces. A low hit ratio, or caching data that was already fast to read, adds latency and a consistency problem.",
      },
      {
        id: "immutable",
        statement: "Objects stored under keys that are never overwritten can be cached with very long TTLs safely.",
        verdict: "holds",
        explanation: "If the bytes behind a key never change, a cached copy is never stale. Changes go to new keys.",
      },
      {
        id: "cold-cache",
        statement: "A correctly designed system must work, perhaps slowly, with an empty cache.",
        verdict: "holds",
        explanation: "Caches are evicted, restarted and flushed. If the source cannot survive a cold cache, the cache has become a load-bearing dependency with no durability.",
      },
    ],
    explain: {
      prompt: "Explain the main risks a cache introduces and how immutability changes them.",
      rubric: [
        { id: "staleness", text: "A cache is a second copy that can serve stale data; TTLs and invalidation trade freshness against complexity." },
        { id: "stampede", text: "Expiry of hot entries can stampede the source; coalescing or stale-while-revalidate helps." },
        { id: "immutable", text: "Immutable, versioned keys never go stale, so they can be cached indefinitely." },
      ],
    },
    relatedConceptIds: ["object-storage", "partitioning", "backpressure"],
  },
  {
    id: "rate-limiting",
    title: "Rate limiting",
    domain: "performance",
    summary:
      "Capping how fast a client may use a resource, to protect capacity, enforce fairness, and stay within the limits of the systems you depend on.",
    problem: md`
      Without limits, one client can consume a shared resource: a buggy script hammering an API, a tenant monopolizing workers, or your own system exceeding a provider's quota and getting cut off for everyone.
    `,
    mechanism: md`
      A rate limiter tracks usage per **key** (user, API token, IP, tenant, or "us, towards provider X") and rejects or delays requests over a limit. The common algorithms:

      - **Token bucket:** a bucket holds up to *B* tokens and refills at *r* per second; each request takes one. It allows bursts up to *B* and a sustained rate of *r*. It is the most common choice.
      - **Leaky bucket / queue:** requests drain at a fixed rate; excess queues or drops. It smooths output, which is useful in front of a strict downstream limit.
      - **Fixed window counters:** count per minute. Simple, but allow 2x bursts at window boundaries.
      - **Sliding window:** smooths the boundary problem at more bookkeeping.

      Where it runs matters as much as the algorithm. A limiter in each of 20 API instances enforces 20x the intended limit unless state is shared (Redis with atomic increments or Lua scripts) or the limit is divided among instances. Shared state adds a dependency on every request; decide what happens if the limiter's store is down (fail open or closed).

      Limiting **outbound** calls is just as important: if a provider allows 100 requests per second, your fleet needs a shared limiter, plus queueing for work that can wait, rather than discovering the limit through 429s.
    `,
    assumptions: [
      "Requests can be attributed to a meaningful key.",
      "Rejected clients receive a clear signal (429 with Retry-After) and back off.",
    ],
    alternatives: [
      { name: "Concurrency limits", when: "The scarce resource is simultaneous work (connections, workers) rather than rate." },
      { name: "Quotas over long periods", when: "Fairness is about daily or monthly consumption, as with billing tiers." },
      { name: "Queueing", when: "Excess work can wait rather than be rejected." },
    ],
    failureModes: [
      { name: "Per-instance limits", description: "Each instance enforces the full limit, multiplying the effective limit by the instance count." },
      { name: "Limiter store outage", description: "Every request depends on the limiter; failing closed takes the API down." },
      { name: "Retry-on-429 storms", description: "Clients retry immediately and keep the limiter saturated." },
    ],
    implementations: [
      { name: "Token bucket in Redis", note: "Atomic refill-and-take with a Lua script or INCR with expiry." },
      { name: "API gateway / proxy limits", note: "Envoy, NGINX, cloud gateways." },
      { name: "Client-side limiter for outbound calls", note: "Keeps your fleet under a provider's quota." },
    ],
    claims: [
      {
        id: "per-instance",
        statement: "Each of 10 API servers enforcing 100 requests/minute per user limits each user to 100 requests/minute.",
        verdict: "fails",
        explanation: "Requests spread across servers, so a user can make up to 1,000 per minute. The limit needs shared state or division among instances.",
      },
      {
        id: "burst",
        statement: "A token bucket with capacity 20 and refill of 5/s allows a burst of 20 requests, then 5 per second.",
        verdict: "holds",
        explanation: "The bucket's capacity is the burst; its refill rate is the sustained limit.",
      },
      {
        id: "protects-db",
        statement: "Rate limiting users is sufficient to protect the database from overload.",
        verdict: "depends",
        explanation:
          "Only if per-user limits multiplied by active users stay within capacity, and requests have similar costs. Expensive endpoints and many simultaneous users can still overload it; global limits or concurrency limits may also be needed.",
      },
    ],
    explain: {
      prompt: "Explain how a token-bucket rate limiter works and what changes when it must be enforced across many servers.",
      rubric: [
        { id: "bucket", text: "Tokens refill at a steady rate up to a capacity; each request consumes one, allowing bursts up to the capacity." },
        { id: "shared", text: "Across servers the counter must be shared (or the limit divided), or the effective limit multiplies." },
        { id: "failure", text: "Decides what happens if the shared store is unavailable (fail open or closed).", weight: "supporting" },
        { id: "signal", text: "Rejected clients get a clear signal and back off.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["backpressure", "retries-and-backoff", "partitioning"],
  },
];
