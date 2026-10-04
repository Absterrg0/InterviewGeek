import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const shardLiveDatabase = {
  id: "shard-live-database",
  title: "Sharding Postgres while it is running",
  searchTitle: "Shard a Live Database Without Downtime",
  premise:
    "Built from how Notion and Figma sharded Postgres while millions of people were using it: choose a shard key, choose a shard count you can live with for years, move every row while writes continue, prove the copy is right, and grow again later without starting over.",
  difficulty: "advanced",
  estimatedMinutes: 50,
  scenario: md`
    A collaborative workspace app stores everything (pages, blocks, comments) in one Postgres primary, already on the largest instance available. The biggest table has billions of rows. Writes keep climbing, autovacuum can no longer keep up, and the database is drifting toward **transaction ID wraparound**: the point at which Postgres stops accepting writes to protect itself.

    Every block belongs to exactly one workspace, and almost every query stays inside one workspace. The infrastructure team is small, and it knows Postgres well.

    Notion was in this position in 2020 and wrote up the whole migration, then wrote again in 2023 about growing from 32 to 96 database hosts. Figma described a similar journey in 2024, and Stripe and GitHub have published the patterns for moving live data safely. This investigation follows their decisions.
  `,
  objectives: [
    "Explain what sharding fixes that bigger machines, replicas and table partitioning do not.",
    "Choose a shard key from the access pattern, and a shard count you can grow into.",
    "Plan a migration in which no write is lost and every step until cutover can be undone.",
    "Find the bugs that make a backfill silently corrupt data.",
    "Reason about what stops working once data is split: cross-shard queries and global constraints.",
  ],
  prerequisites: ["partitioning", "replication"],
  requirements: {
    functional: [
      "Route every query to the shard that holds its data.",
      "Move all existing data from the monolith into shards.",
      "Keep serving reads and writes during the migration.",
      "Add database hosts later without changing how the application finds data.",
    ],
    nonFunctional: [
      "No acknowledged write is ever lost.",
      "At most a few minutes of planned disruption at cutover.",
      "Until cutover, every step can be reversed.",
      "The sharded copy is verified to match before it serves users.",
    ],
  },
  constraints: [
    "One Postgres primary on the largest instance size; billions of rows in the largest tables.",
    "Vacuum is falling behind, and transaction ID wraparound is a hard deadline.",
    "Stay on Postgres: the team's expertise and tooling are built around it.",
  ],
  assumptions: [
    "Every row can be attributed to a workspace (directly, or through its parent).",
    "IDs are UUIDs, so rows can be copied between databases without ID conflicts.",
    "Rows carry an updated-at version that increases on every write.",
  ],
  competencies: [
    { id: "pressure", label: "Reading the pressure", description: "Knowing which limit you are hitting and what actually relieves it." },
    { id: "shard-design", label: "Shard key and layout", description: "Choosing the key, the number of logical shards and their placement." },
    { id: "migration", label: "Moving data live", description: "Capturing writes, backfilling and cutting over without loss." },
    { id: "verification", label: "Proving it is correct", description: "Comparing stores before trusting the new one." },
    { id: "cross-shard", label: "Living with shards", description: "What becomes hard once data is split, and how to design around it." },
  ],
  system: {
    components: [
      { id: "users", label: "Users", kind: "client", responsibility: "Read and edit pages.", position: { col: 0, row: 1 } },
      { id: "app", label: "Application servers", kind: "service", responsibility: "Compute the shard from workspace_id; send each query to its shard; dark-read and compare during migration.", position: { col: 1, row: 1 } },
      { id: "monolith", label: "Monolith Postgres", kind: "database", responsibility: "The original database; source of truth until cutover.", durableState: "all data (until retired)", position: { col: 2, row: 0 } },
      { id: "audit-log", label: "Write audit log", kind: "stream", responsibility: "Every write made during the migration, in order.", position: { col: 3, row: 0 } },
      { id: "backfill", label: "Backfill and catch-up", kind: "worker", responsibility: "Copies existing rows, then replays the log; checkpoints per table and shard; never overwrites newer versions.", position: { col: 4, row: 0 } },
      { id: "poolers", label: "Connection poolers", kind: "service", responsibility: "PgBouncer clusters that map logical shards to physical hosts and can pause traffic for a cutover.", position: { col: 2, row: 1 } },
      { id: "shards", label: "Shard hosts", kind: "database", responsibility: "480 logical shards (one Postgres schema each), spread across physical hosts.", durableState: "all data, by workspace", position: { col: 3, row: 1 } },
    ],
    flows: [
      { id: "requests", from: "users", to: "app", label: "Requests", kind: "request" },
      { id: "legacy", from: "app", to: "monolith", label: "Reads and writes until cutover", kind: "request" },
      { id: "log-writes", from: "app", to: "audit-log", label: "Log every write", kind: "async" },
      { id: "copy", from: "backfill", to: "monolith", label: "Copy existing rows", kind: "request" },
      { id: "replay", from: "backfill", to: "audit-log", label: "Replay logged writes", kind: "request" },
      { id: "apply", from: "backfill", to: "shards", label: "Write rows by shard", kind: "request" },
      { id: "query", from: "app", to: "poolers", label: "Queries by shard", kind: "request" },
      { id: "route", from: "poolers", to: "shards", label: "Schema on host", kind: "request" },
    ],
    invariants: [
      {
        id: "one-home",
        statement: "Every row of a workspace lives on exactly one logical shard.",
        enforcedBy: ["app", "shards"],
        mechanism: "Logical shard = hash(workspace_id) mod 480; a map assigns each logical shard (schema) to a host.",
      },
      {
        id: "no-lost-writes",
        statement: "No write made during the migration is lost.",
        enforcedBy: ["audit-log", "backfill"],
        mechanism: "Writes are logged before the copy starts; catch-up replays them in order; the backfill never overwrites a newer version.",
      },
      {
        id: "reversible",
        statement: "Until cutover, the monolith is the source of truth and the switch can be undone.",
        enforcedBy: ["app", "monolith"],
        mechanism: "Shards receive copies only; reads from shards are dark (compared, not served) until verification passes.",
      },
    ],
  },
  stages: [
    {
      id: "why-shard",
      title: "What is actually running out?",
      phase: "model",
      dimensions: ["explain", "defend"],
      conceptIds: ["partitioning", "replication"],
      competencyIds: ["pressure"],
      context: md`
        Postgres tags each transaction with a 32-bit ID. Vacuum must periodically "freeze" old rows so IDs can be reused; if it falls too far behind, Postgres stops accepting writes rather than risk corrupting data.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "bigger",
            statement: "Moving to a bigger instance would fix this for good.",
            verdict: "fails",
            explanation: "They are already on the largest instance. And vacuum's work grows with table size, so a faster machine postpones the deadline without changing its direction.",
          },
          {
            id: "replicas",
            statement: "Adding read replicas would relieve the pressure.",
            verdict: "fails",
            explanation: "Replicas take reads off the primary, but this is a write-volume and table-size problem on the primary. Every replica also replays every write.",
          },
          {
            id: "partition-local",
            statement: "Splitting the largest tables into partitions on the same host makes each vacuum smaller, but every partition still shares one host's CPU, disk and connections.",
            verdict: "holds",
            explanation: "Native partitioning helps maintenance, not capacity. The host's limits are the ceiling.",
          },
          {
            id: "shard-fixes",
            statement: "Spreading workspaces across many hosts divides write volume, table sizes and vacuum work between them.",
            verdict: "holds",
            explanation: "Each host holds a fraction of the data and receives a fraction of the writes, so every per-host limit is pushed back by roughly the number of hosts.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          Name the limit before choosing the fix. Here it is **per-host write volume and table size**: replicas do not touch it, a bigger machine is not available, and partitioning inside one host only makes maintenance smaller. Horizontal [[partitioning]] is the only option that divides the load itself. That justifies the cost, which is considerable: Notion described sharding as something they would rather have done earlier, while the data was smaller and the migration simpler.
        `,
      },
    },
    {
      id: "shard-key",
      title: "Choose the shard key",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["partitioning"],
      competencyIds: ["shard-design"],
      context: md`
        Most queries load a page's blocks, a workspace's sidebar or a page's comments. A workspace may have one member or thousands.
      `,
      interaction: {
        kind: "decision",
        prompt: "What should determine which shard a row lives on?",
        options: [
          {
            id: "workspace",
            label: "The workspace ID, for every table that belongs to a workspace",
            assessment: "sound",
            feedback:
              "Almost every query stays inside one workspace, so almost every query hits one shard, and joins between a workspace's blocks, pages and comments stay local. It is the key Notion chose. The cost: very large workspaces are concentrated on one shard, and anything that crosses workspaces becomes a multi-shard query.",
          },
          {
            id: "user",
            label: "The ID of the user who created the row",
            assessment: "flawed",
            feedback: "A shared page contains blocks written by many users, so loading one page would gather rows from many shards. The key does not match how data is read.",
          },
          {
            id: "block",
            label: "A hash of each row's own ID, for perfectly even distribution",
            assessment: "flawed",
            feedback: "Data spreads evenly, and every page load becomes a scatter-gather across all shards. Even distribution is worthless if the common query has to touch everything.",
          },
          {
            id: "created",
            label: "Time ranges of creation date, so old data sits on cold shards",
            assessment: "flawed",
            feedback: "All new writes land on the newest shard, which becomes the hot spot, and a page with old and new blocks spans shards.",
          },
        ],
        rationale: {
          prompt: "Explain your key in terms of the queries it keeps on one shard and the ones it does not.",
          rubric: [
            { id: "locality", text: "Common queries and joins stay inside one workspace, so they hit one shard." },
            { id: "derivable", text: "Every row can be attributed to a workspace, so the key is known for every query." },
            { id: "costs", text: "Names the costs: big workspaces concentrate load; cross-workspace queries span shards." },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The shard key is chosen from **the queries**, not from the data's size or distribution. A key that sends the common query to one shard, and keeps related rows together for joins, is worth far more than a perfectly even spread. Figma calls groups of tables sharded by the same key "colos" (colocations) for exactly this reason: tables that are queried together must be split the same way.

          Notion added one regret afterwards: they wished every table's primary key had included the workspace ID, so the shard could be found from a row's ID alone without looking anything up.
        `,
      },
    },
    {
      id: "how-many",
      title: "How many shards?",
      phase: "decide",
      dimensions: ["defend", "change"],
      conceptIds: ["partitioning", "consistent-hashing"],
      competencyIds: ["shard-design"],
      context: md`
        Today 32 hosts are enough. In a few years it may be 96, or more. Moving rows between shards is a migration in its own right; moving a whole shard from one host to another is much easier.
      `,
      interaction: {
        kind: "decision",
        prompt: "How should shards map to hosts?",
        options: [
          {
            id: "one-per-host",
            label: "32 shards, one per host",
            assessment: "defensible",
            feedback:
              "Simple today. But growing to 40 or 96 hosts means splitting shards: rehashing workspaces to new shard numbers and moving their rows, which is another full data migration.",
          },
          {
            id: "logical",
            label: "480 logical shards (one Postgres schema each), 15 per host on 32 hosts; growing means moving whole schemas to new hosts",
            assessment: "sound",
            feedback:
              "A workspace's logical shard never changes, so growth means moving schemas, not re-hashing rows. 480 divides evenly by 32, 40, 48, 60, 80, 96 and more, so hosts stay balanced at many sizes. This is exactly Notion's layout, and how they later grew to 96 hosts.",
          },
          {
            id: "many",
            label: "16,384 logical shards spread over the 32 hosts",
            assessment: "defensible",
            feedback:
              "Very flexible placement, but hundreds of schemas per host multiply catalog size, connection pools and migration tooling. Worth it with good automation; more than this team needs.",
          },
          {
            id: "consistent",
            label: "Consistent hashing of workspace IDs directly onto hosts, so adding a host moves only a fraction of workspaces",
            assessment: "defensible",
            feedback:
              "It limits how many workspaces move, but those that do still have their rows moved individually between live databases. Fixed logical shards turn the same growth into moving whole schemas with database replication, which is much easier to do safely.",
          },
        ],
        rationale: {
          prompt: "What does your scheme make easy later, and why?",
          rubric: [
            { id: "stable", text: "A workspace's logical shard never changes; only the shard-to-host map does." },
            { id: "move-unit", text: "Growth moves whole logical shards with database tools rather than re-sharding rows." },
            { id: "divisible", text: "The shard count divides evenly into many host counts.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Separate the **logical** layout (which shard a row belongs to, fixed forever) from the **physical** layout (which host a shard lives on, changed whenever you like). Then growth is a routing change plus a database copy, not a data re-shuffle.

          Figma reached the same split by a different route: they sharded "logically" first, using views inside existing databases, so the application could be tested against the sharded layout before any data moved physically.
        `,
        tradeoffs: [
          { choice: "Many logical shards per host", gains: "Growth by moving schemas; balanced at many host counts.", costs: "More schemas to manage; routing must map shard to host." },
        ],
      },
      reveals: { components: ["poolers", "shards"], flows: ["query", "route"] },
    },
    {
      id: "migration-plan",
      title: "Move billions of rows, live",
      phase: "change",
      dimensions: ["change", "trace"],
      conceptIds: ["online-migrations", "event-log"],
      competencyIds: ["migration"],
      event: {
        kind: "requirement-change",
        title: "The migration starts",
        detail: "Every row must reach its shard while users keep writing. The team will allow a few minutes of scheduled maintenance for the final switch, and no more.",
      },
      context: md`
        Notion captured writes with an application-level audit log rather than Postgres logical replication, because replicating the initial snapshot of tables this large through logical replication was too slow for them at the time.
      `,
      interaction: {
        kind: "ordering",
        prompt: "Put the migration steps in a safe order.",
        items: [
          { id: "log", label: "Start logging every write to an audit log, alongside the normal write to the monolith" },
          { id: "backfill", label: "Copy every existing row from the monolith to its shard, never overwriting a newer version" },
          { id: "catch-up", label: "Replay audit-log entries written since logging began, until the shards trail the monolith by seconds" },
          { id: "verify", label: "Verify: compare sampled rows, and run dark reads against both and alert on differences" },
          { id: "cutover", label: "In a short maintenance window, stop writes, let catch-up finish, then switch reads and writes to the shards" },
          { id: "retire", label: "Keep the monolith for a while as a fallback, then retire it" },
        ],
        explanation: md`
          Logging must start **before** the copy, so that any write the copy misses is in the log. The copy then has a fixed past to cover, and catch-up closes the gap. Verification happens while the monolith is still the truth, so a mismatch costs a fix, not an incident. Only then does the switch happen. See [[online-migrations]].

          Notion's backfill ran on 96 CPUs for about three days; the cutover took five minutes of scheduled maintenance. They noted afterwards that a zero-downtime switch would have been possible with more work, which they did for the 2023 expansion.
        `,
      },
      reveal: {
        reasoning: md`
          The order is the design. Each step depends on the one before it being complete: capture before copy, copy before catch-up, catch-up before verify, verify before switch. Every safe live migration published by Stripe, GitHub, Notion, Figma and Discord follows this shape, whatever the tools.
        `,
      },
      reveals: { components: ["audit-log", "backfill"], flows: ["log-writes", "copy", "replay", "apply"] },
    },
    {
      id: "backfill-bug",
      title: "Shards that are slightly in the past",
      phase: "break",
      dimensions: ["break", "implement", "trace"],
      conceptIds: ["online-migrations", "concurrency-control", "backpressure"],
      competencyIds: ["migration", "verification"],
      event: {
        kind: "failure",
        title: "Verification finds old versions of recently edited blocks",
        detail:
          "About 0.02% of sampled blocks differ: the shard holds an older version than the monolith. Meanwhile, the monolith's p99 latency doubled while the backfill ran, and when the catch-up process was restarted after a deploy, it started again from the beginning.",
      },
      context: md`
        Here is the backfill and catch-up code. Find every line that contributes to these three problems.
      `,
      interaction: {
        kind: "diagnosis",
        prompt: "Select the faulty lines.",
        artifact: {
          type: "code",
          language: "typescript",
          caption: "migrate.ts",
          lines: [
            { text: "async function backfill(table: string) {" },
            {
              text: "  for await (const batch of monolith.scan(table, { batchSize: 5000 })) {",
              fault: "Scans the primary as fast as it can, competing with production traffic. Throttle the copy (or read from a replica or snapshot) and back off when the primary is busy.",
            },
            { text: "    for (const row of batch) {" },
            { text: "      const shard = shardFor(row.space_id);" },
            {
              text: "      await shard.upsert(table, row, { onConflict: 'id', update: 'all' });",
              fault:
                "If catch-up has already written a newer version of this row, the backfill's older copy overwrites it. Only write when the row is absent or the incoming version is newer (WHERE existing.version < incoming.version).",
            },
            { text: "    }" },
            { text: "  }" },
            { text: "}" },
            { text: "" },
            { text: "async function catchUp() {" },
            {
              text: "  for await (const entry of auditLog.readFrom(0)) {",
              fault: "Always starts at the beginning of the log. Persist the position of the last applied entry and resume from it.",
            },
            { text: "    await applyToShard(entry);   // same versioned write as the backfill" },
            { text: "  }" },
            { text: "}" },
          ],
        },
        rationale: {
          prompt: "Explain how each bug arises, and what the corrected code does.",
          rubric: [
            { id: "clobber", text: "The backfill can overwrite newer data written by catch-up; writes must be conditional on version." },
            { id: "throttle", text: "The copy must be throttled so it does not degrade production." },
            { id: "checkpoint", text: "Progress must be checkpointed so restarts resume." },
            { id: "idempotent", text: "Notes that replaying log entries must be idempotent, because restarts and overlaps replay some entries twice.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          Backfill and catch-up run **concurrently** against the same rows, so they need a rule for who wins, and "the last one to write" is wrong. "The newest version wins" is right, and it makes every write idempotent too: replaying an entry twice, or backfilling a row that catch-up already wrote, changes nothing.

          The throttle and checkpoint bugs are about operating the migration rather than its correctness, but they decide whether it finishes in days or drags on for weeks. Discord's migration and Stripe's both describe the same priorities.
        `,
      },
    },
    {
      id: "verify",
      title: "Is the copy right?",
      phase: "decide",
      dimensions: ["explain", "defend"],
      conceptIds: ["online-migrations", "reconciliation", "replication"],
      competencyIds: ["verification"],
      context: md`
        Before the shards serve a single user, the team wants evidence that they match. Notion compared randomly sampled records and ran dark reads: queries sent to both databases with results compared, while users still got the monolith's answer. Stripe used GitHub's Scientist library for the same kind of comparison.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "counts",
            statement: "If row counts match for every table, the data matches.",
            verdict: "fails",
            explanation: "Counts catch missing rows, not stale ones. Every bug in the previous stage would leave counts identical.",
          },
          {
            id: "dark-reads",
            statement: "Dark reads test the sharded data with real query patterns, without risking what users see.",
            verdict: "holds",
            explanation: "They run production queries against both stores and report differences, while users get the monolith's result. They also exercise the new routing code.",
          },
          {
            id: "lag-mismatch",
            statement: "Comparing immediately after a write will report false mismatches while catch-up is a few seconds behind.",
            verdict: "holds",
            explanation: "Compare after a short delay, or re-check a mismatch before alerting. Notion's 2023 re-shard sampled with a brief delay for this reason.",
          },
          {
            id: "unit-tests",
            statement: "With thorough unit tests on the migration code, verification against production data is unnecessary.",
            verdict: "fails",
            explanation: "Production data contains years of edge cases no fixture has: odd encodings, orphaned rows, rows from old schema versions. Verification is about the data, not the code.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          Verification is [[reconciliation]] between two stores: compare, explain every difference, fix the cause. It only has value while the old store is still authoritative, which is why it sits before the cutover in every published migration plan.
        `,
      },
    },
    {
      id: "grow-again",
      title: "From 32 hosts to 96",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["partitioning", "replication", "online-migrations"],
      competencyIds: ["shard-design", "migration", "pressure"],
      event: {
        kind: "scale",
        title: "Two years later, the shards are running hot",
        detail: "Some hosts exceed 90% CPU at peak, disk bandwidth is near its limit, and connection pools are close to theirs. Year-end traffic is coming.",
      },
      context: md`
        Each of the 32 hosts holds 15 of the 480 logical shards.
      `,
      interaction: {
        kind: "decision",
        prompt: "How do you add capacity?",
        options: [
          {
            id: "rehash",
            label: "Change the hash so workspaces spread over 96 shards instead",
            assessment: "flawed",
            feedback: "Changing the hash moves almost every workspace to a different shard: a full row-by-row migration, again. The logical layout exists so you never have to do this.",
          },
          {
            id: "move-schemas",
            label: "Add 64 hosts; move whole schemas so each host holds 5 instead of 15, using Postgres logical replication; switch each host over by briefly pausing traffic at the poolers",
            assessment: "sound",
            feedback:
              "No workspace changes logical shard; only the schema-to-host map changes. Database replication copies the schemas, a pause of about a second at the poolers lets replication finish, routing flips, and traffic resumes. Notion did this in 2023 and reported CPU and disk utilisation falling to about 20% at peak.",
          },
          {
            id: "vertical",
            label: "Move each host to a bigger instance",
            assessment: "defensible",
            feedback: "Quick if bigger instances exist, but it costs more per unit of capacity, can only be done once or twice, and does not let you separate the heaviest shards from each other.",
          },
          {
            id: "replicas",
            label: "Add read replicas to every shard",
            assessment: "defensible",
            feedback: "It relieves read load, but the hot resources here include write-driven CPU and disk on the primaries, which replicas do not reduce.",
          },
        ],
        rationale: {
          prompt: "Why is this expansion so much easier than the original migration?",
          rubric: [
            { id: "unit", text: "The unit of movement is a whole logical shard, so no row changes shard." },
            { id: "replication", text: "Database replication can copy whole schemas, replacing custom backfill code." },
            { id: "pause", text: "Cutover is a brief pause at the poolers while replication drains, then a routing change." },
            { id: "connections", text: "Mentions keeping connection counts bounded as hosts multiply (e.g. splitting the poolers).", weight: "supporting" },
          ],
        },
      },
      reveal: {
        reasoning: md`
          The first migration bought the second one: because the logical layout was fixed, the expansion was "copy schemas with standard replication, flip routing". Notion reported two lessons from it worth stealing: build indexes **after** the initial sync (it cut their sync from three days to twelve hours), and watch connection counts, because every pooler connecting to three times as many hosts is three times the connections. They split PgBouncer into four clusters, each in front of 24 hosts.
        `,
      },
    },
    {
      id: "across-shards",
      title: "Queries that cross shards",
      phase: "change",
      dimensions: ["change", "break", "explain"],
      conceptIds: ["partitioning", "concurrency-control", "transactions"],
      competencyIds: ["cross-shard"],
      event: {
        kind: "requirement-change",
        title: "Features that span workspaces",
        detail: "Product wants 'recent pages across all your workspaces', and user accounts (which are not inside any workspace) need globally unique emails.",
      },
      context: md`
        Rows for different workspaces now live in different databases.
      `,
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "one-shard",
            statement: "A query filtered by one workspace ID touches exactly one shard.",
            verdict: "holds",
            explanation: "That is the point of the shard key: the router computes the shard from the workspace ID.",
          },
          {
            id: "scatter",
            statement: "'Recent pages across all your workspaces' must query every shard holding one of the user's workspaces and merge the results.",
            verdict: "holds",
            explanation: "A scatter-gather. It is fine when it touches a few shards; for features that need many, maintain a separate index (per-user recent pages) updated on write.",
          },
          {
            id: "unique-email",
            statement: "A unique index on email in each shard's users table enforces globally unique emails.",
            verdict: "fails",
            explanation:
              "Each shard's index sees only its own rows, so two shards can each accept the same email. Global uniqueness needs one place that owns it, for example an unsharded table keyed by email, or users sharded by email.",
          },
          {
            id: "cross-tx",
            statement: "Moving a page from one workspace to another can still be a single local transaction.",
            verdict: "fails",
            explanation: "The workspaces may be on different hosts. The move becomes a multi-step operation (copy, switch, delete) that must be made safe with idempotent steps and a state machine, or a distributed transaction.",
          },
        ],
      },
      reveal: {
        reasoning: md`
          Sharding is a trade: every operation inside the key gets cheaper, and every operation across keys gets harder. Joins, uniqueness and transactions that span shards need explicit designs: an index maintained on write, a separate owner for global constraints, a multi-step workflow. Figma built a query proxy (DBProxy) that parses SQL, routes single-shard queries and scatter-gathers the rest, and still asked teams to avoid cross-shard queries where they could.
        `,
      },
    },
    {
      id: "defend-postgres",
      title: "Why not a distributed database?",
      phase: "defend",
      dimensions: ["defend"],
      conceptIds: ["partitioning", "online-migrations"],
      competencyIds: ["pressure", "shard-design", "cross-shard"],
      context: md`
        Your interviewer: "This is months of custom work. Why not move to a distributed SQL database like CockroachDB, Spanner or Vitess, which shards for you?"
      `,
      interaction: {
        kind: "open",
        prompt: "Make the case for hand-sharding Postgres here, concede what the alternative offers, and say when you would choose it.",
        placeholder: "The deadline is transaction ID wraparound…",
        rubric: [
          { id: "risk", text: "Weighs risk and timeline: a new database means a full migration plus new operational expertise, under a hard deadline." },
          { id: "expertise", text: "Values the team's existing Postgres expertise, tooling and extensions." },
          { id: "concede", text: "Concedes what a distributed database gives: automatic rebalancing, cross-shard transactions, less custom routing code." },
          { id: "when", text: "Names when they would choose the distributed database (greenfield, bigger team, heavy cross-shard transactions)." },
        ],
        reference: md`
          **Risk and time.** The deadline is wraparound, which stops all writes. Moving to a new database is the same live migration plus learning a new system's failure modes, performance profile and operations at the same moment. Hand-sharding keeps every database a Postgres database the team already knows how to run, tune, back up and debug.

          **Compatibility.** The application's queries, extensions and tooling keep working inside a shard. A distributed SQL database is "Postgres-compatible" up to a point, and finding those points mid-migration is costly.

          **What I concede.** A distributed database rebalances automatically, supports cross-shard transactions, and removes the routing layer and migration tooling we have to own. Those are real; Figma listed the same alternatives and chose sharding Postgres for the same reasons of risk and timeline.

          **When I would choose it.** A new system without legacy data, a team with time to learn it, or a product where cross-shard transactions are central (a ledger spanning many accounts) would make a distributed database the better call.
        `,
      },
      reveal: {
        reasoning: md`
          Good infrastructure decisions are often about **risk under a deadline**, not about which technology is best in general. Both Notion and Figma made the "boring" choice and said why; that reasoning is what an interviewer wants to hear.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      Sharding divides the one resource that was running out: per-host write volume and table size. The **shard key is the workspace**, because almost every query and join lives inside one, so most queries still touch one database. A **fixed set of 480 logical shards** (Postgres schemas) is mapped to physical hosts, so growth is moving whole schemas, never re-hashing rows.

      The migration follows the safe order: **log writes first, backfill without overwriting newer versions, catch up, verify with sampled comparisons and dark reads, then cut over** in a short window, with the monolith authoritative and the switch reversible until then. Later growth uses database replication and a brief pause at the connection poolers. Cross-workspace features are designed explicitly: scatter-gather for a few shards, write-time indexes for many, and a single owner for global constraints.
    `,
    reliesOn: [
      "Almost every query is scoped to one workspace.",
      "Every row's workspace can be determined.",
      "Rows carry versions, so concurrent copies can be reconciled.",
      "A few minutes of planned maintenance is acceptable for the first cutover.",
    ],
    alternatives: [
      { design: "Distributed SQL (CockroachDB, Spanner, YugabyteDB)", preferWhen: "Starting fresh, or cross-shard transactions are central and the team can adopt a new database." },
      { design: "Vitess or Citus in front of existing databases", preferWhen: "You want sharding middleware rather than routing in the application." },
      { design: "Vertical partitioning (separate databases per table group)", preferWhen: "A few tables dominate load and they rarely join with the rest. Figma did this first." },
    ],
    tradeoffs: [
      { choice: "Workspace as shard key", gains: "Single-shard queries and local joins.", costs: "Large workspaces concentrate load; cross-workspace features get harder." },
      { choice: "Many logical shards per host", gains: "Growth without re-sharding.", costs: "More schemas, and routing that maps shards to hosts." },
      { choice: "Application audit log for capture", gains: "Works at a scale where logical replication snapshots were too slow.", costs: "Custom code that must capture every write path." },
      { choice: "Scheduled maintenance at cutover", gains: "Simple, certain final switch.", costs: "Minutes of downtime." },
    ],
    breaksWhen: [
      "One workspace grows beyond a single host's capacity.",
      "Cross-workspace queries become the common case.",
      "Global constraints or transactions span many shards routinely.",
    ],
  },
  interviewVariants: [
    "How would you shard a database that is already in production?",
    "Migrate a large table to a new schema or store with zero downtime.",
    "How do you choose a shard key?",
    "Your database is running out of capacity. Walk me through your options.",
  ],
  relatedInvestigationIds: ["chat-message-store", "payment-workflow"],
} satisfies InvestigationInput;
