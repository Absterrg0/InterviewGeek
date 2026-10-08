import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const realtimeCollaboration = {
  id: "realtime-collaboration",
  title: "A real-time collaborative editor",
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
      lesson: [

        {
          kind: "read",
          body: md`
            "Last write wins" on the whole document means: whoever saves second replaces whatever the first person wrote. With two people typing in the same second, someone's sentence disappears.

            Collaborative editing has to merge **operations** (insert "x" at this point, delete these characters), not replace whole documents.
          `,
        },
        {
          kind: "estimate",
          id: "inbound",
          prompt: "20,000 people connected, a tenth of them typing at about 7 operations a second. About how many operations a second arrive?",
          answer: 14000,
          unit: "ops per second",
          working: md`
            20,000 × 0.1 × 7 = **14,000 ops a second**. As 14,000 separate committed transactions that's heavy; batched per document it's modest.
          `,
        },
        {
          kind: "estimate",
          id: "hot-doc",
          prompt: "The all-hands doc: 30 editors at about 7 ops a second each, every op delivered to about 230 participants. About how many outbound messages a second?",
          answer: 46000,
          unit: "messages per second",
          working: md`
            30 × 7 ≈ 210 ops a second; × 230 recipients ≈ **48,000 messages a second** (about 46,000, excluding each sender) for one document. Delivery, not ingestion, is the hot path.
          `,
        },
        {
          kind: "choice",
          id: "connections",
          prompt: "Do 20,000 idle WebSocket connections need a large server fleet?",
          options: [
            {
              id: "no",
              label: "No: an idle connection costs tens of kilobytes on an event-driven server; what costs is message rate and buffering.",
              correct: true,
              why: "20,000 × ~30 KB is well under a gigabyte. A few servers hold the connections; traffic decides the rest.",
            },
            {
              id: "yes",
              label: "Yes: one thread per connection.",
              why: "Event-driven servers don't need a thread per connection.",
            },
            {
              id: "depends",
              label: "It depends on the database.",
              why: "Connections are held by the collaboration servers, not the database.",
            },
          ],
        },
      ],
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
        takeaways: [
          "Concurrent edits are normal: merge operations instead of replacing documents.",
          "About 14,000 ops a second inbound means writes must be batched.",
          "One hot document can need tens of thousands of outbound messages a second; connections themselves are cheap.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            Transports differ in direction, overhead and ordering:

            | Transport | Direction | Ordering of one client's messages |
            | --- | --- | --- |
            | Polling | client asks | each request separate |
            | Server-Sent Events | server → client | ordered downstream only |
            | HTTP POST per op | client → server | separate requests can arrive out of order |
            | WebSocket | both ways, one connection | ordered both ways |

            See [[server-push]] and [[persistent-connections]].
          `,
        },
        {
          kind: "choice",
          id: "post-order",
          prompt: "Each keystroke is a separate POST. Op 2 is sent before op 3, but op 3's request arrives first. What must the server do?",
          options: [
            {
              id: "reorder",
              label: "Reorder by a client sequence number, holding op 3 until op 2 arrives",
              correct: true,
              why: "Op 3 was computed assuming op 2 had happened. Separate requests lose ordering, so the server has to rebuild it. One WebSocket preserves it for free.",
            },
            {
              id: "apply",
              label: "Apply op 3 first; order doesn't matter",
              why: "Edits depend on the ones before them. Applying them out of order puts text in the wrong place.",
            },
            {
              id: "reject",
              label: "Reject op 3",
              why: "That throws away a valid edit that only arrived early.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            A persistent socket comes with commitments: heartbeats to detect dead clients, a protocol to resume after reconnecting, and a plan for deploys that close every socket.
          `,
        },
      ],
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
        takeaways: [
          "High-rate, ordered traffic in both directions fits one persistent WebSocket per document.",
          "Separate requests lose a client's operation order.",
          "Sockets bring heartbeats, reconnect protocols and deploy handling as obligations.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            Every document needs **one authority** that decides the order of its operations. Clocks can't do it: client clocks disagree by seconds, so ordering by timestamp gives different orders on different machines. See [[ordering]].

            Give each document an **owner** server: it holds the document in memory, assigns each op the next sequence number, persists it and broadcasts it. Ordering becomes a counter in memory.
          `,
        },
        {
          kind: "read",
          body: md`
            That turns ordering into **routing**: every connection for document 42 must reach its current owner. A router can map document IDs to servers with consistent hashing, so that when servers come and go, most documents stay where they are. See [[consistent-hashing]].
          `,
        },
        {
          kind: "simulation",
          simulation: "consistent-hashing",
          body: md`
            Think of the keys as documents and the nodes as collaboration servers. Every key that moves is a document whose owner changes, and whose editors must reconnect.
          `,
        },
        {
          kind: "choice",
          id: "db-sequencer",
          prompt: "Alternative: any server accepts any client, and each op takes the next sequence number from a row in Postgres. What's the cost?",
          options: [
            {
              id: "round-trip",
              label: "Every keystroke waits for a round trip to a contended database row before it can be ordered.",
              correct: true,
              why: "It works, but the document's counter row becomes a lock every op queues on, and every server must hold a copy of the document.",
            },
            {
              id: "wrong",
              label: "Operations end up in the wrong order.",
              why: "The row lock does give a single order. The problem is latency and contention.",
            },
            {
              id: "none",
              label: "None: databases are fast.",
              why: "A row updated by every keystroke of 30 editors is a contention point.",
            },
          ],
        },
      ],
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
        takeaways: [
          "Each document needs one ordering authority; client clocks can't provide it.",
          "A single owner per document makes sequencing a local counter.",
          "The hard parts move to routing connections to the owner and keeping ownership unique.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            Alice and Bob both edit "The cat sat." Alice inserts "black " at position 4. Bob deletes positions 8–10 ("sat"). Each op was computed against the text **they** saw.

            Once Alice's insert has happened, everything after position 4 has shifted by 6 characters. Applied as-is, Bob's "delete 8–10" now removes the wrong characters.
          `,
        },
        {
          kind: "predict",
          id: "shifted",
          prompt: "After Alice's insert the text is \"The black cat sat.\" Applied naively, Bob's delete of positions 8–10 (counting from 0) removes which characters?",
          answer: md`
            "k c": positions 8–10 of "The black cat sat." are "k", " " and "c". The text becomes "The blacat sat.", and "sat" survives. Bob's delete needed to be shifted right by 6, to positions 14–16.
          `,
        },
        {
          kind: "read",
          body: md`
            Two families of algorithms make concurrent edits converge. See [[conflict-resolution]]:

            - **Operational transformation (OT):** a central server transforms each incoming op against the ops it hadn't seen (shift Bob's delete by Alice's insert), then applies it in one agreed order.
            - **CRDTs:** every character gets a stable identity, so ops say "delete character #a17" instead of "delete position 8". Ops then commute: they give the same result in any order.
          `,
        },
        {
          kind: "choice",
          id: "offline",
          prompt: "A user edits offline for three hours, then reconnects. Which approach handles that more naturally?",
          options: [
            {
              id: "crdt",
              label: "CRDTs: ops merge in any order, so a long divergence is just more ops to exchange.",
              correct: true,
              why: "OT can handle it, but transforming hours of ops against hours of others' ops is expensive and complex. CRDTs pay instead with per-character metadata.",
            },
            {
              id: "ot",
              label: "OT: the server just transforms everything.",
              why: "It can, but long divergence is OT's weak spot.",
            },
            {
              id: "lock",
              label: "Paragraph locks",
              why: "Locks make offline editing impossible by definition.",
            },
          ],
        },
      ],
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
        takeaways: [
          "Concurrent edits computed against different versions must be merged, not chosen between.",
          "OT transforms ops against unseen ones in one agreed order; CRDTs make ops commute with stable identities.",
          "Long offline sessions favour CRDTs; both still benefit from server sequence numbers.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            **Custody**: at every moment, an edit must be held by someone who won't forget it: either the client's pending buffer (saved locally for offline use) or the durable log on the server.

            The **acknowledgement** hands custody over. So the server may only ack once the log has the edit, and the client may only drop the edit from its buffer once it has the ack. See [[durability]].
          `,
        },
        {
          kind: "choice",
          id: "local-first",
          prompt: "Why does Alice's client apply her keystroke locally before the server has seen it?",
          options: [
            {
              id: "latency",
              label: "So typing feels instant; the op stays in her pending buffer until the server acknowledges it.",
              correct: true,
              why: "Waiting for a round trip per keystroke would make typing feel sluggish. The pending buffer keeps the op safe meanwhile.",
            },
            {
              id: "trust",
              label: "Because the client is the authority on order",
              why: "The owner assigns order. The client applies locally only for responsiveness.",
            },
            {
              id: "save",
              label: "To save server load",
              why: "The server still receives and processes every op.",
            },
          ],
        },
        {
          kind: "predict",
          id: "resend",
          prompt: "Alice never sees the ack for op a:812 and resends it. How does the owner avoid applying it twice?",
          answer: md`
            Each op carries an id (client id + counter). The owner recognises a:812, finds the sequence number it already assigned, and acks with that instead of applying the op again.
          `,
        },
      ],
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
        takeaways: [
          "An edit is always in someone's custody: the client's pending buffer or the durable log.",
          "Ack only once the log has the op; the client drops it only after the ack.",
          "Op ids make resends idempotent.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            Presence (who's here) and cursors (where they are) describe **now**. They're useless a minute later, and they rebuild themselves within seconds when clients reconnect and re-announce. That makes them **soft state**: keep them in memory, refresh them with heartbeats, expire them on a short TTL. See [[soft-state]].
          `,
        },
        {
          kind: "choice",
          id: "ghost",
          prompt: "A laptop lid closes without a goodbye message. What removes that user's avatar?",
          options: [
            {
              id: "ttl",
              label: "Their heartbeats stop, and the presence entry expires on its short TTL.",
              correct: true,
              why: "A client that vanishes can't announce leaving. Expiry handles it without anyone needing to notice.",
            },
            {
              id: "close",
              label: "The socket's close event",
              why: "A sleeping laptop may not close the socket cleanly for a long time.",
            },
            {
              id: "cleanup",
              label: "A nightly cleanup job",
              why: "The avatar should disappear within seconds, not overnight.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Cursors move with every keystroke, but only the **latest** position matters. So cursor updates can be **coalesced** (send only the newest every 50–100 ms), throttled, and sent at most once: a lost cursor update is replaced by the next one.
          `,
        },
      ],
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
        takeaways: [
          "Presence and cursors are soft state: in memory, refreshed by heartbeats, expired by TTL.",
          "Only the latest cursor matters, so coalesce, throttle and send at most once.",
          "Keep edits durable and ordered; keep presence cheap and disposable.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            **Group commit** batches many writes into one transaction without weakening any of them: ops for a document accumulate for 10–20 ms, one transaction inserts them all, and **then** each op is acknowledged.

            Throughput is the same as buffering longer; latency rises by a few milliseconds; and an ack still means "durable".
          `,
        },
        {
          kind: "choice",
          id: "early-ack",
          prompt: "The owner acks each op immediately and flushes to Postgres every 2 seconds. The process is killed 1.5 s after the last flush. What's lost?",
          options: [
            {
              id: "acked",
              label: "Up to 1.5 s of acknowledged ops, which clients already dropped from their buffers",
              correct: true,
              why: "The ack handed custody to a server that only had the ops in memory. Clients won't resend what they think is saved.",
            },
            {
              id: "nothing",
              label: "Nothing: clients resend",
              why: "Clients only resend unacknowledged ops. These were acknowledged.",
            },
            {
              id: "one",
              label: "Only the op being processed at the moment of the crash",
              why: "Everything since the last flush was in memory only.",
            },
          ],
        },
        {
          kind: "predict",
          id: "client-ahead",
          prompt: "After the crash, Bob reconnects claiming last_seq = 5131, but the log only reaches 5120. What should the new owner do?",
          answer: md`
            Not trust it. Bob has seen ops the log doesn't contain, so his document is ahead of the truth. Force a resync: send him the snapshot and log as they really are. Then he and everyone else converge on the same history.
          `,
        },
      ],
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
        takeaways: [
          "Ack only after the op is durable; group commit keeps batching without weakening the ack.",
          "Broadcast only after durability, so nobody sees ops that are later lost.",
          "Treat a client's last-seen position as a claim and resync if it's ahead of the log.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            Reconnection uses three things the design already has:

            - A **position**: the client's last-seen sequence number.
            - A **replay**: the log can return every op after that position, so the server doesn't need to remember the client. See [[event-log]].
            - **Idempotent resends**: pending ops carry their original ids, so any the server already sequenced are skipped.
          `,
        },
        {
          kind: "choice",
          id: "pending-vs-remote",
          prompt: "Alice has 40 pending ops; the log has 25 ops from Bob she hasn't seen. How do her edits avoid overwriting Bob's?",
          options: [
            {
              id: "merge",
              label: "Bob's ops are integrated and Alice's pending ops are rebased on top (transformed, or merged as CRDT ops).",
              correct: true,
              why: "Alice's ops were computed against an older document. The merge algorithm adjusts them so both sets of edits survive.",
            },
            {
              id: "alice-wins",
              label: "Alice's ops replace Bob's, since she's reconnecting.",
              why: "That's last-write-wins, which loses Bob's work.",
            },
            {
              id: "bob-wins",
              label: "Alice's ops are discarded.",
              why: "That loses 90 seconds of her typing.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Two more rules: apply remote ops in sequence order and ignore any with \`seq ≤ lastSeq\` (duplicates). And reconnect with exponential backoff plus jitter, so thousands of clients don't reconnect in the same instant. See [[retries-and-backoff]].
          `,
        },
      ],
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
        takeaways: [
          "Resume from the client's last-seen sequence by replaying the log, not server memory.",
          "Resend pending ops with original ids and rebase them over missed remote ops.",
          "Apply remote ops in order, ignore duplicates, and back off with jitter.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            Load-balancer **draining** waits for in-flight requests to finish before stopping a server. A WebSocket is one request that never finishes, so draining alone just waits out the timeout and cuts it.

            The server has to hand off actively: stop accepting ops, flush pending batches, release ownership, and tell clients to reconnect.
          `,
        },
        {
          kind: "estimate",
          id: "spread",
          prompt: "20,000 clients reconnect with a random delay spread evenly over 10 seconds. About how many reconnections a second do the new servers face?",
          answer: 2000,
          unit: "per second",
          working: md`
            20,000 ÷ 10 = **2,000 a second**, instead of 20,000 handshakes, permission checks and catch-up reads in the same instant. Jitter turns a spike into a ramp.
          `,
        },
        {
          kind: "read",
          body: md`
            During handoff, two servers can briefly both believe they own a document: the old one mid-flush, the new one starting. Ownership is a [[leases-and-fencing|lease]] with an **epoch** number that increases with each new owner.

            Appends to the log are conditioned on the owner's epoch, and \`(doc_id, seq)\` is unique, so a stale owner's write fails and it learns it lost.
          `,
        },
        {
          kind: "choice",
          id: "presence-deploy",
          prompt: "Should presence be saved before a deploy so avatars survive it?",
          options: [
            {
              id: "no",
              label: "No: clients reconnect and re-announce within seconds; presence rebuilds itself.",
              correct: true,
              why: "That's the benefit of treating presence as soft state.",
            },
            {
              id: "yes",
              label: "Yes, or everyone's avatars disappear.",
              why: "They disappear for a moment and come back as clients reconnect.",
            },
            {
              id: "redis",
              label: "Only if it's in Redis.",
              why: "Where it lives doesn't change that it rebuilds itself.",
            },
          ],
        },
      ],
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
        takeaways: [
          "Draining doesn't end WebSockets: hand off actively and tell clients to reconnect.",
          "Reconnect with jitter so new servers see a ramp, not a spike.",
          "Fence ownership with epochs and a unique (doc, seq) so a stale owner can't fork history.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            Find the part of the work that **must** be serialized and keep only that part serialized. Here:

            - **Sequencing** (assigning order) must be single-writer, and it's cheap: about 200 ops a second.
            - **Delivery** (sending to 230 sockets) is expensive, and parallel by nature.
          `,
        },
        {
          kind: "estimate",
          id: "batched",
          prompt: "Instead of sending each op separately, each recipient gets one frame every 50 ms containing all new ops. With 230 recipients, how many frames a second?",
          answer: 4600,
          unit: "frames per second",
          working: md`
            20 frames a second × 230 recipients = **4,600 frames a second**, down from about 46,000 individual messages. Same ops, a tenth of the overhead.
          `,
        },
        {
          kind: "choice",
          id: "slow-viewer",
          prompt: "A viewer on a bad connection reads slower than ops arrive. What should the server do with their send buffer?",
          options: [
            {
              id: "bound",
              label: "Bound it; when it fills, drop the buffered ops and let the client catch up from the log by sequence number",
              correct: true,
              why: "An unbounded buffer turns one slow viewer into growing memory on the owner. The log makes dropping safe: the client asks for what it missed.",
            },
            {
              id: "grow",
              label: "Let it grow until the viewer catches up",
              why: "Several slow viewers can exhaust the owner's memory.",
            },
            {
              id: "disconnect",
              label: "Block the document until the viewer catches up",
              why: "One slow viewer would stall 229 others.",
            },
          ],
        },
      ],
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
        takeaways: [
          "Keep only the necessary part serialized: sequencing stays single-writer, delivery scales out.",
          "Batch ops into frames per recipient to cut per-message overhead.",
          "Bound send buffers; slow clients fall back to catching up from the log.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            When the log is the source of truth, loading a document means replaying it, and that cost grows with the document's whole life. A **snapshot** stores the document as it was at a given sequence number. Loading becomes: latest snapshot, then replay only the ops after it. See [[event-log]].
          `,
        },
        {
          kind: "estimate",
          id: "replay-after",
          prompt: "Snapshots are taken every 2,000 ops. At most how many ops does a load replay after the latest snapshot?",
          answer: 2000,
          unit: "ops",
          working: md`
            At most **2,000**, compared with 2.3 million from the beginning. Load time is now bounded, whatever the document's age.
          `,
        },
        {
          kind: "choice",
          id: "snapshot-seq",
          prompt: "Why must each snapshot record exactly which sequence number it includes?",
          options: [
            {
              id: "resume",
              label: "So replay starts at the next op, with no gap and no op applied twice",
              correct: true,
              why: "A snapshot without its position can't be combined with the log safely.",
            },
            {
              id: "sort",
              label: "So snapshots can be sorted by date",
              why: "Sorting is a side benefit. The position is what makes replay correct.",
            },
            {
              id: "size",
              label: "To estimate its size",
              why: "Size has nothing to do with it.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Snapshots never change once written, so they suit [[object-storage]]: keyed by \`{doc}/{seq}\`, written once, cached forever.
          `,
        },
      ],
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
        takeaways: [
          "A snapshot is a cached fold of the log, keyed by the sequence number it includes.",
          "Load = latest snapshot + ops after it, so load time stays bounded.",
          "Keep the log after the latest snapshot for catch-up and correctness.",
        ],
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
      lesson: [

        {
          kind: "read",
          body: md`
            Three ideas carry this design, and the same three appear in jobs and payments:

            - **A single authority per unit of state:** one owner per document, fenced by an epoch.
            - **Custody transferred only once durable:** ack after commit; clients hold ops until acked.
            - **Idempotent application of anything repeatable:** op ids, sequence numbers.

            Defending the guarantees means naming the failure that would break each one.
          `,
        },
        {
          kind: "choice",
          id: "breaks",
          prompt: "Which failure would break the 'no acknowledged edit is lost' guarantee?",
          options: [
            {
              id: "early-ack",
              label: "Acking an op before it's committed to the log",
              correct: true,
              why: "The client drops it on the ack. A crash before the commit then loses it with nobody holding a copy.",
            },
            {
              id: "slow",
              label: "A slow network",
              why: "Slowness delays acks; the client keeps the op until one arrives.",
            },
            {
              id: "reconnect",
              label: "Reconnecting to a different server",
              why: "The log and op ids make that safe.",
            },
          ],
        },
      ],
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
        takeaways: [
          "Convergence comes from a convergent merge plus idempotent application by op id.",
          "Durability comes from acking only after commit and clients holding ops until acked.",
          "Name what breaks each guarantee: early acks, an unfenced second sequencer, a lost pending buffer.",
        ],
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
