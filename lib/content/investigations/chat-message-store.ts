import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const chatMessageStore = {
  id: "chat-message-store",
  title: "Storing trillions of chat messages",
  searchTitle: "Design Discord's Message Storage",
  premise:
    "Built from what Discord's engineers published about storing billions, then trillions, of messages: choose a partition key that keeps every read small, survive a channel full of deletions and a channel everyone opens at once, then move the whole thing to a new database while it is running.",
  difficulty: "advanced",
  estimatedMinutes: 45,
  scenario: md`
    A chat platform organises conversations into servers, and servers into channels. Opening a channel loads its latest 50 messages; scrolling up loads older pages; clicking a reply or a search result jumps straight to one message. Messages can be edited and deleted.

    The platform stores about 120 million messages a day and the number is climbing fast. Reads and writes are roughly equal, and reads are scattered: most servers are small groups of friends, a few are public communities with hundreds of thousands of members. The current database is a single replica set whose data and indexes no longer fit in memory, and read latency has become unpredictable.

    Discord described this exact situation in 2017, and what happened over the five years after it in 2023. This investigation follows the decisions they made and the failures they wrote about.
  `,
  objectives: [
    "Size a storage problem by data volume and access pattern, not just request rate.",
    "Design a partition key that keeps every common read inside one bounded partition.",
    "Predict how a log-structured store behaves under deletes, concurrent edits and compaction.",
    "Protect a database from one channel that everybody reads at once.",
    "Plan a migration of a live, write-heavy dataset with no downtime.",
  ],
  prerequisites: ["partitioning", "id-generation"],
  requirements: {
    functional: [
      "Send a message to a channel.",
      "Load the latest page of messages in a channel, and page backwards through history.",
      "Jump to a specific message by its ID.",
      "Edit and delete messages.",
    ],
    nonFunctional: [
      "Loading a channel is fast whatever the channel's size or age (p99 well under 100 ms).",
      "An acknowledged message is never lost, even if a database node dies.",
      "Capacity grows by adding nodes, without manual resharding.",
      "One busy channel never slows down unrelated channels.",
    ],
  },
  constraints: [
    "About 120 million new messages a day, growing several-fold a year.",
    "Roughly equal reads and writes; reads are spread randomly across millions of channels.",
    "A small infrastructure team: operating the store must not need constant manual work.",
  ],
  assumptions: [
    "A message is about 1 KB including metadata.",
    "Message IDs are 64-bit Snowflakes: a millisecond timestamp, a worker number and a sequence, so they sort by time.",
    "New messages reach online members through a separate WebSocket gateway; this investigation is about storing and reading them.",
  ],
  competencies: [
    { id: "sizing", label: "Sizing the data", description: "Turning message rates into storage growth and working-set size." },
    { id: "data-model", label: "Modelling for the query", description: "Choosing partition and clustering keys from the access pattern." },
    { id: "storage-engine", label: "Knowing the storage engine", description: "How appends, tombstones and compaction shape what is cheap and what is dangerous." },
    { id: "hot-spots", label: "Hot partitions", description: "Keeping one popular key from hurting everything else." },
    { id: "migration", label: "Migrating live data", description: "Moving a large, busy dataset without downtime or loss." },
  ],
  system: {
    components: [
      { id: "members", label: "Members", kind: "client", responsibility: "Send messages, open channels, scroll history.", position: { col: 0, row: 1 } },
      { id: "api", label: "API servers", kind: "service", responsibility: "Validate, assign Snowflake IDs, check permissions, and call the message service.", position: { col: 1, row: 1 } },
      { id: "gateway", label: "Gateway", kind: "service", responsibility: "Holds members' WebSocket connections and pushes new-message events.", position: { col: 1, row: 0 } },
      {
        id: "message-service",
        label: "Message data service",
        kind: "service",
        responsibility: "The only path to the database. Routes each channel to one instance by consistent hashing and coalesces identical concurrent reads.",
        position: { col: 2, row: 1 },
      },
      {
        id: "store",
        label: "Message cluster",
        kind: "database",
        responsibility: "Wide-column, log-structured store. Partition key (channel_id, bucket); rows clustered by message_id, newest first; replication factor 3.",
        durableState: "every message, edit and delete marker",
        position: { col: 3, row: 1 },
      },
    ],
    flows: [
      { id: "requests", from: "members", to: "api", label: "Send, load history, jump", kind: "request" },
      { id: "publish", from: "api", to: "gateway", label: "New message event", kind: "async" },
      { id: "deliver", from: "gateway", to: "members", label: "Push to online members", kind: "push" },
      { id: "route", from: "api", to: "message-service", label: "Query by channel (hash-routed)", kind: "request" },
      { id: "rows", from: "message-service", to: "store", label: "Read and write one partition", kind: "request" },
    ],
    invariants: [
      {
        id: "bounded-reads",
        statement: "Loading a channel reads one bounded partition, however large or old the channel is.",
        enforcedBy: ["store", "message-service"],
        mechanism: "The partition key includes a fixed time bucket derived from the message ID, so partitions stay small; empty buckets are tracked and skipped.",
      },
      {
        id: "hot-channel",
        statement: "A burst of readers on one channel becomes one database query, not thousands.",
        enforcedBy: ["message-service"],
        mechanism: "Consistent hashing sends every request for a channel to the same instance, which merges identical in-flight reads.",
      },
      {
        id: "durable",
        statement: "An acknowledged message survives the loss of a database node.",
        enforcedBy: ["store"],
        mechanism: "Writes go to three replicas and are acknowledged at quorum.",
      },
    ],
  },
  stages: [
    {
      id: "size-it",
      title: "What the numbers say",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["id-generation", "partitioning"],
      competencyIds: ["sizing", "data-model"],
      context: md`
        Use 86,400 seconds in a day. Messages are about 1 KB.
      `,
      lesson: [

        {
          kind: "estimate",
          id: "write-rate",
          prompt: "120 million messages a day. About how many writes a second on average?",
          answer: 1400,
          unit: "per second",
          working: md`
            120,000,000 ÷ 86,400 ≈ **1,400 a second**. Even several times that at peak is within one good database's reach. The write rate isn't the problem.
          `,
        },
        {
          kind: "estimate",
          id: "yearly-data",
          prompt: "At about 1 KB per message, how many terabytes a year (before replication)?",
          answer: 44,
          unit: "TB",
          working: md`
            120 GB a day × 365 ≈ **44 TB a year**, and growing several-fold a year. What outgrows one machine is the data.
          `,
        },
        {
          kind: "read",
          body: md`
            When data and indexes fit in memory, a random read is a memory lookup. When they don't, it becomes a **disk seek**, and latency becomes unpredictable. The usual fix is to store what one query needs **physically together**, so it takes one seek and a short sequential read instead of fifty random ones.
          `,
        },
        {
          kind: "read",
          body: md`
            A **Snowflake ID** is 64 bits: a millisecond timestamp in the high bits, then a worker number and a per-worker sequence. Any server can generate one without coordinating, and sorting IDs sorts messages by creation time. See [[id-generation]].

            So "the latest 50 messages in a channel" is "the 50 largest IDs in that channel".
          `,
        },
        {
          kind: "choice",
          id: "central-sequence",
          prompt: "Do time-ordered IDs require one central counter?",
          options: [
            {
              id: "no",
              label: "No: putting the timestamp in the high bits makes independently generated IDs sort by time.",
              correct: true,
              why: "Each worker's number and sequence keep IDs unique; the timestamp makes them sortable. No coordination needed.",
            },
            {
              id: "yes",
              label: "Yes, otherwise two servers' IDs can't be compared.",
              why: "They can: the timestamp bits dominate the comparison.",
            },
            {
              id: "clocks",
              label: "Yes, because server clocks differ.",
              why: "Clock differences make ordering approximate across servers (to a few milliseconds), which is fine for chat.",
            },
          ],
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements follow from the scenario?",
        claims: [
          {
            id: "write-rate",
            statement: "120 million messages a day is roughly 1,400 writes a second on average.",
            verdict: "holds",
            explanation: "120,000,000 / 86,400 ≈ 1,390. Peaks are several times that, which a single good database could still absorb. The write rate is not the problem.",
          },
          {
            id: "data-not-rate",
            statement: "What outgrows one machine is the data, not the request rate.",
            verdict: "holds",
            explanation:
              "At ~1 KB a message that is ~120 GB a day, over 40 TB a year before replication, and growing. Once data and indexes stop fitting in memory, random reads go to disk and latency becomes unpredictable, which is exactly the symptom in the scenario.",
          },
          {
            id: "cache-solves",
            statement: "Because reads are about half the traffic, a cache of recent messages will take most read load off the database.",
            verdict: "depends",
            explanation:
              "It helps for the latest page of busy channels. But reads are scattered across millions of small channels, history pages, jumps to old messages and mentions, so much of the read traffic is a long tail a cache will mostly miss. The store itself must serve random reads well.",
          },
          {
            id: "together",
            statement: "The dominant query is 'latest messages in channel X', so a channel's messages should be stored together, in time order.",
            verdict: "holds",
            explanation: "If a page of messages is physically contiguous, loading it is one seek and a short sequential read rather than fifty random lookups.",
          },
          {
            id: "central-sequence",
            statement: "To sort messages by time, IDs must come from one central sequence.",
            verdict: "fails",
            explanation:
              "Snowflake IDs put a millisecond timestamp in the high bits, then a worker number and a per-worker sequence. Any server generates them without coordination, and they sort by creation time to the millisecond. See [[id-generation]].",
          },
        ],
      },
      reveal: {
        takeaways: [
          "The write rate is modest; what outgrows one machine is the ever-growing data.",
          "Store a channel's messages together in time order so the latest page is one contiguous read.",
          "Snowflake IDs sort by time without central coordination.",
        ],
        reasoning: md`
          Chat storage is a **data-shape** problem. The write rate is modest; the dataset is huge, ever-growing and read at random. The design has to make the common read (a channel's latest page) touch a small, contiguous piece of data, whatever the total size.

          Time-sortable IDs are what make that possible: if the ID *is* the time, "the latest 50" is just "the 50 largest IDs in this channel".
        `,
      },
    },
    {
      id: "choose-the-store",
      title: "Choose the store",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["lsm-trees", "partitioning", "replication"],
      competencyIds: ["storage-engine", "sizing"],
      context: md`
        The requirements ask for growth by adding nodes, survival of node loss, and a team too small for constant manual operations.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A **log-structured** (LSM) store turns every write into an append: new data goes to memory, then is flushed to immutable sorted files on disk, which are periodically merged (**compaction**). Writes are cheap; reads may consult several files. See [[lsm-trees]].
          `,
        },
        {
          kind: "read",
          body: md`
            A **wide-column** store like Cassandra or ScyllaDB has two keys per table:

            - The **partition key** decides which nodes hold a row, and which rows are stored together.
            - The **clustering key** orders rows **within** a partition.

            Capacity grows by adding nodes; each partition is replicated (typically 3 copies) automatically. See [[partitioning]].
          `,
        },
        {
          kind: "choice",
          id: "doc-per-channel",
          prompt: "Why not one document per channel holding an array of its messages?",
          options: [
            {
              id: "unbounded",
              label: "Documents grow without bound, every send rewrites a growing document, and size limits cap history.",
              correct: true,
              why: "The busiest channels become the slowest writes, and a 16 MB document limit eventually caps a channel's history.",
            },
            {
              id: "slow-read",
              label: "Reading one document is slow.",
              why: "Reading one document is fast. Writing to an ever-growing one isn't.",
            },
            {
              id: "fine",
              label: "It's fine; document stores are built for this.",
              why: "Not for unbounded arrays that grow with every message.",
            },
          ],
        },
        {
          kind: "predict",
          id: "costs",
          prompt: "What do you give up with a wide-column LSM store compared with Postgres?",
          answer: md`
            Flexible queries (you query by key, not arbitrary filters or joins), strong consistency by default, and cheap deletes: a delete is a **tombstone** that reads must skip until compaction removes it. You also take on compaction and repair as ongoing operational work.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "Which store should hold the messages?",
        options: [
          {
            id: "postgres",
            label: "Postgres, with an index on (channel_id, message_id), partitioned and sharded by hand as it grows",
            assessment: "defensible",
            feedback:
              "It will work for a long time, and SQL is flexible. But at this growth rate you will be sharding by hand repeatedly, moving data between shards and managing failover yourself, which is what the 'add nodes, no manual resharding' requirement rules out for this team.",
          },
          {
            id: "wide-column",
            label: "A wide-column, log-structured store (Cassandra-style) partitioned by channel and clustered by message ID",
            assessment: "sound",
            feedback:
              "Capacity grows by adding nodes; replication and failover are built in; writes are appends, which suits a write-heavy log of messages; and a partition's rows are stored together in clustering order, so a page of a channel is one contiguous read. The costs are a narrow query model, eventual consistency and real operational work (compaction, repair). This is what Discord chose in 2017.",
          },
          {
            id: "document-per-channel",
            label: "A document store with one document per channel holding an array of its messages",
            assessment: "flawed",
            feedback:
              "Documents grow without bound, every send rewrites or locks a growing document, and document size limits (16 MB in MongoDB) cap a channel's history. It turns the busiest channels into the slowest writes.",
          },
          {
            id: "redis-primary",
            label: "Redis as the primary store, with periodic snapshots to disk",
            assessment: "flawed",
            feedback:
              "Tens of terabytes a year in RAM is very expensive, and snapshot persistence loses every message acknowledged since the last snapshot when a node dies, which violates the durability requirement.",
          },
        ],
        rationale: {
          prompt: "What does the access pattern need from the storage engine, and what are you giving up?",
          rubric: [
            { id: "contiguous", text: "A channel's messages must be stored together in time order so the latest page is one contiguous read." },
            { id: "scale-out", text: "Growth by adding nodes with built-in replication matches the requirement and the team size." },
            { id: "costs", text: "Names the costs: limited queries, eventual consistency, compaction and repair to operate." },
            { id: "writes", text: "Notes that log-structured writes suit a write-heavy, append-mostly workload.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Append-mostly data read by contiguous key ranges suits a wide-column LSM store.",
          "Growth by adding nodes, with built-in replication, matches a small team and fast growth.",
          "LSM costs: reads touch several files, deletes are tombstones, compaction competes with traffic.",
        ],
        reasoning: md`
          The choice follows from three facts: the data is append-mostly, the main query reads a contiguous slice of one channel, and the team wants growth to be "add a node". A wide-column store built on [[lsm-trees]] fits all three.

          It is not free. Reads cost more than writes in an LSM engine, deletes become tombstones, and compaction competes with traffic. Those costs are where the later failures in this investigation come from.
        `,
        otherwise:
          "A team with deep Postgres expertise and a slower growth curve could reasonably shard Postgres by channel and accept the manual work; several large chat products do.",
      },
    },
    {
      id: "partition-key",
      title: "Choose the partition key",
      phase: "decide",
      dimensions: ["defend", "change"],
      conceptIds: ["partitioning", "id-generation", "lsm-trees"],
      competencyIds: ["data-model"],
      context: md`
        In this store, the partition key decides which nodes hold a row and which rows are stored together. The clustering key orders rows inside a partition. Some channels will receive millions of messages over their lifetime; most receive a few hundred.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Partitions must stay **bounded**. A partition that grows forever (many gigabytes) makes compaction, repair and replacing a node slow and memory-hungry, and reads of it get slower.

            The natural key here, the channel, is unbounded: a busy channel gets messages for years.
          `,
        },
        {
          kind: "read",
          body: md`
            **Bucketing** bounds it: add a time window to the partition key, say 10 days. Partition = (channel, bucket), where the bucket is computed from the message's timestamp. Each partition holds at most 10 days of one channel.

            Because the bucket comes from the Snowflake ID's timestamp, any message's partition can be computed from its ID alone.
          `,
        },
        {
          kind: "estimate",
          id: "bucket-size",
          prompt: "A very busy channel gets 10,000 messages a day at 1 KB each. About how many megabytes in one 10-day bucket?",
          answer: 100,
          unit: "MB",
          working: md`
            10,000 × 10 days × 1 KB = **100 MB**, which is Discord's target ceiling. Without buckets, after 5 years the same channel's partition would be about 18 GB.
          `,
        },
        {
          kind: "choice",
          id: "by-message",
          prompt: "Why not partition by message_id so writes spread perfectly evenly?",
          options: [
            {
              id: "scatter",
              label: "The latest 50 messages of a channel would be on up to 50 different partitions: every page becomes a scatter-gather.",
              correct: true,
              why: "Even spreading helps writes, but the dominant read needs a channel's messages together.",
            },
            {
              id: "hot",
              label: "It creates hot partitions.",
              why: "It's the opposite: perfectly even, and that's the trouble for reads.",
            },
            {
              id: "fine",
              label: "It's the best choice.",
              why: "Not for this read pattern.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What should the primary key of the messages table be?",
        options: [
          {
            id: "channel",
            label: "Partition by channel_id; cluster by message_id descending",
            assessment: "flawed",
            feedback:
              "Every page of a channel is one partition, which is good, but a busy channel's partition grows forever. Partitions of many gigabytes make compaction, repair and node replacement slow and memory-hungry, and reads of a huge partition get slower over the years. It fails the 'whatever the channel's age' requirement.",
          },
          {
            id: "channel-bucket",
            label: "Partition by (channel_id, bucket), where bucket is a fixed time window (about 10 days) computed from the message ID; cluster by message_id descending",
            assessment: "sound",
            feedback:
              "A partition holds at most ten days of one channel, so even the busiest stays bounded (Discord aimed for under 100 MB). The latest page is a read of the current bucket; scrolling back walks to earlier buckets; jumping to a message computes its bucket from its ID. This is the schema Discord described.",
          },
          {
            id: "message",
            label: "Partition by message_id, so writes spread perfectly evenly",
            assessment: "flawed",
            feedback:
              "Writes spread well, but 'the latest 50 messages in a channel' now touches up to 50 partitions on different nodes. The common read becomes a scatter-gather.",
          },
          {
            id: "server",
            label: "Partition by server (guild) id; cluster by channel_id, message_id",
            assessment: "flawed",
            feedback:
              "The largest communities become enormous partitions holding every channel's history, and their traffic all lands on the same three replicas.",
          },
        ],
        rationale: {
          prompt: "Explain what your key keeps together, what it keeps bounded, and how a history page is read.",
          rubric: [
            { id: "together", text: "A channel's messages for a time range are in one partition, ordered by message ID." },
            { id: "bounded", text: "Partitions are bounded in size regardless of how busy or old a channel is." },
            { id: "derive", text: "The bucket is computed from the Snowflake ID's timestamp, so any message's partition is known from its ID." },
            { id: "paging", text: "Paging back means reading earlier buckets, possibly several if a channel is quiet.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Keep a page's rows together and every partition bounded.",
          "Bucket an unbounded key by time: partition by (channel, bucket), cluster by message ID.",
          "Quiet channels may need to walk back through several buckets to fill a page.",
        ],
        reasoning: md`
          \`PRIMARY KEY ((channel_id, bucket), message_id)\` does two jobs: it keeps the rows a page needs **together**, and it keeps every partition **bounded**. Bucketing by time is the standard way to stop a partition growing forever when the natural key (the channel) is unbounded.

          The cost shows up for quiet channels: their latest 50 messages may be spread over many buckets, and a read walks backwards through them. Hold that thought for the next stage.
        `,
        tradeoffs: [
          { choice: "Bucket of ~10 days", gains: "Bounded partitions; the latest page is usually one read.", costs: "Quiet channels need several bucket reads to fill a page." },
          { choice: "Cluster by message_id descending", gains: "The newest messages are first on disk.", costs: "Queries must be by channel and bucket; no ad-hoc filtering." },
        ],
      },
      reveals: { components: ["store"], flows: ["rows"] },
    },
    {
      id: "deleted-channel",
      title: "The channel that froze the cluster",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["lsm-trees"],
      competencyIds: ["storage-engine"],
      event: {
        kind: "failure",
        title: "Opening one channel stalls three database nodes",
        detail:
          "A large public server cleaned up its announcements channel with a bot, deleting millions of messages and leaving one. Whenever anyone opens that channel, three nodes pause for around ten seconds and cluster-wide latency spikes.",
      },
      context: md`
        Here is what the message service and the store logged when one member opened the channel. Find the lines that explain the stall.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            In an LSM store, a **delete is a write**: a tombstone marking the row as deleted. Older copies of the row may sit in files that haven't been compacted yet, so the tombstone must be kept, and read past, until compaction removes both.

            Tombstones are kept for a grace period (\`gc_grace_seconds\`) so replicas that missed the delete can learn of it through **repair**.
          `,
        },
        {
          kind: "predict",
          id: "empty-read",
          prompt: "A channel had 2 million messages; a bot deleted all but one. A read asks for the latest 50 messages. How much work is it?",
          answer: md`
            Huge. The read has to scan past every tombstone in each bucket before concluding the bucket has nothing live, then move to the previous bucket and do it again. Reading "nothing" costs millions of steps, on every replica that serves the read.
          `,
        },
        {
          kind: "choice",
          id: "nulls",
          prompt: "A writer inserts every column, writing explicit NULL for the 12 columns a message doesn't use. What does that do in this store?",
          options: [
            {
              id: "tombstones",
              label: "Creates a tombstone for each null column: a dozen useless tombstones per message.",
              correct: true,
              why: "Writing NULL means 'delete this cell'. Write only the columns a message actually has.",
            },
            {
              id: "nothing",
              label: "Nothing; NULLs take no space.",
              why: "In this store, an explicit NULL is a deletion marker.",
            },
            {
              id: "error",
              label: "The insert fails.",
              why: "It succeeds, which is why the cost goes unnoticed.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Three ways to bound the damage: track which buckets are empty so reads skip them; shorten the tombstone grace period (safe if repair runs more often than the period); and stop writing needless nulls.
          `,
        },
      ],
      interaction: {
        kind: "diagnosis",
        prompt: "Select the lines that are part of the problem.",
        artifact: {
          type: "log",
          caption: "Opening #announcements (channel 81723…)",
          lines: [
            { text: "schema: messages has 16 columns; the average message sets 4 of them" },
            {
              text: "writer: INSERT INTO messages (…all 16 columns…) VALUES (…, null, null, null, …)",
              fault: "Writing explicit nulls creates a tombstone for every null column. Most messages carried a dozen tombstones they never needed. Write only the columns that have values.",
            },
            {
              text: "config: gc_grace_seconds = 864000   # tombstones kept 10 days before compaction may drop them",
              fault:
                "Ten days of tombstones from millions of deletes are still on disk. Discord shortened this to two days, which is safe because repair runs nightly and every replica sees deletes well within that window.",
            },
            { text: "10:03:15 GET /channels/81723/messages?limit=50" },
            {
              text: "10:03:15 read (81723, bucket 1871): live rows 0, tombstones scanned 211,903",
              fault: "Reading a partition of deleted rows means scanning every tombstone in it before concluding it is empty. The work is proportional to what was deleted, not to what is returned.",
            },
            {
              text: "10:03:16 read (81723, bucket 1870): live rows 0, tombstones scanned 198,277 … (continues back through 140 buckets)",
              fault: "The reader walks backwards bucket by bucket looking for 50 live messages, through every empty bucket. Tracking which buckets are empty lets reads skip them.",
            },
            { text: "10:03:24 node-17: JVM GC pause 9,870 ms" },
            { text: "10:03:24 node-09, node-23: JVM GC pause 9,410 ms, 10,120 ms" },
            { text: "10:03:25 cluster p99 read latency 4,200 ms" },
          ],
        },
        rationale: {
          prompt: "Explain why reading one channel stalled the nodes, and what you would change.",
          rubric: [
            { id: "tombstones", text: "Deletes are tombstones that reads must scan until compaction removes them." },
            { id: "walk", text: "The read walks through many empty buckets; tracking and skipping empty buckets bounds it." },
            { id: "grace", text: "Shortening tombstone lifetime (safe given regular repair) reduces how many are kept." },
            { id: "nulls", text: "Writing nulls creates needless tombstones; write only present columns.", weight: "supporting" },
            { id: "replicas", text: "All replicas of the partition do the same work, so the stall spreads to three nodes.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "In an LSM store a delete is a tombstone, and reads must scan past tombstones until compaction.",
          "Bound the work: skip empty buckets and shorten tombstone lifetime when repair runs regularly.",
          "Write only the columns you have; explicit nulls create tombstones.",
        ],
        reasoning: md`
          This is the incident from Discord's 2017 post. In a log-structured store, **a delete is a write**: a tombstone that must be read past until compaction removes it. A channel with millions of deletions becomes a channel where reading "nothing" costs millions of steps, and those steps allocate enough memory to trigger stop-the-world garbage collection on every replica holding the partition.

          Discord's fixes were all about bounding that work: skip empty buckets, keep tombstones two days instead of ten (nightly repair makes that safe), and stop writing nulls. See [[lsm-trees]].
        `,
      },
    },
    {
      id: "edit-meets-delete",
      title: "The message with no author",
      phase: "break",
      dimensions: ["break", "explain"],
      conceptIds: ["concurrency-control", "conflict-resolution", "lsm-trees"],
      competencyIds: ["storage-engine", "data-model"],
      event: {
        kind: "failure",
        title: "Clients crash rendering a message",
        detail:
          "A few messages come back with an edited body but no author_id, channel metadata or timestamp. Each time, one user edited the message at the same moment another user deleted it.",
      },
      context: md`
        In this store, \`UPDATE\` and \`INSERT\` are both upserts: they write the given columns with a timestamp. Conflicts are resolved per column by last write wins.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            In this store, writes are **blind upserts**: an UPDATE doesn't check whether the row exists; it just writes the given columns with a timestamp. Conflicts are resolved **per column** by **last write wins** (LWW): each cell keeps its newest value. See [[conflict-resolution]].

            A row is a collection of cells, not a single value.
          `,
        },
        {
          kind: "predict",
          id: "half-row",
          prompt: "A delete at time T1 writes a tombstone for the row. An edit at T2 > T1 writes the body and edited_at columns. What does a reader see?",
          answer: md`
            A half-row: body and edited_at (newer than the tombstone, so they win), and every other column deleted. A message with no author, channel or timestamp, which no user ever wrote.
          `,
        },
        {
          kind: "choice",
          id: "fix",
          prompt: "The race is rare. What's the cheaper fix?",
          options: [
            {
              id: "repair",
              label: "Treat a row missing a required column (like author_id) as deleted, and clean it up on read",
              correct: true,
              why: "The invalid state is easy to recognise and rare, so repairing it costs almost nothing.",
            },
            {
              id: "lwt",
              label: "Make every edit a conditional write (IF EXISTS)",
              why: "That works, but costs a consensus round trip on every edit to prevent a rare race. Repair is cheaper here.",
            },
            {
              id: "nothing",
              label: "Nothing; last write wins already handles it",
              why: "Per-column LWW is what produced the half-row.",
            },
          ],
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "update-fails",
            statement: "An UPDATE of a row that was just deleted fails, because the row no longer exists.",
            verdict: "fails",
            explanation: "Writes are blind upserts; there is no read first. The edit writes its columns whether or not a row exists.",
          },
          {
            id: "delete-wins",
            statement: "Because the delete happened, last-write-wins guarantees the message stays deleted.",
            verdict: "fails",
            explanation:
              "Last write wins **per column**. The delete's tombstone covers the row at time T1; the edit writes body and edited_at at T2 > T1, and those newer cells win. The result is a half-row: the edited columns, with everything else deleted.",
          },
          {
            id: "detect",
            statement: "A row missing a required column such as author_id can be treated as a deleted message and cleaned up on read.",
            verdict: "holds",
            explanation: "This was Discord's fix: a message without an author cannot be valid, so readers treat it as deleted and remove it.",
          },
          {
            id: "lwt",
            statement: "Making edits conditional (UPDATE … IF EXISTS) would prevent the half-row, at the cost of a consensus round trip on every edit.",
            verdict: "holds",
            explanation: "A lightweight transaction checks existence atomically, but it costs several round trips. For a rare race, detecting and repairing invalid rows is the cheaper trade.",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Per-column last-write-wins means each cell keeps its newest value, not that the last operation wins.",
          "A racing edit and delete can leave a row nobody wrote.",
          "When a race is rare and its result recognisable, repairing on read beats preventing with consensus.",
        ],
        reasoning: md`
          Eventual consistency with per-column last-write-wins does not mean "the last operation wins". It means **each cell keeps its newest value**, and a row is just a collection of cells. An edit racing a delete leaves a row that no single user ever wrote.

          You can prevent the race with a conditional write ([[concurrency-control]]) or accept it and repair what it produces. When the race is rare and the invalid state is easy to recognise, repair is usually cheaper. See [[conflict-resolution]].
        `,
      },
    },
    {
      id: "hot-channel",
      title: "Everyone opens the same channel",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["request-coalescing", "consistent-hashing", "partitioning"],
      competencyIds: ["hot-spots"],
      event: {
        kind: "scale",
        title: "An @everyone ping in a server with 500,000 members",
        detail:
          "Within seconds, hundreds of thousands of clients load the same channel's latest page. The three replicas holding that partition saturate, queues build on them, and requests for unrelated channels on those nodes slow down too.",
      },
      context: md`
        The cluster has plenty of total capacity. One partition is getting far more reads than three nodes can serve.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A partition lives on its replicas, typically three nodes. Adding nodes adds capacity for **other** partitions; it can't split one partition's load. A burst of reads for one channel lands on the same three nodes however big the cluster is.
          `,
        },
        {
          kind: "read",
          body: md`
            But hundreds of thousands of "latest page of channel X" requests are **the same question**. If they meet in one place, they can be answered by one query. That's **request coalescing**: the first request runs the query; identical requests that arrive while it's running wait for its result. See [[request-coalescing]].

            Requests only meet if they're routed to the same place, which is what consistent hashing on the channel ID does for a fleet of data-service instances.
          `,
        },
        {
          kind: "simulation",
          simulation: "cache-stampede",
          body: md`
            The same arithmetic applies to a burst of identical reads: compare no protection, coalescing per instance, and one query fleet-wide.
          `,
        },
        {
          kind: "choice",
          id: "routing",
          prompt: "Why route each channel's requests to one data-service instance?",
          options: [
            {
              id: "meet",
              label: "So all identical requests for a channel reach the same instance, where they can be coalesced",
              correct: true,
              why: "Spread randomly over 50 instances, each would issue its own query. Routed by channel, one instance sees them all.",
            },
            {
              id: "cache",
              label: "So the instance can cache the channel forever",
              why: "Coalescing shares in-flight queries; it doesn't keep results afterwards.",
            },
            {
              id: "security",
              label: "For permission checks",
              why: "Permissions are checked upstream. Routing is about letting duplicates meet.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What do you change?",
        options: [
          {
            id: "more-nodes",
            label: "Add more nodes to the cluster",
            assessment: "flawed",
            feedback: "The partition still lives on the same three replicas. More nodes add capacity for other keys; they do not split one key's load. See [[partitioning]].",
          },
          {
            id: "data-service",
            label: "Route every request for a channel to one data-service instance (consistent hashing on channel_id) and coalesce identical in-flight reads into one query",
            assessment: "sound",
            feedback:
              "Hundreds of thousands of identical 'latest page of channel X' requests arrive at the same instance, which issues one query and hands the result to every waiter. The database sees a handful of reads instead of a flood. Discord built exactly this layer in Rust in front of its database.",
          },
          {
            id: "redis-page-cache",
            label: "Cache each channel's latest page in Redis with a five-second TTL",
            assessment: "defensible",
            feedback:
              "It absorbs this burst. But every new message, edit and delete in a busy channel invalidates the page, so you are maintaining a second copy under constant churn, and when the entry expires the burst still stampedes the database unless the refill is coalesced.",
          },
          {
            id: "consistency-one",
            label: "Read at consistency ONE from any replica instead of QUORUM",
            assessment: "defensible",
            feedback:
              "It spreads reads over all three replicas instead of two per read, a modest gain. The burst is still far more than three nodes can serve, and you give up read-your-writes for the sender.",
          },
        ],
        rationale: {
          prompt: "Why does your change help with one hot key, when adding capacity does not?",
          rubric: [
            { id: "one-key", text: "A single partition's load cannot be spread by adding nodes; it stays on its replicas." },
            { id: "identical", text: "The burst consists of identical reads, so it can be served by one query." },
            { id: "routing", text: "Routing by channel is what lets one instance see, and merge, all the identical requests." },
            { id: "isolation", text: "Mentions protecting unrelated channels on the same nodes.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "One partition's load stays on its replicas; adding nodes doesn't split it.",
          "A burst of identical reads is one question: coalesce it into one query.",
          "Route by channel (consistent hashing) so identical requests meet where they can be coalesced.",
        ],
        reasoning: md`
          A hot key is a key-level problem, so it needs a key-level fix. The burst is not a thousand different questions; it is one question asked a thousand times. [[request-coalescing]] answers it once.

          Coalescing only works if the duplicates meet, which is why it is paired with [[consistent-hashing]] on the channel ID: every instance sees all the traffic for the channels it owns. Discord's 2023 post credits this data-service layer, together with the database change in the next stage, for keeping the cluster calm through traffic spikes like the 2022 World Cup final.
        `,
      },
    },
    {
      id: "migrate-live",
      title: "Move trillions of messages, live",
      phase: "change",
      dimensions: ["change", "trace"],
      conceptIds: ["online-migrations", "replication"],
      competencyIds: ["migration"],
      event: {
        kind: "requirement-change",
        title: "The cluster has grown to 177 nodes and constant toil",
        detail:
          "Garbage-collection pauses and compaction backlogs need daily manual work. The team decides to move every message to ScyllaDB, which speaks the same protocol but avoids JVM garbage collection, without downtime.",
      },
      context: md`
        Messages keep arriving throughout. The old cluster must stay correct until the very end.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A live migration follows the same shape every time. See [[online-migrations]]:

            1. **Capture new writes** in both places, so the new store never falls further behind.
            2. **Backfill** the past, which has now stopped changing.
            3. **Verify** by comparing reads from both.
            4. **Move reads** to the new store, keeping a way back.
            5. **Stop writing** to the old store.
          `,
        },
        {
          kind: "choice",
          id: "why-dual-first",
          prompt: "Why start dual writes before copying the old data?",
          options: [
            {
              id: "frozen",
              label: "So everything after a known point is already in both stores; the copy only has to handle a past that no longer changes.",
              correct: true,
              why: "If you copy first, messages written during the copy are missing from the new store, and you have to chase a moving target.",
            },
            {
              id: "speed",
              label: "It makes the copy faster.",
              why: "It makes the copy correct, not faster.",
            },
            {
              id: "test",
              label: "To load-test the new cluster.",
              why: "That's a useful side effect, but the reason is correctness.",
            },
          ],
        },
        {
          kind: "predict",
          id: "checkpoint",
          prompt: "Copying trillions of rows takes days. Why checkpoint each token range?",
          answer: md`
            So a failure partway costs one range, not the whole copy. Without checkpoints, a crash on day 3 means starting over.
          `,
        },
      ],
      interaction: {
        kind: "ordering",
        prompt: "Put the migration steps in a safe order.",
        items: [
          { id: "stand-up", label: "Stand up the new cluster and make the data service write every new message to both clusters", detail: "The old cluster remains the source of truth." },
          { id: "cutover-point", label: "Record the point from which every message exists in both clusters" },
          { id: "copy", label: "Copy everything older than that point, token range by token range, checkpointing each range", detail: "So a crashed migrator resumes rather than restarts." },
          { id: "verify", label: "Send a sample of reads to both clusters and compare the results" },
          { id: "switch-reads", label: "Switch reads to the new cluster, keeping dual writes so you can switch back" },
          { id: "retire", label: "Stop writing to the old cluster and decommission it" },
        ],
        explanation: md`
          Dual writes come first so that nothing written during the copy is lost; the copy then only has to cover a fixed, unchanging past. Verification before switching reads, and dual writes kept on after it, keep every step reversible until the last one. See [[online-migrations]].

          Discord's numbers: their first migrator (on Spark) estimated three months. They rewrote it in Rust in an afternoon, reached 3.2 million messages a second, and copied everything in nine days. The last few token ranges stalled on enormous runs of tombstones (the previous stage's problem, again), which one compaction cleared. The new cluster runs on 72 nodes instead of 177, with p99 history reads of 15 ms instead of 40 to 125 ms.
        `,
      },
      reveal: {
        takeaways: [
          "Capture new writes first, then backfill a past that has stopped changing.",
          "Verify by comparing reads, then move reads before writes so there's always a way back.",
          "Checkpoint the copy per range and throttle it so live traffic isn't starved.",
        ],
        reasoning: md`
          Every safe migration is the same shape: capture new writes first, backfill a past that has stopped changing, verify, then move reads before writes so there is always a way back.

          The interesting engineering is in the details: checkpointing per token range so failures cost minutes rather than days, throttling the copy so it does not starve live traffic, and expecting the old store's worst data (here, tombstones) to be the last and slowest thing you move.
        `,
      },
    },
    {
      id: "write-the-coalescer",
      title: "Write the coalescer",
      phase: "break",
      dimensions: ["implement", "break"],
      conceptIds: ["request-coalescing"],
      competencyIds: ["hot-spots"],
      context: md`
        Implement the read path in the data service so that identical concurrent reads share one database query. Permissions have already been checked by the API servers. Think about what happens when the shared query fails or hangs.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A coalescer is a map from request key to in-flight promise:

            1. If the key is in the map, await the existing promise.
            2. Otherwise, start the query, store its promise, and remove the entry when it settles.

            The key must include **every parameter that changes the result**: channel, cursor and limit. Two requests that differ in any of them aren't the same question.
          `,
        },
        {
          kind: "choice",
          id: "on-failure",
          prompt: "The shared query fails. What must happen to its map entry?",
          options: [
            {
              id: "remove",
              label: "Remove it, so the next request tries again instead of receiving the cached failure",
              correct: true,
              why: "Keeping a failed promise in the map would hand the same error to every later request.",
            },
            {
              id: "keep",
              label: "Keep it briefly to stop a retry storm",
              why: "That's caching errors. Waiters already got the failure; new requests should retry.",
            },
            {
              id: "nothing",
              label: "Nothing special; it's removed on success",
              why: "Only removing on success leaves failures stuck forever.",
            },
          ],
        },
        {
          kind: "predict",
          id: "hang",
          prompt: "The shared query hangs for 60 seconds. What happens to the hundreds of thousands of waiters, and what prevents it?",
          answer: md`
            They all wait 60 seconds: coalescing turned one slow query into a slow page for everyone. A timeout on the shared query bounds it; when it fires, the entry is removed and the next request starts fresh.
          `,
        },
      ],
      interaction: {
        kind: "implementation",
        prompt: "Implement getMessages with request coalescing.",
        language: "typescript",
        starter: md`
          type Message = { id: string; channelId: string; authorId: string; body: string };

          // Reads one page of a channel from the store. Slow under load.
          declare function queryPage(channelId: string, before: string | null, limit: number): Promise<Message[]>;

          export async function getMessages(channelId: string, before: string | null, limit: number): Promise<Message[]> {
            // Coalesce identical concurrent reads.
          }
        `,
        rubric: [
          { id: "inflight", text: "Keeps a map of in-flight queries; later identical calls await the existing promise." },
          { id: "full-key", text: "The key includes every parameter that changes the result (channel, cursor, limit)." },
          { id: "cleanup", text: "Removes the entry when the query settles, on failure as well as success, so errors are not cached." },
          { id: "timeout", text: "Bounds the shared query with a timeout so one slow query does not hold every waiter indefinitely." },
          { id: "no-caching", text: "Does not keep results after completion (that would be a cache, with invalidation problems).", weight: "supporting" },
        ],
        reference: {
          code: md`
            const inflight = new Map<string, Promise<Message[]>>();

            function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
              return Promise.race([
                p,
                new Promise<T>((_, reject) => setTimeout(() => reject(new Error("query timed out")), ms)),
              ]);
            }

            export function getMessages(channelId: string, before: string | null, limit: number): Promise<Message[]> {
              const key = \`\${channelId}:\${before ?? "latest"}:\${limit}\`;
              const existing = inflight.get(key);
              if (existing) return existing;

              const query = withTimeout(queryPage(channelId, before, limit), 2_000).finally(() => {
                inflight.delete(key);
              });
              inflight.set(key, query);
              return query;
            }
          `,
          notes: md`
            - \`finally\` removes the entry whether the query succeeds or fails. Without it, one failed query would be returned to every future caller.
            - The map holds a request only while it is in flight. Results are not kept, so there is nothing to invalidate when a new message arrives.
            - The key must contain every parameter. Coalescing "latest 50" with "latest 100" would hand some callers the wrong page.
            - Per-user checks happen before this function. Never coalesce a response that depends on who is asking.
            - This only collapses requests that reach the same process, which is why the router hashes channel IDs to instances. See [[request-coalescing]].
          `,
        },
      },
      reveal: {
        takeaways: [
          "Key in-flight queries by every parameter that changes the result.",
          "Remove entries when the query settles, on failure as well as success.",
          "Bound the shared query with a timeout, and don't keep results afterwards.",
        ],
        reasoning: md`
          The code is a dozen lines; the guarantees are in the details. An entry must disappear on failure, the shared work must have a deadline, and the key must capture everything that makes two requests the same. Each of those is an easy omission that turns a protective layer into an outage amplifier.
        `,
      },
    },
    {
      id: "defend-the-design",
      title: "Defend the design",
      phase: "defend",
      dimensions: ["defend", "change"],
      conceptIds: ["partitioning", "lsm-trees", "request-coalescing"],
      competencyIds: ["data-model", "storage-engine", "sizing"],
      context: md`
        Your interviewer pushes back: "This is a lot of machinery. Why not shard Postgres by channel and be done? And isn't the data service just an extra hop that adds latency?"
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            "Postgres doesn't scale" isn't true and isn't a defence. A convincing answer names the conditions under which the alternative wins (slower growth, a need for relational queries, more people to run it) and shows which of those conditions doesn't hold here.
          `,
        },
        {
          kind: "choice",
          id: "hop",
          prompt: "\"The data service is just an extra hop.\" What does the hop buy?",
          options: [
            {
              id: "coalesce",
              label: "Request coalescing and isolation from hot channels, worth far more than a sub-millisecond hop",
              correct: true,
              why: "Without it, a single @everyone ping can saturate three database nodes and slow unrelated channels.",
            },
            {
              id: "nothing",
              label: "Nothing measurable",
              why: "It's what turns a burst of identical reads into one query.",
            },
            {
              id: "security",
              label: "Only security",
              why: "Permissions are checked elsewhere; the hop is about protecting the database.",
            },
          ],
        },
      ],
      interaction: {
        kind: "open",
        prompt: "Answer both questions, saying when you would choose Postgres instead and what the extra hop buys.",
        placeholder: "The dataset grows by tens of terabytes a year…",
        rubric: [
          { id: "postgres-fair", text: "Acknowledges sharded Postgres is viable and names when it is the better choice (slower growth, relational queries, existing expertise)." },
          { id: "growth", text: "Uses the growth rate and team size: resharding by hand repeatedly is the cost being avoided." },
          { id: "hop", text: "The data-service hop buys coalescing and isolation from hot keys, worth far more than a sub-millisecond hop." },
          { id: "costs", text: "Owns the costs of the chosen design: eventual consistency, tombstones, compaction and repair." },
        ],
        reference: md`
          **Postgres is a fair choice.** With slower growth, a team fluent in Postgres, or a need for relational queries across messages, sharding Postgres by channel works well; several large chat products do it. What it costs here is repeated manual resharding: at tens of terabytes a year, you would be splitting shards and moving data again and again, with failover to run yourself. The requirement that capacity grows by adding nodes, for a small team, is what tips it.

          **The hop is cheap and the protection is not.** A request to a data service in the same zone costs well under a millisecond. In exchange, every request for a channel meets in one place, so a burst of identical reads becomes one query, and one hot channel cannot saturate the replicas that also serve thousands of other channels. It is also the one place to put concurrency limits and to dual-write during a migration.

          **What I am accepting:** per-column last-write-wins and the edit/delete race, tombstones that make deletes expensive to read past, compaction and repair to operate, and a query model that only answers "by channel and time". Search, mentions and analytics go to other stores fed from the message stream.
        `,
      },
      reveal: {
        takeaways: [
          "Name when sharded Postgres would win, and why those conditions don't hold here.",
          "The growth rate and team size make repeated manual resharding the cost being avoided.",
          "Own the chosen store's costs: eventual consistency, tombstones, compaction and repair.",
        ],
        reasoning: md`
          The strongest defence names the conditions under which the alternative wins. "Postgres would work if growth were slower or the team bigger" is a much more convincing answer than "Postgres doesn't scale", which is not true.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      Every common read is shaped to touch one small, contiguous partition: messages are keyed by **(channel, ten-day bucket)** and ordered by a **time-sortable Snowflake ID**, so the latest page, a history page and a jump to any message each map to a known partition. A **log-structured, replicated store** makes writes cheap appends and grows by adding nodes.

      Its weaknesses are handled explicitly: tombstones are kept short-lived, nulls are never written, and empty buckets are skipped; half-rows from edit/delete races are recognised and removed. A **data service** in front of the store routes each channel to one instance and coalesces identical reads, so a hot channel costs one query. The same layer made it possible to dual-write and move the whole dataset to a new database while it was live.
    `,
    reliesOn: [
      "Almost every query is by channel and time.",
      "Snowflake IDs are generated with roughly synchronized clocks, so they sort by time.",
      "Repair runs regularly, so short tombstone lifetimes are safe.",
      "Requests for a channel can be routed to one data-service instance.",
    ],
    alternatives: [
      { design: "Sharded Postgres by channel", preferWhen: "Growth is slower, relational queries matter, or the team knows Postgres deeply." },
      { design: "Managed key-value store (DynamoDB, Bigtable)", preferWhen: "You want the same data model without operating the cluster yourself." },
      { design: "Tiered storage: hot recent buckets in the database, old buckets in object storage", preferWhen: "Most history is never read again and storage cost dominates." },
    ],
    tradeoffs: [
      { choice: "Wide-column LSM store", gains: "Cheap writes, scale-out, built-in replication.", costs: "Narrow queries, tombstones, compaction and repair to operate." },
      { choice: "Time-bucketed partitions", gains: "Bounded partitions whatever the channel's size.", costs: "Quiet channels need several bucket reads per page." },
      { choice: "Data service with coalescing", gains: "Hot channels cost one query; one place for limits and migrations.", costs: "Another service to run; routing must stay consistent." },
    ],
    breaksWhen: [
      "Queries need to filter by something other than channel and time (search, mentions), which calls for separate indexes fed from the message stream.",
      "A single channel's write rate exceeds what one partition's replicas can absorb.",
      "Clock skew between ID generators is large enough to misorder messages noticeably.",
    ],
  },
  interviewVariants: [
    "Design Discord.",
    "Design the message storage for a chat app like Slack or WhatsApp.",
    "How would you store and paginate billions of chat messages?",
    "One key in your database is getting far more traffic than the rest. What do you do?",
  ],
  relatedInvestigationIds: ["realtime-collaboration", "notification-system"],
} satisfies InvestigationInput;
