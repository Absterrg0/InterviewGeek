import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const realtimeCollaboration = {
  id: "realtime-collaboration",
  title: "Real-time collaborative editor",
  searchTitle: "Design a Collaborative Editor (Google Docs)",
  premise:
    "Many people edit the same document at once over unreliable connections. Every client must converge on the same text, no acknowledged keystroke may be lost, and daily deploys must not kick anyone out.",
  difficulty: "advanced",
  estimatedMinutes: 60,
  scenario: md`
    You are building the editor for a team documentation product: engineering specs, meeting notes, incident write-ups. Documents are structured text, typically 5-50 KB and occasionally a couple of megabytes. Usually one to five people edit a document together; the company all-hands doc has thirty editors and two hundred people watching.

    Users expect to see each other's keystrokes within a fraction of a second, along with live cursors and avatars. They also edit on trains, close laptop lids mid-sentence, and leave tabs open for a week.

    The prototype sends the whole document to the server a second after each change, and the server keeps whichever copy arrived last. In testing, two people typing at once kept losing each other's sentences.
  `,
  objectives: [
    "Choose a transport from the traffic pattern, not the fashion.",
    "Give each document a single sequencer, and keep it single during deploys and failures.",
    "Make concurrent edits converge without losing anyone's work.",
    "Define what an acknowledgement means, and make reconnection lossless.",
    "Separate durable state (edits) from soft state (presence) and treat each appropriately.",
    "Scale fan-out for one hot document without breaking ordering.",
  ],
  prerequisites: ["persistent-connections", "ordering"],
  requirements: {
    functional: [
      "Several users edit the same document concurrently and see each other's changes live.",
      "Users see who else is in the document and where their cursors are.",
      "Edits made offline, for minutes or hours, merge when the client reconnects.",
      "Users can browse and restore earlier versions.",
      "Documents open quickly even after years of edits.",
    ],
    nonFunctional: [
      "All clients converge on identical content once they have received the same edits.",
      "No acknowledged edit is ever lost.",
      "Remote edits appear within about 200 ms on decent connections.",
      "Deploying servers loses no edits and does not force a reload.",
      "One slow or misbehaving client cannot degrade a session for everyone else.",
    ],
  },
  constraints: [
    "About 50,000 documents edited per day and 20,000 concurrent connections at peak; most documents have at most five editors at once.",
    "An active typist generates 5-10 operations per second; at any moment roughly a tenth of connected users are typing.",
    "Servers run behind a load balancer that supports WebSockets and drains connections for up to 30 s during daily deploys.",
    "Postgres, Redis and object storage are available.",
  ],
  assumptions: [
    "Messages on a single WebSocket connection arrive in order, but connections drop without warning.",
    "Clients may reconnect to a different server than before, with arbitrarily stale state.",
    "Users are authenticated and per-document permissions are checked on connect.",
    "Client clocks are unreliable and are not used for ordering.",
  ],
  competencies: [
    {
      id: "connection-model",
      label: "Connection model",
      description: "Choosing and operating the channel between clients and servers.",
    },
    {
      id: "sequencing",
      label: "Ordering and ownership",
      description: "One authority per document, kept unique through failures and deploys.",
    },
    {
      id: "convergence",
      label: "Convergence",
      description: "Merging concurrent and offline edits so every replica agrees and nothing is lost.",
    },
    {
      id: "durability",
      label: "Durability of edits",
      description: "What an acknowledgement promises, and how reconnects recover everything owed.",
    },
    {
      id: "soft-state",
      label: "Ephemeral vs durable state",
      description: "Giving presence and cursors the cheap treatment they deserve.",
    },
    {
      id: "fan-out",
      label: "Fan-out under load",
      description: "Delivering one document's edits to many readers without stalling its writers.",
    },
  ],
  system: {
    components: [
      {
        id: "editor",
        label: "Editor client",
        kind: "client",
        responsibility:
          "Applies local edits immediately, keeps unacknowledged ops in a pending buffer, and integrates remote ops by sequence number.",
        durableState: "Pending ops persisted in IndexedDB so offline edits survive a closed tab.",
        position: { col: 0, row: 1 },
      },
      {
        id: "router",
        label: "Document router",
        kind: "edge",
        responsibility: "Routes every connection for a document to that document's current owner.",
        position: { col: 1, row: 1 },
      },
      {
        id: "owner",
        label: "Document owner",
        kind: "service",
        responsibility:
          "The single sequencer for a document: validates and integrates ops, appends them durably, then acks and broadcasts. Holds presence in memory.",
        position: { col: 2, row: 1 },
      },
      {
        id: "oplog",
        label: "Postgres op log",
        kind: "database",
        responsibility: "Durable, ordered history of every operation, and the ownership epoch for each document.",
        durableState: "ops(doc_id, seq, op_id, client_id, payload) with a unique (doc_id, seq); doc_owners(doc_id, epoch, lease).",
        position: { col: 3, row: 1 },
      },
      {
        id: "pubsub",
        label: "Pub/sub",
        kind: "stream",
        responsibility: "Carries a hot document's sequenced ops from its owner to the edge servers holding its viewers.",
        position: { col: 2, row: 0 },
      },
      {
        id: "edge",
        label: "Fan-out edge",
        kind: "service",
        responsibility:
          "Holds read-mostly connections, batches frames per viewer, and drops viewers that fall too far behind into catch-up mode.",
        position: { col: 1, row: 0 },
      },
      {
        id: "viewers",
        label: "Viewers",
        kind: "client",
        responsibility: "Read-mostly participants in a large document.",
        position: { col: 0, row: 0 },
      },
      {
        id: "snapshots",
        label: "Snapshot storage",
        kind: "object-store",
        responsibility: "Holds document snapshots, each tagged with the exact sequence number it includes.",
        durableState: "snapshots/{doc}/{seq}",
        position: { col: 3, row: 0 },
      },
      {
        id: "snapshotter",
        label: "Snapshotter",
        kind: "worker",
        responsibility: "Folds ops into periodic snapshots and compacts old history into coarser versions.",
        position: { col: 4, row: 1 },
      },
    ],
    flows: [
      { id: "socket", from: "editor", to: "router", label: "WebSocket: ops, acks, remote ops, presence", kind: "push" },
      { id: "route", from: "router", to: "owner", label: "Route by document id to the current owner", kind: "push" },
      { id: "append", from: "owner", to: "oplog", label: "Append ops at next seq (batched, epoch-fenced)", kind: "request" },
      { id: "load", from: "owner", to: "snapshots", label: "Load latest snapshot on open", kind: "data" },
      { id: "publish", from: "owner", to: "pubsub", label: "Publish sequenced ops", kind: "async" },
      { id: "subscribe", from: "pubsub", to: "edge", label: "Per-document subscription", kind: "async" },
      { id: "frames", from: "edge", to: "viewers", label: "Batched frames, bounded buffers", kind: "push" },
      { id: "fold", from: "snapshotter", to: "oplog", label: "Read ops since the last snapshot", kind: "request" },
      { id: "write-snapshot", from: "snapshotter", to: "snapshots", label: "Write snapshot tagged with its seq", kind: "data" },
    ],
    invariants: [
      {
        id: "single-sequence",
        statement: "Each document has exactly one history: every sequence number is assigned once.",
        enforcedBy: ["owner", "oplog"],
        mechanism:
          "One owner per document, holding a lease with an epoch; appends are conditioned on the current epoch, and a unique (doc_id, seq) constraint rejects any second writer.",
      },
      {
        id: "ack-means-durable",
        statement: "An acknowledged op is never lost.",
        enforcedBy: ["owner", "oplog", "editor"],
        mechanism:
          "The owner acks only after the op's batch commits; clients keep every op until it is acked and resend on reconnect, deduplicated by op id.",
      },
      {
        id: "convergence",
        statement: "Clients that have applied the same set of ops show the same document.",
        enforcedBy: ["owner", "editor"],
        mechanism:
          "Ops are integrated through a convergent algorithm (server-ordered OT or a CRDT) and applied idempotently by op id.",
      },
      {
        id: "presence-expires",
        statement: "Nobody appears present for longer than a few seconds after they leave.",
        enforcedBy: ["owner"],
        mechanism: "Presence is soft state refreshed by heartbeats and expired on a TTL; it is never persisted.",
      },
    ],
  },
  stages: [
    // -----------------------------------------------------------------------
    {
      id: "size-the-problem",
      title: "Size the problem",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["persistent-connections", "conflict-resolution", "backpressure"],
      competencyIds: ["connection-model", "fan-out"],
      context: md`
        Real-time systems fail in ways that depend on numbers: message rates, fan-out factors, connection counts. Work some out before you choose anything. Useful figures: 20,000 connections at peak, about a tenth of users typing at any moment, 5-10 operations per second per typist, and one document with 30 editors and 200 viewers.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "whole-doc",
            statement: "Sending the whole document on each change works if the change is debounced to once a second.",
            verdict: "fails",
            explanation:
              "Bandwidth is the smaller problem. Whole-document last-write-wins means any two people typing within the same second overwrite each other, which is exactly the bug in testing. The unit of change has to be an *operation*, merged rather than replaced; see [[conflict-resolution]].",
          },
          {
            id: "polling-latency",
            statement: "Polling once a second cannot meet the ~200 ms latency goal.",
            verdict: "holds",
            explanation: "Average delay would be half a second plus request time, and polling faster multiplies requests for every idle client.",
          },
          {
            id: "all-hands-fanout",
            statement: "The all-hands document alone can require tens of thousands of outbound messages per second.",
            verdict: "holds",
            explanation:
              "30 editors × ~7 ops/s ≈ 200 ops/s, each delivered to ~230 participants, is about 46,000 messages a second for one document, unless you batch. Fan-out, not ingestion, is the hot path; see [[backpressure]].",
          },
          {
            id: "connections-fleet",
            statement: "20,000 concurrent WebSocket connections require a large server fleet.",
            verdict: "depends",
            explanation:
              "Idle connections are cheap on an event-driven server: tens of kilobytes each, so 20,000 fit in well under a gigabyte. What costs is message rate and per-connection buffering. A handful of servers holds the connections; the fleet size is set by ops and fan-out. See [[persistent-connections]].",
          },
          {
            id: "persist-every-op",
            statement: "Writing every operation durably to Postgres is infeasible at this scale.",
            verdict: "depends",
            explanation:
              "About 2,000 typists × ~7 ops/s ≈ 14,000 ops a second. As 14,000 separate committed transactions, that is a heavy load for one primary. Batched per document, committing every 10-20 ms with the ack waiting for the batch, it becomes a few hundred transactions a second carrying small rows, which is very manageable.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          Three numbers frame the design:

          - **~14,000 ops/s** inbound, so writes must be batched (without weakening acknowledgements).
          - **~46,000 msgs/s** for one hot document, so fan-out needs batching and its own capacity.
          - **20,000 connections**, which is less than it sounds. Connections are not the bottleneck; traffic is.

          And one non-number: concurrent edits are *normal*, not an edge case. The design has to merge rather than replace.
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "choose-the-transport",
      title: "Choose the transport",
      phase: "decide",
      dimensions: ["defend"],
      conceptIds: ["server-push", "persistent-connections"],
      competencyIds: ["connection-model"],
      context: md`
        Each active editor streams 5-10 small operations a second *to* the server and receives everyone else's *from* it, ideally within 200 ms. Order matters: an editor's operations depend on the ones before them.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should editor clients talk to the server?",
        options: [
          {
            id: "websocket",
            label: "One WebSocket per open document: ops up, acks and remote ops down",
            assessment: "sound",
            feedback:
              "High-rate, small, ordered messages in both directions are what WebSockets are for. One connection gives in-order delivery of a client's ops, minimal per-message overhead, and a natural place for heartbeats. You inherit reconnection and resumption, which the design needs anyway because clients go offline.",
          },
          {
            id: "sse-post",
            label: "Server-Sent Events for remote ops; an HTTP POST per local operation",
            assessment: "defensible",
            feedback:
              "Downstream is fine. Upstream, ten POSTs a second per typist adds HTTP overhead, and separate requests can arrive out of order (or retry out of order), so the server must reorder each client's ops by a client sequence number. It is workable, and sometimes chosen for proxy-hostile environments, but you rebuild what the socket gives you.",
          },
          {
            id: "long-poll",
            label: "Long polling for remote ops, POSTs for local ones",
            assessment: "defensible",
            feedback:
              "It delivers quickly and works everywhere, but every delivered batch costs a new request, messages between polls must be buffered per client, and you still have the POST ordering problem. It is a historical fallback rather than a design choice today.",
          },
          {
            id: "webrtc",
            label: "Peer-to-peer WebRTC data channels between editors",
            assessment: "flawed",
            feedback:
              "Thirty editors in a full mesh means 435 connections, NAT traversal failures, and no server that holds the durable history or enforces permissions. The requirement that no acknowledged edit is lost needs a durable party in the loop.",
          },
        ],
        rationale: {
          prompt: "What properties of this traffic decide the transport?",
          rubric: [
            {
              id: "bidirectional-rate",
              text: "Traffic is high-rate in both directions, so a persistent full-duplex channel fits.",
            },
            {
              id: "ordering",
              text: "A single connection preserves the order of a client's own ops; separate requests do not.",
            },
            {
              id: "costs",
              text: "Names what the choice costs: reconnection, heartbeats, deploy handling, routing.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Compare this with the status page in the video pipeline, where polling was the right call. The difference is the traffic: **a few updates over twenty minutes** versus **dozens of messages per second in both directions**. Same question, different constraints, different answer; see [[server-push]].

          The costs of the socket are now commitments: heartbeats to detect dead clients, a resume protocol for reconnects, and a plan for deploys. Several later stages are those commitments coming due.
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "where-a-document-lives",
      title: "Where does a document's live state live?",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["partitioning", "ordering", "publish-subscribe"],
      competencyIds: ["sequencing"],
      context: md`
        Five editors of one document may be connected to five different servers. Each op must be ordered relative to every other op for that document, persisted, and delivered to the other four within 200 ms.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should servers coordinate on a document?",
        options: [
          {
            id: "db-polling",
            label: "Any server accepts any client; servers write ops to Postgres and poll it for others' ops",
            assessment: "flawed",
            feedback:
              "Polling adds its interval to every edit's latency and multiplies database reads by the number of servers times the number of open documents. Ordering also depends on whichever insert commits first, and every server has to cope with it.",
          },
          {
            id: "any-server-pubsub",
            label: "Any server accepts any client; each op gets the next sequence number from Postgres, then is broadcast to other servers via pub/sub",
            assessment: "defensible",
            feedback:
              "It works. The database row lock on the document's counter is the sequencer, and pub/sub delivers. But every keystroke now waits for a round trip to a contended row before it can be ordered, every server holds a copy of every open document, and transforming ops needs the latest state on whichever server received them.",
          },
          {
            id: "single-owner",
            label: "Route every connection for a document to one owner server, which sequences, persists and broadcasts its ops",
            assessment: "sound",
            feedback:
              "One process holds the document in memory and assigns sequence numbers locally, so ordering costs nothing. Broadcast is local to that process. The cost moves to routing (a document-aware router or directory), to hot documents that outgrow one server, and to keeping ownership unique during deploys.",
          },
          {
            id: "client-sequenced",
            label: "Clients order ops by timestamp; servers just relay them",
            assessment: "flawed",
            feedback:
              "Client clocks disagree by seconds, so ops would be ordered wrongly and differently on different clients. Order needs a single authority, not a consensus of clocks; see [[ordering]].",
          },
        ],
        rationale: {
          prompt: "Why is your choice the right place for a document's ordering?",
          rubric: [
            {
              id: "single-sequencer",
              text: "Each document needs one authority assigning order; clocks cannot provide it.",
            },
            {
              id: "partition",
              text: "Partitioning by document gives each its own sequencer while documents scale out independently.",
            },
            {
              id: "new-problems",
              text: "Names what this creates: routing, hot documents, and keeping ownership unique during moves.",
              weight: "supporting",
            },
          ],
        },
      },
      reveals: { components: ["router", "owner"], flows: ["socket", "route"] },
      reveal: {
        reasoning: md`
          [[partitioning|Partitioning]] by document turns a distributed ordering problem into a **routing problem**. Within one owner, ordering is a counter in memory. The hard parts are now:

          - **Routing:** every connection for document 42 must reach its current owner. Consistent hashing at the router keeps most documents in place as servers come and go; a small directory (\`doc → owner, epoch\`) handles explicit moves.
          - **Uniqueness:** during a deploy or crash, two servers must never both act as owner. That is a lease with fencing, enforced at the op log; see [[leases-and-fencing]].
          - **Hot documents:** one owner handles one document's sequencing. The all-hands doc will test that.
        `,
        tradeoffs: [
          {
            choice: "Single owner per document",
            gains: "Free ordering, local broadcast, in-memory state.",
            costs: "Document-aware routing and an ownership handoff protocol.",
          },
          {
            choice: "Any server plus a database sequencer",
            gains: "Stateless routing; any server can serve any client.",
            costs: "A database round trip on a contended row for every op.",
          },
        ],
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "merging-concurrent-edits",
      title: "Merging concurrent edits",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["conflict-resolution", "ordering"],
      competencyIds: ["convergence"],
      context: md`
        Alice and Bob both see "The cat sat." Alice inserts "black " before "cat" at position 4. At the same moment, Bob deletes "sat" at positions 8-10. Each sends an op computed against the text *they* saw. Applied naively in the server's order, Bob's delete removes the wrong characters on Alice's machine. And offline users may send hours of such ops at once.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should concurrent edits be merged?",
        options: [
          {
            id: "lww",
            label: "Last write wins on each paragraph",
            assessment: "flawed",
            feedback:
              "Any two people editing the same paragraph at once lose one person's work. A finer grain only shrinks the window; for offline edits it is enormous.",
          },
          {
            id: "locking",
            label: "Lock a paragraph while someone is editing it",
            assessment: "defensible",
            feedback:
              "It is simple and always convergent, and some products do this. But locks held by a client that went offline need leases and timeouts, collaborators keep hitting \"Bob is editing\", and offline editing is impossible by definition.",
          },
          {
            id: "ot",
            label: "Operational transformation: the owner transforms each incoming op against the ops it had not seen, then sequences it",
            assessment: "sound",
            feedback:
              "With a single owner per document already in place, OT fits naturally: each op carries the sequence number it was based on, and the owner transforms it past everything since. Long offline sessions are the weak spot, because hours of divergent ops must be transformed against hours of others, which is expensive and historically bug-prone.",
          },
          {
            id: "crdt",
            label: "A sequence CRDT: every character has a stable identity, so ops commute and merge in any order",
            assessment: "sound",
            feedback:
              "Convergence no longer depends on ordering, so offline edits merge by simply exchanging ops. The owner still sequences ops for the log and catch-up, but correctness does not hinge on it. The cost is per-character metadata and tombstones that need compaction.",
          },
        ],
        rationale: {
          prompt: "Defend your choice against the requirement that offline edits must merge.",
          rubric: [
            {
              id: "concurrent-normal",
              text: "Concurrent edits to the same region are normal, so the merge must preserve both rather than choose one.",
            },
            {
              id: "mechanism",
              text: "Explains the mechanism: transformation against concurrent ops (OT) or commutative ops via stable identities (CRDT).",
            },
            {
              id: "offline",
              text: "Addresses offline: long divergence is expensive for OT and natural for CRDTs.",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Both OT and CRDTs guarantee **convergence**. They differ in *where* the correctness lives: OT relies on the central sequencer to transform ops in one agreed order, while CRDTs build it into the data structure so that order does not matter; see [[conflict-resolution]].

          The rest of this investigation works with either, because both still benefit from a server that assigns each op a **sequence number**: it gives the durable log an order, gives reconnecting clients a position to resume from, and gives history a timeline.

          What neither gives you is **intent**: two people rewriting the same sentence will converge on a mixture. That is a product problem (comments, suggestions, presence that shows who is where) rather than an algorithm problem.
        `,
        otherwise:
          "For structured data like form fields or task status, per-field last-write-wins is often fine, because a field is an atomic value rather than a sequence people type into together.",
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "trace-an-edit",
      title: "Trace one keystroke",
      phase: "model",
      dimensions: ["trace"],
      conceptIds: ["durability", "ordering", "idempotency"],
      competencyIds: ["durability", "sequencing"],
      context: md`
        Alice types a character. Follow the operation from her keyboard to Bob's screen. Getting the order right is what makes "no acknowledged edit is lost" true.
      `,
      interaction: {
        kind: "ordering",
        prompt: "Order the life of a single operation.",
        items: [
          { id: "apply-local", label: "Alice's client applies the op to her local document immediately" },
          { id: "pending", label: "Client gives the op an id (client id + counter) and adds it to the pending buffer" },
          { id: "send", label: "Client sends the op with the last sequence number it has seen" },
          { id: "integrate", label: "Owner checks permissions and integrates the op into the in-memory document" },
          { id: "append", label: "Owner appends the op to the log with the next sequence number; the batch commits" },
          { id: "ack", label: "Owner acks to Alice with the sequence number" },
          { id: "drop-pending", label: "Alice's client removes the op from its pending buffer" },
          { id: "broadcast", label: "Owner broadcasts the sequenced op to the document's other clients" },
          { id: "bob-applies", label: "Bob's client integrates the op and advances its last-seen sequence" },
        ],
        explanation: md`
          The orderings that carry guarantees:

          - **Apply locally first.** Alice's keystroke appears instantly; the network never sits between her and her own typing. That is why ops must merge (OT/CRDT) rather than wait.
          - **Durable before ack, ack before forgetting.** The client keeps the op until the ack; the owner acks only after the commit. At every moment, at least one party durably holds the op.
          - **Durable before broadcast.** If Bob saw an op that was then lost in a crash, his document would contain text that exists nowhere else, and reconnecting would make the two diverge. Broadcasting after the commit costs a few milliseconds and rules that out.
        `,
      },
      reveal: {
        reasoning: md`
          The design rule is an invariant about **custody**: an op is always held by someone who will not forget it, either the client's pending buffer (persisted to IndexedDB for offline use) or the durable log. Custody is handed over by the ack, and the ack is only sent once the log has it; see [[durability]].

          Op IDs make every step retryable: if Alice resends an op because she never saw its ack, the owner recognizes the ID and returns the existing sequence number instead of applying it twice; see [[idempotency]].
        `,
      },
      reveals: { components: [], flows: ["append"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "presence-and-cursors",
      title: "Presence and cursors",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["soft-state", "delivery-guarantees"],
      competencyIds: ["soft-state"],
      context: md`
        Avatars show who is in the document; coloured cursors show where they are. Cursors move with every keystroke and every click. When someone closes their laptop, their avatar should disappear within seconds.
      `,
      interaction: {
        kind: "decision",
        prompt: "Where should presence and cursor positions live?",
        options: [
          {
            id: "postgres-rows",
            label: "A Postgres row per user per document, updated on every cursor move",
            assessment: "flawed",
            feedback:
              "Cursor moves are as frequent as keystrokes, so this doubles database writes for data nobody needs a minute later. And a crashed client never deletes its row, so ghosts need a cleanup job anyway, which is just expiry done the hard way.",
          },
          {
            id: "owner-memory",
            label: "In the owner's memory: refreshed by heartbeats, expired on a short TTL, broadcast throttled, never persisted",
            assessment: "sound",
            feedback:
              "Presence describes *now*. If the owner restarts, clients reconnect and re-announce within seconds, so durability buys nothing. Expiry handles clients that vanish without a goodbye. Cursor updates are coalesced (only the latest position matters) and sent at-most-once.",
          },
          {
            id: "redis-ttl",
            label: "Redis keys with a TTL, plus pub/sub to broadcast changes",
            assessment: "defensible",
            feedback:
              "Correctly soft, and the right choice if there were no single owner per document. With an owner already holding every participant's connection, Redis adds a network hop and a dependency for information the owner already has.",
          },
          {
            id: "in-op-log",
            label: "Record cursor moves in the op log so history shows where everyone was",
            assessment: "flawed",
            feedback:
              "It bloats the durable log, the snapshots and every reconnect catch-up with data that is worthless seconds later. History should record what changed in the document, not where people looked.",
          },
        ],
        rationale: {
          prompt: "Why does presence deserve different treatment from edits?",
          rubric: [
            {
              id: "ephemeral",
              text: "Presence describes the present; losing it on a crash costs nothing because clients re-announce.",
            },
            {
              id: "expiry",
              text: "It must expire automatically (heartbeat plus TTL), or disconnected users linger as ghosts.",
            },
            {
              id: "coalesce",
              text: "Cursor updates can be throttled, coalesced and sent at-most-once, since only the latest matters.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The system now has two kinds of state with opposite needs:

          | | Edits | Presence and cursors |
          |-|-|-|
          | If lost | Data loss, never acceptable | Rebuilt within seconds by re-announcement |
          | Order | One sequence per document | Only the latest value matters |
          | Storage | Durable log, group commit | Owner's memory, TTL expiry |
          | Delivery | At-least-once, deduplicated by op id | At-most-once, coalesced |

          Treating them the same, in either direction, is a common and expensive mistake: durable presence wastes writes, and ephemeral edits lose work. See [[soft-state]].
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "acked-then-lost",
      title: "Acknowledged, then lost",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["durability", "event-log", "idempotency"],
      competencyIds: ["durability"],
      event: {
        kind: "failure",
        title: "A paragraph vanished after a server crash",
        detail:
          "An owner process was OOM-killed. When users reconnected, the last few seconds of Alice's typing were gone, although her client had shown it as saved. Below are the owner's and client's logs.",
      },
      context: md`
        To reduce database load, an engineer changed the owner to buffer ops in memory and flush them to Postgres every two seconds. Find the design decisions that turned a crash into data loss.
      `,
      interaction: {
        kind: "diagnosis",
        prompt: "Select the lines where the design is at fault.",
        artifact: {
          type: "log",
          caption: "doc 4711: owner and client logs",
          lines: [
            { text: "10:04:00.000  owner-3  flushed ops 5101-5120 to postgres" },
            { text: "10:04:00.180  client-alice  send op a:812 (base seq 5120)" },
            {
              text: "10:04:00.182  owner-3  op a:812 → seq 5121 (buffered)  ack → alice",
              fault:
                "The ack is sent while the op exists only in memory. An acknowledgement must mean durable, so either flush before acking or ack when the batch commits (group commit).",
            },
            {
              text: "10:04:00.183  client-alice  ack a:812; removed from pending",
              fault:
                "That is correct client behaviour, but it is why the early ack is fatal: custody passed to a server that had not secured the op.",
            },
            { text: "10:04:00.183  owner-3  broadcast seq 5121 → bob, carol" },
            { text: "10:04:01.402  owner-3  … ops 5122-5131 buffered and acked" },
            { text: "10:04:01.950  owner-3  killed (OOM)" },
            { text: "10:04:03.100  owner-5  takes ownership; loads log up to seq 5120" },
            {
              text: "10:04:03.300  client-bob  hello last_seq=5131 → owner-5 resumes Bob from 5131",
              fault:
                "Bob claims a sequence number the log does not contain. The owner must detect last_seq > log head and force a resync, not trust it, or Bob's document permanently diverges.",
            },
            { text: "10:04:03.320  client-alice  hello last_seq=5131, pending=[]" },
          ],
        },
        rationale: {
          prompt: "What must an ack mean, and how should reconnects verify state?",
          rubric: [
            {
              id: "ack-durable",
              text: "Ack only after the op is durably persisted; batching is fine if acks wait for the batch.",
            },
            {
              id: "custody",
              text: "Clients keep ops until acked and resend on reconnect; the op id makes the resend idempotent.",
            },
            {
              id: "verify-resume",
              text: "On reconnect, the server compares the client's last seen position with the log and forces a resync if the client is ahead.",
            },
            {
              id: "broadcast-after",
              text: "Broadcasting before durability let other clients see ops that were then lost.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The batching was not the mistake. The **early acknowledgement** was. Group commit keeps both properties: ops for a document accumulate for ~10-20 ms, one transaction inserts them all, and *then* every op in the batch is acked and broadcast. Throughput is the same, the guarantee is intact, and latency rises by a few milliseconds; see [[durability]].

          The second lesson is about **trusting client positions**. A client's \`last_seq\` is a claim. Before resuming, the owner checks it against the log's head. If the client is ahead (it saw ops that were lost), the owner sends a full resync: a snapshot plus the client's own unacknowledged ops to re-apply on top.
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "reconnect-protocol",
      title: "Write the reconnect protocol",
      phase: "break",
      dimensions: ["implement", "break"],
      conceptIds: ["idempotency", "event-log", "retries-and-backoff"],
      competencyIds: ["durability", "convergence"],
      event: {
        kind: "failure",
        title: "Ninety seconds in a tunnel",
        detail:
          "Alice's train enters a tunnel. She keeps typing for 90 seconds: 40 ops, applied locally, sitting in her pending buffer. Meanwhile Bob made 25 edits. The connection comes back, to a different server.",
      },
      context: md`
        Implement the client side of reconnection. The client knows its last-seen sequence number and holds its pending ops, each with a unique id. The server can return every op after a given sequence number.
      `,
      interaction: {
        kind: "implementation",
        prompt: "Implement onReconnect and onServerMessage so that nothing is lost, duplicated or applied out of order.",
        language: "typescript",
        starter: md`
          type Op = { id: string; payload: unknown };
          type Sequenced = Op & { seq: number };

          class DocClient {
            lastSeq = 0;                 // highest server seq applied locally
            pending: Op[] = [];          // local ops not yet acknowledged, in order

            onReconnect(socket: Socket) {
              // …
            }

            onServerMessage(msg: { type: "ack"; opId: string; seq: number }
                               | { type: "op"; op: Sequenced }
                               | { type: "resync"; snapshot: Doc; seq: number }) {
              // …
            }
          }
        `,
        rubric: [
          {
            id: "resume-from-position",
            text: "On reconnect the client sends its last seen sequence and receives missed ops from the log, rather than relying on server memory.",
          },
          {
            id: "resend-same-ids",
            text: "Pending ops are resent with their original ids, so the server deduplicates any it had already sequenced.",
          },
          {
            id: "rebase",
            text: "Missed remote ops are integrated before or alongside the pending ops (transform or CRDT merge), so local edits are rebased rather than overwritten.",
          },
          {
            id: "seq-order",
            text: "Remote ops are applied in sequence order; duplicates (seq <= lastSeq) are ignored.",
          },
          {
            id: "resync",
            text: "Handles a resync by replacing state with the snapshot and re-applying pending ops on top.",
            weight: "supporting",
          },
          {
            id: "backoff",
            text: "Reconnects use exponential backoff with jitter.",
            weight: "supporting",
          },
        ],
        reference: {
          code: md`
            class DocClient {
              lastSeq = 0;
              pending: Op[] = [];
              attempt = 0;

              onReconnect(socket: Socket) {
                this.attempt = 0;
                // The log is the buffer: ask for everything after our position,
                // and offer every op we still hold. Same ids as before.
                socket.send({ type: "hello", lastSeq: this.lastSeq, pending: this.pending });
              }

              onDisconnect() {
                const delay = Math.random() * Math.min(30_000, 500 * 2 ** this.attempt++);
                setTimeout(() => this.connect(), delay); // full jitter
              }

              onServerMessage(msg) {
                switch (msg.type) {
                  case "op": {
                    if (msg.op.seq <= this.lastSeq) return;            // duplicate delivery
                    if (msg.op.seq !== this.lastSeq + 1) return this.requestFrom(this.lastSeq);
                    const mine = this.pending.findIndex((p) => p.id === msg.op.id);
                    if (mine >= 0) {
                      // Our own op, sequenced (its ack may have been lost).
                      this.pending.splice(mine, 1);
                    } else {
                      // Rebase: integrate the remote op, transforming pending ops past it
                      // (OT), or merging by identity (CRDT, where order does not matter).
                      this.doc.integrateRemote(msg.op, this.pending);
                    }
                    this.lastSeq = msg.op.seq;
                    return;
                  }
                  case "ack": {
                    this.pending = this.pending.filter((p) => p.id !== msg.opId);
                    // lastSeq advances when the sequenced op itself arrives in order.
                    return;
                  }
                  case "resync": {
                    // The server's history differs from what we saw. Its log wins;
                    // our unacknowledged work is re-applied on top.
                    this.doc = Doc.from(msg.snapshot);
                    this.lastSeq = msg.seq;
                    for (const op of this.pending) this.doc.applyLocal(op);
                    return;
                  }
                }
              }
            }
          `,
          notes: md`
            - **The server keeps no per-client queue.** Catch-up reads the durable log after \`lastSeq\`, so it works across servers, restarts and arbitrarily long gaps (with a snapshot for very long ones).
            - **Op ids make resends safe.** The owner keeps a recent op-id index per document. If it already sequenced one of Alice's pending ops before the tunnel, it returns the existing sequence number instead of applying it again.
            - **The client's own op returns as a sequenced op** in the catch-up stream. The client recognizes it by id and drops it from pending, which covers the case where the ack was lost but the op was committed.
            - **Gaps trigger a re-request**, not a guess. Order is maintained by sequence number, never by arrival.
          `,
        },
      },
      reveal: {
        reasoning: md`
          Reconnection is where the earlier decisions pay off. Sequence numbers give the client a **position**; the durable log turns that position into a **replay**; op ids make every resend **idempotent**; the merge algorithm turns 40 local ops and 25 remote ones into one document. None of it needs the server to remember anything about Alice personally; see [[event-log]].
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "deploy-day",
      title: "Deploy day",
      phase: "break",
      dimensions: ["break", "explain"],
      conceptIds: ["leases-and-fencing", "persistent-connections", "retries-and-backoff", "soft-state"],
      competencyIds: ["sequencing", "connection-model"],
      event: {
        kind: "failure",
        title: "Every owner restarts",
        detail:
          "The daily deploy replaces every collaboration server. 20,000 connections must move, and every open document needs a new owner, without losing edits or forcing reloads.",
      },
      context: md`
        Deploys are the most common "failure" this system will ever see, and they happen every day. Evaluate each statement about getting through one.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "drain",
            statement: "Load-balancer connection draining is enough: WebSocket connections will finish on their own within the 30-second drain window.",
            verdict: "fails",
            explanation:
              "Draining waits for requests to complete, and a WebSocket never completes. The server must actively hand off: stop accepting, flush pending batches, release ownership, and tell clients to reconnect.",
          },
          {
            id: "herd",
            statement: "If every client reconnects the instant its socket closes, the new servers can be overwhelmed.",
            verdict: "holds",
            explanation:
              "20,000 simultaneous handshakes, permission checks and catch-up reads arrive at once. Clients should reconnect after a random delay; servers can also stagger closing their connections. See [[retries-and-backoff]].",
          },
          {
            id: "two-owners",
            statement: "During a handoff, the old and new servers can briefly both believe they own a document.",
            verdict: "holds",
            explanation:
              "The old owner may be mid-flush when the new owner's lease begins, or paused. Ownership is a [[leases-and-fencing|lease]], and leases can overlap in belief even when they do not overlap in time.",
          },
          {
            id: "unique-seq",
            statement: "A unique constraint on (doc_id, seq) in the op log, plus appends conditioned on the owner's epoch, prevents a stale owner from forking history.",
            verdict: "holds",
            explanation:
              "The stale owner's insert either collides with a sequence number the new owner already used, or fails the epoch check. Either way it learns it lost, and its unacknowledged ops will be resent by clients to the real owner.",
          },
          {
            id: "persist-presence",
            statement: "Presence must be persisted before the deploy so avatars survive the restart.",
            verdict: "fails",
            explanation:
              "Clients reconnect and re-announce within seconds; presence rebuilds itself. That is the benefit of treating it as [[soft-state]].",
          },
        ],
      },
      reveal: {
        reasoning: md`
          A graceful handoff for each document:

          1. The old owner stops accepting ops for the document and commits any buffered batch (acking those ops).
          2. It releases its lease; the new owner acquires it with a **higher epoch**.
          3. Clients receive "reconnect" and back off with jitter; the router sends them to the new owner.
          4. The new owner loads the latest snapshot and log tail. Clients resume from their \`lastSeq\` and resend pending ops.

          And for the ungraceful version (a crash), the same steps happen with step 1 skipped: the lease expires instead of being released, and the epoch fence makes sure a zombie owner cannot write. Deploys exercise the crash-recovery path daily, which is the best way to keep it working.
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "the-all-hands-doc",
      title: "The all-hands document",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["backpressure", "publish-subscribe", "partitioning"],
      competencyIds: ["fan-out"],
      event: {
        kind: "scale",
        title: "230 people in one document",
        detail:
          "During the all-hands, 30 people type into the same document and 200 watch. The owner's CPU is pinned, editors see their own typing echo back late, and memory climbs because several viewers on poor connections are not reading fast enough.",
      },
      context: md`
        The single-owner design made ordering free. Now one document's traffic exceeds what one process can deliver. Sequencing is still cheap (200 ops/s); delivery is not (about 46,000 messages/s).
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you keep this document healthy?",
        options: [
          {
            id: "bigger-box",
            label: "Move hot documents to a larger server",
            assessment: "defensible",
            feedback:
              "It buys headroom quickly and is a reasonable stopgap. It does nothing about slow viewers' buffers growing, and the next, bigger document hits the same wall.",
          },
          {
            id: "split-sequencers",
            label: "Split the document's editors across several servers, each sequencing its own clients' ops",
            assessment: "flawed",
            feedback:
              "Two sequencers mean two histories. Sequence numbers stop defining a single order, catch-up positions become ambiguous, and the log's uniqueness invariant has to be abandoned. Even with a CRDT, where content would converge, you lose the single timeline that history and resumption depend on.",
          },
          {
            id: "batch-and-bound",
            label: "Batch ops into frames every ~50 ms per recipient, bound every connection's send buffer, and move viewers who exceed it to catch-up-from-log mode",
            assessment: "sound",
            feedback:
              "Batching cuts per-message overhead by an order of magnitude, from ~46,000 sends a second to ~4,600 frames. Bounded buffers turn a slow viewer from a memory leak into a client that briefly falls behind and catches up from the log by sequence number, the same path as a reconnect.",
          },
          {
            id: "edge-fanout",
            label: "Keep one owner for sequencing; publish sequenced ops to pub/sub, and serve viewers from separate edge servers that subscribe",
            assessment: "sound",
            feedback:
              "Sequencing and delivery are different jobs with different scaling needs. The owner does the cheap, single-writer part; any number of edge servers do the expensive, embarrassingly parallel part. Viewers lose nothing: ops carry sequence numbers, so edges can detect gaps and catch up from the log.",
          },
        ],
        rationale: {
          prompt: "Which work must stay in one place, and which can be spread out?",
          rubric: [
            {
              id: "separate",
              text: "Sequencing must stay single-writer, but fan-out delivery can be distributed.",
            },
            {
              id: "bounded",
              text: "Per-connection buffers must be bounded; slow clients fall back to catching up from the log.",
            },
            {
              id: "batching",
              text: "Batching or coalescing reduces per-message overhead.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The general move is to **find the part of the work that must be serialized, keep only that part serialized, and scale everything else out**. Here the serialized part (assigning sequence numbers) is tiny; the expensive part (delivering bytes to 230 sockets) is parallel by nature.

          Both sound options compose. Batching and bounded buffers make each server efficient and safe; edge fan-out spreads delivery across servers. Pub/sub can be ephemeral here, because a dropped message shows up as a sequence gap that the edge repairs from the durable log; see [[publish-subscribe]] and [[backpressure]].
        `,
      },
      reveals: { components: ["pubsub", "edge", "viewers"], flows: ["publish", "subscribe", "frames"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "history-and-fast-loads",
      title: "History and fast loads",
      phase: "change",
      dimensions: ["change", "explain"],
      conceptIds: ["event-log", "object-storage"],
      competencyIds: ["durability"],
      event: {
        kind: "requirement-change",
        title: "Old documents open slowly",
        detail:
          "A two-year-old design doc has 2.3 million ops. Opening it replays every one, and takes eleven seconds. Product also wants a version-history sidebar.",
      },
      context: md`
        The op log is the source of truth, and replaying it from the start is how the owner rebuilds a document. That cost grows forever.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should documents be loaded and history served?",
        options: [
          {
            id: "replay",
            label: "Keep replaying the full log, but make apply faster",
            assessment: "flawed",
            feedback: "Load time stays proportional to the document's entire life. Optimizing the constant factor does not change the slope.",
          },
          {
            id: "snapshots",
            label: "Periodically write snapshots tagged with the sequence number they include; load = latest snapshot + ops after it",
            assessment: "sound",
            feedback:
              "Load cost becomes bounded: one object fetch plus at most a few thousand ops. The sequence number on the snapshot is essential: it says exactly where replay resumes. Snapshots at coarser intervals for older periods double as version history.",
          },
          {
            id: "latest-only",
            label: "Store only the latest document state and delete the log",
            assessment: "flawed",
            feedback:
              "Loading is fast, but reconnecting clients can no longer catch up by position, version history is gone, and a bug in the in-memory state is now permanent with nothing to rebuild from.",
          },
          {
            id: "snapshot-every-op",
            label: "Write a new snapshot after every op",
            assessment: "defensible",
            feedback:
              "Loads are instant, but every keystroke now writes the whole document: 50 KB × thousands of ops a second. Snapshotting every few hundred ops or few minutes gets nearly the same load time at a fraction of the cost.",
          },
        ],
        rationale: {
          prompt: "What must a snapshot record, and what still needs the log?",
          rubric: [
            {
              id: "position",
              text: "A snapshot must record exactly which sequence number it reflects, so replay starts at the next op with no gap or duplicate.",
            },
            {
              id: "log-still-needed",
              text: "The log after the latest snapshot remains essential for catch-up and correctness.",
            },
            {
              id: "retention",
              text: "Older history can be compacted into coarser snapshots for the version sidebar.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Snapshots are a **cache of the log's fold**, with the cache key being the sequence number. Like any cache they can be rebuilt from the source of truth, which is why the log after them must be kept, and why a snapshot without its position is useless; see [[event-log]].

          Snapshots are immutable objects keyed by \`{doc}/{seq}\`, which makes them a natural fit for [[object-storage]]: write once, cache forever, never update in place.
        `,
      },
      reveals: { components: ["snapshots", "snapshotter"], flows: ["load", "fold", "write-snapshot"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "defend-convergence",
      title: "Defend the guarantees",
      phase: "defend",
      dimensions: ["defend", "explain"],
      conceptIds: ["conflict-resolution", "durability", "leases-and-fencing"],
      competencyIds: ["convergence", "durability", "sequencing"],
      context: md`
        In the design review, someone asks: "Walk me through why every client ends up with the same document, and why we never lose an edit someone saw as saved. What failure would break each guarantee?"
      `,
      interaction: {
        kind: "open",
        prompt: "Explain the convergence and durability guarantees, the mechanism behind each, and what would have to fail to break them.",
        placeholder: "Convergence comes from…",
        rubric: [
          {
            id: "convergence-mechanism",
            text: "Convergence: ops are merged by a convergent algorithm (server-ordered OT or CRDT) and applied idempotently by op id.",
          },
          {
            id: "single-history",
            text: "One history per document: a single owner with an epoch-fenced lease and a unique (doc, seq) constraint.",
          },
          {
            id: "custody",
            text: "Durability: acks are sent only after commit, and clients hold ops until acked and resend them on reconnect.",
          },
          {
            id: "breaks",
            text: "Names what would break each, e.g. acking before commit, a second sequencer without fencing, a client losing its pending buffer before reconnecting, a merge bug.",
          },
          {
            id: "not-guaranteed",
            text: "Distinguishes what is not guaranteed: intent preservation, latency during handoffs, presence accuracy.",
            weight: "supporting",
          },
        ],
        reference: md`
          **Convergence.** Every op has a unique id and is integrated through a convergent merge (OT transformed in the owner's order, or a CRDT whose ops commute). Duplicate deliveries are ignored by id. So any two clients that have applied the same set of ops show the same text, regardless of when or how often they received them.

          **One history.** Each document has exactly one owner at a time, holding a lease with an epoch. Appends to the op log are conditioned on that epoch, and \`(doc_id, seq)\` is unique, so even a zombie owner cannot fork the history. Sequence numbers therefore mean the same thing to everyone.

          **No acknowledged edit is lost.** Custody is explicit: the client keeps every op (persisted locally) until it is acknowledged; the owner acknowledges only after the batch containing it commits. A crash at any point leaves the op with the client, who resends it with the same id, or in the log, from which it is replayed.

          **What would break them:** acking before commit (the incident in this investigation); a second sequencer without fencing; a client clearing its pending buffer before the ack, or losing its local storage while offline; a bug in the merge algorithm, which is why production systems periodically compare document checksums between clients and server.

          **What is not promised:** that the merged text matches what both authors *meant* when they edit the same words, that edits appear within 200 ms during a handoff, or that presence is exact.
        `,
      },
      reveal: {
        reasoning: md`
          The same three ideas from the other investigations carried this system: **a single authority per unit of state** (the document owner, like the job lease and the payment attempt), **custody that is only transferred once durable**, and **idempotent application of anything that can be repeated**. The technologies were different; the reasoning was not.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      Each document has **one owner** that does the only inherently serial work: assigning sequence numbers. Everything else is designed to happen anywhere and more than once.

      - **Clients apply edits locally first** and keep custody of each op until the owner acknowledges it, and the owner acknowledges only after the op is durable. Reconnection is a replay from the durable log by position, plus a resend of pending ops whose ids make duplicates harmless.
      - **Concurrent edits converge** through a merge algorithm rather than by choosing a winner, so concurrency and offline work are normal operating conditions rather than errors.
      - **Ownership is a fenced lease**, so deploys and crashes move documents between servers without ever producing two histories.
      - **Presence is soft state**, cheap and self-healing, kept out of the durable path entirely.
      - **Fan-out is separated from sequencing**, so a document with hundreds of viewers scales delivery without breaking the single-writer order.
    `,
    reliesOn: [
      "Clients persist pending ops locally and reuse op ids when resending.",
      "The router sends all of a document's connections to its current owner, and ownership changes are fenced.",
      "The merge algorithm is correct; periodic checksum comparisons catch divergence if it is not.",
      "Postgres can absorb batched appends from all active documents; past that, the op log is partitioned by document.",
      "Documents are small enough to hold in an owner's memory.",
    ],
    alternatives: [
      {
        design: "Hosted sync service or CRDT backend (e.g. a managed realtime database)",
        preferWhen:
          "The team wants collaboration as a feature rather than a core competency, and the service's data model, permissions and pricing fit.",
      },
      {
        design: "Peer-to-peer CRDT sync with a relay server",
        preferWhen: "Local-first operation and privacy matter most, and the server should store opaque data.",
      },
      {
        design: "Paragraph-level locking",
        preferWhen: "Collaboration is occasional, documents are structured, and predictability beats fluidity.",
      },
    ],
    tradeoffs: [
      {
        choice: "Single owner per document",
        gains: "Free ordering, local fan-out and in-memory state.",
        costs: "Document-aware routing, ownership handoffs, and hot-document limits.",
      },
      {
        choice: "Ack after durable commit (group commit)",
        gains: "No acknowledged edit can be lost.",
        costs: "A few milliseconds of added latency per batch.",
      },
      {
        choice: "OT or CRDT merging",
        gains: "Concurrent and offline edits preserved.",
        costs: "Algorithmic complexity and per-character metadata (CRDT).",
      },
      {
        choice: "Soft-state presence",
        gains: "No durable writes for ephemeral data; ghosts expire on their own.",
        costs: "Brief inaccuracy after restarts.",
      },
    ],
    breaksWhen: [
      "A single document's sequencing (not delivery) outgrows one process, for example thousands of simultaneous typists.",
      "Documents become too large to hold in memory, which calls for per-section ownership and a different model.",
      "Clients lose local storage while holding unsynchronized offline edits.",
      "Regulatory requirements demand that deletions purge every snapshot and log entry, which conflicts with immutable history.",
    ],
  },
  interviewVariants: [
    "Design Google Docs.",
    "Design a multiplayer whiteboard or Figma-like editor.",
    "How would you add live presence and cursors to an existing app?",
    "Design a chat system that works offline and syncs when reconnected.",
    "Your WebSocket servers need to be redeployed daily. How do you do it without disrupting users?",
  ],
  relatedInvestigationIds: ["video-processing-pipeline", "payment-workflow"],
} satisfies InvestigationInput;
