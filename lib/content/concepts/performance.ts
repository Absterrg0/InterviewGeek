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
  {
    id: "fan-out",
    title: "Fan-out on write and fan-out on read",
    domain: "performance",
    summary:
      "When one write must reach many readers, do the work when it is written (precompute every reader's view) or when it is read (assemble it on demand). Most real feeds do both.",
    problem: md`
      A post from someone with ten million followers must appear in ten million home feeds. A feed must show posts from hundreds of accounts the reader follows. Somebody has to do the multiplication between "one author" and "many readers", and the question is **when**: once per write, or once per read.
    `,
    mechanism: md`
      - **Fan-out on write (push):** when an item is written, insert a reference to it into every reader's precomputed list (a "timeline"). Reads are a single lookup of a short list, which is very fast. Writes cost O(followers), and storage holds one entry per (reader, item).
      - **Fan-out on read (pull):** store each item once, under its author. At read time, fetch recent items from everyone the reader follows and merge them. Writes are O(1); reads cost O(following) and must merge and rank on the spot.

      The deciding numbers are the **read/write ratio** and the **distribution of follower counts**. Feeds are read far more than they are written, so push usually wins, until an author has millions of followers and one post becomes millions of writes that arrive late.

      The standard answer is **hybrid**: push for ordinary authors; for the few with huge audiences, skip fan-out and merge their recent items into the reader's timeline at read time. Two refinements matter in practice:

      - **Don't fan out to people who aren't reading.** Precompute timelines only for recently active users; rebuild the rest on demand when they return.
      - **Store references, not copies.** Timeline entries hold IDs; the content is fetched (and cached) separately, so edits and deletions do not need another fan-out.
    `,
    assumptions: [
      "Reads of the combined view vastly outnumber writes.",
      "A short delay between writing and appearing in every reader's view is acceptable.",
      "Most authors have modest audiences; a few have enormous ones.",
    ],
    alternatives: [
      { name: "Pure fan-out on read", when: "Writes are frequent, reads are rare, or each reader follows few sources (search is the extreme case)." },
      { name: "Pure fan-out on write", when: "Audiences are bounded (group chats, small teams) so no single write is enormous." },
    ],
    failureModes: [
      { name: "Celebrity write amplification", description: "One post becomes millions of inserts; delivery lags for minutes and queues back up behind it." },
      { name: "Wasted work on inactive readers", description: "Most precomputed entries are never read." },
      { name: "Deletes that don't propagate", description: "Copies of content (not references) fanned out to timelines keep showing deleted posts." },
    ],
    implementations: [
      { name: "Redis lists per user", note: "Capped lists of item IDs, the classic home-timeline store." },
      { name: "Wide-column stores", note: "One partition per reader, clustered by time." },
      { name: "Merge at read time", note: "Fetch high-audience authors' recent items and merge by score or time." },
    ],
    claims: [
      {
        id: "push-always",
        statement: "Fan-out on write is always better for feeds because reads dominate.",
        verdict: "fails",
        explanation: "For authors with millions of followers, one write becomes millions of inserts that land late and crowd out everyone else's delivery. Real systems switch those authors to read-time merging.",
      },
      {
        id: "references",
        statement: "Storing post IDs rather than post content in timelines makes deletions and edits cheaper.",
        verdict: "holds",
        explanation: "The content lives in one place; deleting it there removes it from every timeline at hydration time, without a second fan-out.",
      },
      {
        id: "inactive",
        statement: "Skipping fan-out for inactive users means they see an empty feed when they return.",
        verdict: "fails",
        explanation: "Their timeline is rebuilt from the people they follow (fan-out on read) when they come back. They pay one slower load; nobody pays for timelines that are never read.",
      },
    ],
    explain: {
      prompt: "Explain the trade-off between fan-out on write and fan-out on read, and how a feed with celebrity accounts should combine them.",
      rubric: [
        { id: "costs", text: "Push makes writes O(followers) and reads cheap; pull makes writes cheap and reads O(following)." },
        { id: "ratio", text: "The read/write ratio and the follower distribution decide which is cheaper." },
        { id: "hybrid", text: "Hybrid: push for most authors, merge high-audience authors at read time." },
        { id: "refinements", text: "Mentions skipping inactive readers or storing references rather than copies.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["caching", "partitioning", "asynchronous-processing", "publish-subscribe"],
  },
  {
    id: "request-coalescing",
    title: "Request coalescing",
    domain: "performance",
    summary:
      "When many callers ask for the same thing at the same moment, do the expensive work once and give every caller the result. The fix for thundering herds and hot keys.",
    problem: md`
      Popular data is requested in bursts: a message in a huge channel, a cache entry that just expired, a profile shared on the front page. If each request independently goes to the database, a thousand concurrent readers become a thousand identical queries, and the database falls over computing the same answer a thousand times.
    `,
    mechanism: md`
      Keep a table of **in-flight requests** keyed by what is being fetched. The first caller for a key starts the fetch and registers it; later callers for the same key **wait on the same result** instead of starting their own. When the fetch completes, every waiter gets the answer and the entry is removed.

      This only works if requests for the same key meet in the same place, so coalescing is usually paired with **routing by key**: a consistent hash sends every request for a channel or key to the same instance, where coalescing can see them all.

      At the cache layer the same idea appears as a **lease** or **lock on miss**: the cache grants one caller the right to refill a missing key and tells the others to wait briefly and retry. They then find the value already filled.

      Related tools solve neighbouring problems: **stale-while-revalidate** serves the old value while one caller refreshes it, and **jittered TTLs** stop many keys from expiring at once.
    `,
    assumptions: [
      "Concurrent callers can accept the same result (the query is not per-caller).",
      "Requests for the same key can be routed to the same place.",
      "Waiting a few milliseconds for someone else's fetch is acceptable.",
    ],
    alternatives: [
      { name: "Caching with a long TTL", when: "Repeated reads are spread over time rather than simultaneous." },
      { name: "Precomputation", when: "The hot result is predictable and can be pushed before anyone asks." },
      { name: "Rate limiting the source", when: "Protecting the source matters more than serving everyone." },
    ],
    failureModes: [
      { name: "Coalescing on the wrong key", description: "Per-user results are shared between users, leaking data." },
      { name: "A slow leader stalls everyone", description: "All waiters inherit the first fetch's latency or failure; time out the shared fetch." },
      { name: "Scattered routing", description: "Requests for one key land on many instances, so each instance coalesces only a fraction." },
    ],
    implementations: [
      { name: "singleflight (Go)", note: "A library-level in-process coalescer." },
      { name: "Cache leases", note: "The cache grants one refill per key and asks others to retry." },
      { name: "CDN request collapsing", note: "Edges send one origin request per object while others wait." },
      { name: "Data services behind a hash ring", note: "All requests for a key reach one coalescing instance." },
    ],
    claims: [
      {
        id: "replaces-cache",
        statement: "Request coalescing does the same job as a cache.",
        verdict: "fails",
        explanation: "Coalescing only merges requests that overlap in time; a cache serves requests spread over time. They are complementary: coalescing protects the source when the cache misses.",
      },
      {
        id: "needs-routing",
        statement: "Coalescing in a fleet of 50 instances is far less effective unless requests for a key are routed to the same instance.",
        verdict: "holds",
        explanation: "With random routing, each instance sees about 1/50th of a key's burst and still makes its own query. Consistent hashing by key concentrates the burst so it collapses to one query.",
      },
      {
        id: "per-user",
        statement: "Any two concurrent GET requests to the same URL can safely be coalesced.",
        verdict: "fails",
        explanation: "Responses that depend on who is asking (permissions, personalization) must not be shared. Coalesce on the full key that determines the response.",
      },
    ],
    explain: {
      prompt: "Explain how request coalescing protects a database from a burst of identical reads, and what it depends on.",
      rubric: [
        { id: "inflight", text: "Tracks in-flight fetches by key; later callers wait on the existing fetch." },
        { id: "routing", text: "Requests for the same key must reach the same place (routing by key)." },
        { id: "vs-cache", text: "Distinguishes it from caching: it collapses simultaneous requests, not repeated ones.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["caching", "consistent-hashing", "backpressure"],
  },
  {
    id: "load-shedding",
    title: "Load shedding",
    domain: "performance",
    summary:
      "Rejecting some work on purpose when a system is overloaded, so the work it does accept still finishes in time. Cheap rejections beat slow failures.",
    problem: md`
      An overloaded server that accepts everything does everything slowly. Requests time out after consuming CPU, retries pile on, and goodput (useful work completed in time) falls toward zero even though the server is 100% busy. Overload that is not shed becomes an outage.
    `,
    mechanism: md`
      Decide **early and cheaply** which work to refuse:

      - **Detect overload** from a signal that leads rather than lags: concurrency in flight, queue age, worker utilization. CPU alone is often too late.
      - **Reject before doing expensive work**: at the edge, before parsing big bodies, before taking locks. A rejection should cost a tiny fraction of a request.
      - **Prioritize**: classify work (critical API calls vs. analytics, interactive vs. batch) and shed the lowest priority first. Reserve capacity for the work that matters most.
      - **Tell callers what to do**: 503 or 429 with \`Retry-After\`, so well-behaved clients back off instead of retrying immediately.
      - **Drop work nobody is waiting for**: a queued request whose client already timed out should be discarded, not processed.

      Load shedding complements rate limiting: rate limits enforce **fairness per client** under normal load; shedding protects **the system as a whole** when total demand exceeds capacity, whoever caused it.
    `,
    assumptions: [
      "Work can be ranked, so some of it is safe to refuse.",
      "Callers handle rejection by backing off rather than retrying at once.",
      "The overload signal is measured close to where the shedding happens.",
    ],
    alternatives: [
      { name: "Autoscaling", when: "Load rises slowly enough for new capacity to arrive before queues explode." },
      { name: "Queueing", when: "The burst is short and the work can wait." },
      { name: "Degrading responses", when: "A cheaper version of the response (cached, partial) is better than none." },
    ],
    failureModes: [
      { name: "Shedding too late", description: "The signal lags, so the server is already thrashing before it starts rejecting." },
      { name: "Expensive rejection", description: "Requests are fully parsed or authenticated before being rejected, so shedding barely saves anything." },
      { name: "Retry storms", description: "Rejected clients retry immediately and multiply the load." },
      { name: "Shedding the wrong work", description: "Without priorities, critical requests are dropped as readily as background work." },
    ],
    implementations: [
      { name: "Concurrency limiters", note: "Cap requests in flight per endpoint or per client." },
      { name: "Priority load shedders", note: "Reserve a share of workers for critical traffic and reject the rest first." },
      { name: "Queue deadlines", note: "Discard queued work older than the caller's timeout." },
    ],
    claims: [
      {
        id: "accept-all",
        statement: "Accepting every request and processing them slowly is kinder to users than rejecting some.",
        verdict: "fails",
        explanation: "Past saturation, accepting more work makes every request slower until most time out after consuming resources. Rejecting some quickly keeps the rest succeeding.",
      },
      {
        id: "rate-limit-enough",
        statement: "Per-client rate limits make load shedding unnecessary.",
        verdict: "fails",
        explanation: "Every client can be within its limit while the total still exceeds capacity, for example after an incident when everyone retries. Shedding protects aggregate capacity.",
      },
      {
        id: "stale-queue",
        statement: "Processing queued requests whose callers have already timed out wastes capacity.",
        verdict: "holds",
        explanation: "Nobody will read the answer. Checking a deadline before starting work turns that capacity back into useful work.",
      },
    ],
    explain: {
      prompt: "Explain why an overloaded service should reject work, and how it should decide what to reject.",
      rubric: [
        { id: "goodput", text: "Accepting everything past capacity collapses goodput; rejecting some keeps the rest within deadlines." },
        { id: "cheap", text: "Rejection must happen early and cost little." },
        { id: "priority", text: "Lower-priority work is shed first, with capacity reserved for critical work." },
        { id: "signal", text: "Mentions a leading overload signal (concurrency, queue age) or telling callers to back off.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["backpressure", "rate-limiting", "retries-and-backoff", "timeouts"],
  },
];
