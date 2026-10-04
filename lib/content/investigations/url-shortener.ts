import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const urlShortener = {
  id: "url-shortener",
  title: "A URL shortener, without the cargo cult",
  searchTitle: "Design a URL Shortener",
  premise:
    "The classic interview question, done with numbers instead of reflexes: generate short codes that never collide, redirect fast for users everywhere, count clicks without slowing redirects, and take down a malicious link immediately.",
  difficulty: "foundational",
  estimatedMinutes: 40,
  scenario: md`
    A marketing-tools company offers short links: customers paste a long URL, get \`sho.rt/aZ3kQ9x\`, and put it in emails, posters and social posts. They see click counts per link, by day and country.

    Expect about 100 million new links a month and 10 billion redirects a month, peaking at roughly five times the average during big campaigns. Clicks come from everywhere; the company's infrastructure is in one region today. Links occasionally point to malware, and when they do, the trust-and-safety team needs them dead now.
  `,
  objectives: [
    "Size the system with arithmetic before choosing components.",
    "Generate short, unguessable codes with uniqueness enforced, not hoped for.",
    "Separate a latency problem from a throughput problem, and fix the right one.",
    "Keep analytics off the redirect's critical path.",
    "Reason about caches and replicas when data must disappear or appear immediately.",
  ],
  prerequisites: ["caching", "id-generation"],
  requirements: {
    functional: [
      "Create a short link for a long URL, optionally with a custom alias.",
      "Redirect short links to their destination.",
      "Show click counts per link, by day and country.",
      "Disable a link immediately when it is reported as malicious.",
    ],
    nonFunctional: [
      "Redirects are fast for users worldwide (target under 100 ms where possible).",
      "Two links never share a code; a code never silently changes destination.",
      "Codes are not enumerable: knowing one link does not reveal others.",
      "Analytics problems never slow down or break redirects.",
    ],
  },
  constraints: [
    "About 100 million new links a month and 10 billion redirects a month, with peaks around 5x average.",
    "Links never expire unless the customer deletes them.",
    "One region today, Postgres as the primary database, a CDN available.",
  ],
  assumptions: [
    "Click traffic is highly skewed: a small fraction of links receives most clicks.",
    "Customers may change a link's destination after creating it.",
    "Click counts may lag by a minute or two.",
  ],
  competencies: [
    { id: "sizing", label: "Sizing from numbers", description: "Turning monthly volumes into rates, storage and headroom." },
    { id: "identity", label: "Codes and uniqueness", description: "Generating identifiers and enforcing uniqueness atomically." },
    { id: "read-path", label: "The read path", description: "Latency, caching and replicas for a read-heavy system." },
    { id: "analytics", label: "Analytics off the hot path", description: "Counting without slowing the thing being counted." },
    { id: "invalidation", label: "Invalidation and freshness", description: "Making data disappear (or appear) through caches and replicas." },
  ],
  system: {
    components: [
      { id: "users", label: "Clickers", kind: "client", responsibility: "Follow short links from anywhere.", position: { col: 0, row: 1 } },
      { id: "cdn", label: "CDN edge", kind: "edge", responsibility: "Caches redirect responses close to users for a short TTL; purged on takedown.", position: { col: 1, row: 1 } },
      { id: "redirect", label: "Redirect service", kind: "service", responsibility: "Looks up a code, returns a 302, and emits a click event without waiting.", position: { col: 2, row: 1 } },
      {
        id: "db",
        label: "Postgres",
        kind: "database",
        responsibility: "Links (code primary key, destination, owner, status) and aggregated click counts.",
        durableState: "links, daily click aggregates",
        position: { col: 3, row: 1 },
      },
      { id: "api", label: "Links API", kind: "service", responsibility: "Creates links with random codes, edits and disables them.", position: { col: 2, row: 0 } },
      { id: "customers", label: "Customer dashboard", kind: "client", responsibility: "Creates links and reads analytics.", position: { col: 1, row: 0 } },
      { id: "clicks", label: "Click stream", kind: "stream", responsibility: "Buffers click events durably.", position: { col: 2, row: 2 } },
      { id: "aggregator", label: "Click aggregator", kind: "worker", responsibility: "Counts clicks per link, day and country in batches.", position: { col: 3, row: 2 } },
    ],
    flows: [
      { id: "click", from: "users", to: "cdn", label: "GET /aZ3kQ9x", kind: "request" },
      { id: "miss", from: "cdn", to: "redirect", label: "Cache miss", kind: "request" },
      { id: "lookup", from: "redirect", to: "db", label: "Look up code", kind: "request" },
      { id: "create", from: "customers", to: "api", label: "Create, edit, disable", kind: "request" },
      { id: "write", from: "api", to: "db", label: "Insert with unique code", kind: "request" },
      { id: "emit", from: "redirect", to: "clicks", label: "Click event (fire and forget)", kind: "async" },
      { id: "consume", from: "aggregator", to: "clicks", label: "Read click batches", kind: "request" },
      { id: "counts", from: "aggregator", to: "db", label: "Upsert daily aggregates", kind: "request" },
    ],
    invariants: [
      {
        id: "unique-codes",
        statement: "Every code maps to exactly one link.",
        enforcedBy: ["db", "api"],
        mechanism: "The code is the primary key; creation inserts a random code and retries on the (rare) conflict.",
      },
      {
        id: "takedown",
        statement: "A disabled link stops redirecting within seconds, everywhere.",
        enforcedBy: ["api", "cdn"],
        mechanism: "Short edge TTLs plus an explicit CDN purge on disable, with 302 responses so browsers do not cache the redirect permanently.",
      },
      {
        id: "analytics-off-path",
        statement: "Redirects never wait on analytics.",
        enforcedBy: ["redirect", "clicks"],
        mechanism: "Click events are emitted asynchronously to a buffer; aggregation happens in batches elsewhere.",
      },
    ],
  },
  stages: [
    {
      id: "size-it",
      title: "Size it before you draw it",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["id-generation", "backpressure"],
      competencyIds: ["sizing"],
      context: md`
        Interviewers ask this question partly to see whether you calculate before you architect. Use 2.6 million seconds in a month.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements follow from the numbers?",
        claims: [
          {
            id: "write-rate",
            statement: "100 million new links a month is about 40 writes a second.",
            verdict: "holds",
            explanation: "100,000,000 / 2,600,000 ≈ 38 per second on average, perhaps 200 at peak. Any database handles that comfortably.",
          },
          {
            id: "read-rate",
            statement: "10 billion redirects a month means roughly 20,000 redirects a second at peak.",
            verdict: "holds",
            explanation: "10,000,000,000 / 2,600,000 ≈ 3,850 per second on average; at 5x, about 19,000. That is a read-heavy system, around 100 reads per write.",
          },
          {
            id: "seven-chars",
            statement: "Seven base62 characters provide enough codes for many years.",
            verdict: "holds",
            explanation: "62^7 ≈ 3.5 trillion. At 1.2 billion links a year, that is nearly three thousand years of codes, and collisions with random codes stay rare for a very long time. See [[id-generation]].",
          },
          {
            id: "needs-nosql",
            statement: "At this scale the link table needs a distributed NoSQL database.",
            verdict: "fails",
            explanation:
              "A year of links is about 1.2 billion rows of roughly 500 bytes, around 600 GB. Peak reads are ~20,000 primary-key lookups a second on a heavily skewed working set. A single well-provisioned Postgres primary, with a cache in front of the hottest keys, handles that. Distribution may come later; it is not forced by these numbers.",
          },
          {
            id: "latency-distance",
            statement: "Making the database faster will reduce redirect latency for users in Sydney.",
            verdict: "fails",
            explanation: "A round trip from Sydney to a US region costs on the order of 200 ms however fast the database is. Distance is a latency problem that only locality (edge caching, regional replicas) fixes.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          The numbers deflate the usual answer. Writes are trivial. Reads are substantial but well within one database's capacity. Storage grows steadily but slowly. **The hard problems are not scale at all:** they are generating codes correctly, serving distant users quickly, counting clicks without slowing redirects, and making a cached link disappear on demand.

          An answer that starts with sharding, Cassandra and Kafka is solving a problem these numbers do not have.
        `,
      },
    },
    {
      id: "generate-codes",
      title: "Generate the short code",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["id-generation", "concurrency-control"],
      competencyIds: ["identity"],
      context: md`
        Codes appear in public. They must be short, never shared by two links, and not reveal other links.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should codes be generated?",
        options: [
          {
            id: "hash",
            label: "Hash the long URL and take the first 7 base62 characters",
            assessment: "flawed",
            feedback:
              "Two different URLs can share a 7-character prefix, so you still need collision handling. Two customers shortening the same URL get the same code, which means shared analytics, and one customer's edit or deletion affects the other. A hash identifies content, not ownership.",
          },
          {
            id: "sequence",
            label: "Base62-encode an auto-increment id",
            assessment: "defensible",
            feedback:
              "Unique by construction and compact. But codes are sequential, so anyone can enumerate every link (and some are private campaign links) and estimate your volume. Workable for internal tools, wrong for a public product with this requirement.",
          },
          {
            id: "random-unique",
            label: "Random 7-character base62 code from a secure generator; insert with the code as primary key, retry on conflict",
            assessment: "sound",
            feedback:
              "Unguessable, no coordination, and uniqueness is enforced by the database rather than assumed. A collision is a constraint violation followed by a new random code, rare enough to be invisible in latency.",
          },
          {
            id: "precomputed-pool",
            label: "Pre-generate unused random codes into a pool table and hand them out",
            assessment: "defensible",
            feedback:
              "It moves collision handling offline, which matters at far higher write rates. At ~40 writes a second it is an extra moving part with nothing to fix. Insert-and-retry is simpler and equally correct.",
          },
        ],
        rationale: {
          prompt: "What guarantees uniqueness in your scheme, and what does the code reveal?",
          rubric: [
            { id: "enforced", text: "Uniqueness is enforced atomically by the database (primary key or unique constraint), with retry on conflict." },
            { id: "guessability", text: "Considers enumeration: sequential codes reveal other links." },
            { id: "ownership", text: "Recognizes that content hashes merge links that different owners expect to be separate.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The design move is to stop *hoping* codes are unique and make the database *say so*: \`INSERT … VALUES ($code, …)\` on a primary key either succeeds or fails, atomically. Randomness keeps collisions rare; the constraint makes them harmless. See [[id-generation]].

          Custom aliases (\`sho.rt/spring-sale\`) use the same path: the customer's chosen string is the code, and a conflict means "taken", shown to the customer instead of retried.
        `,
      },
    },
    {
      id: "the-create-bug",
      title: "The link that pointed somewhere else",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["concurrency-control", "id-generation"],
      competencyIds: ["identity"],
      event: {
        kind: "failure",
        title: "A customer's link opened a competitor's page",
        detail: "Customer B created a short link and got back a code that redirects to customer A's URL. Here is the create endpoint from an early version.",
      },
      context: md`
        Find every line that contributes to wrong or conflicting codes.
      `,
      interaction: {
        kind: "diagnosis",
        prompt: "Select the faulty lines.",
        artifact: {
          type: "code",
          language: "typescript",
          caption: "POST /links",
          lines: [
            { text: "async function createLink(url: string, ownerId: string) {" },
            {
              text: "  const code = base62(sha256(url)).slice(0, 7);",
              fault: "Derived from the URL alone: two owners shortening the same URL get the same code, and truncation lets different URLs collide.",
            },
            { text: "  const existing = await db.links.findByCode(code);" },
            {
              text: "  if (existing) return { code: existing.code };",
              fault:
                "Returns an existing link without checking that it has the same URL and owner. On a collision, customer B receives customer A's link, which is exactly the incident.",
            },
            {
              text: "  await db.links.insert({ code, url, ownerId });",
              fault:
                "Check-then-insert: two concurrent creates can both see 'no existing' and race on the insert. The insert itself (a unique key) must be the check, with conflicts handled explicitly.",
            },
            { text: "  return { code };" },
            { text: "}" },
          ],
        },
        rationale: {
          prompt: "What should creation look like instead?",
          rubric: [
            { id: "identity", text: "A code should identify one link (one owner's intent), not the destination URL." },
            { id: "atomic", text: "Uniqueness is decided by an atomic insert, not a prior lookup." },
            { id: "conflict-handling", text: "A conflict leads to a new code (random) or a clear 'taken' error (alias), never to returning someone else's row." },
          ],
        },
      },
      reveal: {
        reasoning: md`
          "If it exists, return it" looks like deduplication and is actually **identity confusion**: it treats "a link with this code exists" as "this is your link". Combined with a check-then-insert race, it is the [[concurrency-control]] lesson in its simplest form. Let the constraint decide, and handle its answer explicitly.
        `,
      },
    },
    {
      id: "which-redirect",
      title: "301 or 302?",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["caching"],
      competencyIds: ["invalidation", "analytics"],
      context: md`
        The redirect response is the product. Its status code decides who is allowed to cache it, and for how long.
      `,
      interaction: {
        kind: "decision",
        prompt: "Which response should a redirect return?",
        options: [
          {
            id: "301",
            label: "301 Moved Permanently",
            assessment: "flawed",
            feedback:
              "Browsers may cache a 301 indefinitely and stop asking you. After the first click, a user's later clicks never reach you, so they are not counted, and edits or takedowns never reach that browser. 'Permanently' is a promise this product cannot make.",
          },
          {
            id: "302",
            label: "302 Found, with Cache-Control allowing only short shared caching",
            assessment: "sound",
            feedback:
              "Browsers re-request each time, so every click is countable and edits and takedowns take effect. Shared caches (the CDN) may still hold the response for a short TTL you control, which gives most of the latency benefit without losing control.",
          },
          {
            id: "200-js",
            label: "200 with a page that redirects via JavaScript or meta refresh",
            assessment: "defensible",
            feedback:
              "Some shorteners do this to show interstitials or run tracking scripts. It is slower, breaks for clients without JavaScript, and crawlers treat it worse. Use it only if the interstitial is a requirement.",
          },
          {
            id: "308",
            label: "308 Permanent Redirect",
            assessment: "flawed",
            feedback: "It has the same permanence problem as 301; it only preserves the HTTP method.",
          },
        ],
        rationale: {
          prompt: "Explain how the status code interacts with caching, analytics and takedowns.",
          rubric: [
            { id: "permanent-cache", text: "Permanent redirects can be cached by browsers indefinitely, removing your control." },
            { id: "control", text: "Edits, takedowns and click counts all require requests to keep reaching you (or a cache you control)." },
            { id: "edge", text: "Short-TTL shared caching at the CDN keeps most of the latency benefit.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Every cache is a copy you no longer control; see [[caching]]. A 301 hands the copy to millions of browsers you can never purge. A 302 with a short \`s-maxage\` keeps the copies in your CDN, where a purge API exists. The difference only shows up the day a link must die, and on that day it is the only thing that matters.
        `,
      },
    },
    {
      id: "slow-in-sydney",
      title: "Slow in Sydney",
      phase: "decide",
      dimensions: ["defend", "change"],
      conceptIds: ["caching", "replication"],
      competencyIds: ["read-path", "sizing"],
      event: {
        kind: "scale",
        title: "A campaign goes viral in Australia",
        detail: "Redirects from Sydney take 280 ms at p50. The database in the US region is at 20% CPU; the redirect service at 30%.",
      },
      context: md`
        Nothing is overloaded. Users are still waiting.
      `,
      interaction: {
        kind: "decision",
        prompt: "What do you change?",
        options: [
          {
            id: "bigger-db",
            label: "Upgrade to a larger database instance",
            assessment: "flawed",
            feedback: "The database is at 20% CPU. The time is spent crossing the Pacific twice, and a faster database does not shorten that trip.",
          },
          {
            id: "redis-in-region",
            label: "Put a Redis cache in front of Postgres in the US region",
            assessment: "flawed",
            feedback: "It saves a millisecond or two of lookup time and none of the 200+ ms of distance. A cache helps when it sits close to the reader.",
          },
          {
            id: "edge-cache",
            label: "Cache redirect responses at the CDN edge with a short TTL (say 60 s), purging on edit or disable",
            assessment: "sound",
            feedback:
              "A popular link is answered from an edge location in Sydney in a few milliseconds; only the first request per edge per TTL travels to the origin. Skewed traffic makes hit rates very high, which is exactly this campaign. Short TTLs plus purges keep edits and takedowns prompt.",
          },
          {
            id: "regional-replicas",
            label: "Deploy redirect services and Postgres read replicas in Asia-Pacific",
            assessment: "defensible",
            feedback:
              "It fixes latency for every link, not just popular ones, at the cost of running a second region and dealing with replication lag (stage 8). Worth it when the long tail of links matters there, or when edge caching cannot run your logic.",
          },
        ],
        rationale: {
          prompt: "What is the bottleneck, and why does your change address it?",
          rubric: [
            { id: "latency-not-load", text: "Identifies distance (network round trips), not capacity, as the cause." },
            { id: "locality", text: "Only bringing the answer closer to the user (edge cache or regional copy) fixes it." },
            { id: "skew", text: "Uses the skew of click traffic to justify caching popular links.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Diagnose before you treat: **20% CPU says the system is not busy; 280 ms says the user is far away.** Bottlenecks are not always resources. Sometimes they are the speed of light.

          Edge caching works here because redirects are small, cheap to cache, and highly skewed. The constraint you accept is that the edge holds copies, which the next stage puts to the test.
        `,
      },
      reveals: { components: ["cdn"], flows: ["click", "miss"] },
    },
    {
      id: "count-the-clicks",
      title: "Count the clicks",
      phase: "decide",
      dimensions: ["defend", "change"],
      conceptIds: ["asynchronous-processing", "backpressure", "event-log"],
      competencyIds: ["analytics"],
      context: md`
        Customers want clicks per link, per day, per country. A popular link may get 5,000 clicks a second during a campaign. Counts may lag by a minute or two.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should clicks be counted?",
        options: [
          {
            id: "update-row",
            label: "UPDATE links SET clicks = clicks + 1 in the redirect request",
            assessment: "flawed",
            feedback:
              "Every redirect becomes a write, and a viral link becomes one row receiving 5,000 updates a second. Row-lock contention makes redirects for that link slow, and an analytics problem becomes a redirect outage.",
          },
          {
            id: "stream-aggregate",
            label: "Emit a click event asynchronously to a durable stream; an aggregator counts in batches and upserts daily totals",
            assessment: "sound",
            feedback:
              "The redirect does not wait for analytics, and the database receives one upsert per (link, day, country) per batch instead of one per click. The stream absorbs campaign spikes, and if aggregation falls behind, counts lag while redirects stay fast.",
          },
          {
            id: "edge-logs",
            label: "Derive counts from CDN and server access logs processed hourly",
            assessment: "defensible",
            feedback:
              "It needs no code on the redirect path at all, and it counts edge-served clicks the origin never sees. Its costs are hourly freshness and log pipelines to operate. Many shorteners that cache at the edge end up doing this, because edge hits otherwise go uncounted.",
          },
          {
            id: "sample",
            label: "Count 1% of clicks and multiply by 100",
            assessment: "defensible",
            feedback: "Cheap and fine for large numbers, but customers with 37 clicks see '0' or '100', and billing on clicks becomes impossible. Sampling suits aggregate dashboards, not per-link counts customers trust.",
          },
        ],
        rationale: {
          prompt: "Why does your design keep analytics from hurting redirects?",
          rubric: [
            { id: "off-path", text: "Counting happens asynchronously, so redirects never wait on it." },
            { id: "batching", text: "Aggregating in batches turns per-click writes into a small number of upserts." },
            { id: "edge-clicks", text: "Notes that edge-cached redirects never reach the origin, so their clicks need edge logs or edge events.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          This is [[asynchronous-processing]] for a different reason than usual: the work is short, but it must not **contend** with the hot path. Batching converts thousands of writes to one hot row into one write per batch, which is the same insight as group commit.

          The CDN creates a subtle gap: edge hits are fast precisely because they never reach you. If counts must be exact, edge logs or edge-side events are part of the analytics design, not an afterthought.
        `,
      },
      reveals: { components: ["clicks", "aggregator"], flows: ["emit", "consume", "counts"] },
    },
    {
      id: "malware-takedown",
      title: "Take down a malware link",
      phase: "break",
      dimensions: ["break", "explain"],
      conceptIds: ["caching"],
      competencyIds: ["invalidation"],
      event: {
        kind: "failure",
        title: "A link is reported as distributing malware",
        detail: "It has been clicked 200,000 times in the last hour. Trust and safety disables it in the admin tool.",
      },
      context: md`
        The database now says "disabled". Copies of the redirect exist elsewhere. Evaluate each statement.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "db-enough",
            statement: "Once the database row is disabled, nobody can follow the link any more.",
            verdict: "fails",
            explanation: "CDN edges keep serving their cached copy until it expires or is purged. Disabling must also purge the edge cache.",
          },
          {
            id: "301-forever",
            statement: "If redirects had been 301s, some browsers would keep following the malicious redirect without contacting you.",
            verdict: "holds",
            explanation: "Browsers may cache permanent redirects for a long time, and there is no way to purge a user's browser cache. This is the strongest argument for 302s.",
          },
          {
            id: "short-ttl-purge",
            statement: "Short edge TTLs plus an explicit purge on disable bound the exposure to seconds.",
            verdict: "holds",
            explanation: "The purge removes cached copies right away; the short TTL is the safety net if a purge fails or misses an edge.",
          },
          {
            id: "disabled-404",
            statement: "A disabled link should return 404 so it looks like it never existed.",
            verdict: "depends",
            explanation:
              "A 410 Gone, or a warning page, tells users and crawlers the link was removed deliberately and is cacheable. Some services prefer an interstitial explaining why. What matters is that the response is not a redirect and is itself cached briefly.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          A takedown is a write that must reach **every copy**: the database, every edge cache, and ideally no browser caches, because those cannot be reached at all. Designing for takedown means choosing where copies may exist *before* you need to delete one. That is why the status code, the TTL and the purge path are decided together; see [[caching]].
        `,
      },
    },
    {
      id: "replica-lag-404",
      title: "The link that did not exist yet",
      phase: "change",
      dimensions: ["change", "break"],
      conceptIds: ["replication", "caching"],
      competencyIds: ["read-path", "invalidation"],
      event: {
        kind: "requirement-change",
        title: "Expansion: an Asia-Pacific region with read replicas",
        detail:
          "Redirect services in Sydney now read from a local replica. Customers there report that a freshly created link sometimes shows 'not found', and then keeps showing it for an hour.",
      },
      context: md`
        Replication lag is normally a few hundred milliseconds. The symptom lasts an hour.
      `,
      interaction: {
        kind: "decision",
        prompt: "What is wrong, and what do you change?",
        options: [
          {
            id: "sync-replication",
            label: "Make replication synchronous so replicas are never behind",
            assessment: "defensible",
            feedback:
              "It removes lag, but every link creation now waits for a trans-Pacific round trip, and a slow replica stalls writes globally. It treats the symptom at a heavy cost, and does nothing about the hour.",
          },
          {
            id: "fallback-no-negative-cache",
            label: "On a replica miss, check the primary before answering 404, and cache 404s only briefly",
            assessment: "sound",
            feedback:
              "A miss on a lagging replica is not proof the link does not exist. Falling back to the primary on misses costs a cross-region trip only for real misses and very new links. The hour came from the edge caching the first 404 with the same TTL as a redirect; negative results deserve a much shorter one.",
          },
          {
            id: "creator-reads-primary",
            label: "Route the creator's own reads to the primary for a minute after they create a link",
            assessment: "defensible",
            feedback:
              "That is read-your-writes for the creator, but the people who click a brand-new link are mostly *not* its creator. It does not help them.",
          },
          {
            id: "cache-404-longer",
            label: "Cache 404s at the edge for longer to protect the database from scans",
            assessment: "flawed",
            feedback: "This turns a sub-second replication lag into hours of a working link being reported as missing.",
          },
        ],
        rationale: {
          prompt: "Explain why a sub-second lag produced an hour-long failure, and how your fix prevents both.",
          rubric: [
            { id: "lag", text: "A replica can lag behind the primary, so a new link may be missing there briefly." },
            { id: "negative-cache", text: "Caching the resulting 404 at the edge extends a brief inconsistency for the whole TTL." },
            { id: "fix", text: "Treats a replica miss as uncertain (fall back to the primary) and gives negative results a short TTL." },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Two individually reasonable mechanisms combined into an hour-long bug: [[replication]] that is *briefly* stale, and a [[caching|cache]] that made the stale answer *durable*. When you cache, ask what you are caching: a fact (this code points here), or an observation from a possibly stale source (this replica did not have it). Absence is usually the second kind.
        `,
      },
    },
    {
      id: "defend-simplicity",
      title: "Defend the simple design",
      phase: "defend",
      dimensions: ["defend", "change"],
      conceptIds: ["partitioning", "caching", "id-generation"],
      competencyIds: ["sizing", "read-path", "identity"],
      context: md`
        Your interviewer pushes back: "This wouldn't scale. I'd expect Cassandra for the links, Kafka for clicks, a dedicated ID-generation service and microservices for creation, redirect and analytics. Why didn't you do that?"
      `,
      interaction: {
        kind: "open",
        prompt: "Defend the design with numbers, say what would make you adopt each of those components, and identify the first real bottleneck you expect.",
        placeholder: "At 20,000 redirects a second…",
        rubric: [
          { id: "numbers", text: "Uses the numbers: ~40 writes/s, ~20,000 reads/s at peak, ~600 GB a year, all within a single database plus caching." },
          { id: "triggers", text: "Names concrete triggers for each component (e.g. storage beyond one machine, write rates, multiple independent consumers of click events)." },
          { id: "first-bottleneck", text: "Identifies a plausible first real bottleneck (storage growth, the analytics write path, or cross-region latency) and the targeted fix." },
          { id: "not-dismissive", text: "Acknowledges what the proposed components would buy, rather than dismissing them.", weight: "supporting" },
        ],
        reference: md`
          **Numbers first.** Writes are ~40/s, reads ~20,000/s at peak on a skewed working set, and storage grows ~600 GB a year. One Postgres primary with a read-heavy cache profile handles that, and the CDN absorbs most of the popular-link reads before they reach it.

          **When each component would earn its place:**

          - **Cassandra or another partitioned store:** when the link table outgrows one machine's storage or a single primary's write path, perhaps years from now. Before then, Postgres partitioning by code range or a managed distributed SQL database is a smaller step.
          - **Kafka:** the click stream benefits from a durable log once several independent consumers need click events (fraud detection, billing, analytics). A managed queue or stream suffices for one aggregator.
          - **An ID service:** only if random codes plus a unique constraint stop working, which at 3.5 trillion codes they will not for a very long time.
          - **Microservices:** when separate teams own creation, redirect and analytics, or when their scaling or deploy cadences genuinely diverge. The redirect path is already isolated by the CDN and the asynchronous click path.

          **First real bottleneck:** probably the analytics write path during viral campaigns (handled by batching and the stream) or cross-region latency for the long tail of links (handled by regional replicas with careful miss handling), not the link table.

          Complexity should arrive when a measured constraint demands it, and each component above has a clear trigger.
        `,
      },
      reveal: {
        reasoning: md`
          "This won't scale" is a hypothesis. Answer it with arithmetic and with **triggers**: the specific measurement that would make each component worth its operational cost. That turns a disagreement about taste into a disagreement about numbers, which can actually be resolved, and it shows you know what each component is for.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      The design follows the numbers: a single relational store comfortably holds the links, with the **code as primary key**, so uniqueness is enforced rather than assumed. Random codes from a secure generator keep links unguessable, and collisions turn into retries.

      The read path is optimized for **locality, not throughput**: 302 redirects cached briefly at CDN edges answer popular links near users, while edits and takedowns stay possible through purges and short TTLs. Clicks are **emitted asynchronously** and aggregated in batches, so analytics never contend with redirects. Where replicas add locality for the long tail, misses are treated as uncertain and absence is cached only briefly.
    `,
    reliesOn: [
      "Click traffic is skewed enough for edge caches to absorb most popular-link reads.",
      "The CDN's purge API works within seconds.",
      "Clients follow 302 redirects and respect Cache-Control.",
      "Analytics may lag by minutes.",
    ],
    alternatives: [
      { design: "Edge-native redirects (edge key-value store with functions at the CDN)", preferWhen: "Global latency matters for every link, including the long tail, and the platform's consistency model fits." },
      { design: "Partitioned key-value store for links", preferWhen: "Link volume or write rates outgrow a single primary." },
      { design: "Log-based analytics only", preferWhen: "Most redirects are served at the edge and per-click events from the origin would undercount anyway." },
    ],
    tradeoffs: [
      { choice: "302 with short edge TTLs", gains: "Countable clicks, editable links, prompt takedowns.", costs: "More origin traffic than permanent redirects." },
      { choice: "Random codes + unique key", gains: "Unguessable, coordination-free, enforced uniqueness.", costs: "Scattered index inserts; occasional retries." },
      { choice: "Asynchronous click aggregation", gains: "Redirects never wait on analytics.", costs: "Counts lag; a stream and a worker to operate." },
      { choice: "Replica reads with primary fallback", gains: "Regional latency for the long tail.", costs: "Cross-region trips on misses; lag handling in code." },
    ],
    breaksWhen: [
      "Link volume outgrows one machine's storage, which calls for partitioning by code.",
      "Customers require exact, real-time click counts, including edge-served clicks.",
      "Regulations require data residency per region, so links must be created and stored regionally.",
      "Abuse creates links at very high rates, which needs creation rate limits and scanning before activation.",
    ],
  },
  interviewVariants: [
    "Design a URL shortener like bit.ly.",
    "Design Pastebin.",
    "How would you generate unique short IDs across many servers?",
    "Your cache is serving a deleted item. How do you make deletions take effect immediately?",
  ],
  relatedInvestigationIds: ["api-rate-limiter", "video-processing-pipeline"],
} satisfies InvestigationInput;
