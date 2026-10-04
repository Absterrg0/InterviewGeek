import type { ConceptInput } from "@/lib/domain/content";
import { md } from "../md";

export const distributionConcepts: ConceptInput[] = [
  {
    id: "id-generation",
    title: "Generating unique identifiers",
    domain: "distribution",
    summary:
      "Making ids that are unique across machines and time, and choosing what else they reveal: order, volume, guessability, length.",
    problem: md`
      Every record needs an identity, and in a distributed system many processes create records at once. Ids must never collide, but they also leak information, take up space in URLs and indexes, and influence write performance. "Use a UUID" answers only the first question.
    `,
    mechanism: md`
      The main families, and what each implies:

      - **Central sequence** (database \`SERIAL\`/identity). Compact, ordered, and the database guarantees uniqueness. But it is a single point of coordination, and sequential ids reveal volume and let anyone enumerate your resources (\`/links/1000\`, \`/links/1001\`…).
      - **Block allocation.** Each server reserves a range (e.g. 10,000 ids) from a central counter and hands them out locally. Coordination drops by the block size; ids are unique but only roughly ordered, and a crashed server's unused block is skipped.
      - **Random ids** (UUIDv4, or random base62 strings). No coordination at all, and unguessable if the randomness is cryptographic. Uniqueness is probabilistic: with *n* ids already issued from a space of size *S*, a new one collides with probability *n/S*, so short random ids need an insert-and-retry on the rare collision. Random ids also scatter B-tree inserts, which costs write performance on large tables.
      - **Time-ordered ids** (Snowflake, ULID, UUIDv7). A timestamp prefix plus a machine id or randomness: unique without coordination, sortable by creation time, and index-friendly. They reveal creation time.
      - **Hashes of content.** The same input always maps to the same id, which is useful for deduplication, but different inputs can collide once truncated, and identical inputs from different owners share an id whether you want that or not.

      Length is a budget: a base62 string of length *k* has 62^*k* values (7 characters ≈ 3.5 trillion). The question is never "can it collide?" but "how often, and what happens when it does?". The answer to the second should always be a unique constraint that turns a collision into a retry rather than corruption.
    `,
    assumptions: [
      "A unique constraint backs every scheme, so even a 'can't happen' collision fails loudly rather than overwriting data.",
      "Random ids use a cryptographically secure generator when guessability matters.",
    ],
    alternatives: [
      { name: "Natural keys", when: "The entity already has a stable, unique identity (an email for accounts, an ISBN) that will never need to change." },
      { name: "Composite keys", when: "Uniqueness is only needed within a parent, such as (document_id, seq)." },
    ],
    failureModes: [
      { name: "Enumeration", description: "Sequential public ids let anyone walk through every resource or estimate your volume." },
      { name: "Silent overwrite on collision", description: "An upsert keyed on a colliding id replaces someone else's record." },
      { name: "Clock-based ids going backwards", description: "Time-ordered generators must handle clock adjustments, or they emit duplicates or out-of-order ids." },
      { name: "Weak randomness", description: "Math.random-style generators are predictable; ids meant to be unguessable are not." },
    ],
    implementations: [
      { name: "Database identity columns", note: "Simplest; centrally ordered." },
      { name: "UUIDv4 / UUIDv7", note: "Random or time-ordered 128-bit ids; v7 is index-friendly." },
      { name: "Snowflake-style ids", note: "64-bit: timestamp, worker id, per-millisecond sequence." },
      { name: "Random base62 + unique constraint", note: "Short, unguessable public codes with retry on collision." },
    ],
    claims: [
      {
        id: "short-random-collide",
        statement: "Random 7-character base62 codes are unsafe because collisions are inevitable.",
        verdict: "fails",
        explanation:
          "Some collision is inevitable over billions of codes, but each insert's chance of colliding is tiny (existing codes / 3.5 trillion) and a unique constraint turns a collision into an immediate retry. 'Inevitable' and 'harmful' are different properties.",
      },
      {
        id: "sequential-leaks",
        statement: "Sequential public ids reveal information about your business.",
        verdict: "holds",
        explanation: "Two ids a week apart tell a competitor how many records you created that week, and anyone can enumerate every resource by counting.",
      },
      {
        id: "uuid-index",
        statement: "Random UUIDv4 primary keys can slow down inserts on very large tables compared with sequential keys.",
        verdict: "holds",
        explanation:
          "Random keys land on random B-tree pages, so the working set for inserts is the whole index. Sequential or time-ordered keys append to the right edge. Time-ordered UUIDs (v7) keep the uniqueness without the scattering.",
      },
    ],
    explain: {
      prompt: "Compare sequential, random and time-ordered ids for public short codes: what each guarantees and what each reveals.",
      rubric: [
        { id: "uniqueness", text: "Explains how each achieves uniqueness: central coordination, probability plus constraint, or time plus machine id." },
        { id: "leakage", text: "Notes what each reveals: volume and enumerability, nothing, or creation time." },
        { id: "constraint", text: "A unique constraint should back any scheme so a collision becomes a retry.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["partitioning", "concurrency-control", "ordering"],
  },
  {
    id: "replication",
    title: "Replication",
    domain: "distribution",
    summary:
      "Keeping copies of data on several machines for durability, read capacity and locality, and living with copies that briefly disagree.",
    problem: md`
      One copy of the data is one machine's worth of reads, one data centre's worth of latency for distant users, and one failure away from loss. Copies fix all three, and introduce the question of which copy is right when they differ.
    `,
    mechanism: md`
      The common arrangement is **leader-follower**: one primary accepts writes and streams its change log to replicas, which apply it in order.

      - **Synchronous replication** waits for a replica to confirm before the write is acknowledged. A committed write survives the primary's loss, at the cost of a network round trip on every commit and stalls when the replica is slow.
      - **Asynchronous replication** acknowledges first and ships the change afterwards. Writes are fast, but replicas **lag** (usually milliseconds, sometimes seconds or more under load), and a failover can lose the last few committed writes; see [[durability]].

      Lag produces anomalies that users notice:

      - **Read-your-writes:** a user creates something and the next read, served by a replica, does not show it. Fixes: read from the primary for a short time after a user's write, read from a replica only if it has caught up past the write's log position, or fall back to the primary on a miss.
      - **Monotonic reads:** two reads hit different replicas and data appears to go backwards. Fix: pin a session to one replica.

      **Multi-leader** and **leaderless** replication accept writes in several places, which adds write availability and locality, and makes concurrent writes to the same data a [[conflict-resolution]] problem.
    `,
    assumptions: [
      "Reads dominate, or are latency-sensitive in places far from the primary.",
      "The application can tolerate, or explicitly works around, replication lag.",
    ],
    alternatives: [
      { name: "Caching", when: "Reads repeat the same keys; a cache gives read capacity without a full copy of the database." },
      { name: "Partitioning", when: "Writes or data size exceed one machine; replication alone does not scale writes." },
    ],
    failureModes: [
      { name: "Stale read after write", description: "The user's own change is missing on the next page." },
      { name: "Data loss on failover", description: "Asynchronously replicated writes committed just before the crash are missing on the new primary." },
      { name: "Lag spiral", description: "A replica falls behind under load, serves increasingly stale data, and may need to be removed from rotation." },
      { name: "Caching a miss", description: "A 404 served from a lagging replica is cached and outlives the lag by hours." },
    ],
    implementations: [
      { name: "Postgres streaming replication", note: "Async by default; synchronous_commit for synchronous replicas." },
      { name: "MySQL replication / Aurora replicas", note: "Leader-follower with replica lag metrics." },
      { name: "DynamoDB global tables, Cassandra", note: "Multi-region, multi-writer with last-writer-wins conflict handling." },
    ],
    claims: [
      {
        id: "replicas-scale-writes",
        statement: "Adding read replicas increases the write capacity of a database.",
        verdict: "fails",
        explanation: "Every replica must apply every write, and only the primary accepts them. Replicas scale reads; partitioning scales writes.",
      },
      {
        id: "lag-zero",
        statement: "With asynchronous replication in the same region, lag is small enough to ignore.",
        verdict: "depends",
        explanation:
          "Usually milliseconds, but spikes to seconds or more happen under heavy writes, long transactions or vacuum. Code that assumes zero lag breaks precisely when the system is busiest.",
      },
      {
        id: "sync-durable",
        statement: "Synchronous replication means a committed write survives the loss of the primary.",
        verdict: "holds",
        explanation: "The commit was acknowledged only after a replica confirmed it, so a copy exists elsewhere. The price is latency on every write.",
      },
    ],
    explain: {
      prompt: "Explain replication lag, one anomaly it causes for users, and how you would prevent it.",
      rubric: [
        { id: "async", text: "Asynchronous replication applies writes on replicas after the primary acknowledges, so replicas trail." },
        { id: "anomaly", text: "Describes an anomaly, such as read-your-writes or monotonic reads." },
        { id: "fix", text: "Gives a concrete fix: primary reads after writes, position-aware replica reads, or session pinning." },
      ],
    },
    relatedConceptIds: ["durability", "caching", "partitioning", "conflict-resolution"],
  },
  {
    id: "leases-and-fencing",
    title: "Leases and fencing tokens",
    domain: "distribution",
    summary:
      "Ownership that expires unless renewed, plus a token that lets the rest of the system reject an owner that has lost its claim without knowing it.",
    problem: md`
      Some work must have exactly one owner at a time: a job, a document's sequencer, a leader. Owners crash, so ownership must be reclaimable. But you cannot tell a crashed owner from a slow one: a garbage-collection pause, a network blip or a frozen VM looks exactly like death. Take ownership away from a slow owner and, when it wakes up, you have two.
    `,
    mechanism: md`
      **Leases** solve the crash case. Ownership is granted *until a time*: \`leased_until = now() + 30s\`. The owner renews it with heartbeats. If it stops renewing, the lease lapses and someone else may claim it. No failure detector or cooperation from the dead process is needed. Compute expiry with one clock, the database's or the coordinator's, so skew between machines does not matter.

      **Fencing** solves the slow-owner case. Every grant of the lease comes with a **token that increases** (or is unique): an epoch, a version, a UUID. Every write the owner makes carries its token, and the system holding the data **rejects writes with a stale token**:

      \`\`\`sql
      UPDATE jobs SET status = 'done' WHERE id = $1 AND lease_token = $2;
      \`\`\`

      The old owner wakes up, tries to write, matches zero rows, and learns that it lost. The resource enforces exclusivity; the lease only *advises* it.

      Two complements:

      - **Self-fencing:** an owner that fails to renew should stop work, which wastes less. But a paused process cannot stop itself during the pause, so this is an optimization, not the guarantee.
      - **Isolated side effects:** writes that cannot carry a token, such as files in object storage or calls to third parties, should go to per-owner locations or be deduplicated, so overlap between two owners cannot corrupt them.
    `,
    assumptions: [
      "The resource being protected can check a token on each write (a conditional update, a versioned API).",
      "Lease duration comfortably exceeds the renewal interval plus expected pauses.",
      "Expiry is judged by a single clock, not compared across machines.",
    ],
    alternatives: [
      { name: "Consensus-based leadership (Raft, etcd, ZooKeeper)", when: "You need one leader for a cluster with strong guarantees; these systems provide leases and fencing epochs." },
      { name: "Idempotent, overlapping work", when: "Two owners doing the same work is harmless, so exclusivity does not need enforcing." },
    ],
    failureModes: [
      { name: "Lease without fencing", description: "A paused owner resumes after expiry and overwrites the new owner's work." },
      { name: "Lease too short", description: "Normal pauses cause spurious handovers and duplicate work." },
      { name: "Lease too long", description: "Recovery after a real crash takes the full duration." },
      { name: "Clock comparison across machines", description: "A worker with a fast clock thinks leases have expired early." },
    ],
    implementations: [
      { name: "Lease columns in a jobs table", note: "leased_until + lease_token, claimed with a conditional update." },
      { name: "Queue visibility timeouts", note: "A lease on a message; extend it for long work." },
      { name: "etcd/ZooKeeper sessions and revisions", note: "Leases with monotonically increasing revisions usable as fencing tokens." },
    ],
    claims: [
      {
        id: "expired-stopped",
        statement: "Once a worker's lease has expired, the worker has stopped working on the job.",
        verdict: "fails",
        explanation: "Expiry means it stopped *renewing*. It may be paused, partitioned or just slow, and it can resume work at any moment, which is why fencing exists.",
      },
      {
        id: "redis-lock",
        statement: "A lock with a TTL in Redis is enough to guarantee two workers never modify the same record at once.",
        verdict: "fails",
        explanation:
          "The TTL can expire while the holder is paused, after which a second worker acquires the lock and both proceed. The record's store must check a fencing token on writes for the guarantee to hold.",
      },
      {
        id: "db-clock",
        statement: "Computing lease expiry with the database's now() avoids clock-skew problems between workers.",
        verdict: "holds",
        explanation: "Every comparison uses the same clock. Workers' own clocks never enter into it.",
      },
    ],
    explain: {
      prompt: "Explain why a lease alone cannot guarantee a single owner, and how fencing tokens close the gap.",
      rubric: [
        { id: "indistinguishable", text: "A slow or paused owner is indistinguishable from a dead one, so a lease can expire while the owner still works." },
        { id: "token", text: "Each grant carries an increasing or unique token that accompanies every write." },
        { id: "reject", text: "The protected resource rejects writes with stale tokens, so the old owner's late writes fail." },
        { id: "self-fence", text: "Self-fencing reduces waste but cannot replace resource-side checks.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["concurrency-control", "message-queues", "idempotency", "ordering"],
  },
  {
    id: "partitioning",
    title: "Partitioning",
    domain: "distribution",
    summary:
      "Splitting data or work by key so each part is handled independently: scaling out, and giving each key a single owner.",
    problem: md`
      One machine, one database or one process eventually cannot handle all the load. More copies of a stateless tier are easy to add; more copies of *state* are not, because two copies accepting writes for the same thing must coordinate.
    `,
    mechanism: md`
      Partitioning (sharding) assigns each key, such as a user, a document or an account, to exactly one partition, and each partition is handled independently:

      - **Choosing the key** is the important decision. Operations that must be atomic or ordered together should share a partition key; operations across partitions lose those properties (or need expensive coordination).
      - **Mapping keys to partitions:** hashing spreads load evenly but scatters ranges; range partitioning keeps adjacent keys together but invites hotspots. **Consistent hashing** keeps most keys in place when partitions are added or removed.
      - **Routing:** clients, a proxy or a directory must find the partition that owns a key, including during moves.
      - **Single owner per partition** is the other benefit. If one process owns all of document 42's writes, that process can sequence them without any distributed coordination. Partitioning turns a concurrency problem into a routing problem.

      Partitioning does not fix **hot keys**. If one key (a celebrity account, an all-hands document) receives more load than one partition can handle, you must split the *work* for that key: separate the single-writer part from the read and fan-out part, cache it, or batch it.
    `,
    assumptions: [
      "Most operations touch a single partition key.",
      "Load is spread across many keys, so no single key dominates.",
      "There is a mechanism to move partitions and route correctly during the move.",
    ],
    alternatives: [
      { name: "Vertical scaling", when: "A bigger machine still fits the load. It is simpler, and often enough for longer than expected." },
      { name: "Read replicas", when: "Reads dominate and can tolerate slight staleness, while writes still fit one primary." },
      { name: "Caching", when: "Load is mostly repeated reads of the same data." },
    ],
    failureModes: [
      { name: "Hot partition", description: "One key or range receives disproportionate load." },
      { name: "Cross-partition operations", description: "Transactions or queries spanning partitions become slow, complex or non-atomic." },
      { name: "Split ownership during rebalancing", description: "Two nodes believe they own a partition while it moves; fence ownership." },
    ],
    implementations: [
      { name: "Application-level sharding", note: "Shard ID derived from a key and mapped to a database." },
      { name: "Kafka partitions", note: "Per-partition order and consumer ownership." },
      { name: "Consistent-hash routing at the load balancer", note: "Route all of a document's connections to one server." },
      { name: "Distributed databases", note: "Automatic range or hash partitioning (DynamoDB, Spanner, CockroachDB)." },
    ],
    claims: [
      {
        id: "fixes-hot",
        statement: "Adding more shards fixes a hot key.",
        verdict: "fails",
        explanation: "All of a key's traffic still goes to the one shard that owns it. Hot keys need the work itself split, cached or batched.",
      },
      {
        id: "single-owner",
        statement: "Routing all writes for a key to one owner removes the need for distributed locking on that key.",
        verdict: "holds",
        explanation:
          "A single owner can serialize its own writes locally. The coordination problem moves to keeping ownership unique during failover and rebalancing.",
      },
      {
        id: "shard-early",
        statement: "Microservices and sharding are necessary for a system to scale.",
        verdict: "fails",
        explanation:
          "A single well-indexed database on a large machine handles tens of thousands of transactions per second. Partition when a measured bottleneck requires it; before then you are paying coordination costs for nothing.",
      },
    ],
    explain: {
      prompt: "Explain how you would choose a partition key, and what partitioning cannot fix.",
      rubric: [
        { id: "together", text: "Operations that must be atomic or ordered together share a key." },
        { id: "spread", text: "The key spreads load across many partitions, considering access patterns." },
        { id: "hot", text: "A single hot key is not fixed by more partitions." },
        { id: "routing", text: "Mentions routing and rebalancing (consistent hashing, ownership during moves).", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["ordering", "leases-and-fencing", "caching", "backpressure"],
  },
  {
    id: "soft-state",
    title: "Soft state",
    domain: "distribution",
    summary:
      "State that expires unless refreshed. It is cheap to keep, safe to lose, and right for presence, sessions and anything that describes the present moment.",
    problem: md`
      "Who is online", "where is their cursor", "which server holds this connection" all describe the present. Storing them durably means writing on every change and then cleaning up after crashes. A client that disappears without saying goodbye leaves a ghost that stays "online" forever.
    `,
    mechanism: md`
      Soft state is kept alive by **periodic refresh** and **expires** when refreshes stop:

      - A client announces presence and repeats the announcement every *n* seconds (often piggybacked on heartbeats).
      - The holder stores it with a TTL slightly longer than a few refresh intervals.
      - If the client vanishes, refreshes stop and the entry expires on its own. No cleanup protocol is needed, and a crash can never leave a permanent ghost.

      Because it is rebuilt from refreshes, soft state does not need durability. If the server holding it restarts, clients reconnect and re-announce, and the state reappears within one refresh interval. Persisting it would add write load and still require expiry to clean up after crashes.

      The pattern also applies to rapidly superseded data, such as cursor positions or typing indicators: send it at-most-once, coalesce updates, and keep only the latest. A lost update is replaced by the next one.
    `,
    assumptions: [
      "A short gap or brief staleness after a restart is acceptable.",
      "Producers refresh at a known interval, and expiry is a small multiple of it.",
    ],
    alternatives: [
      { name: "Durable state with explicit cleanup", when: "The information must survive restarts and be auditable, such as 'last seen' timestamps." },
      { name: "Derived from connection lifecycle", when: "One server holds all connections and can infer presence directly from them." },
    ],
    failureModes: [
      { name: "Ghosts", description: "Presence without expiry shows departed users forever." },
      { name: "Flapping", description: "A TTL barely longer than the refresh interval expires during normal jitter." },
      { name: "Durable presence", description: "Writing cursor positions to a database on every move creates heavy write load for data nobody needs later." },
    ],
    implementations: [
      { name: "Redis keys with TTL", note: "SET presence:doc:user … EX 30, refreshed by heartbeats." },
      { name: "In-memory maps with timestamps", note: "Swept periodically on the owning server." },
      { name: "Routing protocols, DHCP leases", note: "The same pattern in networking." },
    ],
    claims: [
      {
        id: "persist-presence",
        statement: "Presence should be stored in the primary database so it survives a server restart.",
        verdict: "fails",
        explanation:
          "After a restart, clients reconnect and re-announce within seconds. Persisting presence adds constant write load and still needs expiry to remove users whose clients crashed.",
      },
      {
        id: "ttl-multiple",
        statement: "A presence TTL should be a few times longer than the refresh interval.",
        verdict: "holds",
        explanation: "One delayed or dropped refresh should not make a present user disappear; several missed refreshes should.",
      },
      {
        id: "cursor-retry",
        statement: "Cursor-position updates should be delivered reliably, with retries.",
        verdict: "fails",
        explanation: "Each update supersedes the previous one. Retrying a stale position only shows the wrong place; the next update fixes any loss.",
      },
    ],
    explain: {
      prompt: "Explain how soft state keeps presence accurate without durability or cleanup logic.",
      rubric: [
        { id: "refresh", text: "Holders keep state only while it is refreshed periodically." },
        { id: "expire", text: "Entries expire automatically when refreshes stop, so crashed clients disappear." },
        { id: "rebuild", text: "After a restart the state is rebuilt from new refreshes, so durability is unnecessary." },
      ],
    },
    relatedConceptIds: ["persistent-connections", "delivery-guarantees", "caching"],
  },
];
