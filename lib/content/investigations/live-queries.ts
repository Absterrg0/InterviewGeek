import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const liveQueries = {
  id: "live-queries",
  title: "Screens that update themselves",
  searchTitle: "Design a Reactive Database (Live Queries)",
  premise:
    "Replace polling with live queries: work out which writes change which results, keep every screen consistent with itself, stop two people breaking a rule at the same moment, and survive one query that a whole company is watching.",
  difficulty: "advanced",
  estimatedMinutes: 45,
  scenario: md`
    A task-tracking app for teams: boards with columns, tasks that move between them, comments, and a count of unread notifications in the corner. When someone moves a task, everyone looking at that board should see it move.

    Today the web app polls. Every open screen re-fetches its data every five seconds. At peak about **40,000 people** have the app open, and a typical screen shows **five pieces of data**: the board, the open task, its comments, the unread count and the member list. Users make about **2,000 changes a second** at peak.

    Two complaints keep coming back. Changes take up to five seconds to appear, so people talk over each other in meetings ("it's in Done" / "no it isn't"). And the database spends most of its time answering polls whose answer has not changed. The team wants queries that stay live: the server sends new results when, and only when, they change.
  `,
  objectives: [
    "Compare the cost of polling with the cost of pushing changes.",
    "Decide what the server must remember about a query to know when its result changes.",
    "Keep several live results on one screen consistent with each other.",
    "Enforce a rule across rows under concurrent writes with optimistic concurrency control.",
    "Serve one query watched by a very large audience without re-running it for each viewer.",
  ],
  prerequisites: ["persistent-connections", "transactions"],
  requirements: {
    functional: [
      "Clients subscribe to queries (a board, a task, a count) and receive new results when they change.",
      "Clients run mutations: create, move, edit and delete tasks.",
      "A column can have a work-in-progress limit: at most N tasks.",
      "Clients that reconnect catch up without reloading the page.",
    ],
    nonFunctional: [
      "A change appears on every affected screen within about 100 ms of being committed.",
      "Queries whose results did not change cost nothing after a write.",
      "One screen never shows results from two different moments (a count of 12 next to a board of 11).",
      "Rules such as the work-in-progress limit hold however many people act at once.",
    ],
  },
  constraints: [
    "About 40,000 people online at peak, with about five live queries each.",
    "About 2,000 mutations a second at peak.",
    "Queries and mutations are functions written by the app's developers, not fixed SQL.",
  ],
  assumptions: [
    "Most queries read one board or one task: tens to hundreds of rows through an index.",
    "A few queries are shared by everyone in a large company, such as an announcements board.",
    "Clients hold a WebSocket open while the app is in the foreground.",
  ],
  competencies: [
    { id: "costing", label: "Costing push and poll", description: "Turning viewers, queries and writes into work per second." },
    { id: "invalidation", label: "Precise invalidation", description: "Knowing exactly which results a write can change." },
    { id: "consistency", label: "Consistent snapshots", description: "Showing every result on a screen as of one moment." },
    { id: "concurrency", label: "Concurrency control", description: "Keeping rules true when transactions overlap." },
    { id: "load", label: "Hot queries", description: "Serving one result to a very large audience." },
  ],
  system: {
    components: [
      { id: "clients", label: "Web and mobile apps", kind: "client", responsibility: "Subscribe to queries, run mutations, render results.", position: { col: 0, row: 1 } },
      {
        id: "sync",
        label: "Sync servers",
        kind: "service",
        responsibility: "Hold each client's WebSocket and its subscriptions; push new results tagged with the moment they are true at.",
        position: { col: 1, row: 1 },
      },
      {
        id: "runners",
        label: "Function runners",
        kind: "service",
        responsibility: "Run queries and mutations against a snapshot and record each one's read set: the index ranges it scanned.",
        position: { col: 2, row: 1 },
      },
      {
        id: "store",
        label: "Versioned store",
        kind: "database",
        responsibility: "Append-only log of committed writes with indexes that can be read as of any recent timestamp.",
        durableState: "every committed write, in commit order",
        position: { col: 3, row: 1 },
      },
      {
        id: "committer",
        label: "Committer",
        kind: "service",
        responsibility: "Checks a mutation's read set against writes committed since it started; assigns commit timestamps in order.",
        position: { col: 3, row: 2 },
      },
      {
        id: "tracker",
        label: "Subscription tracker",
        kind: "service",
        responsibility: "Holds the read sets of all live queries and matches each commit's writes against them.",
        position: { col: 2, row: 0 },
      },
      {
        id: "results",
        label: "Result cache",
        kind: "cache",
        responsibility: "Results keyed by query, arguments and timestamp, so identical subscriptions share one run.",
        position: { col: 2, row: 2 },
      },
    ],
    flows: [
      { id: "socket", from: "clients", to: "sync", label: "Subscribe and mutate", kind: "request" },
      { id: "run", from: "sync", to: "runners", label: "Run a function", kind: "request" },
      { id: "read", from: "runners", to: "store", label: "Read at a snapshot", kind: "request" },
      { id: "commit", from: "runners", to: "committer", label: "Writes plus read set", kind: "request" },
      { id: "append", from: "committer", to: "store", label: "Append in timestamp order", kind: "request" },
      { id: "feed", from: "store", to: "tracker", label: "Committed writes, in order", kind: "async" },
      { id: "invalidate", from: "tracker", to: "sync", label: "These subscriptions changed", kind: "async" },
      { id: "push", from: "sync", to: "clients", label: "New results", kind: "push" },
      { id: "share", from: "runners", to: "results", label: "Reuse identical runs", kind: "request" },
    ],
    invariants: [
      {
        id: "no-missed-change",
        statement: "Every committed write that can change a live result causes that result to be recomputed.",
        enforcedBy: ["runners", "tracker"],
        mechanism: "Queries record the index ranges they scanned, including empty gaps; the tracker matches every commit, in order, against those ranges.",
      },
      {
        id: "one-moment",
        statement: "A client never shows results from two different moments at once.",
        enforcedBy: ["sync", "clients"],
        mechanism: "Every result carries the timestamp it was computed at; the client applies a set of updates only when all its subscriptions have reached the same timestamp.",
      },
      {
        id: "serializable",
        statement: "Mutations behave as if they ran one at a time.",
        enforcedBy: ["committer", "runners"],
        mechanism: "Optimistic concurrency control: a mutation commits only if nothing in its read set changed since its snapshot, and is re-run otherwise.",
      },
    ],
  },
  stages: [
    {
      id: "poll-or-push",
      title: "What polling actually costs",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["server-push", "persistent-connections"],
      competencyIds: ["costing"],
      context: md`
        Use the numbers in the scenario: 40,000 people online, five queries per screen, a poll every five seconds, 2,000 mutations a second.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements follow?",
        claims: [
          {
            id: "poll-rate",
            statement: "Polling costs about 40,000 query runs a second, whether or not anything changed.",
            verdict: "holds",
            explanation: "40,000 people × 5 queries ÷ 5 seconds = 40,000 runs a second. The cost follows the number of viewers, not the amount of change.",
          },
          {
            id: "mostly-unchanged",
            statement: "Most of those polls return exactly what the client already has.",
            verdict: "holds",
            explanation:
              "2,000 writes a second, each touching one board or task, change a small fraction of the 200,000 live results in any five-second window. Most polls re-read data nobody touched.",
          },
          {
            id: "faster-poll",
            statement: "Polling every second instead would fix the delay without changing the architecture, at five times the load.",
            verdict: "holds",
            explanation: "It would cut the delay to a second and cost 200,000 runs a second. It is a dial between staleness and waste, which is why polling stops scaling once both matter.",
          },
          {
            id: "push-free",
            statement: "With push, server work depends only on how many writes there are, not on how many people are watching.",
            verdict: "depends",
            explanation:
              "Each write has to be matched against live subscriptions, and each affected query re-run and sent to its viewers. If a write affects one small board, that is cheap. If it affects a query thousands of people watch, sending the result is proportional to the audience, unless identical subscriptions share one run. That case comes later.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          Polling makes cost proportional to **viewers × queries ÷ interval**. Push makes it proportional to **writes × the queries each write affects**, plus sending results to the people watching them. When change is rare relative to viewing, push wins by orders of magnitude, but only if the server can tell cheaply and exactly which queries a write affects. That is the rest of this investigation.
        `,
      },
    },
    {
      id: "which-queries",
      title: "Which queries did that write change?",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["caching", "publish-subscribe"],
      competencyIds: ["invalidation"],
      context: md`
        A query is a function the app's developers wrote. It might read a board's columns through one index, then each column's tasks through another, and filter them in code. The server cannot read the function and know in advance what it depends on.
      `,
      interaction: {
        kind: "decision",
        prompt: "How does the server decide which subscriptions to re-run after a write?",
        options: [
          {
            id: "rerun-all",
            label: "Re-run every live query after every write",
            assessment: "flawed",
            feedback: "200,000 live queries × 2,000 writes a second is 400 million runs a second. It is correct and impossible.",
          },
          {
            id: "by-table",
            label: "Remember which tables each query read; re-run every query on a table when that table changes",
            assessment: "defensible",
            feedback:
              "Simple and safe. But the tasks table changes 2,000 times a second, so nearly every query is re-run nearly all the time: back to polling, only faster. It works for small apps with few writes.",
          },
          {
            id: "read-sets",
            label: "While a query runs, record the index ranges it scans; after each commit, re-run only queries whose ranges contain a written key",
            assessment: "sound",
            feedback:
              "The record is exact and automatic: whatever the function did, the database saw which index ranges it read. A task moving on board 17 matches only the queries that read board 17's range. Everything else costs nothing.",
          },
          {
            id: "manual-tags",
            label: "Have developers tag each query with invalidation keys, and tag each mutation with the keys it touches",
            assessment: "defensible",
            feedback:
              "Precise when the tags are right, and many caches work this way. But a forgotten tag fails silently: a screen that just never updates. The database already knows what each query read, so asking humans to restate it adds a way to be wrong.",
          },
        ],
        rationale: {
          prompt: "What does your approach record, and why is it both precise and safe?",
          rubric: [
            { id: "record", text: "Records what each query actually read, at run time, not what a developer declares." },
            { id: "precise", text: "Only queries whose read ranges contain a written key are re-run." },
            { id: "safe", text: "Cannot miss a dependency, because the record comes from the reads themselves." },
            { id: "cost", text: "Names the cost: storing read sets for every live query, and matching every write against them.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The idea that makes live queries practical is that **a query's dependencies are whatever it read**. Run it once, write down the index ranges it touched (its *read set*), and you know exactly which future writes can change its answer. The tracker keeps every live query's read set and checks each commit against them in order.

          It turns invalidation from a question about code ("what does this function depend on?") into a question about data ("does this key fall in that range?"), which the database can answer quickly with interval lookups. See [[caching]] for why invalidation is usually the hard part.
        `,
        tradeoffs: [
          { choice: "Re-run per table", gains: "Trivial to build.", costs: "Re-runs almost everything on a busy table." },
          { choice: "Developer-declared tags", gains: "Precise, works with any store.", costs: "A missing tag is a silent bug." },
          { choice: "Recorded read sets", gains: "Precise and automatic.", costs: "Memory for read sets; the store must expose index ranges." },
        ],
      },
      reveals: { components: ["tracker"], flows: ["feed", "invalidate", "push"] },
    },
    {
      id: "missing-task",
      title: "The task that never appeared",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["concurrency-control"],
      competencyIds: ["invalidation"],
      event: {
        kind: "failure",
        title: "New tasks do not show up",
        detail:
          "Ana adds a task to the Backlog column. Ben, looking at the same board, sees it only after refreshing. Moving and editing existing tasks updates fine.",
      },
      context: md`
        The first version of the read-set recorder is below. Select the lines that explain the bug.
      `,
      interaction: {
        kind: "diagnosis",
        prompt: "Select the faulty lines.",
        artifact: {
          type: "code",
          language: "typescript",
          caption: "readset.ts: recording what a query depends on",
          lines: [
            { text: "// Called by the query runtime for every index scan a query performs." },
            { text: "function recordScan(readSet: ReadSet, index: string, from: Key, to: Key, rows: Row[]) {" },
            {
              text: "  for (const row of rows) readSet.add({ index, key: row.key });",
              fault: "It records the rows the scan returned, not the range it scanned. An insert creates a key that did not exist when the query ran, so it can never match a recorded row.",
            },
            { text: "}" },
            { text: "" },
            { text: "// Called for every committed write." },
            { text: "function affects(readSet: ReadSet, write: Write): boolean {" },
            {
              text: "  return readSet.has({ index: write.index, key: write.key });",
              fault: "An exact-key lookup cannot detect a new key landing inside a range the query scanned. The check must ask whether the written key falls within any recorded range.",
            },
            { text: "}" },
          ],
        },
        rationale: {
          prompt: "Why do edits work but inserts fail, and what should be recorded instead?",
          rubric: [
            { id: "rows-vs-range", text: "Edits change keys that were returned, so they match; inserts add keys that were not, so they do not." },
            { id: "ranges", text: "Record the scanned range (from, to), including the empty parts of it." },
            { id: "interval", text: "Match each written key against the recorded ranges with an interval check." },
            { id: "deletes", text: "Notes that a delete or a move out of the range must also match, by its old key.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          A query's answer depends on **what it did not find** as much as on what it found. "Tasks in Backlog, ordered by position" depends on the absence of other Backlog tasks; inserting one changes the answer. Databases call these new rows *phantoms*, and the cure here is the same as in serializable transactions: lock, or in this case record, the **range**, not the rows.

          Writes that move a row change two keys: the old one leaves a range and the new one enters another. Both must be checked.
        `,
      },
    },
    {
      id: "one-moment",
      title: "Twelve tasks, eleven cards",
      phase: "decide",
      dimensions: ["defend", "break"],
      conceptIds: ["ordering", "transactions"],
      competencyIds: ["consistency"],
      event: {
        kind: "failure",
        title: "The count and the board disagree",
        detail: "For a moment after a task is added, the column header says 12 while the column shows 11 cards. Users file it as a bug, and they are right.",
      },
      context: md`
        The board and the count are separate subscriptions. Each is re-run and pushed as soon as its own run finishes.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you stop a screen showing two different moments?",
        options: [
          {
            id: "single-query",
            label: "Merge everything a screen shows into one big query",
            assessment: "defensible",
            feedback:
              "One query is internally consistent, so the problem disappears. But every small change re-runs and resends the whole screen, and components can no longer subscribe to what they need independently.",
          },
          {
            id: "timestamps",
            label: "Run every query at a snapshot timestamp, tag each result with it, and have the client apply updates only when all its subscriptions have reached the same timestamp",
            assessment: "sound",
            feedback:
              "Each result says the moment it is true at. The client holds back the count at timestamp 1050 until the board's 1050 result arrives, then applies both at once. Screens move from one consistent moment to the next.",
          },
          {
            id: "debounce",
            label: "Delay all pushes by 200 ms so related updates usually arrive together",
            assessment: "flawed",
            feedback: "Usually is the problem: under load the two runs can still straddle the delay, and every update now arrives 200 ms late even when nothing else changed.",
          },
          {
            id: "accept",
            label: "Accept it; the screen catches up within a few hundred milliseconds",
            assessment: "defensible",
            feedback:
              "Many apps live with this. It is a real trade-off, not a mistake, if nothing on screen is used to make decisions. Here users act on what they see, and one requirement forbids it.",
          },
        ],
        rationale: {
          prompt: "What does every result need to carry, and what does the client do with it?",
          rubric: [
            { id: "snapshot", text: "Every query runs against a snapshot at a known timestamp." },
            { id: "tag", text: "Results are tagged with that timestamp." },
            { id: "apply-together", text: "The client applies updates only when all its subscriptions reach the same timestamp." },
            { id: "store", text: "Requires a store that can read as of a recent timestamp (multiversion).", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Consistency across queries is a property of **time**, so the fix is to make time explicit. A versioned store can answer "as of timestamp T", every result is labelled with its T, and the client's rule is simple: never show a mix of Ts. The sync server can help by re-running all of a client's affected queries at the same timestamp after each commit, so the client rarely has to wait.

          It is the same reason databases give a transaction one snapshot instead of letting each statement see the latest data. See [[transactions]].
        `,
        otherwise: "If screens are dashboards nobody acts on, a brief mismatch may be an acceptable price for a simpler client.",
      },
    },
    {
      id: "wip-limit",
      title: "Seven tasks in a column of five",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["concurrency-control", "transactions"],
      competencyIds: ["concurrency"],
      event: {
        kind: "failure",
        title: "The limit did not hold",
        detail:
          "The In Progress column has a limit of five and held four tasks. Three people dragged a task into it within the same second. All three moves succeeded.",
      },
      context: md`
        The move mutation counts the tasks in the target column, refuses if the count is at the limit, and otherwise updates the task's column. Each mutation runs in a transaction at snapshot isolation: it sees the database as of the moment it started.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you make the limit hold?",
        options: [
          {
            id: "client-check",
            label: "Check the count in the client before sending the move",
            assessment: "flawed",
            feedback: "Every client saw four tasks. Checks on stale copies are exactly what failed; they belong on the server, inside the transaction.",
          },
          {
            id: "lock",
            label: "Lock the column's row at the start of the mutation, so moves into a column take turns",
            assessment: "defensible",
            feedback:
              "Correct, if every mutation that can affect the rule remembers to take the same lock in the same order. It is easy to forget one, and locks held across a function's whole run hurt throughput and can deadlock.",
          },
          {
            id: "occ",
            label: "Record each mutation's read set; at commit, if anything it read has been written since its snapshot, abort and run it again",
            assessment: "sound",
            feedback:
              "Each mutation read the range 'tasks in In Progress'. The first to commit changes that range, so the other two fail validation, re-run against the new state, see five tasks and refuse. No locks, nothing for developers to remember, and the read sets are the ones already recorded for subscriptions.",
          },
          {
            id: "constraint",
            label: "Add a database constraint for the limit",
            assessment: "defensible",
            feedback: "Ideal where it exists, but most databases cannot express 'at most N rows with this value' as a constraint, and every new rule would need its own.",
          },
        ],
        rationale: {
          prompt: "Why did all three moves succeed, and how does your fix stop it?",
          rubric: [
            { id: "write-skew", text: "Each saw four tasks in its own snapshot and wrote a different row, so snapshot isolation let all three commit (write skew)." },
            { id: "validate", text: "Validating the read set at commit detects that what a mutation read has changed." },
            { id: "retry", text: "The losing mutations re-run on fresh data and reach the right answer." },
            { id: "contention", text: "Notes the cost: a heavily contended range causes repeated retries.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The three moves wrote **different rows**, so nothing collided at the row level. The rule spans rows, and snapshot isolation does not protect rules that span rows. This is *write skew*.

          Optimistic concurrency control fixes it by checking reads, not just writes: a mutation commits only if the world it read is still the world. With read sets already recorded for subscriptions, the same machinery gives **serializable** mutations: developers can write code as if mutations ran one at a time. The cost appears under contention: if many mutations fight over one range, most of them retry. See [[concurrency-control]].
        `,
        tradeoffs: [
          { choice: "Pessimistic locks", gains: "No wasted work under contention.", costs: "Every code path must lock correctly; deadlocks; held for the whole run." },
          { choice: "Optimistic validation", gains: "No locks to forget; serializable by default.", costs: "Retries when many writers contend for one range." },
        ],
      },
      reveals: { components: ["committer"], flows: ["commit", "append"] },
    },
    {
      id: "write-validate",
      title: "Write the commit check",
      phase: "decide",
      dimensions: ["implement", "explain"],
      conceptIds: ["concurrency-control", "transactions"],
      competencyIds: ["concurrency", "invalidation"],
      context: md`
        The committer receives a mutation's snapshot timestamp, its read set (index ranges) and its writes. It keeps the writes of recent commits in memory. Write the function that decides whether the mutation may commit.
      `,
      interaction: {
        kind: "implementation",
        prompt: "Implement tryCommit.",
        language: "typescript",
        starter: md`
          type Range = { index: string; from: string; to: string }; // inclusive from, exclusive to
          type Write = { index: string; key: string; oldKey?: string };
          type Commit = { ts: number; writes: Write[] };

          let lastTs = 0;
          const recent: Commit[] = []; // in timestamp order; older entries are pruned elsewhere

          export function tryCommit(snapshotTs: number, readSet: Range[], writes: Write[]): { ok: true; ts: number } | { ok: false } {
            // decide, then record the commit if it succeeds
          }
        `,
        rubric: [
          { id: "since", text: "Checks only commits after the mutation's snapshot timestamp." },
          { id: "range", text: "Detects a conflict when a written key, or a moved row's old key, falls inside a read range." },
          { id: "order", text: "Assigns a new, increasing timestamp and records the commit only when there is no conflict." },
          { id: "atomic", text: "Makes the check and the append one atomic step (a single committer, or a lock).", weight: "supporting" },
          { id: "pruned", text: "Refuses (forces a retry) when the snapshot is older than the commits still held.", weight: "supporting" },
        ],
        reference: {
          code: md`
            const inRange = (r: Range, index: string, key: string) => r.index === index && key >= r.from && key < r.to;

            function touches(r: Range, w: Write) {
              return inRange(r, w.index, w.key) || (w.oldKey !== undefined && inRange(r, w.index, w.oldKey));
            }

            export function tryCommit(snapshotTs: number, readSet: Range[], writes: Write[]) {
              // This function is the only writer of lastTs and recent, so check-then-append is atomic.
              const oldestHeld = recent[0]?.ts ?? lastTs;
              if (snapshotTs < oldestHeld - 1) return { ok: false as const }; // too old to validate: re-run

              for (const commit of recent) {
                if (commit.ts <= snapshotTs) continue;
                for (const w of commit.writes) {
                  if (readSet.some((r) => touches(r, w))) return { ok: false as const };
                }
              }

              const ts = ++lastTs;
              recent.push({ ts, writes });
              return { ok: true as const, ts };
            }
          `,
          notes: md`
            - Only commits **after** the snapshot matter: anything earlier was already visible to the mutation.
            - A move writes a new key and removes an old one, and either can change a range someone read.
            - If the history needed to validate has been pruned, the safe answer is "retry", never "commit".
            - Real systems index the recent writes so this is not a scan, and use the same range matching to find affected subscriptions.
          `,
        },
      },
      reveal: {
        reasoning: md`
          Validation is a question about a time window: did anything committed between my snapshot and now touch what I read? A single committer that assigns timestamps in order makes that window well defined, and makes the check and the append one step. It is also the natural place to publish each commit, in order, to the subscription tracker.
        `,
      },
    },
    {
      id: "hot-query",
      title: "One board, a hundred thousand viewers",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["request-coalescing", "fan-out", "caching"],
      competencyIds: ["load", "costing"],
      event: {
        kind: "scale",
        title: "A company puts its all-hands board on the app",
        detail:
          "A 100,000-person customer opens the same announcements board in every browser during an all-hands. People comment on it several times a second.",
      },
      context: md`
        Every comment changes the board's result. The board query returns the same thing for everyone in the company.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you keep this from overwhelming the function runners?",
        options: [
          {
            id: "per-viewer",
            label: "Re-run the board query for each viewer after every comment",
            assessment: "flawed",
            feedback: "Five comments a second × 100,000 viewers is half a million runs a second for one result that is identical for everyone.",
          },
          {
            id: "share-coalesce",
            label: "Run each distinct (query, arguments, timestamp) once and send that result to every subscriber; when invalidations arrive faster than runs finish, run once for the latest timestamp",
            assessment: "sound",
            feedback:
              "One run per change serves all 100,000 viewers. If comments arrive while the previous run is still going, intermediate versions are skipped and the next run covers them all. The cost becomes sending, not computing.",
          },
          {
            id: "poll-this-one",
            label: "Switch this one query back to polling every ten seconds",
            assessment: "defensible",
            feedback: "It caps the load at a known rate, at the price of the delay users complained about. A reasonable emergency switch, not a design.",
          },
          {
            id: "bigger",
            label: "Add more function runners",
            assessment: "flawed",
            feedback: "Capacity spent recomputing the same answer 100,000 times. It also shifts the bottleneck to the store, which every run reads.",
          },
        ],
        rationale: {
          prompt: "What makes it safe to share one result, and what is left to scale?",
          rubric: [
            { id: "identity", text: "Results can be shared when the query, its arguments and its timestamp are the same and it does not depend on who is asking." },
            { id: "coalesce", text: "Bursts of invalidations collapse into one run for the newest timestamp." },
            { id: "send", text: "What remains is fan-out of the result to 100,000 connections, spread across sync servers." },
            { id: "auth", text: "Queries that depend on the viewer (permissions, 'my tasks') cannot be shared directly.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          A hot query is a [[request-coalescing]] problem: many people asking the same question at the same moment should cause one computation. Cache results by (function, arguments, timestamp), and the hundred-thousandth viewer costs a lookup. Coalescing invalidations means work follows how often the answer can be **observed** to change, not how often it changes.

          What cannot be coalesced is delivery. Sending a result to 100,000 sockets is [[fan-out]], spread across the sync servers that hold those sockets. Sending only what changed, rather than the whole board, makes each send small.
        `,
      },
      reveals: { components: ["results"], flows: ["share"] },
    },
    {
      id: "reconnect",
      title: "Back from the tunnel",
      phase: "break",
      dimensions: ["trace", "break"],
      conceptIds: ["idempotency", "persistent-connections"],
      competencyIds: ["consistency", "concurrency"],
      event: {
        kind: "failure",
        title: "A phone loses its connection for 40 seconds",
        detail:
          "During the gap its user moved two tasks; the app showed the moves straight away (optimistically) and queued them. Meanwhile other people changed the same board.",
      },
      context: md`
        The connection is back. Mutations carry a client-generated ID. The server can run queries at its current timestamp.
      `,
      interaction: {
        kind: "ordering",
        prompt: "Put the reconnection steps in order.",
        items: [
          { id: "auth", label: "Reconnect and re-authenticate the WebSocket" },
          { id: "replay", label: "Resend the queued mutations in order, each with its ID; the server skips any ID it already committed" },
          { id: "resubscribe", label: "Re-subscribe to every query the screen needs" },
          { id: "snapshot", label: "The server runs them at one timestamp that includes the replayed mutations, and sends the results tagged with it" },
          { id: "swap", label: "The client drops its optimistic changes that are now included and shows the new results all at once" },
        ],
        explanation: md`
          Mutations go first, so the fresh results already include them. Their IDs make the replay safe if a mutation reached the server just before the connection dropped and only its acknowledgement was lost; see [[idempotency]]. All subscriptions are then answered at one timestamp, so the screen jumps from its old moment to a single new one instead of flickering through partial states. Only then does the client remove its optimistic changes, because the server's results now contain the real outcome, which may differ: one of those moves might have hit the work-in-progress limit.
        `,
      },
      reveal: {
        reasoning: md`
          Reconnection is where optimistic UIs earn or lose trust. The rules are the ones from earlier stages, applied in order: **idempotent mutations** so replays are safe, **one timestamp** so the screen stays consistent, and **server results win** so the client converges on what actually happened.
        `,
      },
    },
    {
      id: "defend-design",
      title: "Defend building it into the database",
      phase: "defend",
      dimensions: ["defend"],
      conceptIds: ["concurrency-control", "caching", "server-push"],
      competencyIds: ["invalidation", "consistency", "concurrency", "load"],
      context: md`
        Your interviewer: "This is a lot of machinery. Why not keep Postgres, add a cache, and use change data capture or LISTEN/NOTIFY to tell clients to re-fetch?"
      `,
      interaction: {
        kind: "open",
        prompt: "Defend the design, concede what the simpler route gets right, and say when you would choose it.",
        placeholder: "The thing a re-fetch signal cannot tell you is…",
        rubric: [
          { id: "precision", text: "A change notification says a row changed, not which queries it affects; mapping that needs read sets or hand-written rules." },
          { id: "consistency", text: "Re-fetching queries separately brings back the mixed-moment problem unless they share a snapshot." },
          { id: "serializable", text: "The same read sets give serializable mutations; the alternative still needs its own answer to write skew." },
          { id: "concede", text: "Concedes that the simpler route is right for apps with few writes, coarse invalidation or tolerant users, and costs far less to build." },
        ],
        reference: md`
          **What a re-fetch signal cannot tell you.** Change data capture says "task 812 changed". It does not say which live queries that affects. You either re-fetch broadly (back to polling's waste) or write the mapping by hand (back to silent bugs). Recording each query's read ranges answers the question exactly, including inserts that land in a range.

          **Consistency comes for free only with a snapshot.** If each subscription re-fetches on its own, a screen can show two moments. Running affected queries at one timestamp, and tagging results with it, fixes that; a plain cache plus notifications does not.

          **The same records protect writes.** Read sets also let the committer validate mutations, so rules like a work-in-progress limit hold under concurrency without locks.

          **What I concede.** This is a database-sized project. For an app with modest write rates, a few kinds of screen and users who tolerate a second of delay, Postgres plus a notification channel that triggers targeted re-fetches is much cheaper to build and run. I would choose the integrated design when many screens must be live, writes are frequent, and consistency on screen matters, or I would buy it rather than build it.
        `,
      },
      reveal: {
        reasoning: md`
          Strong defences name the **property** the simpler design lacks, not just the mechanism the complex one has. Here those properties are exactness (no missed or wasted re-runs), consistency (one moment per screen) and serializability (rules hold under concurrency), and all three come from one idea: knowing precisely what each function read.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      Queries and mutations run as functions against a **versioned store** at a snapshot timestamp, and the runtime records each one's **read set**: the index ranges it scanned, including empty gaps. A **subscription tracker** holds the read sets of all live queries and matches each commit's writes against them in commit order, so only queries whose answer can have changed are re-run, and results are pushed over the client's WebSocket tagged with their timestamp. Clients apply updates only when all their subscriptions agree on a timestamp, so screens never mix moments.

      The same read sets make mutations **serializable**: the **committer** accepts a mutation only if nothing it read changed after its snapshot, and otherwise it runs again. Identical subscriptions share one run through a **result cache**, and bursts of invalidations collapse into one run for the newest timestamp. Reconnecting clients replay mutations with IDs, then re-subscribe at one timestamp.
    `,
    reliesOn: [
      "Queries read through indexes, so their read sets are a few ranges rather than whole tables.",
      "Contention on any single range is low enough that optimistic retries are rare.",
      "The store keeps enough recent versions to validate mutations and run queries at a snapshot.",
      "Mutations are idempotent by client-generated ID.",
    ],
    alternatives: [
      { design: "Polling with short intervals", preferWhen: "Few users, rare changes, and a delay of seconds is acceptable." },
      { design: "Change data capture plus targeted re-fetch", preferWhen: "Keeping an existing database matters more than exact, consistent updates." },
      { design: "Local-first sync of raw data to the client", preferWhen: "Offline use matters and each user's data is small enough to hold on the device." },
    ],
    tradeoffs: [
      { choice: "Recorded read sets", gains: "Exact invalidation without developer effort.", costs: "Memory and matching work for every live query." },
      { choice: "Optimistic concurrency", gains: "Serializable mutations with no locks.", costs: "Retries under contention; long mutations may starve." },
      { choice: "Timestamped results", gains: "Consistent screens.", costs: "Requires a multiversion store and client-side buffering." },
    ],
    breaksWhen: [
      "Queries scan whole tables, so every write invalidates them.",
      "Many writers contend for one range, so mutations retry endlessly.",
      "Results depend on the viewer, so identical subscriptions cannot share a run.",
    ],
  },
  interviewVariants: [
    "Design Firebase, or a real-time database.",
    "How would you make a dashboard update live without polling?",
    "Design the sync layer for a collaborative task tracker like Linear or Trello.",
    "Two users break a rule at the same moment. How do you prevent it?",
  ],
  relatedInvestigationIds: ["realtime-collaboration", "distributed-cache", "notification-system"],
} satisfies InvestigationInput;
