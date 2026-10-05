import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const distributedCache = {
  id: "distributed-cache",
  title: "A cache in front of everything",
  searchTitle: "Design a Distributed Cache (Memcache)",
  premise:
    "Built from Facebook's paper on scaling memcache: a look-aside cache serving billions of reads a second, where speed is the easy part and the real work is stale sets, thundering herds, dead servers and invalidations that have to cross regions.",
  difficulty: "advanced",
  estimatedMinutes: 50,
  scenario: md`
    A social network renders every page from many small pieces of data: profiles, friend lists, posts, counts, permissions. A popular page fetches hundreds of distinct items; Facebook reported an average of 521 for its most popular pages. MySQL holds the truth, but it cannot serve this read load, and it is provisioned only for the traffic that misses the cache.

    So the web servers use memcached as a **demand-filled, look-aside cache**: read the cache; on a miss, query the database and put the result in the cache. Reads exceed writes by orders of magnitude, and a little staleness is acceptable, as long as people see their own changes and nothing stays stale for long.

    Facebook described how this grew from one cluster to many clusters and regions in "Scaling Memcache at Facebook" (NSDI 2013). This investigation follows the problems they hit and the mechanisms they built.
  `,
  objectives: [
    "Explain why a look-aside cache deletes on write instead of updating.",
    "Find and fix the race that leaves stale data in the cache indefinitely.",
    "Stop a hot key's misses from stampeding the database.",
    "Keep a failed cache server from turning into a database outage.",
    "Invalidate copies across clusters and regions, and reason about replica lag.",
  ],
  prerequisites: ["caching", "replication"],
  requirements: {
    functional: [
      "Serve cached values for arbitrary keys (query results, computed objects) to web servers.",
      "Reflect writes: after a change, readers stop seeing the old value.",
      "Keep serving when cache servers fail, and when new clusters start empty.",
      "Work across several frontend clusters and several regions.",
    ],
    nonFunctional: [
      "The database must never receive more than the miss load it is provisioned for.",
      "A user sees their own writes on their next request.",
      "Other users may see stale data briefly, never indefinitely.",
      "Losing a few cache servers does not overload the database.",
    ],
  },
  constraints: [
    "Billions of cache reads a second across the fleet; writes are a tiny fraction.",
    "A page needs hundreds of keys, fetched in parallel batches.",
    "One master region holds the MySQL primaries; other regions have read replicas.",
  ],
  assumptions: [
    "Cached values are small and derived from the database.",
    "Any cached key can be evicted at any time.",
    "Brief staleness is acceptable for most data.",
  ],
  competencies: [
    { id: "semantics", label: "Look-aside semantics", description: "Demand-fill, delete on write, and what the cache is allowed to forget." },
    { id: "races", label: "Cache races", description: "Stale sets and thundering herds, and the lease mechanism that fixes both." },
    { id: "failure", label: "Failing safely", description: "Keeping dead servers and cold clusters from overloading the database." },
    { id: "invalidation", label: "Invalidation at scale", description: "Delivering deletes reliably to every copy, in every cluster." },
    { id: "consistency", label: "Consistency trade-offs", description: "Replica lag, read-your-writes, and what 'eventually' costs." },
  ],
  system: {
    components: [
      { id: "users", label: "Users", kind: "client", responsibility: "Load pages.", position: { col: 0, row: 1 } },
      { id: "web", label: "Web servers", kind: "service", responsibility: "Render pages; read through the cache, query MySQL on a miss, delete keys after writes.", position: { col: 1, row: 1 } },
      { id: "mcrouter", label: "mcrouter", kind: "service", responsibility: "Routes each key to a memcached server by consistent hashing; fans out deletes.", position: { col: 2, row: 1 } },
      { id: "memcache", label: "memcached pool", kind: "cache", responsibility: "Demand-filled key-value cache; issues leases on misses.", position: { col: 3, row: 1 } },
      { id: "gutter", label: "Gutter pool", kind: "cache", responsibility: "About 1% of servers, idle until a memcached server fails; short-lived entries.", position: { col: 3, row: 2 } },
      { id: "mysql", label: "MySQL", kind: "database", responsibility: "The source of truth. Writes embed the cache keys to invalidate.", durableState: "all user data, commit log", position: { col: 1, row: 0 } },
      { id: "mcsqueal", label: "Invalidation daemon", kind: "worker", responsibility: "Tails the commit log, extracts deletes and sends them in batches to every cluster.", position: { col: 2, row: 0 } },
    ],
    flows: [
      { id: "page", from: "users", to: "web", label: "Page request", kind: "request" },
      { id: "get", from: "web", to: "mcrouter", label: "get / multiget, delete", kind: "request" },
      { id: "route", from: "mcrouter", to: "memcache", label: "Keys by consistent hash", kind: "request" },
      { id: "miss", from: "web", to: "mysql", label: "Query on miss; writes", kind: "request" },
      { id: "log", from: "mysql", to: "mcsqueal", label: "Committed deletes", kind: "data" },
      { id: "invalidate", from: "mcsqueal", to: "mcrouter", label: "Batched deletes", kind: "async" },
      { id: "fallback", from: "mcrouter", to: "gutter", label: "On server failure", kind: "request" },
    ],
    invariants: [
      {
        id: "no-stale-set",
        statement: "A value read before a write cannot be stored in the cache after that write's delete.",
        enforcedBy: ["memcache"],
        mechanism: "A miss returns a lease token; a delete invalidates outstanding tokens; a set with an invalid token is rejected.",
      },
      {
        id: "invalidations-delivered",
        statement: "Every committed write's invalidations reach every cluster, and can be replayed if lost.",
        enforcedBy: ["mysql", "mcsqueal"],
        mechanism: "Keys to delete are recorded with the committed SQL; daemons read the commit log and batch deletes to each cluster.",
      },
      {
        id: "failure-contained",
        statement: "A failed cache server does not send its full load to the database.",
        enforcedBy: ["mcrouter", "gutter"],
        mechanism: "Requests to an unresponsive server retry against a small gutter pool that fills on demand and expires quickly.",
      },
    ],
  },
  stages: [
    {
      id: "look-aside",
      title: "How a look-aside cache behaves",
      phase: "model",
      dimensions: ["explain", "trace"],
      conceptIds: ["caching", "idempotency"],
      competencyIds: ["semantics"],
      context: md`
        Reads: get from the cache; on a miss, query MySQL and set the result. Writes: update MySQL, then do something about the cached copy.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "update-on-write",
            statement: "After a write, the web server should set the new value in the cache so the next read hits.",
            verdict: "fails",
            explanation:
              "Facebook deletes instead. A delete is idempotent and order-insensitive: two deletes in any order leave the same result. Two concurrent sets can arrive in the wrong order and leave the older value cached. The next read refills from the database.",
          },
          {
            id: "evict-safe",
            statement: "Because the cache is not the source of truth, losing any cached key must always be safe.",
            verdict: "holds",
            explanation: "It may cost a database query, but never correctness. Hold on to this: stage 7 introduces a key for which it is no longer true.",
          },
          {
            id: "one-at-a-time",
            statement: "To keep latency low, a page that needs 500 keys should fetch them one by one.",
            verdict: "fails",
            explanation:
              "500 sequential round trips is far too slow. Clients batch independent keys into parallel multigets, ordering them by data dependencies. That creates its own problem: hundreds of responses arriving at once (incast), which clients limit with a sliding window of outstanding requests.",
          },
          {
            id: "hit-rate",
            statement: "If the hit rate drops from 99% to 98%, the database receives about twice as many reads.",
            verdict: "holds",
            explanation: "Misses go from 1% to 2% of reads. Small changes in hit rate are large changes in database load, which is why everything later in this investigation is about protecting the miss path.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          The look-aside contract is simple: **the database is the truth, the cache is a disposable copy, writes delete.** The arithmetic is the part people miss: at high hit rates, the database's load is the *miss* rate, so anything that causes a burst of misses (a hot key, a dead server, an empty cluster) is a database incident.
        `,
      },
    },
    {
      id: "stale-set",
      title: "A stale value that never leaves",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["caching", "concurrency-control", "leases-and-fencing"],
      competencyIds: ["races", "semantics"],
      event: {
        kind: "failure",
        title: "A renamed user keeps showing the old name",
        detail: "Ann renamed herself to Annie. Most people still see 'Ann' a day later. The database says 'Annie'. Here is what happened, reconstructed from logs.",
      },
      context: md`
        Two web servers, A and B, touched the same key around the same time. Find the lines that explain why the cache holds the old value indefinitely.
      `,
      interaction: {
        kind: "diagnosis",
        prompt: "Select the lines that are part of the problem.",
        artifact: {
          type: "timeline",
          caption: "Key user:42",
          lines: [
            { text: "t1  A: get user:42 → miss" },
            { text: "t2  A: SELECT name FROM users WHERE id = 42 → 'Ann'" },
            { text: "t3  B: UPDATE users SET name = 'Annie' WHERE id = 42; COMMIT" },
            { text: "t4  B: delete user:42   (nothing cached yet, so nothing removed)" },
            {
              text: "t5  A: set user:42 = 'Ann'",
              fault: "A's set carries a value read before B's write, and arrives after B's delete. Nothing tells the cache that this value is older than the write it already saw invalidated.",
            },
            {
              text: "t6  memcached: stores 'Ann' (sets are unconditional)",
              fault: "An unconditional set lets any late writer win. The cache needs a way to reject sets that started before a delete.",
            },
            { text: "t7+ everyone: get user:42 → 'Ann'  (until the next write to user 42, or eviction)" },
          ],
        },
        rationale: {
          prompt: "Explain the race, and a mechanism in the cache that prevents it.",
          rubric: [
            { id: "order", text: "The refill read happened before the write but the set arrived after the delete." },
            { id: "indefinite", text: "Nothing removes the stale value until another write or an eviction." },
            { id: "lease", text: "Leases: a miss returns a token tied to the key; a delete invalidates it; a set with an invalidated token is rejected." },
            { id: "ttl", text: "A TTL bounds the damage but does not prevent it.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          This is a **stale set**: a refill computed from old data lands after the invalidation meant to remove it. Deleting instead of setting on write does not fix it, because the problem is the *reader's* set.

          Facebook's fix is a **lease**: a miss hands the client a token for that key, and the refill is accepted only if it carries the token. A delete for that key invalidates outstanding tokens, so A's late set is rejected. It is the same idea as a fencing token in [[leases-and-fencing]]: a write is only accepted if nothing newer has happened since it was authorised.
        `,
      },
    },
    {
      id: "thundering-herd",
      title: "The key everyone wants",
      phase: "decide",
      dimensions: ["defend", "break"],
      conceptIds: ["request-coalescing", "caching", "backpressure"],
      competencyIds: ["races"],
      event: {
        kind: "scale",
        title: "A viral post's like count",
        detail:
          "The like count is read by every page that shows the post and updated thousands of times a minute. Each update deletes the key, and in the instant before it is refilled, thousands of web servers miss and all query MySQL.",
      },
      context: md`
        The database is provisioned for the normal miss rate. This one key is producing a large share of all misses.
      `,
      interaction: {
        kind: "decision",
        prompt: "What do you change?",
        options: [
          {
            id: "longer-ttl",
            label: "Give the key a much longer TTL",
            assessment: "flawed",
            feedback: "The key is not expiring; it is being deleted by writes. A TTL does nothing about misses caused by invalidation.",
          },
          {
            id: "rate-limited-leases",
            label: "Rate-limit leases: hand out one refill token per key every few seconds; other missing clients are told to wait briefly and retry",
            assessment: "sound",
            feedback:
              "One client refills while the rest wait a few milliseconds and then find the value in the cache. Facebook issued at most one token per key every 10 seconds; on keys prone to herds, peak database queries fell from 17,000 a second to 1,300.",
          },
          {
            id: "set-on-write",
            label: "Set the new value on write instead of deleting, so there is never a miss",
            assessment: "flawed",
            feedback: "It reintroduces racing sets: concurrent updates can land in the wrong order and leave an older count cached. It trades a load problem for a correctness problem.",
          },
          {
            id: "serve-stale",
            label: "Keep recently deleted values briefly, and serve them (marked stale) to callers that can tolerate it while one refills",
            assessment: "defensible",
            feedback:
              "Facebook did this too, for data where a slightly old value is fine (a like count usually is). It removes the wait entirely, but each caller must opt in, because some data must never be served stale.",
          },
        ],
        rationale: {
          prompt: "Why does a hot, frequently written key stampede the database, and how does your fix bound it?",
          rubric: [
            { id: "cause", text: "Every write deletes the key, and many concurrent readers miss in the gap before refill." },
            { id: "one-refill", text: "Only one caller should refill; the others wait or use a stale value." },
            { id: "bounded", text: "The database sees at most one refill per key per interval, however many readers there are." },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The same lease that prevents stale sets also prevents herds once you **rate-limit how often it is granted**. That is [[request-coalescing]] implemented inside the cache: one caller does the work, everyone else waits on its result.

          Stale values are the complementary tool: when a caller can live with a slightly old answer, it does not need to wait at all.
        `,
      },
    },
    {
      id: "write-the-client",
      title: "Write the lease-aware read",
      phase: "break",
      dimensions: ["implement"],
      conceptIds: ["request-coalescing", "leases-and-fencing", "retries-and-backoff"],
      competencyIds: ["races"],
      context: md`
        The cache's \`get\` now returns one of three things: a value, a lease token (you should refill), or "wait" (someone else is refilling). \`setWithLease\` returns false if the token was invalidated. Write the web server's read helper.
      `,
      interaction: {
        kind: "implementation",
        prompt: "Implement cachedRead.",
        language: "typescript",
        starter: md`
          type GetResult<T> = { kind: "hit"; value: T } | { kind: "lease"; token: bigint } | { kind: "wait" };

          declare const cache: {
            get<T>(key: string): Promise<GetResult<T>>;
            setWithLease<T>(key: string, value: T, token: bigint): Promise<boolean>;
          };

          export async function cachedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
            // hit, refill with the lease, or wait and retry
          }
        `,
        rubric: [
          { id: "hit", text: "Returns the value on a hit." },
          { id: "lease", text: "On a lease, loads from the database and sets with the token, returning the loaded value whether or not the set is accepted." },
          { id: "wait", text: "On 'wait', sleeps briefly and retries, with a bounded number of attempts." },
          { id: "fallback", text: "After the retries run out, reads from the database directly rather than failing the page." },
          { id: "jitter", text: "Adds jitter to the wait so waiting clients do not retry in lockstep.", weight: "supporting" },
        ],
        reference: {
          code: md`
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

            export async function cachedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
              for (let attempt = 0; attempt < 5; attempt++) {
                const result = await cache.get<T>(key);
                if (result.kind === "hit") return result.value;
                if (result.kind === "lease") {
                  const value = await load();
                  // Rejected if a delete arrived meanwhile: our value may be stale, so it is
                  // not cached, but it is still a valid answer for this request.
                  await cache.setWithLease(key, value, result.token);
                  return value;
                }
                // Someone else holds the lease; it is usually filled within milliseconds.
                await sleep(5 * 2 ** attempt + Math.random() * 5);
              }
              return load();
            }
          `,
          notes: md`
            - A rejected set is not an error. It only means this value must not be *cached*; returning it to the caller who asked is fine, because it was correct when read.
            - Waits are short and grow, with jitter; most waiters find the value on their first retry.
            - The final fallback goes to the database, so a lost lease holder (a crashed web server) costs a few milliseconds, not a broken page. Leases also expire on the server for the same reason.
          `,
        },
      },
      reveal: {
        reasoning: md`
          The client is where the protocol becomes behaviour: what to do with a token, what to do while waiting, and what to do when waiting goes on too long. Each branch has a reason, and each has a bound.
        `,
      },
    },
    {
      id: "server-dies",
      title: "A cache server dies",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["caching", "consistent-hashing", "backpressure"],
      competencyIds: ["failure"],
      event: {
        kind: "failure",
        title: "One memcached server stops responding",
        detail:
          "Automated remediation will replace it, but that takes a few minutes. Every key it held now misses. Some of those keys are among the hottest in the cluster; one of them alone takes about a fifth of that server's requests.",
      },
      context: md`
        The database is provisioned for the normal miss rate. Decide what clients do in the minutes before the replacement arrives.
      `,
      interaction: {
        kind: "decision",
        prompt: "What should clients do with requests for the failed server's keys?",
        options: [
          {
            id: "db",
            label: "Go straight to the database for those keys until the server is replaced",
            assessment: "flawed",
            feedback: "Every request that server used to absorb becomes a database query, minutes of a miss rate the database was never provisioned for. That is how one cache failure becomes a site outage.",
          },
          {
            id: "rehash",
            label: "Rehash its keys onto the remaining memcached servers",
            assessment: "flawed",
            feedback:
              "The failed server's hot keys land on healthy servers that are already busy; a key that is 20% of a server's traffic can overload its new home, which fails in turn. Facebook rejected this specifically because of cascading failures.",
          },
          {
            id: "gutter",
            label: "Retry failed gets against a small, normally idle 'gutter' pool that fills on demand, with short expiry and no invalidations",
            assessment: "sound",
            feedback:
              "Roughly 1% of servers sit idle until needed. A failed get retries against gutter; a gutter miss queries the database once and fills gutter, so the next request hits. Facebook reported gutter hit rates above 35% within four minutes, and a 99% drop in client-visible failures. Entries expire quickly because gutter does not receive invalidations.",
          },
          {
            id: "double",
            label: "Store every key on two memcached servers",
            assessment: "defensible",
            feedback: "Doubling memory for every key costs a lot to cover rare failures. Facebook did replicate some key families inside pools, for read throughput, not as the general answer to failure.",
          },
        ],
        rationale: {
          prompt: "Why does your choice protect the database, and what does it give up?",
          rubric: [
            { id: "miss-load", text: "A failed server's keys all miss at once; the database cannot absorb that load." },
            { id: "cascade", text: "Rehashing onto busy servers risks cascading failure because of hot keys." },
            { id: "idle", text: "Spare capacity that is idle until a failure absorbs the load without disturbing healthy servers." },
            { id: "stale", text: "Gutter entries may be slightly stale, so they expire quickly.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The general lesson: **when part of a cache fails, the load it was absorbing has to go somewhere**, and the database is the worst place. Gutter gives that load a home that is empty, cheap and temporary.

          Notice why gutter can skip invalidations: its entries live for seconds. Short-lived copies need far less consistency machinery than long-lived ones.
        `,
      },
      reveals: { components: ["gutter"], flows: ["fallback"] },
    },
    {
      id: "invalidate-everywhere",
      title: "Deletes for every cluster",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["transactional-outbox", "event-log", "caching"],
      competencyIds: ["invalidation"],
      event: {
        kind: "scale",
        title: "One cluster becomes several",
        detail:
          "The region now has several frontend clusters, each with its own web servers and memcached pool, all sharing one storage cluster. A popular key may be cached in every one of them. A write must invalidate all of those copies.",
      },
      context: md`
        Web servers currently delete keys in their own cluster after writing. Deletes must now reach every cluster, reliably, at a very high rate.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should invalidations reach every cluster?",
        options: [
          {
            id: "web-broadcast",
            label: "The web server that wrote sends deletes to every cluster",
            assessment: "defensible",
            feedback:
              "Simple, but each web server batches poorly, so packet rates across cluster boundaries are high. And if deletes are lost or misrouted (a configuration bug), there is no record to replay; Facebook's recourse used to be a slow rolling restart of the whole cache.",
          },
          {
            id: "commit-log",
            label: "Record the keys to invalidate with the committed SQL; daemons on each database tail the commit log and send batched deletes to routers in every cluster",
            assessment: "sound",
            feedback:
              "Invalidations become part of the durable commit, so they cannot be lost when a web server crashes, and they can be replayed. Daemons batch them (an 18× improvement in deletes per packet), and routers in each cluster fan them out. The writing web server still deletes in its own cluster for read-your-writes.",
          },
          {
            id: "ttl-only",
            label: "Rely on short TTLs everywhere instead of invalidating",
            assessment: "defensible",
            feedback: "Staleness is bounded with no machinery, but short TTLs mean many more misses across the whole fleet, which is exactly the load the cache exists to remove.",
          },
          {
            id: "write-through",
            label: "Write the new value through to every cluster's cache",
            assessment: "flawed",
            feedback: "Sets racing across clusters can arrive out of order and leave old values cached, and most of those clusters may never read the key, so you fill caches with data nobody asked for.",
          },
        ],
        rationale: {
          prompt: "Why is the database's commit log a better source of invalidations than the web server?",
          rubric: [
            { id: "durable", text: "Invalidations committed with the write cannot be lost when the writer crashes." },
            { id: "replay", text: "A log can be replayed after a delivery failure or misrouting." },
            { id: "batching", text: "Daemons batch deletes efficiently across cluster boundaries." },
            { id: "local", text: "The writer still deletes locally for read-your-writes.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          This is the [[transactional-outbox]] idea applied to caches: the side effect (invalidate these keys) is recorded **in the same commit** as the data change, and a separate process reliably delivers it from the log. See also [[event-log]].

          Facebook noted that only about 4% of deletes actually remove a cached value. Most keys are not cached in a given cluster when they change, which is why cheap, batched delivery matters more than precise targeting.
        `,
      },
      reveals: { components: ["mcsqueal"], flows: ["log", "invalidate"] },
    },
    {
      id: "across-regions",
      title: "A second region",
      phase: "change",
      dimensions: ["change", "break", "explain"],
      conceptIds: ["replication", "caching"],
      competencyIds: ["consistency", "invalidation"],
      event: {
        kind: "requirement-change",
        title: "A region on another continent",
        detail:
          "The new region has its own frontend clusters and MySQL read replicas. All writes go to the master region and replicate over, usually within a second, sometimes much more.",
      },
      context: md`
        Replicas can lag behind the master. Caches in the replica region are filled from the local replica.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "own-write",
            statement: "A user in the replica region who changes their profile may see the old version on their next request.",
            verdict: "holds",
            explanation: "Their write went to the master. If their next request misses the cache, it refills from a local replica that may not have the change yet, and caches the old value.",
          },
          {
            id: "master-sends",
            statement: "The master region's web server should send invalidations straight to the replica region right after its write.",
            verdict: "fails",
            explanation:
              "The delete can arrive before replication does. A read in the replica region then misses, refills from the lagging replica, and caches the old value with nothing left to remove it. Invalidations in each region should come from that region's own database log, after the data has arrived.",
          },
          {
            id: "remote-marker",
            statement: "Setting a 'recently written' marker for a key, and sending misses for marked keys to the master region, trades latency for freshness.",
            verdict: "holds",
            explanation:
              "Facebook called these remote markers: set the marker, write to the master, delete the local key. A miss that finds a marker reads from the master region (slower) instead of the possibly stale replica.",
          },
          {
            id: "marker-eviction",
            statement: "Evicting a remote marker is as harmless as evicting any other cached key.",
            verdict: "fails",
            explanation:
              "A marker is information, not a copy: its presence says 'the local replica may be stale for this key'. Evicting it means a read may go to the stale replica. Facebook pointed this out explicitly; it is rare enough in practice to accept.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          Across regions, the cache inherits the database's [[replication]] lag. Two rules follow: **invalidate after the data arrives** (by tailing each region's own log), and **route a writer's reads to the master** while their write is in flight.

          The marker claim is the subtle one. Stage 1 said any key can be safely evicted. That is true for copies of data. A key whose *presence* carries meaning is not a cache entry anymore, and the system has to know the difference.
        `,
      },
    },
    {
      id: "cold-cluster",
      title: "A cluster with an empty cache",
      phase: "break",
      dimensions: ["break", "change"],
      conceptIds: ["caching", "backpressure"],
      competencyIds: ["failure", "consistency"],
      event: {
        kind: "failure",
        title: "A frontend cluster comes back from maintenance with empty caches",
        detail: "Its hit rate is near zero. Sending it full user traffic would send nearly all of that traffic to MySQL.",
      },
      context: md`
        Other clusters in the region have warm caches with roughly the same data.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you bring the cold cluster back?",
        options: [
          {
            id: "just-traffic",
            label: "Send it traffic and let the caches fill from the database",
            assessment: "flawed",
            feedback: "Nearly every request misses, so the cluster's entire read load hits MySQL. With a large cluster, that is a database outage. Facebook said warming this way took days.",
          },
          {
            id: "warm-from-peer",
            label: "On a miss, fetch from a warm cluster's cache and add the value locally; deletes in the cold cluster carry a short hold-off that rejects adds",
            assessment: "sound",
            feedback:
              "Misses are served from memory in a neighbouring cluster instead of the database, and the cluster warms in hours. The hold-off (two seconds at Facebook) closes a race: without it, a value deleted after a write could be re-added from the warm cluster before that cluster received the same delete.",
          },
          {
            id: "copy-dump",
            label: "Copy a full snapshot of a warm cluster's cache before sending traffic",
            assessment: "defensible",
            feedback: "It warms everything, including keys that will never be read here, and the data changes while it copies, so you still need invalidation during and after the copy.",
          },
        ],
        rationale: {
          prompt: "What race does warming from a peer introduce, and how is it closed?",
          rubric: [
            { id: "load", text: "An empty cache sends its whole read load to the database." },
            { id: "peer", text: "A warm peer cache can absorb the misses instead." },
            { id: "race", text: "A value can be deleted locally and then re-added from the peer before the peer gets the delete." },
            { id: "holdoff", text: "A hold-off after deletes rejects adds for a short window, and a failed add means 'go to the database'." },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Every mechanism in this investigation answers the same question: **where does the miss load go?** Leases send it to one refiller, gutter sends it to idle servers, warmup sends it to a neighbour's memory. The database only ever sees what it was provisioned for.

          Each one also opens a small consistency window, and each closes it with a bounded mechanism (a token, a short expiry, a hold-off) instead of perfect consistency.
        `,
      },
    },
    {
      id: "defend-eventual",
      title: "Defend 'best-effort eventual consistency'",
      phase: "defend",
      dimensions: ["defend"],
      conceptIds: ["caching", "replication", "leases-and-fencing"],
      competencyIds: ["consistency", "semantics", "races"],
      context: md`
        Your interviewer: "Your cache can serve stale data in at least four ways. Why not a strongly consistent cache, or write-through updates, and be done with it?"
      `,
      interaction: {
        kind: "open",
        prompt: "Defend the consistency model: what is guaranteed, what is not, and what strong consistency would cost here.",
        placeholder: "Readers always see their own writes, because…",
        rubric: [
          { id: "guarantees", text: "States what is guaranteed: read-your-writes for the writer, bounded staleness, no indefinite stale sets." },
          { id: "cost", text: "Explains what strong consistency costs at this scale: coordination on every read or write, latency, availability during failures." },
          { id: "write-through", text: "Explains why write-through does not solve ordering and fills caches with unread data." },
          { id: "data-specific", text: "Notes that data needing strong consistency can bypass the cache or read from the master.", weight: "supporting" },
        ],
        reference: md`
          **What is guaranteed.** A user sees their own writes (local delete plus remote markers). A stale value cannot be cached after a newer write's delete (leases). Invalidations are recorded with every commit and replayed if lost, so staleness is bounded, not indefinite.

          **What is not.** Other users may see a slightly old value for a short time: during replication lag, from gutter, or during warmup.

          **What strong consistency would cost.** Every read would have to confirm with the source (or every write would have to synchronously update or lock every copy across clusters and regions) before answering. At billions of reads a second, that means cross-region round trips on the hot path and a cache that stops serving when any participant is unreachable. The whole point of the cache is to avoid the database; strongly consistent caching brings it back into every read.

          **Why not write-through.** Concurrent sets still race across clusters, so ordering is still a problem, and it fills every cluster with values they may never read.

          **Where I would choose differently.** For data where staleness is unacceptable (balances, permissions changes that must apply instantly), read from the master or skip the cache.
        `,
      },
      reveal: {
        reasoning: md`
          "Eventually consistent" is not an answer by itself. A strong defence lists the **specific** guarantees, the **specific** windows of staleness and the mechanism that bounds each one. That is what Facebook's paper does, and what an interviewer wants to hear.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      The cache is a **disposable, demand-filled copy**: writes go to MySQL and **delete** cached keys, reads refill on a miss. Because database load equals the miss rate, every mechanism protects the miss path.

      **Leases** reject refills that started before a newer write (no stale sets) and, rate-limited, let one caller refill a hot key while others wait (no thundering herds). A **gutter pool** absorbs a dead server's load; **cold-cluster warmup** borrows a neighbour's memory. Invalidations are **recorded with each commit** and delivered from the log in batches to every cluster, after the data has replicated, so they are durable, replayable and correctly ordered. Writers see their own changes through local deletes and **remote markers**; everyone else gets bounded staleness.
    `,
    reliesOn: [
      "Reads vastly outnumber writes, and most data tolerates brief staleness.",
      "The cache is never the only copy of anything (except deliberately, like remote markers).",
      "Cache keys to invalidate can be known at write time.",
      "Spare capacity (gutter) is kept idle for failures.",
    ],
    alternatives: [
      { design: "Write-through graph cache (like Facebook's later TAO)", preferWhen: "The data model is uniform enough for the cache to understand and update it." },
      { design: "Short TTLs with no invalidation", preferWhen: "Staleness of seconds is fine and write rates are high." },
      { design: "Database read replicas instead of a cache", preferWhen: "Queries are too varied to cache by key." },
    ],
    tradeoffs: [
      { choice: "Delete on write", gains: "Idempotent, order-insensitive invalidation.", costs: "A miss after every write." },
      { choice: "Leases", gains: "No stale sets; one refill per hot key.", costs: "Brief waits for other readers; a protocol change." },
      { choice: "Gutter pool", gains: "Server failures do not reach the database.", costs: "~1% idle capacity; slightly stale entries." },
      { choice: "Invalidation from the commit log", gains: "Durable, replayable, batched, correctly ordered.", costs: "Daemons on every database; invalidation delay." },
    ],
    breaksWhen: [
      "Data requires strong consistency for every reader.",
      "Write rates approach read rates, so deletes keep the hit rate low.",
      "Keys to invalidate cannot be determined from the write.",
    ],
  },
  interviewVariants: [
    "Design a distributed cache.",
    "How do you keep a cache consistent with the database?",
    "A hot key expires and the database falls over. What happened and how do you prevent it?",
    "Design Memcached or Redis as a service for a large company.",
  ],
  relatedInvestigationIds: ["url-shortener", "news-feed"],
} satisfies InvestigationInput;
