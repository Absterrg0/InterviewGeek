/**
 * Primary sources: what engineers have published about the systems they built.
 * Every writeup links to the original. Summaries and takeaways are ours; numbers
 * are the ones the authors reported. Investigations and concepts are linked by id,
 * so company pages, investigation pages and concept pages all read from this list.
 */
import type { CompanyInput, WriteupInput } from "@/lib/domain/content";
import { md } from "./md";

export const allCompanies: CompanyInput[] = [
  {
    id: "discord",
    name: "Discord",
    summary: "Chat for communities of every size: trillions of stored messages, servers with millions of members, and voice for millions at once.",
    context: md`
      Discord's engineering posts are unusually concrete: schemas, partition keys, latency numbers before and after, and the incidents that forced each change. The two posts on message storage, written six years apart, are one of the best long-running case studies of a data model meeting reality.
    `,
    blogUrl: "https://discord.com/category/engineering",
  },
  {
    id: "stripe",
    name: "Stripe",
    summary: "Payments APIs where a retry must never charge twice, and where every change to data has to happen without downtime.",
    context: md`
      Stripe's engineers wrote several of the most-cited posts on API reliability: idempotency keys, rate limiters and load shedders, and the dual-write pattern for migrating live data. They are short, practical and still how many companies build these things.
    `,
    blogUrl: "https://stripe.com/blog/engineering",
  },
  {
    id: "figma",
    name: "Figma",
    summary: "A multiplayer design tool in the browser: real-time collaboration on large documents, and Postgres scaled far past one machine.",
    context: md`
      Figma explains its decisions in terms of trade-offs: why not operational transforms, why a central server, why shard Postgres rather than adopt a distributed database. Good reading for how a small team picks the lower-risk option and makes it work.
    `,
    blogUrl: "https://www.figma.com/blog/engineering/",
  },
  {
    id: "twitter",
    name: "Twitter (X)",
    summary: "Timelines read hundreds of thousands of times a second, accounts with tens of millions of followers, and IDs generated without coordination.",
    context: md`
      Twitter's early infrastructure talks and code defined two classic answers: fan-out of posts into precomputed timelines (with a different path for celebrities), and Snowflake, the time-sortable ID scheme Discord and many others adopted.
    `,
    blogUrl: "https://blog.x.com/engineering/en_us",
  },
  {
    id: "meta",
    name: "Meta (Facebook)",
    summary: "Caching at billions of requests a second: look-aside caches, leases, invalidation pipelines and a graph cache in front of MySQL.",
    context: md`
      "Scaling Memcache at Facebook" is the reference text on running a cache at scale, and it is readable: every mechanism is introduced by the problem that forced it, usually with a number attached.
    `,
    blogUrl: "https://engineering.fb.com/",
  },
  {
    id: "notion",
    name: "Notion",
    summary: "Billions of blocks in Postgres, sharded by workspace while the product stayed online, then expanded again three years later.",
    context: md`
      Notion wrote up both of its big database migrations: the original sharding (with an honest list of regrets) and the later expansion from 32 to 96 hosts. Together they show how a good first migration makes the second one easy.
    `,
    blogUrl: "https://www.notion.com/blog/topic/tech",
  },
  {
    id: "slack",
    name: "Slack",
    summary: "Real-time messaging for large organisations, a job queue running over a billion jobs a day, and edge caches for huge teams.",
    context: md`
      Slack's posts are strong on operations: what failed, why, and how the replacement was rolled out without an outage. The job-queue post is a model incident-to-redesign write-up.
    `,
    blogUrl: "https://slack.engineering/",
  },
  {
    id: "uber",
    name: "Uber",
    summary: "Real-time marketplaces: pushing trip updates to millions of phones and indexing the world into hexagons.",
    context: md`
      Uber's engineering blog covers moving from polling to push for mobile clients, and the geospatial indexing behind pricing and dispatch.
    `,
    blogUrl: "https://www.uber.com/blog/engineering/",
  },
  {
    id: "netflix",
    name: "Netflix",
    summary: "Encoding a vast catalogue into many formats, and the microservice platform built to do it.",
    context: md`
      The Netflix Technology Blog documents its media-processing platform in depth, including the move from a monolithic encoding pipeline to services that split work into chunks and run it in parallel.
    `,
    blogUrl: "https://netflixtechblog.com/",
  },
  {
    id: "airbnb",
    name: "Airbnb",
    summary: "Payments across many services, where an API call that moves money must happen at most once.",
    context: md`
      Airbnb's payments team described a general-purpose idempotency library and the rules it imposes on every request: a sharp, practical complement to Stripe's posts on the same problem.
    `,
    blogUrl: "https://medium.com/airbnb-engineering",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    summary: "Rate limiting and counting at the edge, across millions of domains and hundreds of data centres.",
    context: md`
      Cloudflare's blog is a good source on doing approximate things well: their rate limiter trades a tiny, measured error for counters that are cheap enough to run everywhere.
    `,
    blogUrl: "https://blog.cloudflare.com/",
  },
  {
    id: "shopify",
    name: "Shopify",
    summary: "Millions of shops on sharded MySQL, isolated into pods that can fail and move independently.",
    context: md`
      Shopify's pods post shows sharding taken one step further: not just the database, but every datastore a shop uses, grouped so one shard's failure stays inside it.
    `,
    blogUrl: "https://shopify.engineering/",
  },
  {
    id: "github",
    name: "GitHub",
    summary: "Changing the schema of very large, very busy MySQL tables without locking them.",
    context: md`
      GitHub open-sourced gh-ost and explained why: trigger-based migration tools caused lock contention on their busiest tables, so they built one that tails the binary log instead.
    `,
    blogUrl: "https://github.blog/engineering/",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    summary: "Notifications for hundreds of millions of members, decided by a stream-processing system that caps volume and picks the channel.",
    context: md`
      LinkedIn's Air Traffic Controller post describes notification decisions as a system of its own: which channel, how many, and when, made in a stream processor partitioned by member.
    `,
    blogUrl: "https://www.linkedin.com/blog/engineering",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    summary: "An internal async task framework running thousands of tasks a second for dozens of teams.",
    context: md`
      Dropbox's ATF post is a clear description of a general-purpose task system: at-least-once execution, priorities and isolation per task type, and the guarantees each team can rely on.
    `,
    blogUrl: "https://dropbox.tech/",
  },
  {
    id: "amazon",
    name: "Amazon",
    summary: "The Builders' Library and the Dynamo paper: how Amazon thinks about retries, queues, overload and highly available storage.",
    context: md`
      The Amazon Builders' Library is a set of essays by senior AWS engineers on operating services at scale. Several are the best short treatment of their topic anywhere. The Dynamo paper introduced consistent hashing, sloppy quorums and vector clocks to a generation of databases.
    `,
    blogUrl: "https://aws.amazon.com/builders-library/",
  },
  {
    id: "linear",
    name: "Linear",
    summary: "An issue tracker built on a sync engine: the client holds the data locally and the server streams changes.",
    context: md`
      Linear's co-founder Tuomas Artman has talked about the sync engine behind the product: a local object graph on the client, transactions sent to the server, and deltas streamed back. The talk covers what broke as customers grew.
    `,
    blogUrl: "https://linear.app/now",
  },
];

export const allWriteups: WriteupInput[] = [
  // Discord
  {
    id: "discord-billions-of-messages",
    companyId: "discord",
    title: "How Discord Stores Billions of Messages",
    url: "https://discord.com/blog/how-discord-stores-billions-of-messages",
    authors: ["Stanislav Vishnevskiy"],
    published: "2017-01",
    format: "post",
    summary: md`
      Why Discord left MongoDB once data and indexes stopped fitting in memory, why it chose Cassandra, and the schema it settled on: messages partitioned by channel and a ten-day time bucket, clustered by Snowflake ID. Then the surprises: edits racing deletes to create half-rows, and one channel full of deleted messages that stalled the cluster.
    `,
    takeaways: [
      "Partition by (channel, time bucket) to keep partitions bounded however busy a channel gets.",
      "In a log-structured store, a delete is a tombstone that reads must scan past.",
      "Writing nulls creates tombstones too; write only the columns you have.",
      "Per-column last-write-wins lets an edit racing a delete produce a row nobody wrote.",
    ],
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
    summary: md`
      Six years later: 177 Cassandra nodes, hot partitions, garbage-collection pauses and daily manual toil. Discord added Rust data services that route by channel and coalesce identical reads, then migrated trillions of messages to ScyllaDB in nine days with a migrator rewritten in an afternoon.
    `,
    takeaways: [
      "Route requests for a key to one instance, then coalesce identical in-flight reads.",
      "A hot partition is a key-level problem; adding nodes does not split it.",
      "Dual-write new data, then copy history range by range with checkpoints.",
      "177 nodes became 72, and p99 history reads went from 40–125 ms to 15 ms.",
    ],
    investigationIds: ["chat-message-store"],
    conceptIds: ["request-coalescing", "consistent-hashing", "online-migrations", "lsm-trees"],
  },
  {
    id: "discord-elixir-scaling",
    companyId: "discord",
    title: "How Discord Scaled Elixir to 5,000,000 Concurrent Users",
    url: "https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users",
    authors: ["Stanislav Vishnevskiy"],
    published: "2017-07",
    format: "post",
    summary: md`
      Each Discord server (guild) is a process that fans events out to the sessions of its members. As guilds grew past tens of thousands of online members, a single publish took up to two seconds. Discord spread the fan-out work across nodes, sped up hash-ring lookups and added a semaphore to stop overload cascading.
    `,
    takeaways: [
      "Fan-out cost grows with audience size; very large audiences need the send work distributed.",
      "Group recipients by node so each node does its own local delivery.",
      "Limit concurrency towards a struggling dependency so callers fail fast instead of queueing.",
    ],
    investigationIds: [],
    conceptIds: ["fan-out", "publish-subscribe", "load-shedding", "consistent-hashing"],
  },
  {
    id: "discord-go-to-rust",
    companyId: "discord",
    title: "Why Discord is switching from Go to Rust",
    url: "https://discord.com/blog/why-discord-is-switching-from-go-to-rust",
    authors: ["Jesse Howarth"],
    published: "2020-02",
    format: "post",
    summary: md`
      Discord's Read States service, a large in-memory LRU cache of which messages each user has read, had latency spikes every two minutes from Go's garbage collector scanning the whole cache. Rewriting it in Rust removed the spikes and allowed a much larger cache.
    `,
    takeaways: [
      "Large in-memory caches can turn garbage collection into a tail-latency problem.",
      "Measure tail latency over time, not just averages: periodic spikes hide in means.",
    ],
    investigationIds: [],
    conceptIds: ["caching"],
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
    summary: md`
      Networks fail in ways that leave a client unsure whether its request happened. Stripe's answer: clients send an idempotency key with every mutating request and retry with exponential backoff and jitter; the server guarantees the operation happens at most once per key.
    `,
    takeaways: [
      "A timeout does not tell you whether the request succeeded.",
      "An idempotency key makes retrying safe; the server remembers the result per key.",
      "Back off exponentially and add jitter so retries do not arrive as a thundering herd.",
    ],
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
    summary: md`
      Written on the author's own site while he was at Stripe: a full implementation of idempotency keys in Postgres, with the request split into atomic phases separated by recovery points, so a retried request resumes where the last attempt stopped, including around calls to foreign services.
    `,
    takeaways: [
      "Split a request into atomic phases, each committed with a recovery point.",
      "Calls to external services sit between phases and must themselves be idempotent.",
      "Lock the key while a request is in flight so concurrent retries cannot both run.",
    ],
    investigationIds: ["payment-workflow"],
    conceptIds: ["idempotency", "transactions", "state-machines"],
  },
  {
    id: "stripe-rate-limiters",
    companyId: "stripe",
    title: "Scaling your API with rate limiters",
    url: "https://stripe.com/blog/rate-limiters",
    authors: ["Paul Tarjan"],
    published: "2017-03",
    format: "post",
    summary: md`
      Stripe runs four kinds of limiter: a per-user request rate limiter (token buckets in Redis), a concurrent-requests limiter, and two load shedders that reserve capacity for critical traffic when the fleet or the workers are overloaded.
    `,
    takeaways: [
      "Rate limits protect fairness per user; load shedders protect the system as a whole.",
      "Reserve capacity for critical requests and shed the rest first.",
      "Dark-launch limiters, fail open on limiter errors, and keep a kill switch.",
    ],
    investigationIds: ["api-rate-limiter"],
    conceptIds: ["rate-limiting", "load-shedding", "backpressure"],
  },
  {
    id: "stripe-online-migrations",
    companyId: "stripe",
    title: "Online migrations at scale",
    url: "https://stripe.com/blog/online-migrations",
    authors: ["Jacqueline Xu"],
    published: "2017-02",
    format: "post",
    summary: md`
      How Stripe moved subscriptions out of customer records into their own table, for hundreds of millions of objects, with no downtime: dual-write, backfill with offline processing, compare old and new reads with GitHub's Scientist library, switch reads, switch writes, then remove the old data.
    `,
    takeaways: [
      "Dual-write, backfill, verify, switch reads, switch writes, clean up, in that order.",
      "Compare old and new code paths in production before trusting the new one.",
      "Change a few hundred lines at a time; keep every step reversible.",
    ],
    investigationIds: ["shard-live-database"],
    conceptIds: ["online-migrations", "reconciliation"],
  },
  {
    id: "stripe-payments-apis",
    companyId: "stripe",
    title: "Stripe's payments APIs: the first ten years",
    url: "https://stripe.dev/blog/payment-api-design",
    authors: ["Michelle Bu"],
    published: "2020-12",
    format: "post",
    summary: md`
      Stripe's original Charges API assumed a card payment succeeds or fails immediately. Asynchronous payment methods broke that assumption, and the redesign, PaymentIntents, models every payment as one explicit state machine.
    `,
    takeaways: [
      "Model payments as a state machine; asynchronous methods make 'pending' a real state.",
      "Two state machines that must agree (client and server) are a source of bugs.",
      "Layer a new API over the old one so customers can migrate gradually.",
    ],
    investigationIds: ["payment-workflow"],
    conceptIds: ["state-machines", "webhooks", "asynchronous-processing"],
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
    summary: md`
      Figma rejected operational transforms as too complex, and used a central server per document with CRDT-inspired, last-writer-wins updates per property. Ordering children uses fractional indexing, so inserting between two objects never renumbers the rest.
    `,
    takeaways: [
      "A central authority lets you drop much of the machinery decentralized CRDTs need.",
      "Last-writer-wins per property makes most concurrent edits not conflict at all.",
      "Fractional indexes give a stable order that supports insertion anywhere.",
    ],
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
    summary: md`
      Figma's multiplayer servers used to checkpoint whole files about every minute, so a crash could lose up to a minute of edits. A write-ahead journal in DynamoDB now records changes about every half second, and a lock stops two servers writing the same file's history.
    `,
    takeaways: [
      "Acknowledged edits need a durable log, not just periodic snapshots.",
      "Journal small increments frequently; checkpoint whole state less often.",
      "Ensure only one writer owns a document's history at a time.",
    ],
    investigationIds: ["realtime-collaboration"],
    conceptIds: ["durability", "event-log", "leases-and-fencing"],
  },
  {
    id: "figma-livegraph",
    companyId: "figma",
    title: "LiveGraph: real-time data fetching at Figma",
    url: "https://www.figma.com/blog/livegraph-real-time-data-fetching-at-figma/",
    authors: ["Rudi Chen", "Slava Kim"],
    published: "2021-10",
    format: "post",
    summary: md`
      LiveGraph keeps Figma's UI up to date without polling: it tails the Postgres replication stream, distributed through Kafka, and pushes changes to clients subscribed to queries those changes affect.
    `,
    takeaways: [
      "Tail the database's replication log to learn about changes, instead of polling.",
      "Index active subscriptions by the objects they depend on to route changes cheaply.",
    ],
    investigationIds: [],
    conceptIds: ["event-log", "publish-subscribe", "server-push"],
  },
  {
    id: "figma-database-sharding",
    companyId: "figma",
    title: "How Figma's databases team lived to tell the scale",
    url: "https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/",
    authors: ["Sammy Steele"],
    published: "2024-03",
    format: "post",
    summary: md`
      After its databases grew nearly 100× in four years, Figma first split tables into separate databases, then sharded Postgres horizontally. Tables sharded by the same key are grouped into "colos", a query proxy routes and scatter-gathers SQL, and logical sharding was rolled out before any data moved physically.
    `,
    takeaways: [
      "Shard tables that are queried together by the same key so joins stay local.",
      "Separate logical sharding (routing) from physical sharding (moving data) to de-risk each.",
      "They chose sharding Postgres over adopting a distributed database to limit risk under time pressure.",
    ],
    investigationIds: ["shard-live-database"],
    conceptIds: ["partitioning", "online-migrations"],
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
    summary: md`
      How Twitter served about 300,000 home-timeline reads a second: posts fanned out at write time into per-user timelines in Redis, capped at 800 entries and replicated three times; no fan-out for users inactive for 30 days; and celebrity posts that strained fan-out, with a plan to merge them at read time.
    `,
    takeaways: [
      "With reads far outnumbering writes, precompute timelines at write time.",
      "Store IDs in timelines, not content.",
      "Merge posts from very large accounts at read time instead of fanning them out.",
      "Timelines are derived data: skip inactive users and rebuild on demand.",
    ],
    investigationIds: ["news-feed"],
    conceptIds: ["fan-out", "caching", "soft-state"],
  },
  {
    id: "twitter-snowflake",
    companyId: "twitter",
    title: "Snowflake: a network service for generating unique ID numbers",
    url: "https://github.com/twitter-archive/snowflake/tree/snowflake-2010",
    authors: ["Twitter engineering"],
    published: "2010",
    format: "code",
    summary: md`
      When Twitter moved off MySQL auto-increment IDs, it needed unique IDs without coordination that still sorted roughly by time. Snowflake packs a millisecond timestamp, a worker number and a sequence into 64 bits.
    `,
    takeaways: [
      "Put time in the high bits and IDs sort by creation time.",
      "Give each generator its own worker number and no coordination is needed.",
      "Clock skew between generators bounds how well IDs order across machines.",
    ],
    investigationIds: ["chat-message-store", "news-feed", "url-shortener"],
    conceptIds: ["id-generation"],
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
    summary: md`
      How Facebook ran memcached as a look-aside cache serving billions of requests a second, from one cluster to many regions: leases against stale sets and thundering herds, a gutter pool for failed servers, invalidations from the MySQL commit log, cold-cluster warmup and remote markers for cross-region consistency.
    `,
    takeaways: [
      "Delete on write; refill on read.",
      "Leases stop stale sets, and rate-limited leases stop thundering herds (17K/s to 1.3K/s).",
      "A small idle gutter pool keeps a dead cache server from overloading the database.",
      "Deliver invalidations from the database's commit log, so they are durable and replayable.",
    ],
    investigationIds: ["distributed-cache"],
    conceptIds: ["caching", "request-coalescing", "leases-and-fencing", "transactional-outbox", "replication"],
  },
  {
    id: "meta-mcrouter",
    companyId: "meta",
    title: "Introducing mcrouter: a memcached protocol router",
    url: "https://engineering.fb.com/2014/09/15/web/introducing-mcrouter-a-memcached-protocol-router-for-scaling-memcached-deployments/",
    authors: ["Hans Fugal", "Anton Likhtarov", "Rajesh Nishtala", "et al."],
    published: "2014-09",
    format: "post",
    summary: md`
      The router between Facebook's web servers and memcached, handling close to 5 billion requests a second at peak: consistent hashing, prefix routing to separate pools, replicated pools, failover, cold-cache warmup and reliable delete streams.
    `,
    takeaways: [
      "A routing layer centralizes hashing, pooling and failover instead of every client doing it.",
      "Route by key prefix to give workloads separate pools.",
    ],
    investigationIds: ["distributed-cache"],
    conceptIds: ["consistent-hashing", "caching"],
  },
  {
    id: "meta-tao",
    companyId: "meta",
    title: "TAO: The power of the graph",
    url: "https://engineering.fb.com/2013/06/25/core-infra/tao-the-power-of-the-graph/",
    authors: ["Mark Marchukov"],
    published: "2013-06",
    format: "post",
    summary: md`
      TAO replaced much of the look-aside memcache usage with a write-through cache that understands Facebook's data as objects and associations, serving over a billion reads a second with leader and follower cache tiers in front of MySQL.
    `,
    takeaways: [
      "A cache that understands the data model can update itself on writes instead of deleting.",
      "Favour availability over strict consistency when reads dominate.",
    ],
    investigationIds: ["distributed-cache"],
    conceptIds: ["caching", "replication"],
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
    summary: md`
      With vacuum stalling and transaction ID wraparound approaching, Notion sharded its Postgres monolith by workspace into 480 logical shards on 32 hosts. Writes were captured in an audit log, history backfilled in about three days, results verified with dark reads, and the switch made in five minutes of maintenance.
    `,
    takeaways: [
      "Shard by the key almost every query is scoped to (the workspace).",
      "Many logical shards per host let you add hosts later without re-sharding rows.",
      "Capture writes before backfilling, verify with sampling and dark reads, then switch.",
      "Their regret: sharding earlier, while the data was smaller.",
    ],
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
    summary: md`
      Two years later, Notion tripled its shard hosts from 32 to 96 by moving whole logical shards with Postgres logical replication, verifying with dark reads, and cutting over each host with a pause of about a second at PgBouncer.
    `,
    takeaways: [
      "Fixed logical shards turn growth into moving schemas, not re-hashing rows.",
      "Build indexes after the initial sync (it cut syncing from 3 days to 12 hours).",
      "More hosts means more connections; shard the connection poolers too.",
    ],
    investigationIds: ["shard-live-database"],
    conceptIds: ["partitioning", "replication", "online-migrations"],
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
    summary: md`
      A slow database filled Slack's Redis-based job queue until it could neither enqueue nor dequeue. The fix put Kafka in front of Redis, with a stateless gateway for enqueues and a relay that feeds Redis at a controlled rate, rolled out with double writes, shadow mode and heartbeat jobs.
    `,
    takeaways: [
      "Keep the backlog on disk; keep memory for the working set.",
      "Make sure a full buffer can still drain.",
      "Roll out a new critical path in shadow mode on real traffic before depending on it.",
    ],
    investigationIds: ["job-queue"],
    conceptIds: ["message-queues", "backpressure", "event-log", "online-migrations"],
  },
  {
    id: "slack-real-time-messaging",
    companyId: "slack",
    title: "Real-time Messaging",
    url: "https://slack.engineering/real-time-messaging/",
    authors: ["Sameera Thangudu"],
    published: "2023-04",
    format: "post",
    summary: md`
      How a Slack message reaches every connected client within about 500 ms: channel servers own channels by consistent hashing, gateway servers hold WebSocket connections in each region, and events fan out from channel servers to the gateways with subscribers.
    `,
    takeaways: [
      "Assign each channel one owning server with consistent hashing.",
      "Separate connection-holding servers from servers that own channel state.",
      "Transient events (typing) take the same path but are never stored.",
    ],
    investigationIds: ["notification-system"],
    conceptIds: ["consistent-hashing", "persistent-connections", "publish-subscribe", "server-push"],
  },
  {
    id: "slack-flannel",
    companyId: "slack",
    title: "Flannel: An Application-Level Edge Cache to Make Slack Scale",
    url: "https://slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale/",
    authors: ["Bing Wei"],
    published: "2017-05",
    format: "post",
    summary: md`
      For teams with tens of thousands of users, loading the whole team at connect time was too slow and caused reconnection storms. Flannel caches team data at the edge, kept fresh by real-time events, and clients load users and channels lazily.
    `,
    takeaways: [
      "Don't send the whole world at connect time; load lazily.",
      "An edge cache kept fresh by an event stream avoids both polling and stale data.",
      "Reconnect storms are a capacity problem to design for.",
    ],
    investigationIds: [],
    conceptIds: ["caching", "persistent-connections", "publish-subscribe"],
  },

  // Uber
  {
    id: "uber-h3",
    companyId: "uber",
    title: "H3: Uber's Hexagonal Hierarchical Spatial Index",
    url: "https://www.uber.com/blog/h3/",
    authors: ["Isaac Brodsky"],
    published: "2018-06",
    format: "post",
    summary: md`
      Uber buckets the world into hexagonal cells at sixteen resolutions to measure supply and demand, set prices and make dispatch decisions. Hexagons have one distance between neighbours, which makes analysing movement across cells simpler than with squares.
    `,
    takeaways: [
      "Partition space into cells so 'nearby' becomes a lookup of neighbouring keys.",
      "Hierarchical cells let you trade precision for coverage.",
    ],
    investigationIds: [],
    conceptIds: ["partitioning"],
  },
  {
    id: "uber-push-platform",
    companyId: "uber",
    title: "Uber's Real-Time Push Platform",
    url: "https://www.uber.com/blog/real-time-push-platform/",
    authors: ["Madan Thangavelu", "Anirudh Raja", "Nilesh Mahajan", "Uday Kiran Medisetty"],
    published: "2020-12",
    format: "post",
    summary: md`
      Polling once made up most of Uber's API traffic. RAMEN replaced it with server push: first server-sent events with sequence numbers so clients resume after reconnecting, later gRPC streams with acknowledgements, at 1.5 million concurrent connections.
    `,
    takeaways: [
      "Moving from polling to push removes most wasted requests.",
      "Sequence numbers let a reconnecting client resume without losing messages.",
      "Acknowledgements tell the server what actually arrived.",
    ],
    investigationIds: ["notification-system"],
    conceptIds: ["server-push", "persistent-connections", "ordering", "delivery-guarantees"],
  },

  // Netflix
  {
    id: "netflix-video-pipeline",
    companyId: "netflix",
    title: "Rebuilding Netflix Video Processing Pipeline with Microservices",
    url: "https://netflixtechblog.com/rebuilding-netflix-video-processing-pipeline-with-microservices-4e5e6310e359",
    authors: ["Netflix Technology Blog"],
    published: "2024-01",
    format: "post",
    summary: md`
      Netflix moved video encoding from a monolithic pipeline to services on its Cosmos platform, which combines an API layer, a workflow layer and serverless compute connected by priority queues. Encoding is split into chunks processed in parallel.
    `,
    takeaways: [
      "Split long media jobs into chunks so they run in parallel and fail independently.",
      "Separate request handling, workflow orchestration and compute.",
      "Connect stages with queues that understand priority.",
    ],
    investigationIds: ["video-processing-pipeline"],
    conceptIds: ["asynchronous-processing", "message-queues", "object-storage"],
  },

  // Airbnb
  {
    id: "airbnb-double-payments",
    companyId: "airbnb",
    title: "Avoiding Double Payments in a Distributed Payments System",
    url: "https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb",
    authors: ["Jon Chew", "Ninad Khisti"],
    published: "2019-04",
    format: "post",
    summary: md`
      Airbnb's idempotency library splits every payments request into pre-RPC, RPC and post-RPC phases: database work never happens during the network call, and network calls never happen inside database work. Errors are classified as retryable or not, and idempotency records are read from the primary.
    `,
    takeaways: [
      "Never mix network calls with database transactions.",
      "Classify every error as retryable or not, explicitly.",
      "Read idempotency state from the primary, never a lagging replica.",
    ],
    investigationIds: ["payment-workflow"],
    conceptIds: ["idempotency", "transactions", "timeouts", "retries-and-backoff"],
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
    summary: md`
      Cloudflare approximates a sliding window from two fixed-window counters, counted in memcache within each data centre, and caches the decision to block locally. Across 400 million requests, 0.003% were wrongly allowed or limited.
    `,
    takeaways: [
      "A weighted sum of the previous and current window approximates a sliding window cheaply.",
      "Count locally per data centre instead of globally.",
      "Once a client is blocked, cache that decision instead of counting every request.",
    ],
    investigationIds: ["api-rate-limiter"],
    conceptIds: ["rate-limiting", "caching"],
  },

  // Shopify
  {
    id: "shopify-pods",
    companyId: "shopify",
    title: "A Pods Architecture to Allow Shopify to Scale",
    url: "https://shopify.engineering/a-pods-architecture-to-allow-shopify-to-scale",
    authors: ["Xavier Denis"],
    published: "2018-03",
    format: "post",
    summary: md`
      Shopify groups shops into pods, each with its own MySQL, Redis and memcached, so a failing shard takes down only its pod. A routing layer sends each request to its shop's pod, and a pod mover relocates pods between data centres in about a minute.
    `,
    takeaways: [
      "Shard every datastore a request touches, not just the database, to contain failures.",
      "Route requests to their shard at the edge.",
    ],
    investigationIds: ["shard-live-database"],
    conceptIds: ["partitioning"],
  },

  // GitHub
  {
    id: "github-gh-ost",
    companyId: "github",
    title: "gh-ost: GitHub's online schema migration tool for MySQL",
    url: "https://github.blog/news-insights/company-news/gh-ost-github-s-online-migration-tool-for-mysql/",
    authors: ["Shlomi Noach"],
    published: "2016-08",
    format: "post",
    summary: md`
      Trigger-based schema migration tools caused lock contention on GitHub's busiest tables. gh-ost copies rows into a shadow table and applies ongoing changes by tailing the binary log instead, so a migration can be paused, throttled and tested on a replica before the final table swap.
    `,
    takeaways: [
      "Capture changes from the replication log rather than with triggers on the hot path.",
      "A migration must be pausable and throttled by production load.",
      "Rehearse on a replica before cutting over on the primary.",
    ],
    investigationIds: ["shard-live-database"],
    conceptIds: ["online-migrations", "event-log"],
  },

  // LinkedIn
  {
    id: "linkedin-air-traffic-controller",
    companyId: "linkedin",
    title: "Air Traffic Controller: Member-First Notifications at LinkedIn",
    url: "https://www.linkedin.com/blog/engineering/messaging-notifications/air-traffic-controller-member-first-notifications-at-linkedin",
    authors: ["Changji Shi"],
    published: "2018-03",
    format: "post",
    summary: md`
      Every notification at LinkedIn passes through ATC, a Samza stream processor partitioned by member, which decides the channel, aggregates related notifications, caps volume and picks the delivery time, using state kept locally in RocksDB.
    `,
    takeaways: [
      "Make notification decisions in one place, partitioned by recipient.",
      "Cap volume and aggregate per member; more notifications is not better.",
      "Keep per-member state local to the partition that owns it.",
    ],
    investigationIds: ["notification-system"],
    conceptIds: ["partitioning", "asynchronous-processing"],
  },

  // Dropbox
  {
    id: "dropbox-atf",
    companyId: "dropbox",
    title: "How we designed Dropbox ATF: an async task framework",
    url: "https://dropbox.tech/infrastructure/asynchronous-task-scheduling-at-dropbox",
    authors: ["Arun Sai Krishnan"],
    published: "2020-11",
    format: "post",
    summary: md`
      Dropbox's task framework runs about 9,000 tasks a second for dozens of teams with at-least-once execution, a queue per task type and priority for isolation, and a target of starting 95% of tasks within five seconds of their scheduled time.
    `,
    takeaways: [
      "Give each task type and priority its own queue so they cannot starve each other.",
      "At-least-once execution means every task must be idempotent.",
      "Publish the guarantees (latency, retries) teams can rely on.",
    ],
    investigationIds: ["job-queue"],
    conceptIds: ["message-queues", "delivery-guarantees", "idempotency"],
  },

  // Amazon
  {
    id: "aws-queue-backlogs",
    companyId: "amazon",
    title: "Avoiding insurmountable queue backlogs",
    url: "https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/",
    authors: ["David Yanacek"],
    published: "2019-12",
    format: "post",
    summary: md`
      Queues make systems resilient to short failures, then make recovery slow when a backlog builds. Yanacek covers measuring the age of the oldest message, separate queues per workload, shuffle sharding, dropping work that is too old, and draining without overloading what just recovered.
    `,
    takeaways: [
      "Alarm on the age of the oldest message, not just queue depth.",
      "Isolate workloads into separate queues so one tenant's backlog stays its own.",
      "Drop work nobody needs any more, and drain at a rate downstream can take.",
    ],
    investigationIds: ["job-queue"],
    conceptIds: ["backpressure", "load-shedding", "message-queues"],
  },
  {
    id: "aws-timeouts-retries-backoff",
    companyId: "amazon",
    title: "Timeouts, retries, and backoff with jitter",
    url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/",
    authors: ["Marc Brooker"],
    published: "2019",
    format: "post",
    summary: md`
      How Amazon sets timeouts from observed latency percentiles, why retries should happen at one layer rather than every layer, how to cap retries with a token bucket, and why backoff needs jitter.
    `,
    takeaways: [
      "Set timeouts from measured latency, at a percentile you choose deliberately.",
      "Retry at one layer; retries at every layer multiply.",
      "Limit retries so they cannot amplify an outage, and add jitter.",
    ],
    investigationIds: ["notification-system", "payment-workflow"],
    conceptIds: ["timeouts", "retries-and-backoff"],
  },
  {
    id: "amazon-dynamo",
    companyId: "amazon",
    title: "Amazon's Dynamo",
    url: "https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html",
    authors: ["Giuseppe DeCandia et al."],
    published: "2007-10",
    format: "paper",
    summary: md`
      The paper behind Amazon's highly available key-value store for the shopping cart: consistent hashing with virtual nodes, replication with sloppy quorums, vector clocks for conflicting versions, and anti-entropy repair. Published on Werner Vogels' blog with the full text.
    `,
    takeaways: [
      "Consistent hashing with virtual nodes spreads keys and failures evenly.",
      "Choose availability for writes and resolve conflicts on read when the business allows it.",
      "Background repair keeps replicas converging.",
    ],
    investigationIds: [],
    conceptIds: ["consistent-hashing", "replication", "conflict-resolution", "partitioning"],
  },

  // Linear
  {
    id: "linear-sync-engine",
    companyId: "linear",
    title: "Scaling the Linear Sync Engine",
    url: "https://linear.app/now/scaling-the-linear-sync-engine",
    authors: ["Tuomas Artman"],
    published: "2023-06",
    format: "talk",
    summary: md`
      A talk on Linear's sync engine: the client keeps a local copy of the workspace's data, sends changes to the server as transactions, and receives a stream of changes back. It covers what had to change as the largest workspaces grew.
    `,
    takeaways: [
      "A local copy on the client makes the UI instant and works offline.",
      "Loading everything up front stops scaling for the largest customers; load partially.",
    ],
    investigationIds: ["realtime-collaboration"],
    conceptIds: ["event-log", "conflict-resolution"],
  },
];
