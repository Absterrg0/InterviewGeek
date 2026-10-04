import type { ConceptInput } from "@/lib/domain/content";
import { md } from "../md";

export const concurrencyConcepts: ConceptInput[] = [
  {
    id: "concurrency-control",
    title: "Concurrency control",
    domain: "concurrency",
    summary:
      "Making read-decide-write sequences safe when other actors may change the same data in between: locks, conditional writes and constraints.",
    problem: md`
      Most business logic reads some state, decides, and writes: "if the seat is free, book it", "if the job is unclaimed, claim it". When two actors do this concurrently, both can read "free", both decide "book", and both write. Each step was correct; the interleaving was not.
    `,
    mechanism: md`
      The fix is always to make *read-decide-write* behave as one atomic step with respect to the data involved. There are three main families of mechanism:

      - **Pessimistic locking.** Take a lock before reading (\`SELECT … FOR UPDATE\`, a mutex, an advisory lock). Others wait. Simple to reason about; costs waiting, deadlock risk, and locks held across slow work.
      - **Optimistic concurrency.** Read with a version, then write *conditionally*: \`UPDATE … SET …, version = version + 1 WHERE id = $1 AND version = $2\`. If someone else wrote first, zero rows match and you retry or report a conflict. No waiting; costs retries under contention. HTTP's \`If-Match\` with ETags is the same idea.
      - **Constraints.** Let the database enforce the invariant directly: a unique index on (seat, showtime), a check constraint, a foreign key. The second writer gets an error. This is the most robust option, because it holds no matter which code path writes.

      Choose by contention and by the duration of the critical section. Rare conflicts favour optimistic writes; hot rows with short critical sections favour locks; invariants about uniqueness are best expressed as constraints.

      In distributed settings the "lock" may be a [[leases-and-fencing|lease]], and the conditional write must carry a fencing token, because a lock holder can stall and lose its lock without knowing.
    `,
    assumptions: [
      "All writers go through the same mechanism; one unguarded path breaks the invariant.",
      "Conflict handling (retry, reject, merge) is defined for the losing side.",
    ],
    alternatives: [
      { name: "Single writer", when: "Route all writes for a key to one process or thread, so concurrent access cannot happen. See [[partitioning]]." },
      { name: "Commutative operations", when: "The operations can be applied in any order with the same result (increments, CRDTs)." },
      { name: "Serializable isolation", when: "Invariants span many rows and you prefer the database to detect conflicts and abort." },
    ],
    failureModes: [
      { name: "Check-then-act", description: "Read and write are separate statements with nothing preventing interleaving." },
      { name: "Lost update", description: "Two writers read, modify and write back full rows; the second silently overwrites the first." },
      { name: "Deadlock", description: "Two transactions lock rows in opposite orders and wait on each other forever (until the database kills one)." },
      { name: "Locks held across network calls", description: "A slow dependency turns every waiter into a timeout." },
    ],
    implementations: [
      { name: "SELECT … FOR UPDATE / SKIP LOCKED", note: "Row locks; SKIP LOCKED lets job claimers bypass rows being claimed." },
      { name: "Version columns / ETags", note: "Optimistic concurrency with conditional writes." },
      { name: "Unique and check constraints", note: "Invariants enforced by the database for every writer." },
      { name: "Compare-and-set in key-value stores", note: "Redis WATCH, DynamoDB condition expressions, etcd transactions." },
    ],
    claims: [
      {
        id: "check-first",
        statement: "Checking that a username is available before inserting it prevents duplicate usernames.",
        verdict: "fails",
        explanation: "Two requests can both check, both see \"available\", and both insert. Only a unique constraint, or a lock spanning both steps, prevents it.",
      },
      {
        id: "optimistic-always",
        statement: "Optimistic concurrency is always faster than locking.",
        verdict: "depends",
        explanation:
          "Under low contention it avoids waiting entirely. On a hot row, most attempts fail and retry, and the wasted work can exceed what a lock queue would have cost.",
      },
      {
        id: "constraint-robust",
        statement: "A database constraint protects an invariant even from code paths that forgot about it.",
        verdict: "holds",
        explanation: "That is its main advantage over application-level checks: admin scripts, backfills and new endpoints are all held to it.",
      },
    ],
    explain: {
      prompt: "Two requests try to book the last seat at the same time. Explain how the bug happens and two ways to prevent it.",
      rubric: [
        { id: "interleave", text: "Both read 'available' before either writes; each step is fine but the interleaving is not." },
        { id: "mechanism-1", text: "Describes one correct mechanism: row lock, conditional update, or unique constraint." },
        { id: "mechanism-2", text: "Describes a second, and when each is preferable (contention, duration)." },
      ],
    },
    relatedConceptIds: ["transactions", "state-machines", "leases-and-fencing", "idempotency"],
  },
  {
    id: "ordering",
    title: "Ordering",
    domain: "concurrency",
    summary:
      "There is no global 'now' in a distributed system. Order exists only where something assigns it, so decide which order you need and who assigns it.",
    problem: md`
      Two users edit the same paragraph; two webhooks for the same payment arrive; two servers both log events. Which happened first? Wall clocks on different machines disagree by milliseconds or more, messages are delayed and retried, and "arrived first" is not "happened first".
    `,
    mechanism: md`
      Order exists where something establishes it:

      - **A single sequencer.** One process (or one database row, or one log partition) assigns increasing sequence numbers. Everything it sequences has a total order, which is the order everyone agrees on. This is how a primary database orders transactions, how a Kafka partition orders records, and how a collaborative editor's server orders operations. The cost: all writes for that sequence go through one place.
      - **Per-key order.** Usually you only need order *within* an entity: one user's messages, one document's operations, one account's transactions. [[partitioning|Partition]] by that key and sequence each partition independently. You get parallelism across keys and order within each.
      - **Causal order.** Sometimes "B was written by someone who had seen A" is all that matters. Version vectors or Lamport timestamps capture *happened-before* without a central sequencer, but leave truly concurrent events unordered, so you need a [[conflict-resolution]] rule for them.
      - **Wall-clock timestamps.** Useful for display, dangerous for correctness: clock skew and NTP adjustments mean a later event can carry an earlier timestamp. "Last write wins by timestamp" silently discards writes.

      Over a single TCP or WebSocket connection, messages arrive in the order sent. Across connections, reconnects, retries or multiple senders, nothing is ordered unless you order it.
    `,
    assumptions: [
      "You know which order the application actually needs (total, per-key, or causal).",
      "The sequencer is unique, and its uniqueness is enforced during failover (fencing, unique constraints on position).",
    ],
    alternatives: [
      { name: "Commutative operations", when: "Results do not depend on order, so no ordering is needed at all (counters, sets, CRDTs)." },
      { name: "Hybrid logical clocks", when: "You need timestamps that respect causality and stay close to wall time across nodes." },
    ],
    failureModes: [
      { name: "Ordering by client timestamps", description: "A device with a wrong clock reorders history or always wins." },
      { name: "Two sequencers", description: "During failover both assign sequence numbers, and history forks." },
      { name: "Assuming retries preserve order", description: "A retried message lands after a later one." },
    ],
    implementations: [
      { name: "Database sequences / identity columns", note: "Total order per sequence, gaps possible." },
      { name: "Log partitions (Kafka, Kinesis)", note: "Total order within a partition, keyed by entity." },
      { name: "Per-entity version counters", note: "Increment with a conditional update to order changes to one row." },
      { name: "Lamport clocks, version vectors", note: "Causal order without a central authority." },
    ],
    claims: [
      {
        id: "timestamps",
        statement: "Sorting events from different servers by their timestamps gives the order they happened in.",
        verdict: "fails",
        explanation: "Clocks drift and are adjusted; skew of milliseconds to seconds is normal. Two events close together can easily be ordered backwards.",
      },
      {
        id: "per-key",
        statement: "Most applications need ordering only per entity, not globally.",
        verdict: "holds",
        explanation: "A user's messages must be in order; messages from unrelated users rarely need a mutual order. Per-key order scales out; global order does not.",
      },
      {
        id: "websocket-order",
        statement: "Messages sent by one client over a single WebSocket connection arrive at the server in the order sent.",
        verdict: "holds",
        explanation: "TCP preserves order within a connection. The guarantee ends at reconnects: messages resent on a new connection can interleave with others.",
      },
    ],
    explain: {
      prompt: "Explain how you would guarantee that every client sees a document's edits in the same order, and why you would not use timestamps.",
      rubric: [
        { id: "sequencer", text: "A single sequencer per document assigns increasing positions." },
        { id: "clocks", text: "Wall clocks are skewed and adjusted, so timestamps cannot define correct order." },
        { id: "unique", text: "The sequencer must be unique even during failover (fencing or unique (doc, seq) constraint).", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["event-log", "partitioning", "conflict-resolution", "leases-and-fencing"],
  },
  {
    id: "conflict-resolution",
    title: "Conflict resolution and convergence",
    domain: "concurrency",
    summary:
      "When replicas accept concurrent changes, a deterministic rule must merge them so every replica ends in the same state without losing intent.",
    problem: md`
      Two people type into the same sentence at the same moment; a phone edits a note offline while a laptop edits it online. Both changes were made against the same starting state, and both are legitimate. Applying them one after the other, naively, can garble the text or silently drop one of them.
    `,
    mechanism: md`
      There are three broad approaches, each with a different idea of what "correct" means:

      - **Last writer wins (LWW).** Keep the change with the latest timestamp or version. Simple and convergent, but it **discards** the other change. Fine for a profile photo; wrong for a paragraph two people are editing.
      - **Operational transformation (OT).** Clients send operations ("insert 'x' at 12") tagged with the revision they were based on. A central server, the [[ordering|sequencer]], transforms each incoming operation against the operations it missed ("someone inserted 3 characters before position 12, so this is now position 15"), assigns it a position, and broadcasts it. It depends on that central ordering, and the transformation functions are subtle to get right.
      - **CRDTs (conflict-free replicated data types).** Data structures whose operations **commute**: applying the same set of operations in any order yields the same state. For text, each character gets a unique, stable identity and a position defined relative to its neighbours, so "insert after character (alice, 41)" means the same thing on every replica. Peers can merge without a central authority, which suits offline editing. The cost is metadata overhead, and garbage collection of deleted items is tricky.

      Convergence (everyone ends with the same text) is the guarantee all three give. **Intent preservation** (the merged result reflects what each person meant) is where they differ, and no algorithm can fully decide it; two people rewriting the same sentence still need a human.
    `,
    assumptions: [
      "Every replica eventually receives every operation (delivery is reliable, possibly duplicated).",
      "Operations are applied idempotently. Duplicates are detected by operation ID.",
      "For OT: a single authority orders operations per document.",
    ],
    alternatives: [
      { name: "Locking (one editor at a time)", when: "Concurrent editing is rare, and simplicity and predictability matter more than fluid collaboration." },
      { name: "Manual merge (git-style)", when: "Changes are large and infrequent, and users can review conflicts." },
    ],
    failureModes: [
      { name: "LWW on rich content", description: "One user's paragraph silently disappears." },
      { name: "Non-convergence", description: "A transformation bug or missed operation leaves replicas permanently different; detect with periodic checksums." },
      { name: "Unbounded metadata", description: "CRDT tombstones accumulate for documents with long histories." },
    ],
    implementations: [
      { name: "ShareDB, ot.js", note: "OT with a central server." },
      { name: "Yjs, Automerge", note: "Sequence and map CRDTs with sync protocols." },
      { name: "LWW registers", note: "Per-field last-writer-wins, common in mobile sync products." },
    ],
    claims: [
      {
        id: "lww-text",
        statement: "Last-writer-wins on the whole document is acceptable for a collaborative editor if updates are sent often enough.",
        verdict: "fails",
        explanation: "Any two edits made before seeing each other conflict, and one is discarded. Sending more often narrows the window but never closes it, and offline edits make it wide.",
      },
      {
        id: "crdt-server",
        statement: "CRDTs make a central server unnecessary for correctness.",
        verdict: "holds",
        explanation:
          "Convergence comes from commutativity, not from a sequencer. A server is still useful for durability, access control, history and fan-out, but replicas would converge without it.",
      },
      {
        id: "intent",
        statement: "Convergence guarantees that the merged document says what both authors intended.",
        verdict: "fails",
        explanation:
          "It guarantees everyone sees the *same* result. Two people rewriting the same sentence can converge to a mixture neither intended.",
      },
    ],
    explain: {
      prompt: "Compare operational transformation and CRDTs for collaborative text editing: what each relies on, and when you would choose each.",
      rubric: [
        { id: "ot", text: "OT transforms operations against concurrent ones and relies on a central ordering authority." },
        { id: "crdt", text: "CRDT operations commute via stable element identities, so any delivery order converges without a central authority." },
        { id: "choice", text: "Ties the choice to requirements, e.g. offline/peer-to-peer favours CRDTs; existing central server and simpler data favours OT." },
        { id: "lww", text: "Explains why last-writer-wins loses work for shared text.", weight: "supporting" },
      ],
    },
    relatedConceptIds: ["ordering", "event-log", "idempotency"],
  },
];
