import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const urlShortener = {
  id: "url-shortener",
  title: "A URL shortener like bit.ly",
  searchTitle: "Design a URL Shortener",
  premise:
    "Short links that never collide, redirect quickly for users anywhere, count every click, and can be switched off in seconds. You will estimate the load first, then design each part from the numbers.",
  difficulty: "foundational",
  estimatedMinutes: 45,
  scenario: md`
    A marketing-tools company offers short links. A customer pastes a long URL and gets back something like \`sho.rt/aZ3kQ9x\` to put in emails, posters and social posts. The customer can see how many clicks each link got, by day and by country.

    They expect about 100 million new links a month and 10 billion redirects a month. Big campaigns push traffic to about five times the average. People click from all over the world, but the servers are in one US region today. Occasionally a link turns out to point at malware, and the trust-and-safety team needs it switched off immediately.
  `,
  objectives: [
    "Turn monthly volumes into per-second rates and storage before picking any technology.",
    "Generate short codes that are unique and can't be guessed, and let the database enforce uniqueness.",
    "Tell a latency problem (distance) apart from a load problem (busy servers).",
    "Count clicks without making redirects wait.",
    "Make a deleted or changed link disappear from every cache.",
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
      "Redirects are fast for users worldwide (under 100 ms where possible).",
      "Two links never share a code, and a code never silently changes destination.",
      "Codes can't be enumerated: knowing one link doesn't reveal others.",
      "Problems in analytics never slow down or break redirects.",
    ],
  },
  constraints: [
    "About 100 million new links a month and 10 billion redirects a month, with peaks around 5× average.",
    "Links never expire unless the customer deletes them.",
    "One region today, Postgres as the primary database, a CDN available.",
  ],
  assumptions: [
    "Clicks are very uneven: a small fraction of links gets most of the clicks.",
    "Customers may change a link's destination after creating it.",
    "Click counts may lag by a minute or two.",
  ],
  competencies: [
    { id: "sizing", label: "Estimating load", description: "Turning monthly volumes into rates, storage and headroom." },
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
      title: "Estimate the load",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["id-generation", "backpressure"],
      competencyIds: ["sizing"],
      context: md`
        Before drawing any boxes, work out how much traffic and data this system really has. Rough numbers are enough: you only need to know whether something fits on one machine or needs many.
      `,
      lesson: [
        {
          kind: "read",
          body: md`
            Requirements usually come as monthly or daily totals. Systems fail per second, so convert.

            A month has about **2.6 million seconds** (30 days × 86,400 seconds). Divide a monthly total by 2.6 million to get the average per second. Traffic isn't flat, so multiply by the peak factor to get the rate you actually have to handle.
          `,
        },
        {
          kind: "estimate",
          id: "write-rate",
          prompt: "100 million new links a month. About how many links are created per second, on average?",
          answer: 38,
          unit: "per second",
          working: md`
            100,000,000 ÷ 2,600,000 ≈ **38 per second**. At 5× peak, about 190 per second.

            One Postgres server handles thousands of small inserts a second, so writes are nowhere near a limit.
          `,
        },
        {
          kind: "estimate",
          id: "read-rate",
          prompt: "10 billion redirects a month, with peaks at 5× the average. About how many redirects per second at peak?",
          answer: 19_000,
          unit: "per second",
          working: md`
            10,000,000,000 ÷ 2,600,000 ≈ 3,850 per second on average. × 5 ≈ **19,000 per second** at peak.

            That's about 100 reads for every write. This is a read-heavy system, so the redirect path is where the design effort goes.
          `,
        },
        {
          kind: "read",
          body: md`
            Now storage. Estimate the size of one record, then multiply by how many you add per year.

            A link row holds a 7-character code, the destination URL (usually 100 to 200 bytes, sometimes much longer), an owner id, timestamps and a status. With index overhead, **500 bytes** is a reasonable round number. 100 million links a month is 1.2 billion a year.
          `,
        },
        {
          kind: "estimate",
          id: "storage",
          prompt: "1.2 billion links a year at 500 bytes each. About how much storage per year?",
          answer: 600,
          unit: "GB",
          working: md`
            1,200,000,000 × 500 bytes = 600,000,000,000 bytes ≈ **600 GB a year**.

            A single database server can hold several terabytes, so this fits on one machine for years.
          `,
        },
        {
          kind: "read",
          body: md`
            Compare your numbers with what one machine can do. These are rough figures for a well-provisioned server, worth remembering as orders of magnitude:

            | Work | One server handles roughly |
            | --- | --- |
            | Postgres lookups by primary key | tens of thousands per second |
            | Postgres small inserts | thousands per second |
            | Redis gets | around 100,000 per second |
            | Disk | several terabytes |
          `,
        },
        {
          kind: "choice",
          id: "verdict",
          prompt: "Put your three numbers (190 writes/s at peak, 19,000 reads/s at peak, 600 GB/year) next to that table. What do they tell you?",
          options: [
            {
              id: "one-machine",
              label: "One database server can handle it, especially with a cache in front for popular links.",
              correct: true,
              why: "Every number is within one server's range. That means scale isn't the hard part of this problem. The hard parts are elsewhere: correct codes, distant users, counting clicks and takedowns.",
            },
            {
              id: "shard-now",
              label: "Reads are too high for one database, so it needs to be sharded from the start.",
              why: "19,000 primary-key lookups a second is within range for one Postgres server, and clicks are uneven, so a cache absorbs most of them anyway. Sharding would add complexity to solve a problem these numbers don't have.",
            },
            {
              id: "storage-bound",
              label: "Storage is the bottleneck: 600 GB a year is too much for one machine.",
              why: "600 GB a year is a few terabytes after several years, which one server's disks can hold. Storage would become a reason to partition eventually, but not for years.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "Where should the links be stored?",
        options: [
          {
            id: "single-postgres",
            label: "One Postgres primary with a standby replica for failover, with the code as the primary key",
            assessment: "sound",
            feedback:
              "It covers the numbers with room to spare, and the primary key gives you uniqueness for free. The standby protects against losing the server. You can add read replicas or partitioning later, when a measurement says you need them.",
          },
          {
            id: "cassandra",
            label: "A Cassandra cluster partitioned by code",
            assessment: "defensible",
            feedback:
              "It would handle far more than this, but you pay to run a cluster, and you lose simple unique constraints (Cassandra's lightweight transactions can emulate them, at a latency cost). Pick it when writes or storage outgrow one machine. These numbers are about 100× away from that.",
          },
          {
            id: "redis-primary",
            label: "Redis as the only store, since every read is a key lookup",
            assessment: "flawed",
            feedback:
              "Lookups would be fast, but Redis keeps everything in memory (600 GB a year of RAM is expensive) and its usual persistence settings can lose the last second of writes in a crash. A lost link breaks every poster it's printed on. Redis works well as a cache in front of a durable store, not instead of one.",
          },
          {
            id: "sharded-postgres",
            label: "Postgres sharded across eight servers from day one",
            assessment: "defensible",
            feedback:
              "It works, and code-based sharding is a reasonable plan for later. Today it means eight servers to run and back up, and routing logic in the app, to hold data that fits on one.",
          },
        ],
        rationale: {
          prompt: "Which numbers drove your choice, and what would make you change it?",
          rubric: [
            { id: "rates", text: "Uses the rates: about 40 writes/s (190 at peak) and about 19,000 reads/s at peak." },
            { id: "storage", text: "Uses the storage estimate: about 600 GB a year." },
            { id: "trigger", text: "Names what would justify distributing, such as storage beyond one machine or write rates beyond one primary.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Divide monthly totals by 2.6 million to get per-second rates, then multiply by the peak factor.",
          "Compare each number with what one machine can do before you reach for a distributed database.",
          "When the numbers fit on one machine, the hard parts of the problem are correctness and latency, not scale.",
        ],
        reasoning: md`
          Writes are about 40 a second, reads about 19,000 at peak, and storage grows about 600 GB a year. One database with a cache in front handles all of that.

          So the rest of this investigation isn't about scaling. It covers four problems the numbers don't solve: generating codes correctly, serving users far from the servers, counting clicks without slowing redirects, and removing a bad link from every cache.
        `,
      },
    },
    {
      id: "generate-codes",
      title: "Generate short codes",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["id-generation", "concurrency-control"],
      competencyIds: ["identity"],
      context: md`
        Every link needs a code like \`aZ3kQ9x\`. Codes must be short, two links must never share one, and knowing one code must not let anyone find others.
      `,
      lesson: [
        {
          kind: "read",
          body: md`
            Codes use **base62**: the characters \`a–z\`, \`A–Z\` and \`0–9\`. Each character has 62 possible values, so a code of *n* characters has 62ⁿ possible values.

            | Length | Possible codes |
            | --- | --- |
            | 5 | about 916 million |
            | 6 | about 57 billion |
            | 7 | about 3.5 trillion |
          `,
        },
        {
          kind: "choice",
          id: "length",
          prompt: "You'll create about 1.2 billion links a year, and codes are chosen at random. Which length should you use?",
          options: [
            {
              id: "five",
              label: "5 characters",
              why: "916 million codes run out within the first year.",
            },
            {
              id: "six",
              label: "6 characters",
              why: "It doesn't run out quickly, but random codes collide more often as the space fills. After 10 years (12 billion links), 21% of codes are taken, so about one new code in five collides and has to be retried.",
            },
            {
              id: "seven",
              label: "7 characters",
              correct: true,
              why: "After 10 years, 12 billion of 3.5 trillion codes are taken: about 0.3%. Roughly one new code in 300 collides, and a single retry fixes it.",
            },
            {
              id: "ten",
              label: "10 characters, to be safe",
              why: "It works, but every link on every poster is three characters longer for no real benefit. Seven characters already gives enough room for decades.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            There are three common ways to produce a code.

            1. **Counter.** Keep an auto-incrementing number and write it in base62. Link 1 gets \`1\`, link 125 gets \`21\`, and so on.
            2. **Hash.** Hash the long URL (with SHA-256, say) and keep the first 7 characters. The same URL always gives the same code.
            3. **Random.** Pick 7 random characters from a cryptographically secure generator.
          `,
        },
        {
          kind: "predict",
          id: "enumerate",
          prompt: "Codes come from a counter, and you know one link: `sho.rt/aZ3kQ9x`. What could you do with it?",
          answer: md`
            Decode it to a number and try the numbers next to it. You can walk through every link anyone has made, including private ones like unreleased campaign pages. Comparing two codes a week apart also tells a competitor how many links the company makes per week.

            That breaks the requirement that codes can't be enumerated.
          `,
        },
        {
          kind: "choice",
          id: "hash-owners",
          prompt: "With hashing, two different customers shorten the same URL, `https://shop.com/sale`. What happens?",
          options: [
            {
              id: "shared",
              label: "They get the same code, so they share one link.",
              correct: true,
              why: "They now share click counts, and if one customer edits or deletes the link, the other customer's link changes too. A hash identifies the destination, but a link belongs to one customer.",
            },
            {
              id: "different",
              label: "They get different codes, because each customer's request is separate.",
              why: "A hash depends only on its input. The same URL gives the same hash. You could add the customer id to the input, but then you lose the deduplication that made hashing attractive, and truncated hashes can still collide.",
            },
            {
              id: "error",
              label: "The second customer gets an error.",
              why: "Only if you treat the duplicate as a conflict, and then the second customer can't shorten that URL at all.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            That leaves random codes. They reveal nothing and need no coordination between servers, but two creations *can* pick the same code.

            Don't try to prevent that by checking first. Make the code the table's **primary key** and just insert. If the code is taken, the database rejects the insert, all in one atomic step, and you try again with a new random code.
          `,
        },
        {
          kind: "choice",
          id: "check-first",
          prompt: "Why not run `SELECT … WHERE code = $1` first, and only insert if the code is free?",
          options: [
            {
              id: "race",
              label: "Two requests can both check, both see the code is free, and both insert.",
              correct: true,
              why: "The check and the insert are separate steps, and another request can run between them. Only the insert is atomic, so let the insert do the checking.",
            },
            {
              id: "slow",
              label: "The extra query makes link creation too slow.",
              why: "A primary-key lookup takes about a millisecond. The problem is correctness, not speed.",
            },
            {
              id: "pointless",
              label: "Random codes never collide, so the check is pointless.",
              why: "They do collide, just rarely. A rare bug is still a bug: when it happens, a customer gets someone else's link.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should codes be generated?",
        options: [
          {
            id: "hash",
            label: "Hash the long URL and take the first 7 base62 characters",
            assessment: "flawed",
            feedback:
              "Two different URLs can share a 7-character prefix, so you still need collision handling. And two customers shortening the same URL get the same code, so they share analytics and one's edits affect the other.",
          },
          {
            id: "sequence",
            label: "Base62-encode an auto-increment id",
            assessment: "defensible",
            feedback:
              "Unique by construction and compact. But anyone can enumerate every link and estimate your volume. Fine for an internal tool; wrong for a public product with this requirement.",
          },
          {
            id: "random-unique",
            label: "Random 7-character base62 code from a secure generator; insert with the code as primary key, retry on conflict",
            assessment: "sound",
            feedback:
              "Unguessable, no coordination between servers, and the database enforces uniqueness. A collision is a rejected insert followed by a new random code, rare enough that nobody notices the extra millisecond.",
          },
          {
            id: "precomputed-pool",
            label: "Pre-generate unused random codes into a pool table and hand them out",
            assessment: "defensible",
            feedback:
              "It moves collision handling offline, which helps at much higher write rates. At about 40 writes a second it's an extra moving part that fixes nothing. Insert-and-retry is simpler and just as correct.",
          },
        ],
        rationale: {
          prompt: "What guarantees uniqueness in your scheme, and what does a code reveal?",
          rubric: [
            { id: "enforced", text: "Uniqueness is enforced atomically by the database (primary key or unique constraint), with a retry on conflict." },
            { id: "guessability", text: "Considers enumeration: sequential codes reveal other links." },
            { id: "ownership", text: "Recognizes that hashing the URL merges links that different customers expect to be separate.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Let the database enforce uniqueness: make the code the primary key, insert, and retry on conflict.",
          "Sequential codes are unique but anyone can enumerate them; URL hashes merge links that belong to different customers.",
          "Custom aliases use the same insert. A conflict there means \"taken\", which you show to the customer instead of retrying.",
        ],
        reasoning: md`
          Random codes make collisions rare; the primary key makes them harmless. \`INSERT … VALUES ($code, …)\` either succeeds or fails as one step, so no two requests can both get the same code. See [[id-generation]].
        `,
      },
    },
    {
      id: "the-create-bug",
      title: "Debug: a customer got someone else's link",
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
        Use what you learned in the last stage. Find every line that can produce a wrong or shared code.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            When reading code that creates something unique, ask three questions of every line:

            1. **Where does the identity come from?** Is it unique to this caller's thing, or could two callers produce the same one?
            2. **What happens if it already exists?** Is the existing thing really the caller's?
            3. **What can happen between the check and the act?** Another request can run in that gap.
          `,
        },
        {
          kind: "choice",
          id: "gap",
          prompt: "Two requests run `findByCode(code)` at the same moment, both get nothing back, and both call `insert`. Without a unique constraint on code, what's in the table?",
          options: [
            {
              id: "two",
              label: "Two rows with the same code",
              correct: true,
              why: "Each request's check was true when it ran. Only the database, deciding atomically at insert time, can stop the second one.",
            },
            {
              id: "one",
              label: "One row: the second insert sees the first",
              why: "The second request already did its check. It doesn't look again before inserting.",
            },
            {
              id: "error",
              label: "An error for the second request",
              why: "Only if a unique constraint exists. That's the fix, not the default.",
            },
          ],
        },
      ],
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
              fault: "The code comes from the URL alone: two customers shortening the same URL get the same code, and truncating the hash lets different URLs collide.",
            },
            { text: "  const existing = await db.links.findByCode(code);" },
            {
              text: "  if (existing) return { code: existing.code };",
              fault:
                "Returns an existing link without checking that it has the same URL and owner. On a collision, customer B receives customer A's link: exactly this incident.",
            },
            {
              text: "  await db.links.insert({ code, url, ownerId });",
              fault:
                "Check-then-insert: two concurrent requests can both see no existing row and both insert. The insert itself must be the check, with conflicts handled explicitly.",
            },
            { text: "  return { code };" },
            { text: "}" },
          ],
        },
        rationale: {
          prompt: "What should creation look like instead?",
          rubric: [
            { id: "identity", text: "A code should identify one customer's link, not the destination URL." },
            { id: "atomic", text: "Uniqueness is decided by an atomic insert, not a lookup beforehand." },
            { id: "conflict-handling", text: "A conflict leads to a new random code (or a clear 'taken' error for aliases), never to returning someone else's row." },
          ],
        },
      },
      reveal: {
        takeaways: [
          "\"If it exists, return it\" treats any link with this code as the caller's link. That's how customer B got customer A's page.",
          "Generate a random code, insert it, and handle the conflict explicitly. Never look first and insert second.",
        ],
        reasoning: md`
          The fixed version is three lines: generate a random code, try the insert, and on a unique-key violation generate another and try again. There is no separate lookup, so there's no gap for another request to slip into. This is the simplest form of [[concurrency-control]]: let a constraint make the decision.
        `,
      },
    },
    {
      id: "which-redirect",
      title: "Choose the redirect status: 301 or 302",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["caching"],
      competencyIds: ["invalidation", "analytics"],
      context: md`
        The redirect response is what every click receives. Its status code decides who may cache it and for how long, and that affects analytics, edits and takedowns.
      `,
      lesson: [
        {
          kind: "read",
          body: md`
            A redirect is an HTTP response with a status code and a \`Location\` header. The browser reads the header and requests the new URL. The status code also tells caches (the browser's own cache and any CDN in between) whether they may reuse this answer next time.

            | Status | Meaning | Caching by default |
            | --- | --- | --- |
            | 301 Moved Permanently | This URL will always go there | Browsers may keep it for a very long time and stop asking you |
            | 302 Found | Go there for now | Not reused unless \`Cache-Control\` allows it |
            | 308 / 307 | Like 301 / 302, but a POST stays a POST | Same as 301 / 302 |
          `,
        },
        {
          kind: "choice",
          id: "edit-301",
          prompt: "A link was served as a 301. The customer then changes its destination. What happens to people who already clicked it once?",
          options: [
            {
              id: "stuck",
              label: "Their browsers keep going to the old destination, and you can't clear their caches.",
              correct: true,
              why: "A cached 301 means the browser doesn't ask your server again. There's no API to purge someone's browser cache, so the old destination can stick for months.",
            },
            {
              id: "purge",
              label: "They get the new destination once you purge the CDN.",
              why: "A CDN purge clears the CDN's copies. It doesn't reach the copy stored in each visitor's browser.",
            },
            {
              id: "next-visit",
              label: "They get the new destination on their next click.",
              why: "Only if the browser asks your server again, and with a cached 301 it doesn't.",
            },
          ],
        },
        {
          kind: "choice",
          id: "counts-301",
          prompt: "What else breaks if browsers cache your redirects?",
          options: [
            {
              id: "counts",
              label: "Click counts: repeat clicks never reach your servers.",
              correct: true,
              why: "A click served from the browser's cache is invisible to you, so counts come out too low.",
            },
            {
              id: "creation",
              label: "Creating new links.",
              why: "Creating a link is a separate request to the API and isn't affected by redirect caching.",
            },
            {
              id: "aliases",
              label: "Custom aliases stop working.",
              why: "Aliases are just codes the customer chose. They redirect like any other code.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            The \`Cache-Control\` header sets who may keep a copy and for how long. \`max-age\` applies to every cache, including browsers. \`s-maxage\` applies only to shared caches like a CDN, which you *can* purge.

            So \`Cache-Control: max-age=0, s-maxage=60\` means: browsers must ask again every time, but the CDN may answer from its copy for up to 60 seconds.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "Which response should a redirect return?",
        options: [
          {
            id: "301",
            label: "301 Moved Permanently",
            assessment: "flawed",
            feedback:
              "Browsers may cache a 301 indefinitely and stop asking you. Later clicks from that browser aren't counted, and edits and takedowns never reach it. This product can't promise a link is permanent.",
          },
          {
            id: "302",
            label: "302 Found, with Cache-Control allowing only short caching at the CDN",
            assessment: "sound",
            feedback:
              "Browsers ask again on every click, so every click can be counted and edits and takedowns take effect. The CDN may still hold the response for a short TTL that you control and can purge, which keeps most of the speed.",
          },
          {
            id: "200-js",
            label: "200 with a page that redirects via JavaScript or meta refresh",
            assessment: "defensible",
            feedback:
              "Some shorteners do this to show an interstitial page or run tracking scripts. It's slower, fails without JavaScript, and search engines handle it worse. Use it only if you need the interstitial.",
          },
          {
            id: "308",
            label: "308 Permanent Redirect",
            assessment: "flawed",
            feedback: "It has the same problem as 301: browsers treat it as permanent. It only differs in keeping the HTTP method.",
          },
        ],
        rationale: {
          prompt: "How does the status code affect caching, analytics and takedowns?",
          rubric: [
            { id: "permanent-cache", text: "Permanent redirects can be cached by browsers indefinitely, so you lose control of them." },
            { id: "control", text: "Edits, takedowns and click counts all need requests to keep reaching you (or a cache you can purge)." },
            { id: "edge", text: "Short caching at the CDN keeps most of the speed benefit.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Use a 302 for anything that might change: browsers don't keep it, so edits, takedowns and click counts keep working.",
          "Let only caches you can purge keep copies: `s-maxage` for the CDN, `max-age=0` for browsers.",
        ],
        reasoning: md`
          Every cached copy is one you have to be able to update or delete later; see [[caching]]. A 301 puts copies in millions of browsers you can't reach. A 302 with a short \`s-maxage\` keeps copies only in your CDN, which has a purge API.
        `,
      },
    },
    {
      id: "slow-in-sydney",
      title: "Make redirects fast far from the servers",
      phase: "decide",
      dimensions: ["defend", "change"],
      conceptIds: ["caching", "replication"],
      competencyIds: ["read-path", "sizing"],
      event: {
        kind: "scale",
        title: "A campaign goes viral in Australia",
        detail: "Redirects from Sydney take 280 ms at the median. The database in the US region is at 20% CPU; the redirect service at 30%.",
      },
      context: md`
        Nothing is overloaded, but users in Sydney are waiting. Work out why before choosing a fix.
      `,
      lesson: [
        {
          kind: "read",
          body: md`
            Two different things make a request slow:

            - **Load:** a component is too busy, so requests queue. You see high CPU, long queues or many open connections.
            - **Latency from distance:** data takes time to travel. Light in optical fibre covers about **200 km per millisecond**, and nothing goes faster.

            They need different fixes, so diagnose first.
          `,
        },
        {
          kind: "estimate",
          id: "rtt",
          prompt: "Sydney to the US East Coast is about 16,000 km. What is the fastest possible round trip, there and back, in milliseconds?",
          answer: 160,
          unit: "ms",
          working: md`
            16,000 km ÷ 200 km/ms = 80 ms each way, so **160 ms** for a round trip, before any server does any work.

            Real cable routes aren't straight lines, so in practice it's more like 200 ms. A brand-new HTTPS connection needs extra round trips to set up, which is how a single redirect reaches 280 ms or more.
          `,
        },
        {
          kind: "choice",
          id: "diagnose",
          prompt: "The database is at 20% CPU, the redirect service at 30%, and Sydney sees 280 ms. What's the bottleneck?",
          options: [
            {
              id: "distance",
              label: "Distance: the requests cross the Pacific and back.",
              correct: true,
              why: "Low CPU means the servers aren't busy. Most of the 280 ms is spent travelling.",
            },
            {
              id: "database",
              label: "The database is too slow.",
              why: "At 20% CPU the database is mostly idle. A primary-key lookup takes about a millisecond.",
            },
            {
              id: "service",
              label: "There aren't enough redirect servers.",
              why: "At 30% CPU the servers have plenty of headroom. More of them would be just as far from Sydney.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            The only fix for distance is to answer from somewhere closer:

            - **Cache at the edge.** A CDN has servers in Sydney. They can keep a copy of a redirect for a short time and answer it locally in a few milliseconds.
            - **Run a copy of the service nearby.** Put redirect servers and a read replica of the database in Asia-Pacific.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What do you change?",
        options: [
          {
            id: "bigger-db",
            label: "Upgrade to a larger database instance",
            assessment: "flawed",
            feedback: "The database is at 20% CPU. The time goes into crossing the Pacific twice, and a faster database doesn't shorten that trip.",
          },
          {
            id: "redis-in-region",
            label: "Put a Redis cache in front of Postgres in the US region",
            assessment: "flawed",
            feedback: "It saves a millisecond or two of lookup time and none of the 200+ ms of travel. A cache only helps latency if it's close to the reader.",
          },
          {
            id: "edge-cache",
            label: "Cache redirect responses at the CDN edge with a short TTL (say 60 s), purging on edit or disable",
            assessment: "sound",
            feedback:
              "A popular link is answered from a CDN server in Sydney in a few milliseconds; only the first request per edge server per TTL goes to the US. Since a few links get most clicks, that covers this campaign. Short TTLs plus purges keep edits and takedowns prompt.",
          },
          {
            id: "regional-replicas",
            label: "Deploy redirect services and Postgres read replicas in Asia-Pacific",
            assessment: "defensible",
            feedback:
              "It speeds up every link, not just popular ones, but you run a second region and have to deal with replication lag (stage 8). Worth it when the less popular links matter there too.",
          },
        ],
        rationale: {
          prompt: "What is the bottleneck, and why does your change address it?",
          rubric: [
            { id: "latency-not-load", text: "Identifies distance (network round trips), not load, as the cause." },
            { id: "locality", text: "Only answering from closer to the user (edge cache or regional copy) fixes it." },
            { id: "skew", text: "Uses the fact that a few links get most clicks to justify caching them.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Check utilisation before optimising: low CPU plus slow responses points to distance, not load.",
          "Distance is only fixed by answering closer to the user: an edge cache or a regional copy.",
          "Edge caching works best when a few items get most of the requests, as popular links do.",
        ],
        reasoning: md`
          A bigger database or a cache in the US region speeds up the part that was already fast. The 280 ms is travel time, so the answer has to come from a server near Sydney.

          Edge caching means copies of redirects now exist on CDN servers around the world. Stage 7 tests what that means when a link has to be removed.
        `,
      },
      reveals: { components: ["cdn"], flows: ["click", "miss"] },
    },
    {
      id: "count-the-clicks",
      title: "Count clicks without slowing redirects",
      phase: "decide",
      dimensions: ["defend", "change"],
      conceptIds: ["asynchronous-processing", "backpressure", "event-log"],
      competencyIds: ["analytics"],
      context: md`
        Customers want clicks per link, per day, per country. A popular link may get 5,000 clicks a second during a campaign. Counts may lag by a minute or two.
      `,
      lesson: [
        {
          kind: "read",
          body: md`
            The obvious approach is to update a counter during each redirect:

            \`\`\`sql
            UPDATE links SET clicks = clicks + 1 WHERE code = 'aZ3kQ9x';
            \`\`\`

            An \`UPDATE\` locks the row until its transaction commits, so two updates to the same row take turns.
          `,
        },
        {
          kind: "predict",
          id: "hot-row",
          prompt: "A link gets 5,000 clicks a second, and every click runs that UPDATE on the same row. What happens to redirects for that link?",
          answer: md`
            The updates queue for the same row lock, one after another. Each redirect waits behind all the others, so redirects for that link slow down and start timing out.

            A feature that only needed approximate counts has broken the main product.
          `,
        },
        {
          kind: "read",
          body: md`
            The fix has two parts:

            1. **Don't wait.** The redirect appends a click event to a durable stream (like Kafka or Kinesis) and responds immediately. See [[asynchronous-processing]].
            2. **Batch.** A separate worker reads events in batches, adds them up per link, day and country, and writes one total per group.
          `,
        },
        {
          kind: "estimate",
          id: "batch-writes",
          prompt: "The worker flushes every 10 seconds. For the link getting 5,000 clicks a second, how many clicks does each write now cover?",
          answer: 50_000,
          unit: "clicks per write",
          working: md`
            5,000 clicks/s × 10 s = **50,000 clicks** in one batch, written as a single \`+50,000\` to that link's row. 50,000 lock waits become one.
          `,
        },
        {
          kind: "choice",
          id: "backlog",
          prompt: "During a huge campaign the worker falls behind and the stream builds a backlog. What do users notice?",
          options: [
            {
              id: "lag",
              label: "Click counts are behind for a while. Redirects stay fast.",
              correct: true,
              why: "The redirect only appends an event and never waits for the worker. The backlog only delays the counts, which customers accept can lag.",
            },
            {
              id: "slow",
              label: "Redirects slow down until the worker catches up.",
              why: "The redirect doesn't wait for the worker at all. That separation is the point of the design.",
            },
            {
              id: "lost",
              label: "Some clicks are lost.",
              why: "The stream is durable, so the events wait there until the worker processes them.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            One catch: if the CDN answers a redirect from its cache, the request never reaches your redirect service, so no event is emitted. With edge caching, exact counts have to come from the CDN's logs or from code running on the CDN.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should clicks be counted?",
        options: [
          {
            id: "update-row",
            label: "UPDATE links SET clicks = clicks + 1 in the redirect request",
            assessment: "flawed",
            feedback:
              "Every redirect becomes a write, and a popular link becomes one row receiving 5,000 updates a second. Lock contention slows that link's redirects, so a problem in analytics turns into a redirect outage.",
          },
          {
            id: "stream-aggregate",
            label: "Emit a click event asynchronously to a durable stream; a worker counts in batches and upserts daily totals",
            assessment: "sound",
            feedback:
              "The redirect doesn't wait for analytics, and the database gets one write per (link, day, country) per batch instead of one per click. The stream absorbs spikes; if the worker falls behind, counts lag but redirects stay fast.",
          },
          {
            id: "edge-logs",
            label: "Derive counts from CDN and server access logs processed hourly",
            assessment: "defensible",
            feedback:
              "It needs no code on the redirect path, and it counts clicks the CDN answered, which the origin never sees. The costs are hourly freshness and a log pipeline to run. Many shorteners that cache at the edge end up doing this.",
          },
          {
            id: "sample",
            label: "Count 1% of clicks and multiply by 100",
            assessment: "defensible",
            feedback: "Cheap and fine for large numbers, but a customer with 37 clicks sees 0 or 100, and you can't bill by clicks. Sampling suits overall dashboards, not per-link counts that customers rely on.",
          },
        ],
        rationale: {
          prompt: "Why does your design keep analytics from hurting redirects?",
          rubric: [
            { id: "off-path", text: "Counting happens asynchronously, so redirects never wait on it." },
            { id: "batching", text: "Batching turns per-click writes into a small number of writes." },
            { id: "edge-clicks", text: "Notes that redirects answered by the CDN never reach the origin, so their clicks need CDN logs or edge events.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Never make the main request wait for bookkeeping: emit an event and respond.",
          "Batching turns thousands of writes to one hot row into one write per batch.",
          "If a cache answers requests, those requests are invisible to your servers. Plan how to count them.",
        ],
        reasoning: md`
          The work of counting is tiny. The problem was that it competed with redirects for the same row. Moving it to a stream and a batch worker removes that competition: redirects only append, and the database sees one write per link per batch.
        `,
      },
      reveals: { components: ["clicks", "aggregator"], flows: ["emit", "consume", "counts"] },
    },
    {
      id: "malware-takedown",
      title: "Take down a malicious link everywhere",
      phase: "break",
      dimensions: ["break", "explain"],
      conceptIds: ["caching"],
      competencyIds: ["invalidation"],
      event: {
        kind: "failure",
        title: "A link is reported as distributing malware",
        detail: "It has been clicked 200,000 times in the last hour. Trust and safety disables it in the admin tool, which sets the link's status to disabled in the database.",
      },
      context: md`
        The database now says the link is disabled. But the redirect has been copied to other places.
      `,
      lesson: [
        {
          kind: "predict",
          id: "copies",
          prompt: "List every place a copy of this redirect might still exist after the database row is disabled.",
          answer: md`
            - **CDN edge servers**, until their copy expires or you purge it.
            - **Browsers**, if the redirect was a 301 or had a browser \`max-age\`. You can't clear these.
            - **Any cache inside the redirect service**, such as Redis or in-process memory.
            - **Read replicas** that haven't applied the update yet (usually for under a second).
          `,
        },
        {
          kind: "read",
          body: md`
            A CDN **purge** removes a URL from its edge servers, usually within seconds. A short TTL is the backup: if a purge fails or misses a server, the copy still expires soon.
          `,
        },
        {
          kind: "estimate",
          id: "exposure",
          prompt: "The link gets 200,000 clicks an hour. With no purge and a 60-second CDN TTL, about how many more clicks could still reach the malware in the worst case?",
          answer: 3_300,
          unit: "clicks",
          working: md`
            200,000 per hour ÷ 60 = about **3,300 clicks** a minute, so one full TTL is about 3,300 more people. With a 1-hour TTL it would be 200,000. A purge cuts this to a few seconds' worth.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What should disabling a link do?",
        options: [
          {
            id: "db-only",
            label: "Set the status to disabled in the database",
            assessment: "flawed",
            feedback:
              "The CDN keeps serving its cached redirect until it expires. With a 60-second TTL that's thousands more clicks to malware; with a longer TTL, far more.",
          },
          {
            id: "db-purge-410",
            label: "Set it disabled, purge the URL from the CDN, and from then on return a 410 Gone that is itself cached briefly",
            assessment: "sound",
            feedback:
              "The purge removes the copies you control right away, the short TTL is a backstop if the purge misses an edge server, and the 410 tells users and crawlers the link was removed on purpose.",
          },
          {
            id: "wait-ttl",
            label: "Set it disabled and let the 60-second TTL expire on its own",
            assessment: "defensible",
            feedback:
              "Exposure is capped at one TTL, which some teams accept for ordinary edits. For malware getting 3,300 clicks a minute, it's worth calling the purge API.",
          },
          {
            id: "no-cdn",
            label: "Stop caching redirects at the CDN altogether",
            assessment: "defensible",
            feedback: "Takedowns become instant, but every click goes back to the US region, and you're back to slow redirects in Sydney. You'd be giving up a lot to fix something a purge already fixes.",
          },
        ],
        rationale: {
          prompt: "Where can copies of the redirect live, and how does your choice reach each of them?",
          rubric: [
            { id: "copies", text: "Names the CDN as a place copies live after the database changes." },
            { id: "purge-ttl", text: "Uses an explicit purge, with a short TTL as a backstop." },
            { id: "browsers", text: "Notes that browser caches can't be purged, which is why redirects are 302s.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "A delete has to reach every copy: database, CDN, any service caches. Browsers can't be reached at all.",
          "Purge on delete, and keep TTLs short as a backstop.",
          "Decide where copies may live before you need to delete one. That's why the status code, TTL and purge are designed together.",
        ],
        reasoning: md`
          Disabling the row only changes the source. Every cache built in earlier stages now holds a copy that has to be removed too. Because the redirect is a 302, browsers hold no copies, and the CDN's copies can be purged. See [[caching]].
        `,
      },
    },
    {
      id: "replica-lag-404",
      title: "New links show as \"not found\" in a new region",
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
      lesson: [
        {
          kind: "read",
          body: md`
            A **read replica** copies every change from the primary database, usually within milliseconds, but never instantly. That delay is **replication lag**. A link created on the primary may be missing from a replica for a moment. See [[replication]].

            A **negative cache** stores "not found" answers, so repeated requests for codes that don't exist (from scanners guessing codes, for example) don't hit the database.
          `,
        },
        {
          kind: "predict",
          id: "hour",
          prompt: "A customer creates a link in the US. 200 ms later someone in Sydney clicks it. The Sydney replica doesn't have it yet, so the service answers 404, and the CDN caches that 404 for an hour, like any redirect. What does everyone else in Sydney see?",
          answer: md`
            "Not found" for up to an hour, even though the replica caught up within a second. The cache took a moment of lag and kept it for the whole TTL.
          `,
        },
        {
          kind: "choice",
          id: "miss-meaning",
          prompt: "The Sydney replica doesn't have code `aZ3kQ9x`. What does that tell you?",
          options: [
            {
              id: "uncertain",
              label: "Either the link doesn't exist, or it's new and the replica hasn't caught up yet.",
              correct: true,
              why: "A missing row on a replica is uncertain. Asking the primary settles it, and that's only needed for misses, which are rare.",
            },
            {
              id: "missing",
              label: "The link doesn't exist.",
              why: "Only the primary can say that for sure. The replica may simply be behind.",
            },
            {
              id: "broken",
              label: "Replication is broken.",
              why: "Lag of a few hundred milliseconds is normal. Replication is working; the code just doesn't account for lag.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What do you change?",
        options: [
          {
            id: "sync-replication",
            label: "Make replication synchronous so replicas are never behind",
            assessment: "defensible",
            feedback:
              "It removes lag, but every link creation now waits for a trans-Pacific round trip, and a slow replica stalls writes everywhere. It's a heavy cost, and it does nothing about the hour-long cached 404.",
          },
          {
            id: "fallback-no-negative-cache",
            label: "On a replica miss, check the primary before answering 404, and cache 404s only briefly",
            assessment: "sound",
            feedback:
              "A miss on a replica isn't proof the link doesn't exist. Checking the primary costs a cross-region trip only for real misses and very new links. The hour came from caching the first 404 as long as a redirect; \"not found\" deserves a much shorter TTL.",
          },
          {
            id: "creator-reads-primary",
            label: "Route the creator's own reads to the primary for a minute after they create a link",
            assessment: "defensible",
            feedback:
              "That's read-your-writes for the creator, but the people who click a new link are mostly not its creator. It doesn't help them.",
          },
          {
            id: "cache-404-longer",
            label: "Cache 404s at the edge for longer to protect the database from scans",
            assessment: "flawed",
            feedback: "This turns sub-second replication lag into hours of a working link being reported as missing.",
          },
        ],
        rationale: {
          prompt: "Why did a sub-second lag cause an hour-long failure, and how does your fix prevent both?",
          rubric: [
            { id: "lag", text: "A replica can lag behind the primary, so a new link may be missing there briefly." },
            { id: "negative-cache", text: "Caching the resulting 404 at the edge extends a brief inconsistency for the whole TTL." },
            { id: "fix", text: "Treats a replica miss as uncertain (falls back to the primary) and gives 404s a short TTL." },
          ],
        },
      },
      reveal: {
        takeaways: [
          "A miss on a replica means \"not here yet\" as often as \"doesn't exist\". Confirm with the primary.",
          "Cache \"not found\" much more briefly than real answers. Otherwise a moment of lag lasts the whole TTL.",
        ],
        reasoning: md`
          Two reasonable pieces combined into an hour-long bug: [[replication]] that was briefly behind, and a [[caching|cache]] that kept the wrong answer. Before caching something, ask whether it's a fact (this code points here) or an observation from a source that might be behind (this replica didn't have it).
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
        Your interviewer pushes back: "This wouldn't scale. I'd expect Cassandra for the links, Kafka for clicks, a dedicated ID-generation service, and separate microservices for creation, redirect and analytics. Why didn't you do that?"
      `,
      lesson: [
        {
          kind: "read",
          body: md`
            "Would this scale?" is a question about numbers, so answer with numbers. For each component the interviewer suggests, say two things:

            1. **What it would buy you.** Every one of those components solves a real problem.
            2. **The trigger.** Which measurement would tell you it's time to add it.

            That shows you know what each component is for, without adding them all up front.
          `,
        },
        {
          kind: "choice",
          id: "trigger",
          prompt: "Which is a good trigger for moving the links from Postgres to a partitioned store like Cassandra?",
          options: [
            {
              id: "outgrow",
              label: "The link table is approaching what one server can store, or writes approach what one primary can take.",
              correct: true,
              why: "It names a measurable limit that the current design will actually hit. At 600 GB a year and about 40 writes a second, that's years away.",
            },
            {
              id: "big-company",
              label: "The company becomes large enough to afford it.",
              why: "Budget doesn't make a database necessary. What matters is whether the current one is running out of something.",
            },
            {
              id: "latency",
              label: "Users in Sydney complain about slow redirects.",
              why: "That's distance, which Cassandra in the US region doesn't fix. Edge caching or a regional replica does.",
            },
          ],
        },
      ],
      interaction: {
        kind: "open",
        prompt: "Defend the design with numbers, say what would make you adopt each of those components, and identify the first real bottleneck you expect.",
        placeholder: "At 19,000 redirects a second…",
        rubric: [
          { id: "numbers", text: "Uses the numbers: about 40 writes/s, about 19,000 reads/s at peak, about 600 GB a year, all within one database plus caching." },
          { id: "triggers", text: "Names a concrete trigger for each component (for example storage beyond one machine, write rates, several independent consumers of click events)." },
          { id: "first-bottleneck", text: "Identifies a plausible first real bottleneck (storage growth, the analytics write path, or latency in other regions) and the targeted fix." },
          { id: "not-dismissive", text: "Acknowledges what the proposed components would buy, rather than dismissing them.", weight: "supporting" },
        ],
        reference: md`
          **Numbers first.** Writes are about 40 a second, reads about 19,000 a second at peak (mostly for a small set of popular links), and storage grows about 600 GB a year. One Postgres primary handles that, and the CDN answers most popular-link reads before they reach it.

          **When each component would earn its place:**

          - **Cassandra or another partitioned store:** when the link table outgrows one machine's storage or one primary's write capacity, likely years from now. Before that, Postgres partitioning or a managed distributed SQL database is a smaller step.
          - **Kafka:** once several independent consumers need click events (fraud detection, billing, analytics). For one aggregator, a managed queue or stream is enough.
          - **An ID service:** only if random codes plus a unique constraint stop working, which with 3.5 trillion possible codes won't happen for a very long time.
          - **Microservices:** when separate teams own creation, redirect and analytics, or when their scaling or deploy schedules genuinely differ. The redirect path is already isolated by the CDN and the asynchronous click path.

          **First real bottleneck:** probably the analytics write path during big campaigns (handled by batching and the stream) or latency in other regions for less popular links (handled by regional replicas with careful miss handling). Probably not the link table.
        `,
      },
      reveal: {
        takeaways: [
          "Answer \"would it scale?\" with your numbers, not with more components.",
          "For each component you leave out, say what would make you add it.",
        ],
        reasoning: md`
          Naming triggers turns a disagreement about taste into one about measurements, which can actually be settled. It also shows the interviewer you know what each component is for.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      The numbers fit on one relational database, so the links live in Postgres with the **code as the primary key**, and the database enforces uniqueness. Codes are random, so they can't be guessed, and the rare collision becomes a retry.

      Redirects are **302s cached briefly at CDN edge servers**, so popular links are answered near users while edits and takedowns still work through purges and short TTLs. Clicks are **sent to a stream and counted in batches**, so analytics never slows redirects. Where regional replicas serve less popular links, a miss is checked against the primary and "not found" is cached only briefly.
    `,
    reliesOn: [
      "Clicks are uneven enough for edge caches to absorb most reads of popular links.",
      "The CDN's purge API works within seconds.",
      "Clients follow 302 redirects and respect Cache-Control.",
      "Analytics may lag by minutes.",
    ],
    alternatives: [
      { design: "Redirects served entirely at the edge (a key-value store and functions on the CDN)", preferWhen: "Every link, including rarely clicked ones, must be fast everywhere, and the platform's consistency model fits." },
      { design: "Partitioned key-value store for links", preferWhen: "Link volume or write rates outgrow a single primary." },
      { design: "Log-based analytics only", preferWhen: "Most redirects are served at the edge, so per-click events from the origin would undercount anyway." },
    ],
    tradeoffs: [
      { choice: "302 with short edge TTLs", gains: "Countable clicks, editable links, fast takedowns.", costs: "More traffic reaches the origin than with permanent redirects." },
      { choice: "Random codes + unique key", gains: "Unguessable, no coordination, uniqueness enforced by the database.", costs: "Inserts scattered across the index; occasional retries." },
      { choice: "Asynchronous click counting", gains: "Redirects never wait on analytics.", costs: "Counts lag; a stream and a worker to run." },
      { choice: "Replica reads with primary fallback", gains: "Fast redirects in other regions for every link.", costs: "Cross-region trips on misses; lag handling in code." },
    ],
    breaksWhen: [
      "Link volume outgrows one machine's storage, which calls for partitioning by code.",
      "Customers need exact, real-time click counts, including clicks answered by the CDN.",
      "Regulations require data to stay in each region, so links must be created and stored regionally.",
      "Abusers create links very quickly, which needs rate limits on creation and scanning before a link goes live.",
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
