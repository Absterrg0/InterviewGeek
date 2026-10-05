/**
 * Primary sources: what engineers have published about the systems they built.
 *
 * One company per idea. Each company is here for one problem it solved and wrote
 * about, and links to the investigation that practises it. The company's
 * `context` is our own explanation of that idea; a writeup's `note` says in a
 * sentence or two why to read it. Neither paraphrases the original: the original
 * is the content, and we link to it.
 */
import type { CompanyInput, WriteupInput } from "@/lib/domain/content";
import { md } from "./md";

export const allCompanies: CompanyInput[] = [
  {
    id: "dub",
    name: "Dub",
    topic: "Redirects at the edge",
    summary: "An open-source link platform: every click is a redirect that must be fast everywhere, and an analytics event that must never slow it down.",
    context: md`
      A short link does two jobs on every click: send the visitor on, and remember that they came. Dub is unusual because its redirect path is open source, so you can read the real answer instead of guessing at it.

      The redirect runs in middleware at the edge, near the visitor. It looks the link up in Redis and goes to the database only on a miss, filling the cache afterwards. Recording the click is deferred until the response has gone out, so a slow analytics store costs the visitor nothing. And when Redis itself is failing over, the code skips click tracking rather than risk a slow redirect. A missing click is cheaper than a slow page.

      Click analytics began in Redis sorted sets, which could count but could not filter by country, referrer or device without slow queries. They moved to a column store built for that kind of question. It is the same split the URL shortener investigation arrives at: the redirect path owns latency, the analytics path owns flexibility, and neither waits for the other.
    `,
    blogUrl: "https://dub.co/blog",
  },
  {
    id: "mux",
    name: "Mux",
    topic: "Video that plays before it is processed",
    summary: "A video API that starts playback seconds after upload by transcoding segments on demand instead of the whole file up front.",
    context: md`
      The usual video pipeline transcodes every rendition before anyone can watch: queue a job, wait, publish. Mux reversed the order. An upload is cut into short segments, and a segment is transcoded when a viewer first asks for it, streamed out as it is produced. A long file can play within seconds, and renditions nobody watches are never made.

      That moves work out of a batch queue and into the request path, which changes what can go wrong. Mux's write-up of a 22-day storage incident shows it well: corrupted segments came from a cancelled read that affected other readers of the same file, a race between deleting and replicating, and incomplete writes treated as complete files, all made worse by a scaling change that slowed object storage during bursts. None of these is exotic. Each is a small assumption that held until the load changed.

      Read them next to the video pipeline investigation, which builds the conventional queue-and-workers design. Just-in-time transcoding is the alternative when time to first play matters more than predictable batch cost.
    `,
    blogUrl: "https://www.mux.com/blog",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    topic: "Rate limiting at the edge",
    summary: "Rate limits enforced in hundreds of data centres at once, where exact global counts would cost more than the attacks they stop.",
    context: md`
      A rate limiter that counts every request exactly, worldwide, needs coordination on every request. Cloudflare's design gives that up on purpose. Each data centre counts on its own. The sliding window is estimated from two fixed-window counters, weighted by how far into the current window you are. And once a client is over the limit, the decision to block is cached locally, so the counter is not touched again until it expires.

      The part worth copying is that they measured the cost of approximating instead of assuming it, and found the error tiny. That is the argument to make in an interview: say what is approximate, how large the error is, and who it hurts.
    `,
    blogUrl: "https://blog.cloudflare.com/",
  },
  {
    id: "twitter",
    name: "Twitter (X)",
    topic: "Fan-out for home timelines",
    summary: "The classic home timeline design: do the work when someone posts, so the far more frequent reads are cheap.",
    context: md`
      When reads vastly outnumber writes, build the timeline at write time. Twitter's timeline service did: a new post is inserted into the cached timeline of each follower, so reading a timeline is a single lookup. Timelines hold IDs rather than posts, and are capped in length, so the cache stays small.

      The design has a well-known weak spot: accounts with enormous followings, where one post becomes millions of inserts. The talk covers that problem and the hybrid answer, [[fan-out]] on write for most accounts and a merge at read time for the largest. It also treats timelines as derived data that can be rebuilt, which is why users who have not visited in a while can be skipped entirely.
    `,
    blogUrl: "https://blog.x.com/engineering/en_us",
  },
  {
    id: "slack",
    name: "Slack",
    topic: "Job queues under backlog",
    summary: "A job queue that failed because its backlog lived in memory, and the redesign that moved the backlog to disk.",
    context: md`
      Slack's job queue held every pending job in Redis. That was fine until a slow database made the workers slow. Jobs piled up, Redis filled, and because taking a job off the queue also needed a little free memory, the queue could no longer drain at all.

      The redesign separates two things a queue does: holding a backlog, and handing out work. A durable log on disk took the backlog; Redis kept only the jobs workers were about to run; a relay between them set the pace. The rollout is as instructive as the design: run the new path next to the old one on real traffic, throw its output away, and switch only once it has proven itself.
    `,
    blogUrl: "https://slack.engineering/",
  },
  {
    id: "uber",
    name: "Uber",
    topic: "Push instead of polling",
    summary: "Moving millions of phones from polling for updates to a push platform that resumes cleanly after a dropped connection.",
    context: md`
      Apps that poll for changes spend most of their requests learning that nothing changed. Uber replaced polling with push: the server holds a connection to each app and sends updates as they happen.

      Push brings its own problems, which is what makes the post useful. Mobile connections drop all the time, so each message carries a sequence number, and a reconnecting app asks to resume from the last one it saw. Later versions added acknowledgements, so the server knows what actually arrived rather than what it sent. These are the [[delivery-guarantees|delivery questions]] the notifications investigation asks: what is delivered at least once, what may be dropped, and who notices.
    `,
    blogUrl: "https://www.uber.com/blog/engineering/",
  },
  {
    id: "stripe",
    name: "Stripe",
    topic: "Payments that never charge twice",
    summary: "Payment APIs where a retry after a timeout must never move money twice.",
    context: md`
      A client whose request timed out does not know whether the payment went through. If retrying could charge twice, nobody could safely retry. Stripe's answer is the [[idempotency]] key: the client attaches a unique key to every request that changes something, and the server does the work at most once per key, returning the stored result to any repeat.

      Doing that correctly is harder than it sounds, and Brandur Leach's companion post works through it in Postgres: split a request into steps that each commit atomically with a recovery point, so a retry resumes rather than restarts, and treat each call to an outside service as a step that may need its own key. Michelle Bu's history of the payments API adds the other half: once some payment methods take days to confirm, a payment is a state machine, and the API has to say so.
    `,
    blogUrl: "https://stripe.com/blog/engineering",
  },
  {
    id: "meta",
    name: "Meta (Facebook)",
    topic: "Caching in front of a database",
    summary: "Memcached as a look-aside cache at very large scale, where the hard part is keeping it correct rather than fast.",
    context: md`
      A look-aside cache is easy to describe: read from the cache, fall back to the database on a miss, and fill the cache with what you found. Facebook's memcache paper is the best account of what goes wrong when you lean on that pattern hard.

      Most of the paper is about correctness and load, not speed. Writers delete keys instead of updating them, because deletes cannot land in the wrong order. Leases stop a slow reader from putting a stale value back after a delete, and stop thousands of readers from querying the database for the same missing key at once. Deletes are driven from the database's commit log, so a crash cannot lose them. A small pool of idle servers takes over a failed server's traffic, so its keys do not fall through to the database.

      It is a long paper, but each mechanism is introduced by the problem that forced it, so it reads well one section at a time.
    `,
    blogUrl: "https://engineering.fb.com/",
  },
  {
    id: "discord",
    name: "Discord",
    topic: "Storing chat history forever",
    summary: "Chat history that is kept forever and read at random, and the move to another database while it was running.",
    context: md`
      Chat history looks like a log, but the reads are anything but sequential: people open old channels, jump to search results and scroll back years. Discord's two posts, six years apart, follow one data model through that.

      The first explains the model: [[partitioning|partition]] messages by channel plus a time bucket, so no partition grows without bound, and sort them by a time-ordered ID so the latest page is cheap. It also covers what that storage engine makes expensive: a delete leaves a tombstone that later reads must step over, and an edit racing a delete can leave a broken row.

      The second covers what growth did to the same design: hot partitions when everyone reads one huge channel at once, fixed by routing every request for a channel through one service instance that merges identical reads. Then the whole history moved to a different database without downtime.
    `,
    blogUrl: "https://discord.com/category/engineering",
  },
  {
    id: "figma",
    name: "Figma",
    topic: "Real-time multiplayer editing",
    summary: "Several people editing one design at once, kept in sync by a single server per document.",
    context: md`
      Collaborative editing is usually taught through operational transforms or CRDTs. Figma took a simpler route that its product allowed: one server owns each open document, and changes are resolved per property, with the last writer winning. Two people changing different properties never conflict; two changing the same one get a predictable result. Children are ordered by fractional positions, so inserting between two items never renumbers the rest.

      The second post is about durability. Saving the whole file every so often means a crash loses everything since the last save. Writing each small change to a durable journal first, and making sure only one server owns a file's history at a time, closes that gap.
    `,
    blogUrl: "https://www.figma.com/blog/engineering/",
  },
  {
    id: "notion",
    name: "Notion",
    topic: "Sharding Postgres without downtime",
    summary: "One Postgres database split by workspace while the product stayed online, then split further two years later.",
    context: md`
      Notion's first post covers the choice most teams face once one database is not enough: what to shard by, and into how many pieces. They chose the workspace, because nearly every query is scoped to one, and created far more logical shards than machines, so that adding machines later would mean moving whole shards rather than re-hashing rows.

      The migration follows a sequence worth knowing by heart: capture new writes first, copy the history, check that old and new agree (including by reading from both and comparing), and only then switch. The second post shows why the shard count mattered: when they needed three times the capacity, they moved existing shards to new hosts with replication and switched each with a brief pause.
    `,
    blogUrl: "https://www.notion.com/blog/topic/tech",
  },
  {
    id: "convex",
    name: "Convex",
    topic: "A database that pushes query results",
    summary: "A reactive database: queries are functions, their results update live, and transactions behave as if they ran one at a time.",
    context: md`
      Most apps keep screens current by polling, or by invalidating caches by hand. Convex builds that into the database. A query is a function that runs inside a transaction, and the database records exactly which index ranges it read. Each committed write is checked against the read ranges of the live subscriptions, and only queries whose inputs changed are run again and pushed to their clients.

      The same record of what was read gives them serializable transactions through [[concurrency-control|optimistic concurrency control]]. A mutation runs against a snapshot; at commit the database checks whether anything it read has changed since, and if so the mutation runs again. Developers can write code as if transactions ran one at a time.

      Read it alongside the live queries investigation, which asks you to design the subscription layer yourself: what to track, how precisely, and what happens when a popular query is invalidated constantly.
    `,
    blogUrl: "https://stack.convex.dev/",
  },
  {
    id: "posthog",
    name: "PostHog",
    topic: "Analytics on billions of events",
    summary: "Product analytics that outgrew Postgres: an event pipeline into a column store, and the copying that made person queries fast.",
    context: md`
      Product analytics asks questions row databases are bad at: count events matching a filter over months, grouped by a property, for one customer among thousands. PostHog started on Postgres and moved to ClickHouse, a column store that reads only the columns a query touches and compresses them well.

      Their posts are useful because they cover the costs, not only the speed-up. Events arrive through Kafka rather than direct inserts, so spikes and database outages are absorbed. Changing existing rows in a column store is expensive, and doing it often caused real trouble. Properties stored as one JSON blob had to be parsed on every query until the most used ones were given columns of their own. And joining events to people at query time was slow enough that they now copy person data onto each event as it arrives, accepting that a person's later changes no longer rewrite history.
    `,
    blogUrl: "https://posthog.com/blog/engineering",
  },
];

export const allWriteups: WriteupInput[] = [
  // Dub
  {
    id: "dub-link-middleware",
    companyId: "dub",
    title: "Dub's link redirect middleware",
    url: "https://github.com/dubinc/dub/blob/main/apps/web/lib/middleware/link.ts",
    authors: ["Steven Tey", "Dub contributors"],
    published: "2022-09",
    format: "code",
    note: "The code that serves every Dub short link. Look for the Redis lookup with a database fallback, the click recorded after the response is sent, and what happens when Redis is failing over.",
    investigationIds: ["url-shortener"],
    conceptIds: ["caching", "asynchronous-processing"],
  },
  {
    id: "dub-click-analytics",
    companyId: "dub",
    title: "Upgrading short link analytics by 100x with Steven Tey",
    url: "https://www.tinybird.co/blog-posts/upgrading-short-link-analytics-by-100x-with-steven-tey",
    authors: ["Steven Tey"],
    published: "2023-05",
    format: "post",
    note: "An interview on Tinybird's blog about why click data outgrew Redis sorted sets once people wanted to filter and group it, and what replaced them.",
    investigationIds: ["url-shortener"],
    conceptIds: ["event-log"],
  },

  // Mux
  {
    id: "mux-just-in-time-transcoding",
    companyId: "mux",
    title: "How to transcode video 100x faster; or, a Gordian knot cut",
    url: "https://www.mux.com/blog/how-to-transcode-video-100x-faster-or-a-gordian-knot-cut",
    authors: ["Jon Dahl"],
    published: "2023-04",
    format: "post",
    note: "Why transcoding everything before publishing is slow, and the alternative: split the upload into segments and transcode each one the first time someone watches it.",
    investigationIds: ["video-processing-pipeline"],
    conceptIds: ["asynchronous-processing", "object-storage"],
  },
  {
    id: "mux-storage-bug",
    companyId: "mux",
    title: "What we learned from a 22-Day storage bug (and how we fixed it)",
    url: "https://www.mux.com/blog/22-day-storage-bug",
    authors: ["Drew Rodman", "Constantin Britcov"],
    published: "2026-03",
    format: "post",
    note: "A candid incident report. Three small races in a segment store, exposed when a scaling change slowed object storage, and why it took weeks to connect the symptoms to the cause.",
    investigationIds: ["video-processing-pipeline"],
    conceptIds: ["durability", "object-storage", "replication"],
  },

  // Cloudflare
  {
    id: "cloudflare-rate-limiting",
    companyId: "cloudflare",
    title: "How we built rate limiting capable of scaling to millions of domains",
    url: "https://blog.cloudflare.com/counting-things-a-lot-of-different-things/",
    authors: ["Cloudflare"],
    published: "2017-06",
    format: "post",
    note: "Approximating a sliding window with two counters, counting per data centre instead of globally, and measuring how wrong the approximation actually is.",
    investigationIds: ["api-rate-limiter"],
    conceptIds: ["rate-limiting", "caching"],
  },

  // Twitter
  {
    id: "twitter-timelines-at-scale",
    companyId: "twitter",
    title: "Timelines at Scale",
    url: "https://www.infoq.com/presentations/Twitter-Timeline-Scalability/",
    authors: ["Raffi Krikorian"],
    published: "2013-04",
    format: "talk",
    note: "A talk on how home timelines were served: fan-out on write into a cache, what that costs for very large accounts, and why timelines are treated as rebuildable.",
    investigationIds: ["news-feed"],
    conceptIds: ["fan-out", "caching", "soft-state"],
  },

  // Slack
  {
    id: "slack-job-queue",
    companyId: "slack",
    title: "Scaling Slack's Job Queue",
    url: "https://slack.engineering/scaling-slacks-job-queue/",
    authors: ["Saroj Yadav", "Matthew Smillie", "Mike Demmer", "Tyler Johnson"],
    published: "2017-12",
    format: "post",
    note: "An outage, the design flaw behind it, and the redesign. The section on rolling the new path out without an outage is worth reading twice.",
    investigationIds: ["job-queue"],
    conceptIds: ["message-queues", "backpressure", "event-log"],
  },

  // Uber
  {
    id: "uber-push-platform",
    companyId: "uber",
    title: "Uber's Real-Time Push Platform",
    url: "https://www.uber.com/blog/real-time-push-platform/",
    authors: ["Madan Thangavelu", "Anirudh Raja", "Nilesh Mahajan", "Uday Kiran Medisetty"],
    published: "2020-12",
    format: "post",
    note: "Why polling was replaced, and the delivery problems push brought with it: resuming after a dropped connection, and knowing what actually arrived.",
    investigationIds: ["notification-system"],
    conceptIds: ["server-push", "persistent-connections", "ordering", "delivery-guarantees"],
  },

  // Stripe
  {
    id: "stripe-idempotency",
    companyId: "stripe",
    title: "Designing robust and predictable APIs with idempotency",
    url: "https://stripe.com/blog/idempotency",
    authors: ["Brandur Leach"],
    published: "2017-02",
    format: "post",
    note: "The short, standard explanation of idempotency keys, and of retrying with backoff and jitter.",
    investigationIds: ["payment-workflow"],
    conceptIds: ["idempotency", "retries-and-backoff", "timeouts"],
  },
  {
    id: "brandur-idempotency-keys",
    companyId: "stripe",
    title: "Implementing Stripe-like Idempotency Keys in Postgres",
    url: "https://brandur.org/idempotency-keys",
    authors: ["Brandur Leach"],
    published: "2017-10",
    format: "post",
    note: "The long version, with code: how to make a multi-step request safe to retry when some of its steps call other services.",
    investigationIds: ["payment-workflow"],
    conceptIds: ["idempotency", "transactions", "state-machines"],
  },
  {
    id: "stripe-payments-apis",
    companyId: "stripe",
    title: "Stripe's payments APIs: the first ten years",
    url: "https://stripe.dev/blog/payment-api-design",
    authors: ["Michelle Bu"],
    published: "2020-12",
    format: "post",
    note: "How payment methods that confirm asynchronously broke the original API, and why the replacement models a payment as one explicit state machine.",
    investigationIds: ["payment-workflow"],
    conceptIds: ["state-machines", "webhooks", "asynchronous-processing"],
  },

  // Meta
  {
    id: "meta-scaling-memcache",
    companyId: "meta",
    title: "Scaling Memcache at Facebook",
    url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala",
    authors: ["Rajesh Nishtala", "Hans Fugal", "Steven Grimm", "et al."],
    published: "2013-04",
    format: "paper",
    note: "The reference on running a look-aside cache hard: leases, invalidation from the commit log, failover without hammering the database, and consistency across regions.",
    investigationIds: ["distributed-cache"],
    conceptIds: ["caching", "request-coalescing", "leases-and-fencing", "transactional-outbox", "replication"],
  },

  // Discord
  {
    id: "discord-billions-of-messages",
    companyId: "discord",
    title: "How Discord Stores Billions of Messages",
    url: "https://discord.com/blog/how-discord-stores-billions-of-messages",
    authors: ["Stanislav Vishnevskiy"],
    published: "2017-01",
    format: "post",
    note: "Choosing a database and a partition key for chat history, and the surprises that followed: tombstones, and an edit racing a delete.",
    investigationIds: ["chat-message-store"],
    conceptIds: ["partitioning", "lsm-trees", "id-generation", "conflict-resolution"],
  },
  {
    id: "discord-trillions-of-messages",
    companyId: "discord",
    title: "How Discord Stores Trillions of Messages",
    url: "https://discord.com/blog/how-discord-stores-trillions-of-messages",
    authors: ["Bo Ingram"],
    published: "2023-03",
    format: "post",
    note: "The same data model six years on: hot partitions, a service layer that merges identical reads, and a migration of the full history to a new database.",
    investigationIds: ["chat-message-store"],
    conceptIds: ["request-coalescing", "consistent-hashing", "online-migrations", "lsm-trees"],
  },

  // Figma
  {
    id: "figma-multiplayer",
    companyId: "figma",
    title: "How Figma's multiplayer technology works",
    url: "https://www.figma.com/blog/how-figmas-multiplayer-technology-works/",
    authors: ["Evan Wallace"],
    published: "2019-10",
    format: "post",
    note: "Why a central server per document let Figma avoid most of the machinery of operational transforms, and how ordering works when anyone can insert anywhere.",
    investigationIds: ["realtime-collaboration"],
    conceptIds: ["conflict-resolution", "ordering", "persistent-connections"],
  },
  {
    id: "figma-reliable-multiplayer",
    companyId: "figma",
    title: "Making multiplayer more reliable",
    url: "https://www.figma.com/blog/making-multiplayer-more-reliable/",
    authors: ["Darren Tsung"],
    published: "2022-10",
    format: "post",
    note: "Closing the gap between periodic saves: a durable journal of small changes, and one owner per document's history.",
    investigationIds: ["realtime-collaboration"],
    conceptIds: ["durability", "event-log", "leases-and-fencing"],
  },

  // Notion
  {
    id: "notion-sharding-postgres",
    companyId: "notion",
    title: "Herding elephants: lessons learned from sharding Postgres at Notion",
    url: "https://www.notion.com/blog/sharding-postgres-at-notion",
    authors: ["Garrett Fidalgo"],
    published: "2021-10",
    format: "post",
    note: "Picking a shard key and a shard count, then moving a live database across with no data lost. Includes an honest list of what they would do differently.",
    investigationIds: ["shard-live-database"],
    conceptIds: ["partitioning", "online-migrations"],
  },
  {
    id: "notion-great-reshard",
    companyId: "notion",
    title: "The Great Re-shard: adding Postgres capacity (again) with zero downtime",
    url: "https://www.notion.com/blog/the-great-re-shard",
    authors: ["Arka Ganguli", "Tanner Johnson", "Ben Kraft", "Nathan Northcutt"],
    published: "2023-07",
    format: "post",
    note: "The payoff of fixed logical shards: growing to more machines by moving shards whole.",
    investigationIds: ["shard-live-database"],
    conceptIds: ["partitioning", "replication", "online-migrations"],
  },

  // Convex
  {
    id: "how-convex-works",
    companyId: "convex",
    title: "How Convex Works",
    url: "https://stack.convex.dev/how-convex-works",
    authors: ["Sujay Jayakar"],
    published: "2024-04",
    format: "post",
    note: "A walk through a reactive database from the inside: the transaction log, read sets, optimistic concurrency, and how a write finds the subscriptions it affects.",
    investigationIds: ["live-queries"],
    conceptIds: ["concurrency-control", "transactions", "server-push", "event-log"],
  },

  // PostHog
  {
    id: "posthog-clickhouse",
    companyId: "posthog",
    title: "How we turned ClickHouse into our event mansion",
    url: "https://posthog.com/blog/how-we-turned-clickhouse-into-our-eventmansion",
    authors: ["James Greenhill"],
    published: "2021-11",
    format: "post",
    note: "Why event analytics outgrew Postgres, how they chose a column store, and the mistakes they made running it.",
    investigationIds: ["product-analytics"],
    conceptIds: ["columnar-storage", "online-migrations"],
  },
  {
    id: "posthog-materialized-columns",
    companyId: "posthog",
    title: "How to speed up ClickHouse queries using materialized columns",
    url: "https://posthog.com/blog/clickhouse-materialized-columns",
    authors: ["Karl-Aksel Puulmann"],
    published: "2021-10",
    format: "post",
    note: "Finding out where query time goes (parsing JSON), and pulling hot properties into their own columns without rewriting the table.",
    investigationIds: ["product-analytics"],
    conceptIds: ["columnar-storage"],
  },
  {
    id: "posthog-persons-on-events",
    companyId: "posthog",
    title: "How we're improving performance by combining persons and events",
    url: "https://posthog.com/blog/persons-on-events",
    authors: ["PostHog"],
    published: "2022-11",
    format: "post",
    note: "Copying person data onto every event to avoid a join at query time, and what that changes about how merged users appear in old data.",
    investigationIds: ["product-analytics"],
    conceptIds: ["columnar-storage"],
  },
];
