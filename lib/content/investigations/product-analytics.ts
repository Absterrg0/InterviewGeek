import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const productAnalytics = {
  id: "product-analytics",
  title: "Product analytics over billions of events",
  searchTitle: "Design a Product Analytics System",
  premise:
    "Take in billions of product events a day and answer questions nobody planned for in seconds: choose where events live, keep ingestion alive through spikes and outages, make filters on people fast, and decide what happens when two anonymous visitors turn out to be one person.",
  difficulty: "intermediate",
  estimatedMinutes: 45,
  scenario: md`
    An analytics product for software teams. Customers add a snippet to their app, and it sends **events**: a page was viewed, a button clicked, a plan upgraded. Each event has a name, a timestamp, the ID of whoever did it, and a bag of properties (browser, country, plan, and whatever else the customer's developers decide to send).

    Customers build charts from these events without writing SQL: daily signups from Germany, the share of visitors who sign up and then pay within a week, how many people come back a month later. Each chart is a new question; the product cannot know in advance which ones will be asked.

    There are about **6,000 customer teams**, sending about **2 billion events a day** in total, and the biggest few teams send a large share of it. Everything currently lives in one Postgres table with the properties in a JSON column. Charts for small teams are fine. Charts for big teams time out.
  `,
  objectives: [
    "Size an event stream in rows, bytes and rows read per query.",
    "Choose a storage layout from the shape of analytical queries.",
    "Build ingestion that survives spikes, outages and retries without losing or doubling events.",
    "Decide when to copy data at write time to avoid a join at read time, and what that costs.",
    "Keep one huge customer from overloading the rest.",
  ],
  prerequisites: ["message-queues", "partitioning"],
  requirements: {
    functional: [
      "Accept events from customers' apps and servers.",
      "Answer trends, funnels and retention questions, filtered by any event or person property.",
      "Link a visitor's anonymous events to their account once they sign up.",
      "Show events in charts within a minute or so of being sent.",
    ],
    nonFunctional: [
      "A chart over 90 days of a large team's data returns in a few seconds.",
      "An accepted event is never lost, even if the analytics database is down.",
      "A retried batch never counts an event twice.",
      "One customer's traffic spike does not delay everyone else's charts.",
    ],
  },
  constraints: [
    "About 2 billion events a day, with peaks around four times the average.",
    "The largest teams each send hundreds of millions of events a month.",
    "Properties are free-form: thousands of different keys across all customers.",
  ],
  assumptions: [
    "An event is about 1 KB as sent, most of it properties.",
    "Queries almost always filter by one team and a time range.",
    "Events are never edited after they arrive; people's properties change over time.",
  ],
  competencies: [
    { id: "sizing", label: "Sizing an event stream", description: "Rows, bytes and the work a single query does." },
    { id: "storage", label: "Choosing a layout", description: "Matching storage to the shape of the questions." },
    { id: "ingestion", label: "Reliable ingestion", description: "Absorbing spikes and outages without losing or doubling events." },
    { id: "modelling", label: "Modelling for queries", description: "Denormalising on purpose, and knowing what it costs." },
    { id: "distribution", label: "Spreading the load", description: "Placing data so no customer becomes a hotspot." },
  ],
  system: {
    components: [
      { id: "apps", label: "Customers' apps", kind: "client", responsibility: "Send events in small batches through the analytics snippet.", position: { col: 0, row: 1 } },
      {
        id: "capture",
        label: "Capture API",
        kind: "edge",
        responsibility: "Checks the API key, stamps the team and a unique event ID, and appends to the stream; nothing else.",
        position: { col: 1, row: 1 },
      },
      {
        id: "stream",
        label: "Event stream",
        kind: "stream",
        responsibility: "Durable log of accepted events, partitioned by team and person ID, kept for several days.",
        durableState: "every accepted event, for several days",
        position: { col: 2, row: 1 },
      },
      {
        id: "ingest",
        label: "Ingestion workers",
        kind: "worker",
        responsibility: "Resolve each event's person, copy person properties onto it, and insert into the column store in large batches.",
        position: { col: 3, row: 1 },
      },
      {
        id: "events",
        label: "Events (column store)",
        kind: "database",
        responsibility: "One wide table, sorted by team, event name and time; hot properties stored as their own columns.",
        durableState: "all events, compressed by column",
        position: { col: 4, row: 1 },
      },
      {
        id: "persons",
        label: "Postgres",
        kind: "database",
        responsibility: "Customers, dashboards, and the mapping from anonymous and known IDs to people, with their current properties.",
        durableState: "people and their identities",
        position: { col: 3, row: 2 },
      },
      { id: "query", label: "Query service", kind: "service", responsibility: "Turns a chart into SQL, runs it, and caches the result for a short time.", position: { col: 4, row: 2 } },
      { id: "dashboard", label: "Customers' dashboards", kind: "client", responsibility: "Build charts and read them.", position: { col: 5, row: 2 } },
    ],
    flows: [
      { id: "send", from: "apps", to: "capture", label: "Batches of events", kind: "request" },
      { id: "ask", from: "dashboard", to: "query", label: "Chart request", kind: "request" },
      { id: "lookup", from: "query", to: "persons", label: "Teams and saved charts", kind: "request" },
      { id: "scan", from: "query", to: "events", label: "Aggregate by column", kind: "request" },
      { id: "append", from: "capture", to: "stream", label: "Append, then acknowledge", kind: "request" },
      { id: "consume", from: "ingest", to: "stream", label: "Read a partition", kind: "request" },
      { id: "resolve", from: "ingest", to: "persons", label: "Who is this ID?", kind: "request" },
      { id: "insert", from: "ingest", to: "events", label: "Batch insert", kind: "request" },
    ],
    invariants: [
      {
        id: "accepted-kept",
        statement: "An event the capture API accepted is eventually stored, even after hours of database downtime.",
        enforcedBy: ["capture", "stream", "ingest"],
        mechanism: "Capture acknowledges only after the append; workers move their position in the stream only after a batch is safely inserted; retention outlasts the longest outage.",
      },
      {
        id: "counted-once",
        statement: "A retried batch never counts an event twice.",
        enforcedBy: ["capture", "ingest", "events"],
        mechanism: "Every event gets a unique ID at capture; a retried batch reuses the same deduplication token, and the table collapses rows with the same event ID.",
      },
      {
        id: "person-order",
        statement: "One person's events are processed in order, by one worker at a time.",
        enforcedBy: ["stream", "ingest"],
        mechanism: "The stream is partitioned by team and person ID, and each partition has a single consumer.",
      },
    ],
  },
  stages: [
    {
      id: "the-numbers",
      title: "What one chart has to read",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["columnar-storage"],
      competencyIds: ["sizing"],
      context: md`
        Use 86,400 seconds a day and 1 KB an event. A large team sends 300 million events a month, and its daily-signups chart filters on two properties over 90 days.
      `,
      lesson: [

        {
          kind: "estimate",
          id: "rate",
          prompt: "2 billion events a day. About how many events a second on average?",
          answer: 23000,
          unit: "per second",
          working: md`
            2,000,000,000 ÷ 86,400 ≈ **23,000 a second**; peaks at 4× are about 93,000. A busy write rate, but an ordinary one if writes are batched.
          `,
        },
        {
          kind: "estimate",
          id: "volume",
          prompt: "At about 1 KB per event, how many terabytes of raw events arrive per day?",
          answer: 2,
          unit: "TB",
          working: md`
            2,000,000,000 × 1 KB = **2 TB a day**, about 180 TB over 90 days. Far too much to answer charts from memory.
          `,
        },
        {
          kind: "read",
          body: md`
            A **row store** like Postgres keeps each row's fields together on disk. To count rows, it reads whole rows, every field, even if the query uses three of them.

            An index helps **find** rows. It doesn't make **reading** them cheaper once they're found.
          `,
        },
        {
          kind: "estimate",
          id: "bytes-read",
          prompt: "A chart needs 900 million events, using 3 small fields from each 1 KB event. Reading whole rows, about how many gigabytes are read?",
          answer: 900,
          unit: "GB",
          working: md`
            900,000,000 × 1 KB = **900 GB** read, for perhaps 10 to 20 GB of fields actually used. The query isn't slow at finding rows; it's slow because it reads everything else in them.
          `,
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements follow?",
        claims: [
          {
            id: "rate",
            statement: "2 billion events a day is about 23,000 a second on average, so peaks near 90,000 a second.",
            verdict: "holds",
            explanation: "2,000,000,000 ÷ 86,400 ≈ 23,000; four times that is about 93,000. A busy but ordinary write rate if writes are batched.",
          },
          {
            id: "volume",
            statement: "That is about 2 TB of raw events a day, or roughly 180 TB for 90 days.",
            verdict: "holds",
            explanation: "2 billion × 1 KB = 2 TB a day. The volume, more than the rate, rules out answering from memory.",
          },
          {
            id: "one-chart",
            statement: "The big team's 90-day chart has to consider about 900 million events.",
            verdict: "holds",
            explanation: "300 million a month × 3 months. Even if each row takes a microsecond, a single chart is minutes of work on one core unless most of each row is never read.",
          },
          {
            id: "index-fixes",
            statement: "An index on (team, timestamp) in Postgres would make this chart fast.",
            verdict: "fails",
            explanation:
              "The index finds the 900 million rows quickly, but then each full row, properties and all, must be read to count them. The problem is not finding the rows; it is reading 900 GB to use three fields from each.",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Analytics queries are wide in rows and narrow in columns.",
          "Row stores read whole rows, so a three-field question pays for every field.",
          "Indexes find rows; they don't make reading them cheaper.",
        ],
        reasoning: md`
          Analytical questions are **wide in rows and narrow in columns**: they touch a large share of a team's events but only a few fields of each. A store that keeps whole rows together must read everything to answer them. That is the bottleneck to design around, not the write rate.
        `,
      },
    },
    {
      id: "where-events-live",
      title: "Where the events live",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["columnar-storage", "partitioning"],
      competencyIds: ["storage"],
      context: md`
        Charts are built by customers, so the questions are not known in advance. They nearly always filter by team and time range, then by event name and some properties.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A **column store** keeps each column's values together on disk: all timestamps in one place, all event names in another. A query reads only the columns it uses. See [[columnar-storage]].

            Values in one column are similar (the same few event names, increasing timestamps), so they **compress** very well, often 5 to 10×.
          `,
        },
        {
          kind: "read",
          body: md`
            Column stores also keep data **sorted** by a chosen key, and record the min and max of each block. A query whose filter matches the sort key can skip whole blocks without reading them.

            With the sort key (team, event, time), "team 42's signups last quarter" reads a thin slice and skips every block from other teams, events and dates.
          `,
        },
        {
          kind: "choice",
          id: "rollups",
          prompt: "Why not precompute daily counts for every event and property instead?",
          options: [
            {
              id: "unplanned",
              label: "Customers ask questions nobody planned (combined filters, funnels), and rollups only answer the ones you prepared.",
              correct: true,
              why: "Rollups are great for fixed dashboards. A funnel needs individual events in order, which a count can't give you.",
            },
            {
              id: "slow",
              label: "Rollups are slower to query than raw events.",
              why: "They're much faster for the questions they cover. The problem is coverage.",
            },
            {
              id: "storage",
              label: "Rollups take more storage than the events.",
              why: "They're far smaller. That's their appeal.",
            },
          ],
        },
        {
          kind: "predict",
          id: "column-costs",
          prompt: "What does a column store do badly?",
          answer: md`
            Updates and deletes (they rewrite compressed blocks), fetching one whole row (every column is a separate read), and many tiny inserts (each creates a small part to merge later). It wants large, append-only batches.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "Where should events be stored for querying?",
        options: [
          {
            id: "postgres-bigger",
            label: "Keep Postgres: partition the table by month, add read replicas and more indexes",
            assessment: "defensible",
            feedback: "Fine for smaller volumes, and it keeps one database. At this scale every chart still reads whole rows, so big teams stay slow however many replicas share the pain.",
          },
          {
            id: "rollups",
            label: "Pre-compute daily counts for each event and property as events arrive",
            assessment: "defensible",
            feedback:
              "Known charts become instant. But customers ask new questions, combine filters, and build funnels that need individual events in order. Rollups are a good addition for fixed dashboards, not a replacement for the events.",
          },
          {
            id: "column-store",
            label: "A column store with one wide events table, sorted by team, event name and time",
            assessment: "sound",
            feedback:
              "A chart reads only the columns it uses, compressed several times over, and the sort order lets it skip every block belonging to other teams, other events and other dates. This is the layout most product analytics systems settle on.",
          },
          {
            id: "search",
            label: "A search engine, indexing every property of every event",
            assessment: "defensible",
            feedback: "Excellent at finding individual events by any property. Aggregating hundreds of millions of them, and holding an index on thousands of keys, is expensive compared with a column store.",
          },
        ],
        rationale: {
          prompt: "Why does your choice make the big team's chart fast, and what does it make harder?",
          rubric: [
            { id: "columns", text: "Reads only the columns the query uses, and those compress well." },
            { id: "sort", text: "Sorting by team, event and time lets queries skip most of the data." },
            { id: "unknown", text: "Works for questions nobody planned, unlike rollups." },
            { id: "costs", text: "Names the costs: updates, deletes and single-row lookups are expensive; inserts must be batched.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Store by column: queries read only the columns they use, and columns compress well.",
          "Sort by team, event and time so queries skip most blocks.",
          "Column stores dislike updates, single-row reads and tiny inserts; batch your writes.",
        ],
        reasoning: md`
          The choice follows from the first stage: if queries use few columns of many rows, store data **by column**. The sort key is the other half: with (team, event, time) first, a query for one team's signups in one quarter reads a thin slice of a few columns. See [[columnar-storage]].

          The costs are real and shape the rest of the design: a column store wants **large batches** of inserts, dislikes **updates**, and is slow at fetching one whole row.
        `,
        tradeoffs: [
          { choice: "Row store with indexes", gains: "One database, easy updates.", costs: "Reads whole rows; slow for big teams." },
          { choice: "Rollups", gains: "Instant known charts.", costs: "Cannot answer new questions." },
          { choice: "Column store", gains: "Fast scans over few columns.", costs: "Batch inserts only; updates are expensive." },
        ],
      },
      reveals: { components: ["events"], flows: ["scan"] },
    },
    {
      id: "ingestion",
      title: "The database is down for twenty minutes",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["message-queues", "backpressure", "event-log"],
      competencyIds: ["ingestion"],
      event: {
        kind: "failure",
        title: "The column store restarts during peak",
        detail: "An upgrade takes the analytics database down for twenty minutes at peak. Apps keep sending events the whole time.",
      },
      context: md`
        Today the capture API inserts each request's events straight into the database. Twenty minutes at peak is about 100 million events.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Events arrive at a rate you don't control; the database absorbs them at a rate that varies, sometimes zero during an upgrade. A **durable log** (a stream like Kafka) between the two lets each run at its own pace. See [[event-log]].

            The capture API's job shrinks to: check, stamp, append to the stream, acknowledge.
          `,
        },
        {
          kind: "estimate",
          id: "outage-backlog",
          prompt: "The database is down for 20 minutes at a peak of about 90,000 events a second. Roughly how many million events must be held?",
          answer: 108,
          unit: "million events",
          working: md`
            90,000 × 1,200 s ≈ **108 million events**, about 100 GB at 1 KB each. A stream holding days of data absorbs that easily; capture servers' memory doesn't.
          `,
        },
        {
          kind: "choice",
          id: "retry-snippet",
          prompt: "Capture returns an error during the outage and relies on the snippet to retry later. What happens to many of those events?",
          options: [
            {
              id: "lost",
              label: "They're lost: tabs close and phones go offline before retrying.",
              correct: true,
              why: "Client retries are best effort. Accepting events into a durable buffer is the only way not to depend on them.",
            },
            {
              id: "fine",
              label: "They arrive later, when the database is back.",
              why: "Some will. Many clients are gone by then.",
            },
            {
              id: "duplicated",
              label: "They're duplicated.",
              why: "Duplicates are possible with retries, but the bigger risk here is loss.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            After an outage, the workers have the backlog **plus** live traffic. Size them, and the database, for the catch-up, not only for the average. See [[backpressure]].
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should events get from the capture API into the column store?",
        options: [
          {
            id: "direct",
            label: "Keep inserting directly, and return an error so the snippet retries later",
            assessment: "flawed",
            feedback:
              "Browsers close tabs and phones go offline, so many retries never happen and events are lost. And on a normal day, thousands of tiny inserts a second create thousands of small parts for the column store to merge.",
          },
          {
            id: "memory-buffer",
            label: "Buffer events in the capture servers' memory and insert them every few seconds",
            assessment: "flawed",
            feedback: "Batching fixes the small inserts, but a capture server that restarts loses its buffer, and twenty minutes of peak traffic will not fit in memory.",
          },
          {
            id: "stream",
            label: "Capture appends each batch to a durable, partitioned stream and acknowledges; workers read the stream and insert large batches",
            assessment: "sound",
            feedback:
              "Capture's only dependency is the stream, so an outage of the database delays charts but loses nothing: the stream holds days of events, and workers catch up when the database returns. Workers can also make batches as large as the column store likes.",
          },
          {
            id: "object-files",
            label: "Write events as files to object storage, and load them into the database every hour",
            assessment: "defensible",
            feedback: "Durable and cheap, and common for warehouses. But charts would lag by an hour, and customers expect events within a minute or so.",
          },
        ],
        rationale: {
          prompt: "What does the stream protect, and what has to be true for nothing to be lost?",
          rubric: [
            { id: "decouple", text: "Capture depends only on the stream, so database outages do not lose or reject events." },
            { id: "retention", text: "Retention must outlast the longest outage, plus time to catch up." },
            { id: "batch", text: "Workers insert large batches, which the column store needs." },
            { id: "order-ack", text: "Workers record their position only after a batch is inserted.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "A durable stream between capture and the database lets each run at its own pace.",
          "Capture depends only on the stream, so database outages delay charts but lose nothing.",
          "Workers insert large batches and must be sized for catching up, not just the average.",
        ],
        reasoning: md`
          Ingestion has two speeds: the speed events **arrive**, which you do not control, and the speed the database can **take** them, which varies. A durable log between them lets each run at its own pace. The capture API becomes simple and very hard to break: check, stamp, append, acknowledge.

          Catching up after an outage is its own load: the workers have twenty minutes of backlog plus live traffic. Size the workers and the database for that, not only for the average. See [[backpressure]].
        `,
      },
      reveals: { components: ["stream", "ingest"], flows: ["append", "consume", "resolve", "insert"] },
    },
    {
      id: "slow-again",
      title: "Slow again, for a different reason",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["columnar-storage"],
      competencyIds: ["modelling", "storage"],
      event: {
        kind: "failure",
        title: "The big team's chart takes 40 seconds",
        detail: "Charts that filter on properties are slow for large teams, even in the column store. Here is the query profile.",
      },
      context: md`
        Properties are stored as one JSON string column, because every customer sends different keys. Select the lines that point at the cause.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A column store only helps when the data is actually **in columns**. A single JSON column holding every property is, for those fields, a row store again: to read one property, the query reads and parses the whole blob for every row.
          `,
        },
        {
          kind: "choice",
          id: "profile",
          prompt: "A query profile shows 98% of blocks skipped by the sort key, but 37 of 38 GB read are the properties column. What's the problem?",
          options: [
            {
              id: "inside-row",
              label: "The sort key works; the waste is inside each row, in the JSON blob.",
              correct: true,
              why: "Skipping found the right rows efficiently. Then, to use two properties, each row's whole JSON was read and parsed.",
            },
            {
              id: "sort-key",
              label: "The sort key is wrong.",
              why: "98.6% of blocks skipped means it's doing its job.",
            },
            {
              id: "memory",
              label: "The server needs more memory.",
              why: "Peak memory was modest. Bytes read and JSON parsing dominate.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            The usual fix is a hybrid: keep the JSON for the long tail of rare keys, and **promote** the most-queried keys to real, typed columns, extracted from the JSON as rows are inserted. Which keys? Look at what queries actually filter on. Old data needs a backfill for the new columns to be useful over long ranges.
          `,
        },
      ],
      interaction: {
        kind: "diagnosis",
        prompt: "Select the lines that explain the slowness.",
        artifact: {
          type: "log",
          caption: "Query profile: daily signups where plan = 'pro' and country = 'DE', team 5150, last 90 days",
          lines: [
            { text: "blocks skipped by sort key (team, event, timestamp): 98.6%" },
            { text: "rows read: 41,200,000" },
            {
              text: "columns read: team_id, event, timestamp, properties",
              fault: "To use two properties, the query reads the whole properties column, which is most of each event's bytes.",
            },
            {
              text: "bytes read: 37.9 GB (properties: 37.1 GB)",
              fault: "Almost all the bytes are the JSON blob. The column layout is wasted on a column that holds everything.",
            },
            {
              text: "CPU profile: 81% JSONExtractString",
              fault: "Every row's JSON is parsed on every query to pull out two values. The same parsing is repeated for every chart that uses those keys.",
            },
            { text: "parallel threads: 32; peak memory: 1.4 GB" },
          ],
        },
        rationale: {
          prompt: "Why is the column store slow here, and what would you change?",
          rubric: [
            { id: "blob", text: "One JSON column holding all properties defeats reading only what you need." },
            { id: "parse", text: "Parsing JSON per row per query dominates CPU." },
            { id: "promote", text: "Store the most used properties as their own typed columns, filled at insert time (and backfilled for recent data)." },
            { id: "sort-fine", text: "Notes that the sort key is working; the waste is inside each row.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "One JSON column for all properties turns a column store back into a row store for those fields.",
          "Promote frequently queried keys to typed columns computed at insert time.",
          "Choose which keys to promote from real query patterns, and backfill recent data.",
        ],
        reasoning: md`
          A column store only helps if the data is actually in columns. Free-form properties tempt you into one big JSON column, which turns the column store back into a row store for exactly the fields people filter on.

          The usual answer is a hybrid: keep the JSON for the long tail of rare keys, and **promote** the keys that queries use most into real columns, computed from the JSON as rows are inserted. Find them by looking at which keys queries actually filter on. Old data needs a backfill for the new column; recent data is what most charts read, so start there.
        `,
      },
    },
    {
      id: "people",
      title: "Filtering by who did it",
      phase: "decide",
      dimensions: ["defend", "change"],
      conceptIds: ["columnar-storage", "caching"],
      competencyIds: ["modelling"],
      context: md`
        Customers filter charts by **person** properties too: "signups from people on the Pro plan", where *plan* belongs to the person and changes when they upgrade. People live in Postgres: about 2 billion of them across all teams, keyed by ID, with their current properties.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            **Denormalisation** copies data to where it's read, so queries don't have to join. It costs storage and write-time work, and the copy is a **snapshot**: it records what was true when it was copied.

            In analytics, reads are the expensive part and writes are append-only, so the trade usually pays.
          `,
        },
        {
          kind: "choice",
          id: "in-list",
          prompt: "Why not fetch Pro users' IDs from Postgres and filter events with WHERE person_id IN (…)?",
          options: [
            {
              id: "huge",
              label: "A big team can have millions of Pro users; shipping millions of IDs into a query is slow and fragile.",
              correct: true,
              why: "It works for small teams and breaks as customers grow, which is exactly when it matters.",
            },
            {
              id: "wrong",
              label: "It gives wrong answers.",
              why: "It's correct, using current properties. The problem is cost at scale.",
            },
            {
              id: "nothing",
              label: "Nothing; IN lists are fast.",
              why: "Short ones are. Millions of values aren't.",
            },
          ],
        },
        {
          kind: "predict",
          id: "snapshot-meaning",
          prompt: "Person properties are copied onto each event at ingestion. A user upgraded from Free to Pro last week. A chart asks 'signups by plan'. Which plan does their signup event show?",
          answer: md`
            Free: the plan they were on when they signed up. That's often the right answer ("what plan were people on when they did X?"), but it differs from "people who are Pro now". Write down which questions use snapshots, and offer current properties through a join for the ones that need them.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How do charts filter events by person properties?",
        options: [
          {
            id: "join-postgres",
            label: "Fetch the matching person IDs from Postgres, then filter events with an IN list",
            assessment: "flawed",
            feedback: "A big team can have millions of Pro users. Shipping millions of IDs from one database into a query on another is slow and fragile, and it gets worse as customers grow.",
          },
          {
            id: "join-copy",
            label: "Copy people into a table in the column store, and join events to people at query time",
            assessment: "defensible",
            feedback:
              "Correct, always using people's current properties. But joining hundreds of millions of events to millions of people on every chart is heavy, and the persons table changes constantly, which a column store handles poorly.",
          },
          {
            id: "denormalise",
            label: "When an event is ingested, copy the person's ID and current properties onto it",
            assessment: "sound",
            feedback:
              "Charts filter on columns that are already on each event: no join. The meaning changes, though: an event records the person's properties as they were when it happened. For many questions ('what plan were people on when they did this?') that is the better answer; for others it is a surprise to explain.",
          },
          {
            id: "precompute",
            label: "Pre-compute, for each person, counts of each event they have done",
            assessment: "defensible",
            feedback: "Fast for 'people who did X at least 3 times', but it cannot answer time-based charts or funnels, which need the events themselves.",
          },
        ],
        rationale: {
          prompt: "What do you gain by copying, and what do you give up?",
          rubric: [
            { id: "no-join", text: "Removes the join from every chart; filters read columns on the event." },
            { id: "point-in-time", text: "Properties become as of the event, not current; says when that is right and when it surprises." },
            { id: "storage", text: "Costs storage and ingestion work, softened by column compression." },
            { id: "both", text: "Mentions offering current properties through a join for the queries that need them.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Copy person properties onto events at ingestion to remove the join from every chart.",
          "Copied properties are snapshots as of the event, not current values.",
          "Offer current properties through a join for the questions that need them.",
        ],
        reasoning: md`
          This is denormalisation on purpose: pay once at write time to avoid paying on every read. In an analytics system reads are the expensive part and writes are append-only, so the trade usually wins.

          The cost is semantic, not just storage. Copied data is a **snapshot**: it tells you what was true when the event happened. Write down which questions that answers differently, because customers will ask.
        `,
        tradeoffs: [
          { choice: "Join at query time", gains: "Always current; no duplication.", costs: "Heavy joins on every chart." },
          { choice: "Copy onto events", gains: "No joins; history is preserved.", costs: "Point-in-time meaning; more bytes; later changes do not apply to old events." },
        ],
      },
    },
    {
      id: "anonymous",
      title: "Two visitors who were one person",
      phase: "break",
      dimensions: ["break", "explain"],
      conceptIds: ["ordering", "partitioning", "idempotency"],
      competencyIds: ["modelling", "ingestion"],
      event: {
        kind: "failure",
        title: "The funnel counts one person twice",
        detail:
          "A visitor browses anonymously for a week, then signs up. The customer's signup funnel shows two people: one who viewed pages and never signed up, and one who signed up without viewing anything.",
      },
      context: md`
        Anonymous events carry a random device ID. At signup, the snippet sends an *identify* call linking that device ID to the new account. Person data is copied onto events at ingestion, as decided in the last stage.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Before signup, a visitor's events carry a random device ID. At signup, an **identify** call links that device ID to the new account. But earlier events were already stored with the device ID, and in a column store nothing rewrites stored events cheaply.

            So after the link, the same human appears as two people in older data.
          `,
        },
        {
          kind: "choice",
          id: "fix-history",
          prompt: "What's a cheap way to make funnels count them as one person without rewriting events?",
          options: [
            {
              id: "override-table",
              label: "Keep a small table mapping old IDs to merged ones and apply it at query time, folding it in periodically",
              correct: true,
              why: "Merges are rare compared with events, so the table stays small and the join is cheap. A background job can rewrite events in bulk occasionally.",
            },
            {
              id: "update-each",
              label: "Update the person ID on every past event at each merge",
              why: "Correct, but each update rewrites whole compressed blocks, and merges happen constantly.",
            },
            {
              id: "ignore",
              label: "Ignore it; it's a small error",
              why: "It breaks funnels in exactly the case customers care most about: anonymous visitors becoming users.",
            },
          ],
        },
        {
          kind: "predict",
          id: "order",
          prompt: "The identify call and the user's next event are processed by different workers, and the event is processed first. What goes wrong?",
          answer: md`
            The event is tagged with the old anonymous person, because the link didn't exist yet when it was enriched. Partitioning the stream by team and person ID puts both on one worker, in order. See [[ordering]].
          `,
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "old-events",
            statement: "Linking the two IDs at signup does not change the person on events already stored.",
            verdict: "holds",
            explanation: "The person was copied onto each anonymous event when it was ingested, and nothing rewrites stored events. The link affects only events ingested afterwards.",
          },
          {
            id: "rewrite",
            statement: "The fix is to update the person ID on every past event whenever two people are merged.",
            verdict: "depends",
            explanation:
              "It gives the right answer, but updates rewrite whole blocks of a column store, and merges happen constantly. Done one merge at a time it can overwhelm the database. Batching them, or keeping a small table of overrides that queries apply on top, are the usual compromises.",
          },
          {
            id: "any-order",
            statement: "Ingestion can process events for the same person on any worker, in any order.",
            verdict: "fails",
            explanation:
              "If the identify call and the next event are processed out of order, the event is tagged with the wrong person. Partition the stream by team and person ID so one worker sees each person's events in order. See [[ordering]].",
          },
          {
            id: "overrides",
            statement: "A small table mapping old person IDs to merged ones, applied at query time, keeps funnels right without rewriting events.",
            verdict: "holds",
            explanation: "Merges are rare compared with events, so the table is small and the join is cheap. A background job can fold it into the events table periodically and empty it.",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Identity merges change the meaning of old events, which a column store can't cheaply rewrite.",
          "Keep a small table of ID overrides applied at query time, folded in periodically.",
          "Partition the stream by person so identify calls and events are processed in order.",
        ],
        reasoning: md`
          Identity is the place where "events are never edited" meets reality: the meaning of old events changes when you learn who they belonged to. You can rewrite history (expensive in a column store), or keep a small, separate record of corrections and apply it when querying, folding it in from time to time.

          Ordering matters too. Processing one person's events in order requires that they land in one partition, which is a [[partitioning]] decision made at the capture API.
        `,
        otherwise: "Some products choose never to merge retroactively and document it. That is simpler, and fine if customers understand that funnels start counting at identification.",
      },
    },
    {
      id: "exactly-counted",
      title: "Write the batch inserter",
      phase: "decide",
      dimensions: ["implement", "break"],
      conceptIds: ["delivery-guarantees", "idempotency", "event-log"],
      competencyIds: ["ingestion"],
      context: md`
        Write the loop each ingestion worker runs for one stream partition. Inserts can fail, and workers can crash at any point. The database deduplicates an insert whose \`dedupToken\` it has seen recently.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A stream consumer has two steps per batch: **insert** the batch, then **commit** its position ("I've processed up to offset 5,000"). The order decides what a crash does:

            - Commit then insert: a crash in between skips the batch. **Lost.**
            - Insert then commit: a crash in between re-reads the batch. **Duplicated**, unless the database can recognise it.
          `,
        },
        {
          kind: "choice",
          id: "dedup-token",
          prompt: "To let the database recognise a retried batch, what should its deduplication token be?",
          options: [
            {
              id: "offsets",
              label: "Derived from the batch's partition and offset range, so the same work always gets the same token",
              correct: true,
              why: "A retry of the same batch covers the same offsets and produces the same token, which the database recognises as a repeat.",
            },
            {
              id: "random",
              label: "A random UUID per insert attempt",
              why: "A retry would get a new UUID, so the database couldn't tell it's the same batch.",
            },
            {
              id: "time",
              label: "The current timestamp",
              why: "A retry happens at a different time, so it gets a different token.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            "Exactly once" in practice is **at least once plus deduplication**. See [[delivery-guarantees]]. And batches must be large (by size or time), because a column store turns every insert into a part it later merges.
          `,
        },
      ],
      interaction: {
        kind: "implementation",
        prompt: "Implement runPartition.",
        language: "typescript",
        starter: md`
          type Event = { id: string; offset: number; teamId: number; distinctId: string; name: string; at: string; props: Record<string, unknown> };

          declare const stream: {
            read(partition: number, fromOffset: number, max: number): Promise<Event[]>;
            committedOffset(partition: number): Promise<number>; // next offset to read
            commit(partition: number, nextOffset: number): Promise<void>;
          };
          declare const db: { insert(rows: Event[], dedupToken: string): Promise<void> };
          declare function enrich(e: Event): Promise<Event>; // resolves the person, copies their properties

          export async function runPartition(partition: number): Promise<never> {
            // read, batch, insert, commit
          }
        `,
        rubric: [
          { id: "after", text: "Commits the stream position only after the insert succeeds." },
          { id: "batch", text: "Accumulates a large batch (by size or time) instead of inserting each event." },
          { id: "token", text: "Uses a deduplication token derived from the batch's offsets, so a retried batch is recognised." },
          { id: "retry", text: "Retries a failed insert with backoff instead of skipping the batch." },
          { id: "order", text: "Enriches events in order within the partition.", weight: "supporting" },
        ],
        reference: {
          code: md`
            const MAX_ROWS = 50_000;
            const MAX_WAIT_MS = 2_000;
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

            export async function runPartition(partition: number): Promise<never> {
              let next = await stream.committedOffset(partition);
              for (;;) {
                const batch: Event[] = [];
                const started = Date.now();
                while (batch.length < MAX_ROWS && Date.now() - started < MAX_WAIT_MS) {
                  const events = await stream.read(partition, next + batch.length, MAX_ROWS - batch.length);
                  if (events.length === 0) await sleep(100);
                  for (const e of events) batch.push(await enrich(e)); // in order: identify calls first
                }
                if (batch.length === 0) continue;

                const first = batch[0]!.offset;
                const last = batch[batch.length - 1]!.offset;
                const token = \`\${partition}:\${first}-\${last}\`;

                for (let attempt = 0; ; attempt++) {
                  try {
                    await db.insert(batch, token);
                    break;
                  } catch {
                    await sleep(Math.min(30_000, 500 * 2 ** attempt) * (0.5 + Math.random() / 2));
                  }
                }
                next = last + 1;
                await stream.commit(partition, next);
              }
            }
          `,
          notes: md`
            - The position is committed after the insert. A crash in between means the batch is read and inserted again, so the token must be the same next time.
            - The token comes from the offsets, not from a random value, so a restarted worker produces the same one for the same batch, provided batches are cut the same way. Each event's unique ID gives a second line of defence if they are not.
            - Batches close on size or time, so quiet partitions still reach charts within seconds.
            - A failed insert is retried with backoff rather than skipped: skipping would commit past events that were never stored.
          `,
        },
      },
      reveal: {
        takeaways: [
          "Insert, then commit the stream position: crashes then cause repeats, never loss.",
          "Derive the dedup token from the batch's offsets so retries are recognised.",
          "Accumulate large batches, and retry failed inserts with backoff instead of skipping.",
        ],
        reasoning: md`
          "Exactly once" here is really **at least once, plus deduplication**: the stream may hand you a batch twice, and the database recognises the repeat. The two rules that make it work are the order of operations (insert, then commit) and a deduplication key that is the same every time the same work is retried. See [[delivery-guarantees]].
        `,
      },
    },
    {
      id: "one-giant-team",
      title: "One customer is a third of the traffic",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["partitioning", "rate-limiting"],
      competencyIds: ["distribution", "ingestion"],
      event: {
        kind: "scale",
        title: "A customer launches",
        detail: "One team's app goes viral. It now sends a third of all events, and its charts read more data than any other team's.",
      },
      context: md`
        The column store runs on several servers. Each table is split into shards across them, and a query runs on every shard that holds relevant data, in parallel.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            How you split data across servers (**sharding**) decides where load lands. The natural choice is to shard by what queries filter on. But if one value of that key gets most of the traffic, one server gets most of the work. See [[partitioning]].
          `,
        },
        {
          kind: "choice",
          id: "by-team",
          prompt: "Events are sharded by team. One team becomes a third of all traffic. What happens?",
          options: [
            {
              id: "hot",
              label: "Its server takes a third of all writes and runs its heaviest charts alone, while others idle.",
              correct: true,
              why: "Sharding by team keeps each team on one machine, so the biggest team can never use more than one.",
            },
            {
              id: "even",
              label: "Load stays even, because there are 6,000 teams.",
              why: "Teams aren't equal. One very large team concentrates load.",
            },
            {
              id: "auto",
              label: "The database splits the team automatically.",
              why: "Not with a team-based shard key. Hashing within the team does that.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Hashing (team, person) spreads each team over every server, so its charts run in parallel everywhere. Keeping one person's events together keeps per-person questions (funnels, retention) on one shard.

            Spreading data isn't isolation, though: per-team ingestion quotas and query concurrency limits stop one team's success from becoming everyone else's outage.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should events be spread across the database servers?",
        options: [
          {
            id: "by-team",
            label: "Shard by team, so each team's data sits on one server",
            assessment: "flawed",
            feedback: "The viral team's server takes a third of all writes and runs its heaviest queries alone, while the others sit idle. It also cannot grow beyond one machine.",
          },
          {
            id: "by-person",
            label: "Shard by a hash of team and person ID, so every team's events spread across all servers; queries run on all shards in parallel",
            assessment: "sound",
            feedback:
              "Writes and reads for the big team are spread evenly, and its charts run in parallel on every server. One person's events stay together, which keeps per-person questions (funnels, retention) local to a shard.",
          },
          {
            id: "own-cluster",
            label: "Move the largest customers to their own cluster",
            assessment: "defensible",
            feedback: "Strong isolation, and worth it for a handful of very large accounts. It is more to operate, and it does not tell you how to spread data within any one cluster.",
          },
          {
            id: "drop",
            label: "Sample the viral team's events at 10% until the spike passes",
            assessment: "defensible",
            feedback: "A legitimate tool if the customer agrees and charts scale numbers back up, but it changes their data. It is a product decision, not a sharding scheme.",
          },
        ],
        rationale: {
          prompt: "Why does your scheme stay balanced, and what keeps one team from hurting the others?",
          rubric: [
            { id: "spread", text: "Hashing within a team spreads one team's writes and reads across all servers." },
            { id: "local", text: "Keeping a person's events together keeps funnel and retention work local." },
            { id: "isolation", text: "Adds per-team limits (ingestion quotas or query concurrency) so one team cannot take all capacity." },
            { id: "lag", text: "Notes that the stream absorbs the burst; ingestion lag rises for a while but nothing is lost.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Shard by what spreads load, not by what you filter on.",
          "Hashing team and person spreads a big team across all servers while keeping each person local.",
          "Add per-team quotas and query limits for isolation; spreading data isn't the same thing.",
        ],
        reasoning: md`
          Shard by what spreads the load, not by what you filter on. Every query filters by team, but sharding by team puts the biggest team's load on one machine. Hashing **within** the team spreads it, and the sort key still lets each shard skip other teams' data.

          Spreading data is not the same as isolating customers. Per-team quotas at capture and limits on concurrent queries keep one team's success from becoming everyone else's outage. See [[partitioning]].
        `,
      },
    },
    {
      id: "defend-stack",
      title: "Defend the pipeline",
      phase: "defend",
      dimensions: ["defend"],
      conceptIds: ["columnar-storage", "message-queues"],
      competencyIds: ["storage", "ingestion", "modelling", "distribution"],
      context: md`
        Your interviewer: "That is a stream, a fleet of workers and a separate database. Why not keep Postgres with good rollups, or send everything to a managed warehouse?"
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A good defence ties every component to a requirement:

            | Component | Requirement it serves |
            | --- | --- |
            | Column store | ad hoc questions over huge volumes |
            | Stream | no lost events through outages and spikes |
            | Copied person properties | fast filters without joins |
            | Hashed sharding and quotas | fairness between customers |

            A component you can't tie to a requirement shouldn't be in the design.
          `,
        },
        {
          kind: "choice",
          id: "when-postgres",
          prompt: "When would Postgres with rollups be the better choice?",
          options: [
            {
              id: "small",
              label: "At smaller volumes, or when the set of charts is fixed and known in advance",
              correct: true,
              why: "Then rollups cover the questions, and one database is far simpler to run.",
            },
            {
              id: "never",
              label: "Never; column stores are always better for analytics",
              why: "They're better at scale for ad hoc questions. At small scale, the extra systems cost more than they save.",
            },
            {
              id: "writes",
              label: "When writes outnumber reads",
              why: "Analytics is append-heavy anyway. The deciding factors are volume and how open-ended the questions are.",
            },
          ],
        },
      ],
      interaction: {
        kind: "open",
        prompt: "Defend the design, concede what the alternatives do better, and say when you would pick them.",
        placeholder: "The requirement that rules out rollups is…",
        rubric: [
          { id: "unknown-questions", text: "Customers ask questions nobody planned, so rollups alone cannot serve them." },
          { id: "layout", text: "Explains why a column store fits: few columns, many rows, compression, sort-key skipping." },
          { id: "stream", text: "Explains what the stream buys: outages and spikes do not lose events, and inserts are batched." },
          { id: "concede", text: "Concedes when Postgres or a managed warehouse is better: smaller volumes, or freshness and cost measured differently." },
        ],
        reference: md`
          **The requirement that decides it** is that customers build their own charts. Rollups answer the questions you planned; they cannot answer a funnel someone thought of this morning. So the raw events must be queryable, fast, at the scale of the largest customer.

          **Why a column store.** Those questions read a few fields from a very large number of events. Storing by column, compressed and sorted by team, event and time, turns a 900 GB scan into a few gigabytes. Promoting hot properties to columns and copying person properties onto events keeps it that way.

          **Why the stream.** It separates accepting events from storing them. The capture API stays simple and up; outages and spikes become lag rather than loss; and the database gets the large batches it needs.

          **What I concede.** Under tens of millions of events a month, Postgres with sensible indexes and a few rollups is simpler and good enough. A managed warehouse removes the operational work, and is the right call when charts can be minutes old or query costs per scan are acceptable. This design earns its complexity when interactive, ad hoc questions over billions of events are the product.
        `,
      },
      reveal: {
        takeaways: [
          "Tie each component to a requirement it serves.",
          "Rollups alone can't answer questions nobody planned.",
          "Concede when Postgres or a managed warehouse is the better trade.",
        ],
        reasoning: md`
          A good defence ties each part to a requirement: ad hoc questions (column store), no lost events (stream), fast person filters (copied properties), fairness between customers (hashing and quotas). If a part cannot be tied to a requirement, it should not be in the design.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      Customers' apps send events to a **capture API** that only checks the key, stamps the team and a unique event ID, and appends to a durable **event stream** partitioned by team and person. **Ingestion workers** read each partition in order, resolve the person (linking anonymous IDs at signup), copy the person's current properties onto each event, and insert large batches into a **column store**, committing their position only after each insert, with a deduplication token so retries never double-count.

      Events sit in one wide table sorted by team, event name and time, sharded by a hash of team and person so no customer becomes a hotspot. Frequently filtered properties are real columns; the rest stay in JSON. Charts read only the columns they need and skip everything outside the team and date range, so a 90-day chart over hundreds of millions of events takes seconds. Person merges are recorded in a small override table applied at query time and folded in periodically.
    `,
    reliesOn: [
      "Stream retention outlasts the longest database outage plus catch-up time.",
      "Queries almost always filter by team and time, matching the sort key.",
      "A small set of properties accounts for most filters.",
      "Customers accept that copied person properties describe the moment of the event.",
    ],
    alternatives: [
      { design: "Postgres with indexes and rollups", preferWhen: "Volumes are modest, or the charts are a fixed set." },
      { design: "Managed warehouse (BigQuery, Snowflake)", preferWhen: "Freshness of minutes is fine and the team does not want to run a database." },
      { design: "Pre-aggregated time-series store", preferWhen: "Questions are metrics over fixed dimensions rather than per-person funnels." },
    ],
    tradeoffs: [
      { choice: "Column store", gains: "Fast scans and compression.", costs: "Batch-only inserts; expensive updates." },
      { choice: "Durable stream in front", gains: "No loss through outages; batching.", costs: "Another system; charts lag during catch-up." },
      { choice: "Person data copied onto events", gains: "No joins on reads.", costs: "Point-in-time semantics; merges need corrections." },
    ],
    breaksWhen: [
      "Queries routinely span all teams or ignore time, so the sort key cannot skip data.",
      "Customers need person properties as they are now for every chart.",
      "Merges become so frequent that the override table grows faster than it can be folded in.",
    ],
  },
  interviewVariants: [
    "Design Google Analytics, Mixpanel or Amplitude.",
    "Design a system that counts events and shows real-time dashboards.",
    "Design an ad-click aggregation system.",
    "Why would you use a column store for analytics, and what is it bad at?",
  ],
  relatedInvestigationIds: ["url-shortener", "job-queue", "distributed-cache"],
} satisfies InvestigationInput;
