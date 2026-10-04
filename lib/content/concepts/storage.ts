import type { ConceptInput } from "@/lib/domain/content";
import { md } from "../md";

export const storageConcepts: ConceptInput[] = [
  {
    id: "object-storage",
    title: "Object storage",
    domain: "storage",
    summary:
      "A flat namespace of immutable blobs addressed by key, built for durability and size rather than queries or in-place updates.",
    problem: md`
      Files such as videos, images, backups and exports are large and written once. Putting them in a relational database bloats backups, replication and memory. Putting them on a server's local disk ties them to one machine that will eventually be replaced. You need storage that is durable, effectively unlimited, and reachable from anywhere.
    `,
    mechanism: md`
      An object store keeps **objects**: a byte blob plus metadata, under a **key** in a **bucket**. The interface is deliberately small: \`PUT\` a whole object, \`GET\` it (optionally a byte range), \`DELETE\` it, \`LIST\` keys by prefix. There are no in-place edits; changing an object means writing a new version of it.

      Properties that shape designs:

      - **Durability by replication.** Each object is stored redundantly across devices and facilities before the \`PUT\` is acknowledged. Once you get a success response, the object survives disk and machine failures; see [[durability]].
      - **Multipart upload.** Large objects are uploaded in parts (5 MB to 5 GB each) that can be sent in parallel and retried individually, then assembled atomically by a "complete" call. Until completion the object does not exist.
      - **Presigned URLs.** The server signs a URL granting one operation on one key until an expiry time. Clients can then upload or download directly, keeping bytes out of your application servers.
      - **Consistency.** Major stores now give read-after-write consistency for new objects and overwrites, but LIST is slow and costly at scale, so do not use it as an index. Keep the index of what exists in your database.
      - **Immutability as a feature.** Because keys you never overwrite never change, they can be cached forever. Content-addressed or versioned keys (\`renditions/812/attempt-3/…\`) make CDN [[caching]] trivial and safe.
    `,
    assumptions: [
      "Objects are written whole and rarely modified; access is by key rather than by query.",
      "Your database holds the metadata (which objects exist, who owns them, what state they are in).",
      "Latency of tens of milliseconds per request is acceptable.",
    ],
    alternatives: [
      { name: "Database BLOB columns", when: "Objects are small (kilobytes) and must change transactionally with other rows." },
      { name: "Block storage or a filesystem volume", when: "Software needs POSIX semantics: random writes, appends, file locks." },
      { name: "Local disk", when: "The data is scratch space that can be lost with the machine." },
    ],
    failureModes: [
      { name: "Database and store disagree", description: "A row points at a key that was never written, or objects exist that no row references. Order writes so failures leave garbage, not dangling pointers." },
      { name: "Abandoned multipart uploads", description: "Uncompleted parts are invisible but billed until a lifecycle rule aborts them." },
      { name: "LIST as an index", description: "Listing a large bucket to find work is slow, expensive and eventually unworkable." },
      { name: "Leaked presigned URLs", description: "A URL with a long expiry grants access to anyone who obtains it." },
    ],
    implementations: [
      { name: "Amazon S3, Google Cloud Storage, Azure Blob", note: "The reference implementations." },
      { name: "Cloudflare R2, Backblaze B2", note: "S3-compatible APIs with different egress pricing." },
      { name: "MinIO, Ceph", note: "Self-hosted S3-compatible stores." },
    ],
    claims: [
      {
        id: "append",
        statement: "You can append log lines to an existing object in a standard object store.",
        verdict: "fails",
        explanation:
          "Objects are written whole. \"Appending\" means rewriting the entire object. Systems that need appends write many small objects or use a log or stream service instead.",
      },
      {
        id: "presigned",
        statement: "Presigned URLs let browsers upload directly to storage without being given storage credentials.",
        verdict: "holds",
        explanation:
          "The signature encodes one operation, one key, and an expiry, made with credentials only your server holds. The client gets a capability, not an identity.",
      },
      {
        id: "list-index",
        statement: "Listing the bucket is a good way to find which uploads still need processing.",
        verdict: "fails",
        explanation:
          "LIST is paginated, slow on large buckets and billed per request, and \"needs processing\" is state the store does not have. That belongs in a database row.",
      },
      {
        id: "cheap",
        statement: "Object storage is cheaper than database storage for large files.",
        verdict: "depends",
        explanation:
          "Per gigabyte stored, almost always, by an order of magnitude or more. But request charges and especially egress can dominate for frequently read objects, which is why a CDN in front matters.",
      },
    ],
    explain: {
      prompt: "Explain why a system handling large uploads should store the bytes in object storage and the metadata in a database, and how the two are kept consistent.",
      rubric: [
        { id: "fit", text: "Object storage is built for large immutable blobs; the database for queryable, transactional metadata." },
        { id: "direct", text: "Presigned or multipart uploads keep large transfers out of application servers." },
        { id: "consistency", text: "The two stores share no transaction, so writes are ordered such that a failure leaves unreferenced garbage rather than dangling references." },
        { id: "index", text: "The database, not LIST, is the index of what exists.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["durability", "caching", "asynchronous-processing"],
  },
  {
    id: "transactions",
    title: "Transactions",
    domain: "storage",
    summary:
      "Grouping several reads and writes so they take effect all together or not at all, isolated from concurrent work to a defined degree.",
    problem: md`
      Many operations are really several writes: debit one account and credit another, mark an order paid and record a fulfillment task. If the process crashes between them, or another request interleaves, the data ends up in a state that no single operation intended.
    `,
    mechanism: md`
      A transaction brackets operations with \`BEGIN\` and \`COMMIT\`:

      - **Atomicity.** The database records changes in a write-ahead log. On crash recovery, uncommitted transactions are rolled back, so either all of the writes are visible or none are.
      - **Durability.** \`COMMIT\` returns only after the log record is flushed to stable storage (and, if configured, to replicas). See [[durability]].
      - **Isolation.** Concurrent transactions are kept from seeing each other's partial work, to a configurable degree. *Read committed* (Postgres's default) prevents reading uncommitted data but allows two transactions to read the same row and both act on a stale value. *Repeatable read* and *serializable* prevent more anomalies, the latter by aborting one of the conflicting transactions, which the application must retry.

      Isolation levels are where most real bugs live. "Check the balance, then debit it" in two statements is a race under read committed. Fix it with a conditional update (\`UPDATE … SET balance = balance - 10 WHERE balance >= 10\`), a row lock (\`SELECT … FOR UPDATE\`), or a stricter isolation level. See [[concurrency-control]].

      A transaction covers **one database**. It cannot include an HTTP call to a payment provider, a message broker, or an email. Coordinating across systems needs other tools: the [[transactional-outbox]], [[idempotency]], and [[reconciliation]].
    `,
    assumptions: [
      "All the state that must change together lives in the same database.",
      "Transactions are short. Holding one open across slow network calls holds locks and connections.",
      "Code that runs at stricter isolation levels is prepared to retry on serialization failures.",
    ],
    alternatives: [
      { name: "Single conditional statement", when: "The whole operation fits in one UPDATE or INSERT … ON CONFLICT, which is atomic on its own." },
      { name: "Sagas (compensating steps)", when: "The operation spans services or systems that cannot share a transaction." },
      { name: "Append-only events with idempotent consumers", when: "You can express the change as a fact and derive state from it." },
    ],
    failureModes: [
      { name: "External call inside a transaction", description: "Holds locks during a slow call; and if the call succeeds but the commit fails, the outside world changed while your data did not." },
      { name: "Check-then-act under read committed", description: "Two transactions read the same value and both act on it." },
      { name: "Unretried serialization failures", description: "Stricter isolation aborts transactions; code that does not retry surfaces errors to users." },
      { name: "Long transactions", description: "Block vacuum and other writers, and inflate replication lag." },
    ],
    implementations: [
      { name: "Postgres, MySQL/InnoDB", note: "MVCC with configurable isolation levels." },
      { name: "SQLite", note: "Serializable by design via a single writer." },
      { name: "Distributed SQL (Spanner, CockroachDB)", note: "Transactions across partitions at the cost of coordination latency." },
    ],
    claims: [
      {
        id: "http-in-tx",
        statement: "Wrapping a call to a payment API inside a database transaction makes the charge and the database update atomic.",
        verdict: "fails",
        explanation:
          "The provider is not part of your transaction. If the charge succeeds and your commit fails or the process crashes, money moved and your database says it did not. Rolling back does not reverse the charge.",
      },
      {
        id: "read-committed-race",
        statement: "Under Postgres's default isolation, two concurrent transactions can both read a balance of 100 and both debit 80.",
        verdict: "holds",
        explanation:
          "Read committed lets both read the committed value 100. If each writes a computed value back, both succeed. Use a conditional update or a row lock instead.",
      },
      {
        id: "serializable-free",
        statement: "Switching everything to serializable isolation fixes concurrency bugs with no other code changes.",
        verdict: "fails",
        explanation:
          "Serializable prevents anomalies by aborting conflicting transactions. Your code must catch serialization failures and retry, and under contention throughput drops.",
      },
    ],
    explain: {
      prompt: "Explain what a database transaction guarantees, and give one thing it cannot make atomic.",
      rubric: [
        { id: "atomic", text: "All writes commit together or not at all, even across a crash (via the log)." },
        { id: "isolation", text: "Isolation is configurable, and the default may still allow races such as check-then-act." },
        { id: "boundary", text: "It cannot include external systems (APIs, brokers, email), so cross-system consistency needs other patterns." },
      ],
    },
    relatedConceptIds: ["concurrency-control", "transactional-outbox", "durability", "idempotency"],
  },
  {
    id: "event-log",
    title: "Append-only logs",
    domain: "storage",
    summary:
      "Recording changes as an ordered, immutable sequence of facts, from which current state, history and replicas can be derived.",
    problem: md`
      A row that is updated in place answers "what is the state now?" but not "how did it get here?", "what was it at 3 p.m.?" or "what changed since I last looked?". Payments need an audit trail, editors need version history, and reconnecting clients need everything they missed.
    `,
    mechanism: md`
      Instead of (or alongside) overwriting state, append each change as an **entry** with a position in a sequence: \`(document 42, seq 5131, op …)\`, or \`(payment 9, event 3, captured, provider_event evt_…)\`. Entries are never modified. Current state is a **fold** over the log: start from empty and apply entries in order.

      What this buys:

      - **History and audit.** Every change, when it happened, and what caused it.
      - **Catch-up by position.** A client or replica that has seen up to position *n* asks for everything after *n*. No per-client buffers are needed. This is how database replication, Kafka consumers and collaborative editors all resume.
      - **Idempotent consumers.** A consumer that remembers its position can safely re-read; entries carry identities that make duplicates detectable.

      What it costs:

      - **Replay time grows without bound.** Periodic **snapshots** record the folded state *as of a specific position*; loading means "latest snapshot, plus entries after its position". The position must be recorded exactly, or replay will skip or double-apply entries.
      - **Ordering requires a single sequencer per log**, or a partition per key; see [[ordering]].
      - **Corrections are new entries.** You cannot edit history; a refund is a new event, not a deletion of the charge.
    `,
    assumptions: [
      "There is a single authority assigning positions within each log (or partition).",
      "Entries are deterministic to apply, so replaying the same log yields the same state.",
      "Storage growth is managed with snapshots, compaction or retention.",
    ],
    alternatives: [
      { name: "Mutable rows plus an audit table", when: "You need history for compliance but not catch-up or replay. Simpler, and common." },
      { name: "Periodic full snapshots only", when: "Coarse history is enough and changes between snapshots do not matter." },
    ],
    failureModes: [
      { name: "Snapshot without its position", description: "Replay starts at the wrong entry, skipping or re-applying changes." },
      { name: "Non-deterministic apply", description: "Entries whose effect depends on wall-clock time or external calls replay differently." },
      { name: "Two writers, one log", description: "Two processes assign the same position; history forks. A unique constraint on (log, position) catches it." },
    ],
    implementations: [
      { name: "Table with (stream_id, seq) primary key", note: "The simplest durable log, in the database you already have." },
      { name: "Database write-ahead logs", note: "The same idea used internally for crash recovery and replication." },
      { name: "Kafka, Kinesis, EventStoreDB", note: "Dedicated log stores with retention and consumers." },
    ],
    claims: [
      {
        id: "catch-up",
        statement: "A client that knows the last position it saw can be brought up to date without the server keeping per-client buffers.",
        verdict: "holds",
        explanation: "The log is the buffer. The server reads entries after that position, from durable storage if necessary.",
      },
      {
        id: "snapshot-replaces",
        statement: "Once you take snapshots, the log entries before the latest snapshot can always be deleted.",
        verdict: "depends",
        explanation:
          "For loading current state, yes. But history, audit, and clients catching up from older positions may still need them. Retention is a product decision.",
      },
      {
        id: "event-sourcing-required",
        statement: "Keeping an append-only event table means the whole system must be event-sourced.",
        verdict: "fails",
        explanation:
          "Many systems keep mutable state for queries *and* an append-only table of events for audit or catch-up, written in the same transaction. Full event sourcing is a further, optional step.",
      },
    ],
    explain: {
      prompt: "Explain how an append-only log supports both version history and reconnecting clients, and why snapshots must record a position.",
      rubric: [
        { id: "fold", text: "State is derived by applying entries in order; history is the entries themselves." },
        { id: "position", text: "Clients catch up by asking for entries after the last position they saw." },
        { id: "snapshot", text: "Snapshots record state as of an exact position so replay continues from the next entry without gaps or duplicates." },
      ],
    },
    relatedConceptIds: ["ordering", "durability", "conflict-resolution", "reconciliation"],
  },
  {
    id: "durability",
    title: "Durability",
    domain: "storage",
    summary:
      "What has to have happened before a system may say \"saved\": which failures the data must survive, and where that guarantee is actually made.",
    problem: md`
      A system acknowledges a write. Then the process crashes, the machine loses power, or a disk dies. Was the write saved? That depends entirely on what the system did *before* acknowledging, and acknowledging earlier is always faster, which is why systems are tempted to do it.
    `,
    mechanism: md`
      Durability is defined relative to a failure: "survives a process crash", "survives a machine loss", "survives a data-centre loss". Each requires something different before the acknowledgement:

      - **Process crash:** the data has left the process's memory, for example written to the OS.
      - **Power loss:** the data is on stable storage. \`write()\` puts it in the OS page cache; only \`fsync\` (or a disk with power-loss protection) makes it survive power loss. Databases commit by fsyncing a write-ahead log.
      - **Machine or disk loss:** the data is on another machine. Synchronous replication waits for a replica to confirm before acknowledging; asynchronous replication does not, so a failover can lose the last few transactions.
      - **Region loss:** the data is in another region, with cross-region latency on every write if it must be synchronous.

      The design rule: **an acknowledgement is a promise, and it must not be sent before the promise is true.** A server that acks an edit and then batches it to disk a second later has promised durability it does not have; a crash in that second loses acknowledged work. Batching is fine as long as acknowledgements wait for the batch. That is *group commit*: the same throughput, at a few milliseconds of latency.
    `,
    assumptions: [
      "Storage hardware honours flushes (some consumer disks and virtualized layers do not).",
      "The failure model is explicit: which failures must not lose data, and which are acceptable.",
    ],
    alternatives: [
      { name: "Acknowledge before durable, accept loss", when: "The data can be regenerated or its loss is cheap: metrics, caches, presence." },
      { name: "Client-side retention until durable ack", when: "The client keeps unacknowledged data and resends it, so loss on the server side is recoverable." },
    ],
    failureModes: [
      { name: "Ack before flush", description: "Acknowledged writes vanish on crash." },
      { name: "Async replica failover", description: "The primary dies; the promoted replica lacks the last transactions that clients were told were committed." },
      { name: "Durable but unreachable", description: "Data is safe on a single machine that is down, which is durable but not available." },
    ],
    implementations: [
      { name: "fsync / fdatasync on a log", note: "The basic mechanism databases use at commit." },
      { name: "Synchronous replication (synchronous_commit, quorum writes)", note: "Survives machine loss at the cost of a network round trip per commit." },
      { name: "Object stores", note: "Replicate across facilities before acknowledging a PUT." },
    ],
    claims: [
      {
        id: "write-saved",
        statement: "Once write() returns successfully, the data will survive a power failure.",
        verdict: "fails",
        explanation: "write() hands data to the OS page cache. Only a flush to stable storage (fsync) makes it survive power loss.",
      },
      {
        id: "replica-safe",
        statement: "With an asynchronous replica, a primary failure never loses committed transactions.",
        verdict: "fails",
        explanation:
          "Asynchronous replication acknowledges before the replica has the data. Transactions committed in the last moments before the failure may not exist on the replica that gets promoted.",
      },
      {
        id: "batching",
        statement: "Batching writes to disk necessarily weakens durability.",
        verdict: "fails",
        explanation:
          "Only if acknowledgements are sent before the batch is flushed. Group commit flushes many writes together and acknowledges each after the flush, keeping the guarantee while improving throughput.",
      },
    ],
    explain: {
      prompt: "Explain what \"durable\" means for an acknowledged write, and where batching does and does not weaken it.",
      rubric: [
        { id: "relative", text: "Durability is relative to a failure model (process, power, machine, region)." },
        { id: "mechanism", text: "Names the mechanism for at least one level: fsync for power loss, synchronous replication for machine loss." },
        { id: "ack-after", text: "Acknowledgement must come after the data is durable to the promised level; batching is safe only if acks wait for the flush." },
      ],
    },
    relatedConceptIds: ["transactions", "event-log", "object-storage"],
  },
  {
    id: "state-machines",
    title: "State machines for business state",
    domain: "storage",
    summary:
      "Modelling an entity's lifecycle as explicit states and allowed transitions, enforced with conditional updates so concurrent or stale actors cannot corrupt it.",
    problem: md`
      An order, a payment or a job is touched by many actors: the API, workers, webhooks, reconcilers, admins. Each one sets a status. Without rules, a late or duplicate actor can move a \`paid\` order back to \`pending\`, resurrect a deleted video, or ship something twice.
    `,
    mechanism: md`
      Define the states and the **allowed transitions** explicitly, for example \`created → processing → succeeded | failed\`, \`succeeded → refunded\`. Then enforce each transition at the point of truth with a **conditional update**:

      \`\`\`sql
      UPDATE payments SET status = 'succeeded', succeeded_at = now()
      WHERE id = $1 AND status = 'processing';
      \`\`\`

      The \`WHERE status = 'processing'\` clause makes the database the arbiter. If two actors race, exactly one update matches a row; the other affects zero rows and can treat that as "someone got there first". If a stale event tries to regress a terminal state, it matches nothing.

      Design notes:

      - **Make uncertainty a state.** "We sent the request and do not know the result" is real, and it needs its own state (\`processing\`, \`unknown\`) with a defined way out ([[reconciliation]]). Guessing turns uncertainty into incorrect data.
      - **Terminal states are terminal.** Corrections such as refunds or reversals are new transitions or new entities, not overwrites of history.
      - **Side effects attach to transitions,** and run only for the actor whose conditional update succeeded, ideally through a [[transactional-outbox]].
      - **Record why.** Store which event or actor caused each transition: an append-only history makes "how did this get here?" answerable.
    `,
    assumptions: [
      "Every actor that changes the state goes through the same conditional transitions.",
      "The state lives in one place that supports atomic conditional updates.",
    ],
    alternatives: [
      { name: "Derive state from an event log", when: "History matters as much as current state; the state machine is then enforced when appending events." },
      { name: "Workflow engine", when: "The lifecycle has many steps with timers, retries and human tasks between them." },
    ],
    failureModes: [
      { name: "Unconditional updates", description: "Last writer wins, regardless of whether its information is current." },
      { name: "No state for 'unknown'", description: "Timeouts are recorded as failures and later contradicted by reality." },
      { name: "Side effects outside the transition", description: "Two actors both send the email because neither checked whether its transition won." },
    ],
    implementations: [
      { name: "Status column + conditional UPDATE", note: "Check affected-row count to know whether you won." },
      { name: "Check constraints / triggers", note: "Reject invalid transitions in the database itself." },
      { name: "Typed state machine in code", note: "Encode allowed transitions; still enforce atomically in storage." },
    ],
    claims: [
      {
        id: "zero-rows",
        statement: "A conditional update that affects zero rows should be treated as an error and retried.",
        verdict: "depends",
        explanation:
          "Usually it means another actor already made the transition, or the entity has moved on. Retrying would be wrong. Check the current state and decide; often the right response is \"already done\".",
      },
      {
        id: "app-check",
        statement: "Reading the status in application code, checking the transition is valid, then writing it is as safe as a conditional update.",
        verdict: "fails",
        explanation:
          "Between the read and the write, another actor can change the status. The check and the write must be one atomic operation.",
      },
      {
        id: "unknown-state",
        statement: "A payment whose provider call timed out should be marked failed so the user can retry.",
        verdict: "fails",
        explanation:
          "The charge may have succeeded. Marking it failed invites a second charge. It belongs in an explicit unknown or processing state until the outcome is learned.",
      },
    ],
    explain: {
      prompt: "Explain how a status column plus conditional updates protects an entity from concurrent and out-of-order actors.",
      rubric: [
        { id: "explicit", text: "States and allowed transitions are defined explicitly." },
        { id: "conditional", text: "Each transition is an atomic update conditioned on the expected current state." },
        { id: "zero-rows", text: "A losing or stale actor's update matches zero rows, which it treats as information rather than failure." },
        { id: "unknown", text: "Uncertain outcomes get their own state rather than a guess.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["concurrency-control", "idempotency", "transactions", "reconciliation"],
  },
  {
    id: "online-migrations",
    title: "Online data migrations",
    domain: "storage",
    summary:
      "Moving live data to a new schema or store without downtime: write to both, backfill the past, verify, switch reads, then switch writes, with a way back at every step.",
    problem: md`
      Data outgrows its home: a table needs a new shape, a database needs sharding, a store needs replacing. The system cannot stop while billions of rows move, and every row keeps changing during the copy. A naive "copy, then switch" loses every write made during the copy, and a big-bang cutover has no way back if the new store is wrong.
    `,
    mechanism: md`
      The safe pattern moves data in reversible steps, verifying at each one:

      1. **Dual write.** Every new write goes to the old store (still the source of truth) and the new one. Writes can be mirrored in application code, through a change log (database replication, CDC, an audit log), or by tailing the binlog. A log is harder to get wrong than scattered application writes.
      2. **Backfill.** Copy historical data into the new store. The backfill must not overwrite newer dual-written values (use versions, timestamps or "insert if absent"), and it must be throttled so it does not starve production traffic.
      3. **Verify.** Compare the stores: sample rows, count by key range, and run **shadow (dark) reads** that query both and alert on mismatches while users still get the old answer.
      4. **Switch reads**, gradually (by percentage or tenant), keeping dual writes so you can switch back.
      5. **Switch writes** so the new store becomes the source of truth. Often this is a brief pause, or a log-based catch-up followed by redirecting traffic. Reverse replication keeps the old store current so rollback stays possible.
      6. **Clean up**: stop writing the old store and delete it once nothing reads it.

      The order matters: until step 5, the old store is authoritative and every step can be undone.
    `,
    assumptions: [
      "Writes can be captured completely (in code or from a log).",
      "Rows have a version or timestamp so the backfill can avoid clobbering newer data.",
      "The data can be compared between stores cheaply enough to verify.",
    ],
    alternatives: [
      { name: "Maintenance window", when: "Brief downtime is acceptable and the dataset copies within it." },
      { name: "Expand/contract schema changes", when: "The change is to columns in one database: add the new shape, migrate code, remove the old." },
      { name: "Leave old data in place", when: "Only new data needs the new store; old data can be read from the old one until it ages out." },
    ],
    failureModes: [
      { name: "Lost writes during the copy", description: "Writes that arrive between snapshot and switch never reach the new store." },
      { name: "Backfill clobbers newer data", description: "An old snapshot value overwrites a newer dual-written one." },
      { name: "Partial dual writes", description: "One store's write fails and the other's succeeds, so they diverge silently." },
      { name: "No way back", description: "Writes moved to the new store with nothing keeping the old one current." },
    ],
    implementations: [
      { name: "gh-ost / pt-online-schema-change", note: "Shadow table plus change capture, then an atomic table swap (MySQL)." },
      { name: "Postgres logical replication", note: "Stream changes to a new cluster, then fail over." },
      { name: "Scientist-style experiments", note: "Run old and new read paths side by side and report differences." },
    ],
    claims: [
      {
        id: "copy-then-switch",
        statement: "Copying a snapshot and then pointing the application at the new store is safe if the copy is fast.",
        verdict: "fails",
        explanation: "Every write between the snapshot and the switch is lost, however fast the copy. Changes must be captured continuously until cutover.",
      },
      {
        id: "reads-first",
        statement: "Switching reads before writes keeps a rollback path open.",
        verdict: "holds",
        explanation: "While the old store is still written as the source of truth, reads can move back instantly. Once writes move, rollback needs reverse replication.",
      },
      {
        id: "backfill-order",
        statement: "The backfill can blindly upsert every historical row into the new store.",
        verdict: "fails",
        explanation: "A row updated by dual writes after the snapshot was taken would be overwritten by its older snapshot value. Compare versions or insert only if absent.",
      },
    ],
    explain: {
      prompt: "Explain how to move a heavily written table to a new store without downtime or data loss.",
      rubric: [
        { id: "dual", text: "Capture all new writes to both stores (or via a change log) before backfilling." },
        { id: "backfill", text: "Backfill history without overwriting newer values, throttled." },
        { id: "verify", text: "Verify with comparisons or shadow reads before switching." },
        { id: "reversible", text: "Switch reads, then writes, keeping a rollback path." },
      ],
    },
    relatedConceptIds: ["replication", "event-log", "partitioning", "reconciliation"],
  },
  {
    id: "lsm-trees",
    title: "Log-structured storage (LSM trees)",
    domain: "storage",
    summary:
      "Storage engines that turn every write into a sequential append and merge files in the background: very fast writes, at the cost of compaction, tombstones and more expensive reads.",
    problem: md`
      Updating data in place (as B-tree databases do) means random disk writes, and random writes are the slowest thing a disk does. Write-heavy systems like chat history, metrics and event logs want writes as cheap as an append.
    `,
    mechanism: md`
      An LSM (log-structured merge) tree never updates in place:

      1. A write is appended to a **commit log** (for durability) and inserted into an in-memory sorted table, the **memtable**. Nothing on disk is modified. This is why writes are fast.
      2. When the memtable fills, it is flushed to disk as an immutable sorted file (an **SSTable**).
      3. A read must check the memtable and then potentially **several SSTables**, newest first, merging the results. Bloom filters and partition indexes skip files that cannot contain the key, but reads are still costlier than writes.
      4. **Compaction** runs in the background, merging SSTables, discarding overwritten values and keeping the number of files a read must touch small. It consumes disk I/O and CPU that production traffic also needs.
      5. A delete cannot erase a value from an immutable file, so it writes a **tombstone** marker. Tombstones are kept until compaction can remove them safely (after a grace period, so replicas that missed the delete do not resurrect the value). A read across many tombstones must still scan them all.

      The engine trades read work and background compaction for cheap writes. Designs on top of it should keep partitions bounded and avoid read patterns that scan many deleted rows.
    `,
    assumptions: [
      "The workload is write-heavy or append-mostly.",
      "Reads mostly fetch recent data or single partitions.",
      "Background compaction has spare I/O to run.",
    ],
    alternatives: [
      { name: "B-tree storage (Postgres, MySQL InnoDB)", when: "Reads dominate, updates are in place, and you want predictable read latency." },
      { name: "Append-only object storage", when: "Data is written once in large batches and rarely read." },
    ],
    failureModes: [
      { name: "Compaction falls behind", description: "File counts grow, reads touch more files, and latency climbs." },
      { name: "Tombstone scans", description: "A read over a range of deleted rows scans every tombstone and can stall the node." },
      { name: "Oversized partitions", description: "Huge partitions make compaction and repair slow and memory-hungry." },
      { name: "Resurrected deletes", description: "Tombstones dropped before every replica saw them let deleted data come back." },
    ],
    implementations: [
      { name: "RocksDB / LevelDB", note: "Embedded LSM engines inside many databases and services." },
      { name: "Cassandra / ScyllaDB", note: "Distributed wide-column stores built on SSTables." },
      { name: "HBase, Bigtable", note: "Wide-column stores on LSM storage." },
    ],
    claims: [
      {
        id: "reads-cheap",
        statement: "In an LSM store, reads are cheaper than writes.",
        verdict: "fails",
        explanation: "Writes are an append plus a memory insert. A read may consult the memtable and several SSTables and merge results.",
      },
      {
        id: "delete-frees",
        statement: "Deleting a row in an LSM store frees its space immediately.",
        verdict: "fails",
        explanation: "A delete writes a tombstone. Space is reclaimed only when compaction merges the tombstone with the data it shadows, after a grace period.",
      },
      {
        id: "bounded-partitions",
        statement: "Bounding partition size (for example by bucketing by time) helps compaction and read latency.",
        verdict: "holds",
        explanation: "Smaller partitions compact, repair and stream faster, and a read for recent data touches a small, recent partition.",
      },
    ],
    explain: {
      prompt: "Explain why LSM trees make writes cheap and what they cost in return.",
      rubric: [
        { id: "append", text: "Writes append to a log and a memtable; no in-place disk updates." },
        { id: "reads", text: "Reads may check several SSTables, so they cost more." },
        { id: "compaction", text: "Background compaction merges files and consumes I/O." },
        { id: "tombstones", text: "Deletes are tombstones that must be scanned until compacted.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["durability", "event-log", "partitioning"],
  },
];
