import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const newsFeed = {
  id: "news-feed",
  title: "A home timeline at 300,000 reads a second",
  searchTitle: "Design a News Feed (Twitter Timeline)",
  premise:
    "Built from Twitter's own account of its home timeline: decide when the work of 'one post, many followers' happens, survive accounts with thirty million followers, and stop precomputing timelines for people who never come back.",
  difficulty: "intermediate",
  estimatedMinutes: 45,
  scenario: md`
    On a social network, people post short messages and follow other accounts. The home timeline shows the latest posts from everyone you follow, newest first, and it is the first thing every app open loads.

    At the scale Twitter described in 2012–13: about 150 million active users, around 400 million posts a day (roughly 5,000 a second, 12,000 or more during big live events), and about **300,000 home-timeline reads a second**. Most accounts have a few hundred followers. A handful have tens of millions.

    Raffi Krikorian, then running Twitter's timeline infrastructure, described how they built this in his talk "Timelines at Scale". This investigation walks through the same decisions.
  `,
  objectives: [
    "Use the read/write ratio to decide when to fan out.",
    "Trace a post from author to follower through every component.",
    "Handle accounts whose audience makes write-time fan-out too slow.",
    "Treat timelines as derived, rebuildable data, and store references rather than copies.",
    "Adapt the design when the timeline has to be ranked rather than chronological.",
  ],
  prerequisites: ["caching", "asynchronous-processing"],
  requirements: {
    functional: [
      "Post a message.",
      "Follow and unfollow accounts.",
      "Read the home timeline, newest first, with pagination.",
      "Delete a post, after which nobody sees it.",
    ],
    nonFunctional: [
      "The home timeline loads in tens of milliseconds.",
      "A new post appears in followers' timelines within a few seconds.",
      "One account's post never delays delivery for everyone else.",
      "Losing a cache node loses no posts.",
    ],
  },
  constraints: [
    "About 300,000 timeline reads a second at peak.",
    "About 5,000 posts a second on average, 12,000+ during big events.",
    "Some accounts have more than 30 million followers.",
    "Posts are stored durably in a sharded database; the social graph is a separate service.",
  ],
  assumptions: [
    "People mostly read the first page or two of their timeline.",
    "Keeping the latest 800 entries per user is enough; older pages can be slower.",
    "Post IDs are time-sortable 64-bit IDs, so sorting by ID is sorting by time.",
  ],
  competencies: [
    { id: "sizing", label: "Read/write arithmetic", description: "Turning rates and follower counts into the cost of each design." },
    { id: "fan-out", label: "When to fan out", description: "Choosing between doing the work at write time or at read time." },
    { id: "hot-accounts", label: "Huge accounts", description: "Keeping one enormous audience from stalling the system." },
    { id: "derived-data", label: "Timelines as derived data", description: "References instead of copies; rebuild instead of back up." },
    { id: "read-path", label: "The read path", description: "Merging, hydrating, paginating and ranking a timeline." },
  ],
  system: {
    components: [
      { id: "authors", label: "Authors", kind: "client", responsibility: "Post messages.", position: { col: 0, row: 0 } },
      { id: "write-api", label: "Write API", kind: "service", responsibility: "Stores the post, then enqueues a fan-out job and returns.", position: { col: 1, row: 0 } },
      { id: "posts", label: "Post store", kind: "database", responsibility: "Every post, by ID, with a cache in front for hydration.", durableState: "posts and deletions", position: { col: 3, row: 0 } },
      { id: "fanout-queue", label: "Fan-out queue", kind: "queue", responsibility: "Durable queue of fan-out jobs.", position: { col: 1, row: 1 } },
      { id: "fanout", label: "Fan-out workers", kind: "worker", responsibility: "Insert the post ID into each active follower's timeline; skip accounts above the size threshold.", position: { col: 2, row: 1 } },
      { id: "graph", label: "Social graph", kind: "service", responsibility: "Who follows whom, and who has been active recently.", position: { col: 3, row: 1 } },
      { id: "timelines", label: "Timeline cache", kind: "cache", responsibility: "Per-user list of the latest 800 post IDs, three replicas. Derived; rebuildable.", position: { col: 2, row: 2 } },
      { id: "timeline-api", label: "Timeline service", kind: "service", responsibility: "Reads a page of IDs, merges large accounts' recent posts, hydrates and filters.", position: { col: 1, row: 2 } },
      { id: "readers", label: "Readers", kind: "client", responsibility: "Open the app and scroll.", position: { col: 0, row: 2 } },
    ],
    flows: [
      { id: "post", from: "authors", to: "write-api", label: "Post", kind: "request" },
      { id: "store", from: "write-api", to: "posts", label: "Store post", kind: "request" },
      { id: "enqueue", from: "write-api", to: "fanout-queue", label: "Fan-out job", kind: "async" },
      { id: "take", from: "fanout", to: "fanout-queue", label: "Take jobs", kind: "request" },
      { id: "followers", from: "fanout", to: "graph", label: "Active followers", kind: "request" },
      { id: "insert", from: "fanout", to: "timelines", label: "Push ID, trim to 800", kind: "request" },
      { id: "read", from: "readers", to: "timeline-api", label: "GET home timeline", kind: "request" },
      { id: "ids", from: "timeline-api", to: "timelines", label: "Page of IDs", kind: "request" },
      { id: "hydrate", from: "timeline-api", to: "posts", label: "Hydrate; large accounts' recent posts", kind: "request" },
    ],
    invariants: [
      {
        id: "post-never-waits",
        statement: "Posting never waits for delivery.",
        enforcedBy: ["write-api", "fanout-queue"],
        mechanism: "The post is stored and a fan-out job enqueued; delivery happens asynchronously.",
      },
      {
        id: "references",
        statement: "A timeline is never the only copy of anything.",
        enforcedBy: ["timelines", "timeline-api"],
        mechanism: "Timelines hold post IDs; content is hydrated from the post store, which drops deleted posts.",
      },
      {
        id: "bounded-write",
        statement: "A post costs at most a bounded amount of fan-out work, however large the audience.",
        enforcedBy: ["fanout", "timeline-api"],
        mechanism: "Accounts above a follower threshold are not fanned out; their recent posts are merged at read time.",
      },
    ],
  },
  stages: [
    {
      id: "size-it",
      title: "What the numbers say",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["fan-out", "caching"],
      competencyIds: ["sizing"],
      context: md`
        Twitter reported about 30 billion timeline deliveries a day from about 400 million posts. Each timeline entry needs about 20 bytes: a post ID, the author's ID and a few flag bits.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            **Fan-out** is the multiplication of one event into many deliveries: one post, many followers' timelines. The work can happen at **write time** (when the post is made) or at **read time** (when a timeline is loaded). See [[fan-out]].

            Which is cheaper depends on how often each side happens. Work belongs on the rarer side.
          `,
        },
        {
          kind: "estimate",
          id: "ratio",
          prompt: "300,000 timeline reads a second, and about 6,000 posts a second at peak. Roughly how many reads per post?",
          answer: 50,
          unit: "reads per post",
          working: md`
            300,000 ÷ 6,000 = **50**. Every unit of work moved from read time to write time is paid 50 times less often.
          `,
        },
        {
          kind: "estimate",
          id: "fanout-avg",
          prompt: "30 billion timeline deliveries a day from 400 million posts. On average, how many timelines does each post reach?",
          answer: 75,
          unit: "timelines",
          working: md`
            30,000,000,000 ÷ 400,000,000 = **75**. That's an average over a very uneven distribution: most accounts have hundreds of followers, a few have tens of millions.
          `,
        },
        {
          kind: "estimate",
          id: "memory",
          prompt: "Each user's timeline keeps 800 entries of about 20 bytes. About how many terabytes for 150 million users (one copy)?",
          answer: 2.4,
          unit: "TB",
          working: md`
            800 × 20 = 16 KB per user. 16 KB × 150,000,000 = 2.4 × 10¹² bytes ≈ **2.4 TB**, about 7 TB with three replicas. A big memory fleet, but an affordable one.
          `,
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements follow?",
        claims: [
          {
            id: "ratio",
            statement: "Timeline reads outnumber posts by roughly 50 to 1.",
            verdict: "holds",
            explanation: "300,000 reads a second against about 6,000 posts a second (including peaks) is about 50:1. Work moved from reads to writes is multiplied by far fewer events.",
          },
          {
            id: "average-fanout",
            statement: "On average, each post is delivered to about 75 timelines.",
            verdict: "holds",
            explanation: "30 billion deliveries / 400 million posts ≈ 75. That is the average; the distribution has an extremely long tail.",
          },
          {
            id: "pull-same-cost",
            statement: "Assembling timelines at read time would cost about the same as fanning out at write time.",
            verdict: "fails",
            explanation:
              "At read time, each of 300,000 requests a second would fetch recent posts from the hundreds of accounts its reader follows and merge them: tens of millions of lookups a second plus a merge per request. At write time, ~350,000 cheap list inserts a second on average do the same job once.",
          },
          {
            id: "petabytes",
            statement: "Keeping 800 post IDs for each of 150 million users needs petabytes of memory.",
            verdict: "fails",
            explanation: "800 × ~20 bytes ≈ 16 KB a user; 150 million users ≈ 2.4 TB, about 7 TB with three replicas. A large in-memory fleet, but nowhere near petabytes.",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Reads outnumber posts about 50:1, so work moved to write time is paid far less often.",
          "The average post reaches about 75 timelines, but the distribution has a very long tail.",
          "Timelines of IDs fit in a few terabytes of memory.",
        ],
        reasoning: md`
          Two numbers decide the design: reads are about **50 times** more frequent than writes, and the average post goes to about **75** timelines. Moving the multiplication to write time is the cheaper side for the average post, and keeping the result in memory is affordable.

          The word *average* is doing a lot of work there. The tail of that distribution is the subject of stage 4.
        `,
      },
    },
    {
      id: "push-or-pull",
      title: "When does the multiplication happen?",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["fan-out", "asynchronous-processing", "caching"],
      competencyIds: ["fan-out", "derived-data"],
      context: md`
        Somebody has to combine "one author" with "many readers". Choose where.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            The two strategies:

            | | Fan-out on write (push) | Fan-out on read (pull) |
            | --- | --- | --- |
            | Posting | insert into every follower's list | store the post once |
            | Reading | fetch one list | fetch every followed account's posts, merge |
            | Cost lands on | writes | reads |
          `,
        },
        {
          kind: "estimate",
          id: "pull-lookups",
          prompt: "With pull, each of 300,000 reads a second fetches recent posts from the ~200 accounts its reader follows. About how many lookups a second is that?",
          answer: 60000000,
          unit: "lookups per second",
          working: md`
            300,000 × 200 = **60 million lookups a second**, plus a merge per request. Push does about 75 inserts per post × 5,000 posts a second ≈ 375,000 inserts a second for the same result.
          `,
        },
        {
          kind: "choice",
          id: "ids-or-copies",
          prompt: "Timelines could hold full copies of posts or just post IDs. What happens to copies when the author deletes a post?",
          options: [
            {
              id: "stays",
              label: "Every copy stays in every timeline unless another fan-out finds and removes them.",
              correct: true,
              why: "Copies are independent. With IDs, the post lives once; deleting it there makes it disappear from every timeline when IDs are turned back into posts at read time.",
            },
            {
              id: "gone",
              label: "They disappear automatically.",
              why: "Nothing connects a copy to the original. That's why storing references matters.",
            },
            {
              id: "cheaper",
              label: "Nothing changes; copies are cheaper to read.",
              why: "Reads save one lookup, but every edit and delete becomes another fan-out.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should home timelines be built?",
        options: [
          {
            id: "sql",
            label: "At read time, with one SQL query joining follows to posts, ORDER BY created_at DESC LIMIT 50",
            assessment: "flawed",
            feedback:
              "This is how most products start, and it is fine at small scale. At 300,000 requests a second, each merging hundreds of authors' posts across a sharded post store, it misses the latency requirement by orders of magnitude.",
          },
          {
            id: "pull",
            label: "At read time: fetch each followed account's recent posts from a per-author cache and merge them",
            assessment: "defensible",
            feedback:
              "Posting is O(1) and there is nothing to precompute. But every read fans out to hundreds of authors and merges, so the cost lands on the side that happens 50 times more often. It is the right shape when reads are rare relative to writes.",
          },
          {
            id: "push-ids",
            label: "At write time: insert the new post's ID into each follower's precomputed timeline list in memory; a read fetches one list",
            assessment: "sound",
            feedback:
              "Reads become a single lookup of a short list, which is exactly what you want 300,000 times a second. Each post costs one insert per follower, done asynchronously so the author is not kept waiting. Storing IDs keeps entries tiny and leaves the content in one place.",
          },
          {
            id: "push-copies",
            label: "At write time: copy the full post into each follower's timeline",
            assessment: "flawed",
            feedback:
              "Every post is stored 75 times on average, and editing or deleting it needs another fan-out to find and fix every copy. Deleted posts would keep showing up, which violates a requirement.",
          },
        ],
        rationale: {
          prompt: "Justify where you put the work, with numbers.",
          rubric: [
            { id: "ratio", text: "Uses the read/write ratio: precomputing moves work to the much rarer side." },
            { id: "async", text: "Fan-out runs asynchronously, so posting stays fast." },
            { id: "ids", text: "Timelines store IDs, not copies, so content lives in one place." },
            { id: "tail", text: "Anticipates that very large audiences make write-time fan-out expensive.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Put the fan-out on the rarer side: here, write time.",
          "Run fan-out asynchronously so posting stays fast.",
          "Store IDs in timelines, not copies, so content lives in one place.",
        ],
        reasoning: md`
          Twitter's home timeline is fan-out on write: each user's timeline is a list in a Redis cluster, capped at 800 entries and replicated three times, and a post is inserted into every follower's list. Reads are one list lookup plus hydration. See [[fan-out]].

          Timelines hold IDs (plus the author and a few flags). The post itself lives once, in the post store, which keeps timelines tiny and makes deletion a single write.
        `,
      },
      reveals: { components: ["fanout-queue", "fanout", "timelines"], flows: ["enqueue", "take", "followers", "insert", "ids"] },
    },
    {
      id: "trace-a-post",
      title: "Trace a post to a follower's screen",
      phase: "model",
      dimensions: ["trace"],
      conceptIds: ["fan-out", "asynchronous-processing"],
      competencyIds: ["fan-out", "read-path"],
      context: md`
        An author with 200 followers posts. One of those followers opens the app a few seconds later.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Tracing a request means following it through each component in order, and noting where the user stops waiting. Everything after that point can be slow or retried without them noticing, but it's also why there's a delay before followers see the post.
          `,
        },
        {
          kind: "choice",
          id: "author-waits",
          prompt: "With fan-out on write done asynchronously, how long does the author wait after pressing Post?",
          options: [
            {
              id: "store-enqueue",
              label: "Only for the post to be stored and a fan-out job enqueued",
              correct: true,
              why: "The author's request ends there. Delivering to followers happens afterwards, which is why it can take a few seconds.",
            },
            {
              id: "all",
              label: "Until every follower's timeline has been updated",
              why: "That would make posting as slow as the largest audience. The fan-out is asynchronous so the author doesn't wait.",
            },
            {
              id: "nothing",
              label: "Not even for the store: the post is queued first",
              why: "The post must be durable before the request returns, or a crash could lose it.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            **Hydration** turns IDs back into content: the read path fetches a page of post IDs from the timeline, then looks up the posts themselves (mostly from a cache). Posts that no longer exist are simply dropped.
          `,
        },
      ],
      interaction: {
        kind: "ordering",
        prompt: "Put these steps in order.",
        items: [
          { id: "store", label: "The write API stores the post durably and assigns its ID" },
          { id: "enqueue", label: "A fan-out job is enqueued and the author's request returns" },
          { id: "followers", label: "A fan-out worker asks the social graph for the author's recently active followers" },
          { id: "insert", label: "For each follower, it pushes the post ID onto their timeline list and trims the list to 800" },
          { id: "read", label: "The follower's app asks the timeline service for the first page" },
          { id: "hydrate", label: "The service reads a page of IDs and hydrates them into posts, dropping deleted ones" },
        ],
        explanation: md`
          The author waits only for the first two steps. Everything after the enqueue happens asynchronously, which is why a post can take a few seconds to reach everyone. The follower's read touches only their own list and the post cache: no other user's data, no merge, no scan.
        `,
      },
      reveal: {
        takeaways: [
          "The author waits only for the post to be stored and the fan-out job enqueued.",
          "The write path costs O(followers) asynchronously; the read path costs O(page size).",
          "Reads hydrate IDs into posts, which is where deletions take effect.",
        ],
        reasoning: md`
          Tracing makes the two paths visible: a **write path** that pays O(followers) asynchronously, and a **read path** that pays O(page size). Every later stage changes one of these two paths.
        `,
      },
    },
    {
      id: "celebrity",
      title: "Thirty million followers",
      phase: "break",
      dimensions: ["break", "change"],
      conceptIds: ["fan-out", "backpressure"],
      competencyIds: ["hot-accounts", "fan-out"],
      event: {
        kind: "scale",
        title: "A pop star posts during a live awards show",
        detail:
          "Her account has 31 million followers. Fan-out workers spend minutes on her post alone; delivery for everyone else falls minutes behind, and followers start replying to posts their friends cannot see yet.",
      },
      context: md`
        Twitter's target was to deliver to a million followers in about 3.5 seconds. Thirty million is a different problem.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Averages hide the units of work that hurt. A system that's fine for a 200-follower account can stall on a 30-million-follower one, because that single post becomes a single enormous job, competing with every other delivery.
          `,
        },
        {
          kind: "estimate",
          id: "celebrity-time",
          prompt: "Fan-out delivers about 1 million timelines in 3.5 seconds. About how many seconds for one post to 31 million followers?",
          answer: 108,
          unit: "seconds",
          working: md`
            31 × 3.5 ≈ **108 seconds**, almost two minutes for one post, during which the workers are busy with it and everyone else's deliveries wait.
          `,
        },
        {
          kind: "read",
          body: md`
            Pull has the opposite profile: posting is one write, and readers pay a merge. For an account with millions of followers, the merge is cheap: its recent posts are the same for every reader and sit in cache.

            So the strategy can be chosen **per account**: push for the many accounts with ordinary audiences, pull for the few very large ones.
          `,
        },
        {
          kind: "choice",
          id: "reader-cost",
          prompt: "A reader follows 3 accounts above the threshold. What extra work does their timeline read do?",
          options: [
            {
              id: "small-merge",
              label: "Fetch those 3 accounts' recent posts (cached) and merge them into their list by time",
              correct: true,
              why: "A handful of cached lookups and a small merge, bounded by how many large accounts a person follows, which is usually few.",
            },
            {
              id: "full-pull",
              label: "Rebuild their whole timeline from every account they follow",
              why: "Only the large accounts are merged at read time. Everything else is still precomputed.",
            },
            {
              id: "nothing",
              label: "Nothing; the large accounts' posts are already in their list",
              why: "They're skipped by fan-out, so they must be merged in on read.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What do you change?",
        options: [
          {
            id: "more-workers",
            label: "Add more fan-out workers",
            assessment: "defensible",
            feedback:
              "More throughput shortens the backlog, but each such post is still 31 million inserts arriving at once, competing with everyone else's deliveries. You would be provisioning for the rare spike from a few accounts.",
          },
          {
            id: "merge-on-read",
            label: "Don't fan out posts from accounts above a follower threshold; merge their recent posts into each reader's timeline at read time",
            assessment: "sound",
            feedback:
              "A huge account's post costs one write. Readers who follow a few such accounts pay a small merge on read: fetch those accounts' latest posts (which are heavily cached, since everyone wants them) and interleave by ID. Twitter described moving to exactly this hybrid.",
          },
          {
            id: "prioritize",
            label: "Process the celebrity's fan-out ahead of everyone else's",
            assessment: "flawed",
            feedback: "Her followers get the post sooner, and every other post in the system waits behind 31 million inserts. It makes the delay worse for everyone else.",
          },
          {
            id: "limit-posting",
            label: "Rate-limit how often very large accounts may post",
            assessment: "flawed",
            feedback: "It changes the product to fit the architecture, and even one post is still 31 million inserts.",
          },
        ],
        rationale: {
          prompt: "Why is the hybrid cheaper overall, and what does it cost the read path?",
          rubric: [
            { id: "write-amp", text: "One post from a huge account becomes millions of writes that delay everyone." },
            { id: "few-accounts", text: "Few accounts are that large, and each reader follows few of them, so read-time merging is cheap." },
            { id: "cache", text: "Those accounts' recent posts are hot and cacheable." },
            { id: "threshold", text: "Mentions choosing the threshold, or the extra merge latency on reads.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "One post to tens of millions of followers is a single huge job that delays everyone else's delivery.",
          "Choose fan-out per account: push for ordinary audiences, merge very large accounts at read time.",
          "Bound the worst-case unit of work on the write path.",
        ],
        reasoning: md`
          Neither pure strategy survives a long-tailed follower distribution. Push is right for the many and wrong for the few; pull is the reverse. The hybrid gives each account the strategy that suits its audience size. See [[fan-out]].

          Notice the shape of the fix: it bounds the **worst case** of the write path, the same move as bounding partitions or rejecting oversized work. A system is only as smooth as its largest single unit of work.
        `,
        tradeoffs: [
          { choice: "Merge large accounts at read time", gains: "Bounded write cost; no delivery stalls.", costs: "Every read does a small merge; two code paths to keep consistent." },
        ],
      },
    },
    {
      id: "inactive-users",
      title: "Timelines nobody reads",
      phase: "decide",
      dimensions: ["explain", "defend"],
      conceptIds: ["soft-state", "caching", "fan-out"],
      competencyIds: ["derived-data", "sizing"],
      context: md`
        Many accounts have not opened the app in months, yet every post from someone they follow is still inserted into their timeline. Twitter stopped fanning out to users who had not logged in for 30 days.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            **Derived data** is computed from other data and can be rebuilt from it. A timeline is derived: it's a function of the post store and the follow graph.

            Anything derived can be skipped, evicted or lost without losing anything durable. The cost is the work to rebuild it when it's needed again. See [[soft-state]].
          `,
        },
        {
          kind: "choice",
          id: "skip",
          prompt: "Fan-out skips users inactive for 30 days. One of them returns. What do they see?",
          options: [
            {
              id: "rebuilt",
              label: "A full timeline, rebuilt from their follows on that first request, which is slower than usual",
              correct: true,
              why: "The first load does a read-time merge to rebuild the list; after that, fan-out keeps it current again.",
            },
            {
              id: "empty",
              label: "An empty timeline",
              why: "The posts still exist in the post store, and the timeline can be rebuilt from them.",
            },
            {
              id: "stale",
              label: "Their timeline from 30 days ago",
              why: "It may have been evicted entirely. Either way, it's rebuilt on return.",
            },
          ],
        },
        {
          kind: "predict",
          id: "why-replicas",
          prompt: "Timelines can be rebuilt, yet Twitter kept three replicas of each. Why?",
          answer: md`
            Not to protect data, which is safe in the post store, but to avoid a **rebuild storm**. Losing a node with millions of timelines and rebuilding them all at once would flood the post store and graph with read-time merges. Replicas make node loss cheap.
          `,
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements hold?",
        claims: [
          {
            id: "empty",
            statement: "Users skipped by fan-out will see an empty timeline when they return.",
            verdict: "fails",
            explanation: "On their return, the timeline is rebuilt from the people they follow and the post store (a one-off fan-out on read), then kept up to date by fan-out again.",
          },
          {
            id: "slower-first",
            statement: "A returning user's first load is slower than usual.",
            verdict: "holds",
            explanation: "That one request does a read-time merge. One slow load per returning user is a much better deal than inserts into millions of timelines nobody opens.",
          },
          {
            id: "node-loss",
            statement: "If a timeline cache node is lost, posts are lost.",
            verdict: "fails",
            explanation:
              "Timelines are derived: every entry can be recomputed from the post store and the graph. Losing a node costs rebuild work, which is why Twitter kept three replicas: not to protect data, but to avoid a rebuild storm.",
          },
          {
            id: "expire",
            statement: "Letting unread timelines expire from memory saves space without losing anything durable.",
            verdict: "holds",
            explanation: "Anything that can be rebuilt can be evicted. See [[soft-state]].",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Timelines are derived data: skip, evict or lose them and rebuild from the post store and graph.",
          "Stop fanning out to inactive users; rebuild once when they return.",
          "Replicas of derived data protect against rebuild storms, not data loss.",
        ],
        reasoning: md`
          Once timelines are understood as **derived data**, a whole class of decisions gets easier: skip them for inactive users, evict them under memory pressure, rebuild them after failures. The durable truth is the post store and the graph; the timeline cache is an optimisation that can always be reconstructed.

          That only holds because entries are references. If timelines held the only copy of anything, none of these moves would be safe.
        `,
      },
    },
    {
      id: "deleted-post",
      title: "The post that wouldn't die",
      phase: "break",
      dimensions: ["break", "trace", "implement"],
      conceptIds: ["fan-out", "caching"],
      competencyIds: ["derived-data", "read-path"],
      event: {
        kind: "failure",
        title: "A deleted post is still in followers' timelines",
        detail: "A user deleted a post containing a phone number by mistake. Hours later, followers still see it. Meanwhile the timeline cache's memory use keeps climbing. Here is the fan-out worker and the read path.",
      },
      context: md`
        Find every line that contributes to either problem, or would fall over on a large account.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A Redis list used as a capped timeline needs two operations per insert: \`LPUSH\` adds the newest entry at the front, and \`LTRIM key 0 799\` drops everything past 800. Without the trim, lists grow forever.

            Sending both in one **pipeline** (many commands in one round trip) keeps it cheap.
          `,
        },
        {
          kind: "estimate",
          id: "awaited-inserts",
          prompt: "A worker awaits each insert separately, at about 1 ms per round trip. How many minutes for an account with 1 million followers?",
          answer: 17,
          unit: "minutes",
          working: md`
            1,000,000 × 1 ms = 1,000 s ≈ **17 minutes**. Pipelining hundreds of inserts per round trip brings it down to seconds.
          `,
        },
        {
          kind: "choice",
          id: "where-delete",
          prompt: "Timelines store IDs. Where does a deleted post get removed from what followers see?",
          options: [
            {
              id: "hydrate",
              label: "At hydration: the read looks up each ID, and a deleted post is no longer found",
              correct: true,
              why: "One delete in the post store takes effect for every timeline the next time it's read. No second fan-out needed.",
            },
            {
              id: "fanout",
              label: "By a second fan-out that removes the ID from every follower's list",
              why: "That's needed only if timelines hold copies. With IDs, hydration filters it out.",
            },
            {
              id: "ttl",
              label: "When the timeline entry expires",
              why: "That could be days; the requirement is that nobody sees it after deletion.",
            },
          ],
        },
      ],
      interaction: {
        kind: "diagnosis",
        prompt: "Select the faulty lines.",
        artifact: {
          type: "code",
          language: "typescript",
          caption: "fanout.ts and timeline.ts",
          lines: [
            { text: "async function fanOut(job: FanOutJob) {" },
            { text: "  const post = await posts.get(job.postId);" },
            {
              text: "  const followers = await graph.followers(post.authorId);",
              fault: "Fetches every follower, including inactive ones and audiences of millions, in one call. It should page through active followers only (and skip accounts over the threshold).",
            },
            { text: "  for (const followerId of followers) {" },
            {
              text: "    await redis.lpush(`timeline:${followerId}`, JSON.stringify(post));",
              fault: "Pushes a full copy of the post, so a delete or edit never reaches the timelines. Push the post ID (and author ID) instead.",
            },
            {
              text: "  }",
              fault: "No LTRIM after the push: lists grow without bound, which is the climbing memory. Trim each list to 800 entries, in the same pipeline.",
            },
            { text: "  await job.ack();" },
            { text: "}" },
            { text: "" },
            { text: "async function homeTimeline(userId: string, page = 0) {" },
            { text: "  const raw = await redis.lrange(`timeline:${userId}`, page * 50, page * 50 + 49);" },
            {
              text: "  return raw.map((s) => JSON.parse(s));",
              fault: "Returns the stored copies directly. The read path should hydrate IDs from the post store, which is where deletions take effect.",
            },
            { text: "}" },
          ],
        },
        rationale: {
          prompt: "What should the worker and the read path do instead?",
          rubric: [
            { id: "ids", text: "Store references (IDs) in timelines and hydrate on read, so deletes and edits apply everywhere at once." },
            { id: "trim", text: "Cap each list (LTRIM to 800) as part of the insert." },
            { id: "batch", text: "Page through followers and pipeline the inserts in batches rather than one awaited round trip each." },
            { id: "active", text: "Fan out only to active followers, and skip huge accounts.", weight: "supporting" },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Store IDs and hydrate on read so a delete takes effect everywhere at once.",
          "Trim each timeline as part of the insert, or lists grow without bound.",
          "Page through active followers and pipeline inserts instead of one awaited round trip each.",
        ],
        reasoning: md`
          Copies are the root of the deletion bug: a derived view that contains content must be updated whenever the content changes, and nobody had written that second fan-out. Storing IDs makes deletion a single write to the post store; hydration takes care of every timeline.

          The awaited insert per follower is a quieter problem: at a millisecond per round trip, a million followers is seventeen minutes. Batch and pipeline.
        `,
      },
    },
    {
      id: "write-the-merge",
      title: "Write the merged read",
      phase: "break",
      dimensions: ["implement", "trace"],
      conceptIds: ["fan-out", "id-generation"],
      competencyIds: ["read-path", "hot-accounts"],
      context: md`
        Implement the read path for the hybrid design: the reader's precomputed list, plus the recent posts of any very large accounts they follow, merged newest first. Post IDs are time-sortable, so a larger ID is a newer post. Support a \`before\` cursor for the next page.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Post IDs here are **time-sortable**: a larger ID is a newer post (Twitter's Snowflake IDs start with a timestamp). That makes merging sources a sort by ID, and pagination a cursor: "give me posts with ID less than X". See [[id-generation]].
          `,
        },
        {
          kind: "choice",
          id: "string-compare",
          prompt: "Two 64-bit IDs as decimal strings: \"999\" and \"1000\". Compared as strings, which is 'larger'?",
          options: [
            {
              id: "999",
              label: "\"999\", because '9' sorts after '1'",
              correct: true,
              why: "String comparison goes character by character. IDs of different lengths sort wrongly, so compare them as numbers. For 64-bit values in JavaScript, that means BigInt.",
            },
            {
              id: "1000",
              label: "\"1000\", because it's the bigger number",
              why: "Numerically yes, but string comparison doesn't know that.",
            },
            {
              id: "equal",
              label: "They're equal in length-insensitive comparison",
              why: "There's no such default; strings compare character by character.",
            },
          ],
        },
        {
          kind: "predict",
          id: "cursor-per-source",
          prompt: "A page merges the reader's list with three large accounts' posts. Why must the same 'before' cursor be applied to every source?",
          answer: md`
            So every source contributes only posts older than the last one the client saw. If one source ignored the cursor, its newest posts would show up again on every page; if the cursor were applied unevenly, posts would be skipped.
          `,
        },
      ],
      interaction: {
        kind: "implementation",
        prompt: "Implement homeTimeline.",
        language: "typescript",
        starter: md`
          type Post = { id: string; authorId: string; text: string };

          declare function timelineIds(userId: string, before: string | null, limit: number): Promise<string[]>; // newest first
          declare function largeAccountsFollowed(userId: string): Promise<string[]>;
          declare function recentPostIds(authorId: string, before: string | null, limit: number): Promise<string[]>; // newest first, cached
          declare function hydrate(ids: string[]): Promise<Map<string, Post>>; // deleted posts are absent

          export async function homeTimeline(userId: string, before: string | null, limit = 50): Promise<Post[]> {
            // merge, paginate, hydrate
          }
        `,
        rubric: [
          { id: "parallel", text: "Fetches the precomputed page and the large accounts' recent posts in parallel." },
          { id: "merge", text: "Merges by ID (time), newest first, de-duplicating, and takes only the page size." },
          { id: "cursor", text: "Applies the same 'before' cursor to every source so pages do not overlap or skip." },
          { id: "hydrate", text: "Hydrates IDs and drops posts that no longer exist (deleted)." },
          { id: "numeric", text: "Compares 64-bit IDs numerically (BigInt), not as strings of different lengths.", weight: "supporting" },
        ],
        reference: {
          code: md`
            const newestFirst = (a: string, b: string) => (BigInt(b) > BigInt(a) ? 1 : BigInt(b) < BigInt(a) ? -1 : 0);

            export async function homeTimeline(userId: string, before: string | null, limit = 50): Promise<Post[]> {
              const [own, large] = await Promise.all([
                timelineIds(userId, before, limit),
                largeAccountsFollowed(userId),
              ]);
              const fromLarge = await Promise.all(large.map((a) => recentPostIds(a, before, limit)));

              const page = [...new Set([...own, ...fromLarge.flat()])].sort(newestFirst).slice(0, limit);
              const posts = await hydrate(page);
              return page.flatMap((id) => {
                const post = posts.get(id);
                return post ? [post] : [];
              });
            }
            // The client asks for the next page with before = the last ID it received.
          `,
          notes: md`
            - Each source contributes at most \`limit\` IDs older than the cursor, so the merged page is correct even if all of it comes from one source.
            - IDs are compared as numbers. Two 64-bit IDs as decimal strings only compare correctly as strings if they have the same number of digits.
            - Deleted posts disappear at hydration, so the page may be slightly shorter than \`limit\`. Clients handle that by asking again from the last ID returned; over-fetching a little avoids most short pages.
            - The large accounts' recent posts are the hottest keys in the system, which is fine: they are the same for every reader and cache perfectly.
          `,
        },
      },
      reveal: {
        takeaways: [
          "Time-sortable IDs make merging sources a sort, and pagination a single cursor.",
          "Apply the cursor to every source and take only the page size after merging.",
          "Compare 64-bit IDs numerically, and drop posts that fail to hydrate.",
        ],
        reasoning: md`
          The hybrid's cost lives here: a few extra cached reads and a merge. Because IDs encode time, merging sources is a sort on IDs, and pagination is a single cursor that every source understands. See [[id-generation]].
        `,
      },
    },
    {
      id: "ranked-timeline",
      title: "Top posts first",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["fan-out", "caching"],
      competencyIds: ["read-path", "fan-out"],
      event: {
        kind: "requirement-change",
        title: "Product wants a ranked timeline",
        detail: "Instead of strictly newest first, the timeline should show the posts each reader is most likely to care about, using engagement that keeps changing after a post is published.",
      },
      context: md`
        Rankings depend on the reader, the post, and signals such as replies and likes that arrive over the following minutes and hours.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A ranked feed has two steps:

            1. **Candidate generation:** what could this reader see? (Posts from accounts they follow, maybe more.)
            2. **Ranking:** in what order? (Scored using the reader, the post, and engagement signals.)

            The first changes only when posts or follows change. The second changes every minute as likes and replies arrive.
          `,
        },
        {
          kind: "predict",
          id: "score-at-write",
          prompt: "Scores are computed at fan-out time and stored with each timeline entry. A post gets most of its likes in the hour after it's published. What's wrong?",
          answer: md`
            The score was computed before the engagement existed, so it's stale within minutes. Updating it means fanning out again to every follower's list, continuously. Ranking has to happen when the signals are known: at read time.
          `,
        },
        {
          kind: "choice",
          id: "bounded",
          prompt: "Ranking at read time scores each candidate. What keeps that affordable at 300,000 reads a second?",
          options: [
            {
              id: "candidates",
              label: "The candidate set is small (a few hundred precomputed IDs), so each request scores a bounded number of posts.",
              correct: true,
              why: "Fan-out already did the expensive 'who could see this' work. Ranking only orders what it produced.",
            },
            {
              id: "cache",
              label: "Rankings are cached per post.",
              why: "Rankings depend on the reader, so they can't simply be shared.",
            },
            {
              id: "nothing",
              label: "Nothing; it needs a much bigger fleet.",
              why: "Bounding the candidate set is what makes it affordable.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How do you adapt the design?",
        options: [
          {
            id: "rank-at-read",
            label: "Keep fan-out as candidate generation; at read time, score the candidates (precomputed list plus merged sources) and sort by score",
            assessment: "sound",
            feedback:
              "Fan-out still does the expensive 'who could see this' work ahead of time; ranking runs on a few hundred candidates per request with the latest signals. Ranking is a read-path concern because the signals change after the write.",
          },
          {
            id: "rank-at-write",
            label: "Compute each post's score at fan-out time and store timelines sorted by score",
            assessment: "flawed",
            feedback: "Scores computed at write time are stale within minutes, because engagement arrives afterwards. Re-ranking would mean fanning out again, continuously, to millions of lists.",
          },
          {
            id: "pull-everything",
            label: "Drop precomputed timelines; at read time gather every post from followed accounts in the last few days and rank them",
            assessment: "defensible",
            feedback:
              "Maximally flexible, and it simplifies the write path, but it brings back the read-time scatter-gather that the numbers ruled out, now with a ranking model on top. Large ranked feeds do generate candidates from several sources at read time, but they lean heavily on precomputed and cached sources to make that affordable.",
          },
        ],
        rationale: {
          prompt: "Where should ranking live, and why?",
          rubric: [
            { id: "signals-late", text: "Ranking signals change after the post is written, so scores must be computed at read time (or refreshed)." },
            { id: "candidates", text: "Precomputed timelines become cheap candidate generation for the ranker." },
            { id: "cost", text: "Ranking is bounded by the candidate set size, not the whole graph." },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Fan-out answers 'what could this reader see?'; ranking answers 'in what order?'.",
          "Rank at read time, because engagement signals arrive after the post is written.",
          "Precomputed timelines become cheap, bounded candidate generation.",
        ],
        reasoning: md`
          A useful way to see the change: fan-out answers **"what could this reader see?"** and ranking answers **"in what order?"**. The first is stable once a post is written and benefits from precomputation; the second changes by the minute and belongs on the read path. Separating the two keeps both cheap.
        `,
      },
    },
    {
      id: "defend-the-hybrid",
      title: "Defend the hybrid",
      phase: "defend",
      dimensions: ["defend"],
      conceptIds: ["fan-out", "caching", "soft-state"],
      competencyIds: ["fan-out", "sizing", "derived-data", "hot-accounts"],
      context: md`
        Your interviewer: "You have two read paths, a queue doing a third of a million inserts a second, and terabytes of Redis. Wouldn't fan-out on read with a good cache be simpler?"
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            "Wouldn't X be simpler?" deserves a numeric answer. Restate the ratio that drove the design, show what the alternative costs in the same units, concede the real costs of yours, and say what would change your mind.
          `,
        },
        {
          kind: "choice",
          id: "cache-pull",
          prompt: "\"Use pull with a good cache.\" Why doesn't caching rescue pull here?",
          options: [
            {
              id: "per-reader",
              label: "Each reader's merged timeline is different, so the expensive merge result can't be shared between readers.",
              correct: true,
              why: "You can cache each author's recent posts, but the merge across ~200 authors still runs for every read, 300,000 times a second.",
            },
            {
              id: "memory",
              label: "There isn't enough memory for a cache.",
              why: "Memory isn't the issue; the per-request merge is.",
            },
            {
              id: "staleness",
              label: "Cached timelines would be stale.",
              why: "Staleness can be managed. The cost of merging per reader is what doesn't go away.",
            },
          ],
        },
      ],
      interaction: {
        kind: "open",
        prompt: "Defend the design with numbers, concede what is true in the challenge, and say what would make you switch.",
        placeholder: "Reads outnumber writes about fifty to one…",
        rubric: [
          { id: "numbers", text: "Uses the ratio and fan-out numbers to show which side should pay." },
          { id: "cache-pull", text: "Explains why caching does not rescue pull: each reader's merge is different, so the merged result is not shared." },
          { id: "concede", text: "Concedes the real costs: two read paths, memory, and rebuild work after failures." },
          { id: "switch", text: "Names conditions under which pull (or a different split) would win." },
        ],
        reference: md`
          **The numbers.** Reads are about 50× writes, and the average post reaches ~75 timelines. Precomputing costs roughly 350,000 list inserts a second; pulling would cost tens of millions of lookups a second plus a merge on every one of 300,000 requests.

          **Why a cache doesn't rescue pull.** You can cache each author's recent posts, and the hybrid does exactly that for large accounts. But the expensive part of pull is the per-reader merge across hundreds of authors, and every reader's merge is different, so its result is not shared. The precomputed timeline *is* the cached merge.

          **What I concede.** There are two read paths to keep consistent; the cache holds terabytes; a lost node means rebuilding timelines; and a few seconds' delay before followers see a post. All of it is bounded: the hybrid caps write cost, timelines are derived and rebuildable, and replicas avoid rebuild storms.

          **When I would switch.** If reads per post fell sharply (a write-heavy product), if follow graphs became much denser so the average fan-out exploded, or if ranking moved to mostly out-of-network content, candidate generation at read time would win.
        `,
      },
      reveal: {
        takeaways: [
          "Defend with numbers: the read/write ratio decides which side pays.",
          "Caching doesn't save pull, because every reader's merge is different.",
          "Concede the costs (two read paths, memory, rebuilds) and name what would make pull win.",
        ],
        reasoning: md`
          "Simpler" is a fair objection. Answer it by showing where the work goes under each design, and by naming what you would need to see to change your mind. That is what turns a design preference into an engineering argument.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      Reads outnumber writes about 50 to 1, so the multiplication between authors and readers happens **once, at write time**: each post's ID is pushed asynchronously into every active follower's in-memory timeline, and a read is a single list lookup plus hydration.

      The design bounds its worst cases. Accounts with enormous audiences are **merged at read time** instead of fanned out, so no single post can stall delivery. Timelines hold **references, not copies**, so deletes and edits take effect everywhere through hydration. Timelines are **derived data**, so they can be skipped for inactive users, evicted, and rebuilt after failures. Ranking, when added, runs on the read path over candidates the fan-out has already gathered.
    `,
    reliesOn: [
      "Reads vastly outnumber writes.",
      "Few accounts have very large audiences, and each reader follows few of them.",
      "A few seconds of delivery delay is acceptable.",
      "Post IDs sort by time.",
    ],
    alternatives: [
      { design: "Pure fan-out on read", preferWhen: "Writes are frequent relative to reads, or each reader follows few sources." },
      { design: "Pure fan-out on write", preferWhen: "Audiences are bounded, as in group chats or team feeds." },
      { design: "Read-time candidate generation from many sources", preferWhen: "The feed is mostly recommended content from outside the reader's follows." },
    ],
    tradeoffs: [
      { choice: "Fan-out on write", gains: "One lookup per read.", costs: "Write amplification and terabytes of memory." },
      { choice: "Hybrid for large accounts", gains: "Bounded write cost; no delivery stalls.", costs: "Two read paths and a merge per request." },
      { choice: "IDs in timelines", gains: "Tiny entries; deletes apply everywhere.", costs: "A hydration step on every read." },
      { choice: "Skip inactive users", gains: "Far less wasted work and memory.", costs: "A slower first load when they return." },
    ],
    breaksWhen: [
      "Follow graphs become much denser, so average fan-out grows by orders of magnitude.",
      "The product needs strict real-time delivery (sub-second) to every follower.",
      "Most feed content comes from accounts the reader does not follow.",
    ],
  },
  interviewVariants: [
    "Design Twitter.",
    "Design the Facebook or Instagram news feed.",
    "Fan-out on write or fan-out on read? Defend your choice.",
    "How do you handle a celebrity with 50 million followers in your feed design?",
  ],
  relatedInvestigationIds: ["notification-system", "chat-message-store"],
} satisfies InvestigationInput;
