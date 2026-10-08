import type { InvestigationInput } from "@/lib/domain/content";
import { md } from "../md";

export const videoPipeline = {
  id: "video-processing-pipeline",
  title: "A reliable video processing pipeline",
  searchTitle: "Design a Video Processing Pipeline",
  premise:
    "Instructors upload multi-gigabyte lectures that take minutes to transcode. Workers crash, deploys interrupt jobs, and the same job can run twice. Every accepted upload must end in exactly one correct, visible outcome.",
  difficulty: "intermediate",
  estimatedMinutes: 55,
  scenario: md`
    A course platform lets instructors upload lecture recordings. Files are usually 200 MB to 4 GB, recorded on laptops and uploaded over home or café connections. Each upload has to become an adaptive-bitrate stream (1080p, 720p and 480p renditions) plus a thumbnail before students can watch it.

    The prototype is an Express server that accepts a multipart form upload to local disk and runs \`ffmpeg\` inside the request handler. It worked for the ten test videos. The platform launches next month at around 2,000 uploads a day, with Sunday evenings running at five times the average rate.

    You own the pipeline from "instructor selects a file" to "student presses play". Nothing about the prototype is sacred.
  `,
  objectives: [
    "Turn file sizes, durations and timeouts into constraints that rule designs in or out.",
    "Separate the data plane (bytes) from the control plane (state and decisions).",
    "Design job ownership that survives crashed and paused workers.",
    "Make duplicate execution harmless instead of trying to prevent it.",
    "Find the real bottleneck when load grows 100x, and name what a fix costs.",
  ],
  prerequisites: ["asynchronous-processing", "object-storage"],
  requirements: {
    functional: [
      "Instructors upload video files of up to 10 GB.",
      "Each upload becomes a 1080p/720p/480p HLS ladder and a thumbnail.",
      "Instructors see each video's status: uploading, processing, ready, or failed with a reason.",
      "Students can stream a video only once every rendition is ready.",
      "Instructors can delete a video at any time, including while it is processing.",
    ],
    nonFunctional: [
      "An upload the platform has accepted is never silently lost.",
      "A video is never shown as ready unless every rendition exists and plays.",
      "A crashed or redeployed worker must not strand a job forever.",
      "Duplicate processing may waste compute but must never produce duplicate or corrupt output.",
      "API servers stay responsive during processing peaks.",
    ],
  },
  constraints: [
    "About 2,000 uploads a day at launch, peaking at 5x the average on Sunday evenings; 10x growth expected within a year.",
    "A transcode takes 5-20 minutes of CPU (about 12.5 on average); one worker runs one transcode at a time.",
    "API servers are stateless containers behind a load balancer with a 60-second request timeout, redeployed several times a day.",
    "Small team: managed infrastructure is preferred, and one Postgres database already exists.",
  ],
  assumptions: [
    "An object store with S3-like semantics is available: durable writes, presigned URLs, multipart uploads, and read-after-write consistency for new objects.",
    "Instructors' browsers can upload to the object store directly over HTTPS.",
    "Transcoding the same input twice produces equivalent output.",
    "Postgres is the system of record; losing it is a disaster-recovery event, not a design input.",
  ],
  competencies: [
    {
      id: "requirements-modeling",
      label: "Requirements modeling",
      description: "Turning sizes, durations and timeouts into the numbers that shape the design.",
    },
    {
      id: "data-plane",
      label: "Moving and storing bytes",
      description: "Keeping large payloads out of request paths and in storage built for them.",
    },
    {
      id: "state-transitions",
      label: "State and transitions",
      description: "Driving status from verified facts, with transitions that cannot run backwards.",
    },
    {
      id: "job-ownership",
      label: "Job ownership",
      description: "Leases, heartbeats and fencing: who is allowed to finish a job, and how that is enforced.",
    },
    {
      id: "failure-recovery",
      label: "Failure recovery",
      description: "Crashes, poison inputs, retries, and what the user sees while it happens.",
    },
    {
      id: "scaling",
      label: "Scaling and capacity",
      description: "Locating the bottleneck under growth and separating priority from capacity.",
    },
  ],
  system: {
    components: [
      {
        id: "browser",
        label: "Instructor browser",
        kind: "client",
        responsibility: "Uploads parts directly to storage and reports completion; polls for status.",
        position: { col: 0, row: 1 },
      },
      {
        id: "api",
        label: "Video API",
        kind: "service",
        responsibility:
          "Authorizes uploads, issues presigned part URLs, completes and verifies uploads, and serves status. Holds no state of its own.",
        position: { col: 1, row: 1 },
      },
      {
        id: "postgres",
        label: "Postgres",
        kind: "database",
        responsibility: "System of record for video status and job ownership.",
        durableState:
          "videos (status machine, manifest pointer) and jobs (attempt count, lease token, lease expiry, last error).",
        position: { col: 2, row: 1 },
      },
      {
        id: "storage",
        label: "Object storage",
        kind: "object-store",
        responsibility: "Holds raw uploads and the renditions of each processing attempt.",
        durableState: "raw/{video}, renditions/{video}/{attempt}/…, and each attempt's manifest.",
        position: { col: 2, row: 0 },
      },
      {
        id: "workers",
        label: "Transcode workers",
        kind: "worker",
        responsibility:
          "Claim jobs under a lease, heartbeat while transcoding, write output to a per-attempt prefix, and complete with a fenced update.",
        position: { col: 3, row: 1 },
      },
      {
        id: "reconciler",
        label: "Reconciler",
        kind: "worker",
        responsibility:
          "Periodically expires uploads that were never completed and deletes output prefixes that no video points to.",
        position: { col: 1, row: 2 },
      },
      {
        id: "cdn",
        label: "CDN",
        kind: "edge",
        responsibility: "Caches manifests and segments close to students; fetches from storage on a miss.",
        position: { col: 4, row: 0 },
      },
      {
        id: "player",
        label: "Student player",
        kind: "client",
        responsibility: "Fetches the manifest and segments for a ready video.",
        position: { col: 4, row: 1 },
      },
    ],
    flows: [
      { id: "upload-control", from: "browser", to: "api", label: "Create upload, report parts, poll status", kind: "request" },
      { id: "upload-bytes", from: "browser", to: "storage", label: "Upload parts via presigned URLs", kind: "data" },
      { id: "complete-upload", from: "api", to: "storage", label: "Complete multipart upload, verify object", kind: "request" },
      { id: "record-state", from: "api", to: "postgres", label: "Video row and job row in one transaction", kind: "request" },
      { id: "claim", from: "workers", to: "postgres", label: "Claim lease, heartbeat, fenced completion", kind: "request" },
      { id: "transcode-io", from: "workers", to: "storage", label: "Read raw upload, write attempt output", kind: "data" },
      { id: "reconcile", from: "reconciler", to: "postgres", label: "Find abandoned uploads and orphaned output", kind: "request" },
      { id: "origin-fetch", from: "cdn", to: "storage", label: "Origin fetch on cache miss", kind: "request" },
      { id: "playback", from: "player", to: "cdn", label: "Manifest and segments", kind: "request" },
    ],
    invariants: [
      {
        id: "accepted-is-never-stranded",
        statement: "Once an upload is confirmed, its video eventually reaches ready or failed; it never stays processing forever.",
        enforcedBy: ["postgres", "workers"],
        mechanism:
          "Jobs are rows with expiring leases. A dead worker's lease lapses and the job becomes claimable again; attempts are counted at claim time, so a job that keeps crashing workers ends in failed.",
      },
      {
        id: "ready-means-complete",
        statement: "A video is ready only if every rendition and its manifest exist.",
        enforcedBy: ["workers", "postgres"],
        mechanism:
          "The worker writes all renditions under its attempt prefix, writes the manifest last, and only then flips the status, so the status change is the publish step.",
      },
      {
        id: "one-winner-per-video",
        statement: "At most one attempt's output is ever published for a video.",
        enforcedBy: ["postgres"],
        mechanism:
          "Completion is an UPDATE conditioned on the current lease token. A worker that lost its lease matches zero rows and its output is never referenced.",
      },
      {
        id: "deleted-stays-deleted",
        statement: "A deleted video can never become ready again.",
        enforcedBy: ["postgres", "api"],
        mechanism:
          "Deletion is a status transition, and every later transition is conditioned on the expected previous status.",
      },
    ],
  },
  stages: [
    // -----------------------------------------------------------------------
    {
      id: "read-the-requirements",
      title: "Read the requirements like an engineer",
      phase: "model",
      dimensions: ["explain", "change"],
      conceptIds: ["asynchronous-processing", "backpressure"],
      competencyIds: ["requirements-modeling"],
      context: md`
        Before choosing anything, turn the brief into numbers. Two of them decide most of this design: how long a large upload takes over an ordinary connection, and how many transcodes are in flight at once.

        Useful arithmetic: 1 GB is 8 gigabits. **Little's law** says the average number of jobs in a system equals the arrival rate times the time each job spends there (L = λW). It holds for any stable system regardless of how arrivals are distributed.

        Decide whether each statement holds, fails, or depends on something the brief has not settled.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Network speeds are quoted in **bits** per second; file sizes in **bytes**. One byte is 8 bits, so 1 GB is 8 gigabits. To get a transfer time, convert the file to bits and divide by the link speed.
          `,
        },
        {
          kind: "estimate",
          id: "upload-minutes",
          prompt: "A 4 GB file uploads over a 20 Mbps home connection. About how many minutes does it take?",
          answer: 27,
          unit: "minutes",
          working: md`
            4 GB × 8 = 32 gigabits = 32,000 megabits. 32,000 ÷ 20 = 1,600 seconds ≈ **27 minutes**.

            Any server on the path of those bytes has to keep a connection alive for half an hour, through its own timeouts and deploys.
          `,
        },
        {
          kind: "read",
          body: md`
            **Little's law:** the average number of jobs in a system equals the arrival rate times the time each job spends there.

            \`\`\`
            L = λ × W
            \`\`\`

            It holds for any stable system, whatever the pattern of arrivals. It turns "how many per second" and "how long each" into "how many at once", which is the number that sizes a worker fleet.
          `,
        },
        {
          kind: "estimate",
          id: "peak-concurrency",
          prompt: "Sunday peak: about 0.12 uploads arrive per second, and each transcode takes 750 seconds. How many transcodes are in flight at once if nothing waits?",
          answer: 90,
          unit: "transcodes",
          working: md`
            L = 0.12 × 750 = **90** transcodes in flight.

            With 20 workers, the other 70 wait in a queue, and the queue grows for as long as the peak lasts.
          `,
        },
        {
          kind: "choice",
          id: "crash-means",
          prompt: "A worker dies 14 minutes into a 20-minute transcode. The requirement says accepted uploads are never lost. What does that force?",
          options: [
            {
              id: "rerun",
              label: "The job must be able to run again, so running twice must be harmless.",
              correct: true,
              why: "The only alternative to re-running is never finishing, which breaks the requirement. And since a slow worker looks like a dead one, sometimes both will run.",
            },
            {
              id: "resume",
              label: "The new worker must resume from minute 14.",
              why: "Checkpointing could save time, but it's an optimization. The requirement only forces that the work happens again somewhere.",
            },
            {
              id: "prevent",
              label: "The system must guarantee each job runs exactly once.",
              why: "Nothing can promise that when workers can stall or crash. The realistic goal is that a second run causes no harm.",
            },
          ],
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which of these follow from the requirements and constraints?",
        claims: [
          {
            id: "upload-duration",
            statement: "A 4 GB upload over a 20 Mbps home connection takes roughly half an hour.",
            verdict: "holds",
            explanation:
              "4 GB is 32 gigabits; at 20 megabits per second that is 1,600 seconds, about 27 minutes. A 10 GB file takes over an hour. Any component on the path of those bytes has to tolerate a connection that lives this long.",
          },
          {
            id: "proxy-through-api",
            statement: "Uploads can pass through the API servers as long as they have enough memory and disk.",
            verdict: "fails",
            explanation: md`
              Capacity is not the issue. The load balancer cuts requests at 60 seconds, and the containers are redeployed several times a day, so a 27-minute upload through them would be cut off by the timeout and again by every deploy. Raising the timeout fixes the first problem but not the second: a redeploy still kills every in-flight upload.
            `,
          },
          {
            id: "processing-in-request",
            statement: "Transcoding has to happen outside the request that delivers the upload.",
            verdict: "holds",
            explanation:
              "A 5-20 minute transcode cannot finish inside a 60-second request, and even with a longer timeout, tying the response to minutes of CPU means a deploy or crash loses the work and the client has no way to find out. The work has to outlive the request: see [[asynchronous-processing]].",
          },
          {
            id: "twenty-workers",
            statement: "Twenty always-on workers are enough for launch traffic.",
            verdict: "depends",
            explanation: md`
              Over a whole day: 2,000 × 12.5 minutes ≈ 17 worker-days of CPU, so twenty workers keep up *on average*. During the Sunday peak the arrival rate is 5x, about 0.12 uploads per second, and Little's law gives 0.12 × 750 s ≈ 87 transcodes in flight if nothing waits. With twenty workers a backlog builds all evening and takes hours to drain.

              Whether that is acceptable is a product decision: how long may an instructor wait on a Sunday? The queue turns a capacity problem into a latency problem; it does not make it disappear. See [[backpressure]].
            `,
          },
          {
            id: "duplicates-possible",
            statement: "Because workers can crash mid-job, the design must expect some jobs to run more than once.",
            verdict: "holds",
            explanation:
              "If a worker dies at minute 14, either the job runs again or it never finishes. \"Never finishes\" violates a requirement, so re-execution is the only option, and from the outside a slow worker is indistinguishable from a dead one. The goal is not exactly-once execution, which nobody can promise here, but making a second execution harmless.",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Convert sizes to bits and divide by link speed: a 4 GB upload over home broadband takes about half an hour.",
          "Little's law (L = λW) turns arrival rate and job time into concurrent jobs, which sizes the fleet.",
          "When workers can crash, jobs must be safe to run twice.",
        ],
        reasoning: md`
          The two numbers to keep are **~30 minutes** for an upload and **~90 concurrent transcodes** at peak. Together they rule out most of the prototype.

          - The upload outlives every timeout and deploy cycle on the API tier, so the bytes cannot flow through it.
          - The transcode outlives any reasonable request, so it must become a durable *job* that some other process picks up.
          - Once work is a job that survives crashes, it can run twice, and the rest of the design has to make that safe.

          Notice that the capacity question has no single correct answer. It turns into a choice between paying for peak capacity and making people wait. A design review that skips that conversation has decided it by accident.
        `,
        tradeoffs: [
          {
            choice: "Provision for the Sunday peak (~90 workers)",
            gains: "Videos start processing immediately at all times.",
            costs: "Most of that capacity sits idle six and a half days a week.",
          },
          {
            choice: "Provision near the daily average and let a backlog form",
            gains: "Roughly a quarter of the compute cost.",
            costs: "Sunday-evening uploads can wait hours, so the status UI has to say so honestly.",
          },
        ],
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "where-do-the-bytes-go",
      title: "Where do the bytes go?",
      phase: "decide",
      dimensions: ["defend", "trace"],
      conceptIds: ["object-storage"],
      competencyIds: ["data-plane"],
      context: md`
        An instructor selects a 4 GB file. Your API servers are stateless, redeploy several times a day, and cut requests at 60 seconds. You have Postgres and an S3-compatible object store.

        Choose where the file's bytes travel and where they come to rest.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A system has two kinds of traffic:

            - The **control plane**: small, important decisions. Who may upload, which video this is, what state it's in. It needs authorization and belongs in your API and database.
            - The **data plane**: the bytes themselves. Here, gigabytes of video. It should take the shortest path to storage built for large blobs.

            Mixing them makes the API tier carry traffic it's bad at.
          `,
        },
        {
          kind: "read",
          body: md`
            **Object storage** (S3 and similar) stores files ("objects") by key, durably, at a low price per gigabyte. Two features matter here:

            - A **presigned URL** is a link your server signs that lets whoever holds it do one specific thing, such as upload part 3 of one object, until it expires. The client never sees storage credentials.
            - **Multipart upload** splits a file into parts uploaded separately, even in parallel. If one part fails, only that part is retried. See [[object-storage]].
          `,
        },
        {
          kind: "choice",
          id: "deploy-kills",
          prompt: "Uploads stream through the API servers into storage. The API is redeployed 4 times a day. What happens to a 27-minute upload that's in progress during a deploy?",
          options: [
            {
              id: "killed",
              label: "Its connection is cut when its server is replaced, and the upload starts over.",
              correct: true,
              why: "A redeploy replaces the process holding the connection. Whatever the timeout settings, an upload running through that tier can't outlive the process.",
            },
            {
              id: "drained",
              label: "The load balancer moves it to a new server without interruption.",
              why: "Load balancers move new requests, not a single in-flight HTTP request's stream.",
            },
            {
              id: "fine",
              label: "Nothing, as long as the timeout is raised to an hour.",
              why: "Raising the timeout helps with the 60-second cut, but not with the process being replaced.",
            },
          ],
        },
        {
          kind: "estimate",
          id: "resume-saves",
          prompt: "A 4 GB file is uploaded in 100 MB parts, and the connection drops during part 31. With multipart upload, about how many megabytes have to be sent again?",
          answer: 100,
          unit: "MB",
          working: md`
            Only part 31: **100 MB**. Parts 1 to 30 are already stored. Without multipart, the whole 4 GB would start over.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should the file get from the browser to durable storage?",
        options: [
          {
            id: "api-local-disk",
            label: "Upload through the API to its local disk, then process from there",
            assessment: "flawed",
            feedback:
              "The container's disk disappears on the next deploy, and the next request for this video may land on a different container that never saw the file. The upload also outlives the 60-second timeout. This fails the requirement that an accepted upload is never lost.",
          },
          {
            id: "api-proxy-to-storage",
            label: "Stream through the API servers into object storage",
            detail: "The API receives the bytes and pipes them on, so the browser only talks to your domain.",
            assessment: "defensible",
            feedback: md`
              The bytes end up somewhere durable, which is the important part. But a 30-minute connection still runs through a tier that times out at 60 seconds and restarts several times a day, so every deploy kills in-flight uploads. You also pay for the bandwidth twice and tie up API capacity on peak days.

              This is the right shape when payloads are small (avatars, documents of a few megabytes) or when you must inspect or transform the bytes before they are stored.
            `,
          },
          {
            id: "direct-presigned",
            label: "Browser uploads directly to object storage using presigned multipart URLs from the API",
            detail: "The API authorizes the upload and records it; the bytes never touch the API.",
            assessment: "sound",
            feedback: md`
              The API does what it is good at: it checks that this instructor may upload, creates the video row as \`uploading\`, and hands out short-lived URLs that each allow writing one part of one object. The bytes go to a system built for large, durable blobs, and multipart upload lets a dropped connection resume from the last part instead of from zero.
            `,
          },
          {
            id: "postgres-blob",
            label: "Store the file in Postgres as a large object",
            assessment: "flawed",
            feedback:
              "It is durable and transactional, but gigabytes of video per row bloat backups, replication and vacuum, and the upload still has to stream through some server holding a database connection for half an hour. The database should hold the facts about the video, not the video.",
          },
        ],
        rationale: {
          prompt: "Why is this the right place for the bytes, given these constraints?",
          rubric: [
            {
              id: "timeouts-and-deploys",
              text: "The API tier's 60-second timeout and frequent redeploys make it a poor path for a transfer lasting tens of minutes.",
            },
            {
              id: "blob-vs-metadata",
              text: "Object storage is built for large immutable blobs; the database holds the metadata and status, not the bytes.",
            },
            {
              id: "resumable",
              text: "Multipart or resumable upload lets a dropped connection continue from the last completed part.",
              weight: "supporting",
            },
            {
              id: "scoped-credentials",
              text: "A presigned URL grants a narrow, expiring permission (one object, one part) without giving the client storage credentials.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Separate the control plane (authorization, state) from the data plane (bytes).",
          "Send large uploads directly to object storage with presigned, scoped, expiring URLs.",
          "Multipart upload makes a dropped connection cost one part, not the whole file.",
        ],
        reasoning: md`
          The underlying move is separating the **control plane** from the **data plane**. The control plane (who may upload, which video this is, what state it is in) is small, needs authorization and belongs to your API and database. The data plane (gigabytes of bytes) should travel the shortest path to storage built for it. See [[object-storage]].

          In practice the API runs \`CreateMultipartUpload\`, inserts \`videos(id, owner, status = 'uploading', raw_key)\`, and returns a presigned URL for each part. The browser uploads parts in parallel, retries any part that fails, and collects each part's ETag.

          What you give up: you can no longer inspect bytes on the way in. Validation (is this actually a video? is it under 10 GB?) moves to after the upload, using size limits on the presigned request and content sniffing in the worker. Abandoned multipart uploads also leave invisible parts behind; a bucket lifecycle rule that aborts incomplete uploads after a few days cleans them up.
        `,
        tradeoffs: [
          {
            choice: "Direct-to-storage uploads",
            gains: "API out of the data path, resumable uploads, scales with the storage service.",
            costs: "More client logic, validation only after the fact, and abandoned parts to clean up.",
          },
        ],
        otherwise:
          "If uploads were a few megabytes and you needed to scan or transform them inline, proxying through the API would be simpler and entirely reasonable.",
      },
      reveals: { components: ["storage"], flows: ["upload-bytes"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "knowing-the-upload-finished",
      title: "How does the system learn the upload finished?",
      phase: "decide",
      dimensions: ["defend", "break"],
      conceptIds: ["state-machines", "idempotency", "delivery-guarantees"],
      competencyIds: ["state-transitions"],
      context: md`
        The parts are in storage, but the video row still says \`uploading\`. Something has to move it to \`queued\` so processing can start.

        The browser is the first to know the parts are uploaded, but it is also the least reliable participant: tabs close, laptops sleep, and clients can be buggy or malicious.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Video status is a **state machine**: a fixed set of states and the allowed moves between them.

            \`\`\`
            uploading → queued → processing → ready
                                            ↘ failed
            \`\`\`

            Each move should happen because of a fact the system has checked, not because a participant said so.
          `,
        },
        {
          kind: "choice",
          id: "trust",
          prompt: "The browser says \"all parts uploaded\". Why not move the video to queued on that alone?",
          options: [
            {
              id: "unverified",
              label: "The claim may be wrong (a failed last part, a bug), and the error would surface much later as a confusing processing failure.",
              correct: true,
              why: "If the API completes the multipart upload itself, storage tells it whether the object exists and how big it is. Moving on a verified fact keeps the status honest.",
            },
            {
              id: "slow",
              label: "It's slower than waiting for a storage event.",
              why: "The client's call is usually the fastest signal. The problem is trusting it without checking.",
            },
            {
              id: "security-only",
              label: "Only because a malicious client could lie.",
              why: "Malice is one reason, but honest bugs and failed parts are more common. Verification protects against both.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Triggers fire more than once: a client retries its request, a storage event is delivered twice. Each trigger tries the same transition, so the transition must be safe to attempt twice. A **conditional update** does that:

            \`\`\`sql
            UPDATE videos SET status = 'queued'
            WHERE id = $1 AND status = 'uploading';
            \`\`\`

            The first attempt changes one row. Every later attempt changes zero.
          `,
        },
        {
          kind: "predict",
          id: "tab-closes",
          prompt: "An instructor's upload finishes, and they close the laptop before the browser reports completion. What does the design need so this video doesn't stay 'uploading' forever?",
          answer: md`
            A backstop that doesn't depend on the client: a periodic sweep (a **reconciler**) that checks old \`uploading\` videos against storage, completing those whose objects exist and failing the rest as abandoned. Storage events can play the same role.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What should trigger the transition from uploading to queued?",
        options: [
          {
            id: "verified-completion",
            label: "The browser sends the part list; the API completes the multipart upload, verifies the object, then queues it",
            detail: "Plus a periodic sweep that expires uploads nobody completed.",
            assessment: "sound",
            feedback: md`
              The API completes the upload itself, so it learns that the object exists from the storage system's response, not from the client's claim. It checks size and declared type, then moves the row \`uploading → queued\` in a conditional update. The sweep covers the case the fast path cannot: a client that disappears after uploading.
            `,
          },
          {
            id: "trust-client",
            label: "The browser calls POST /videos/:id/uploaded and the API queues processing immediately",
            assessment: "flawed",
            feedback:
              "The state machine advances on an unverified claim. If the last part failed, or a buggy client calls too early, the video shows processing and then fails ten minutes later in the worker with a confusing error, for what was really an upload problem the instructor could have retried immediately. Status has to reflect facts the system checked.",
          },
          {
            id: "storage-events",
            label: "Subscribe to the object store's object-created events and queue processing from them",
            assessment: "defensible",
            feedback: md`
              This is correct even if the tab closes, because the event comes from storage itself. The costs: events are typically delivered at least once and with some delay, you need to map object keys back to videos, and the client still has to learn the outcome somehow. It is a good primary mechanism when uploaders are third parties you cannot rely on to call back, and a common backstop alongside the client's call.
            `,
          },
          {
            id: "list-bucket",
            label: "Every minute, list the bucket and queue anything new",
            assessment: "defensible",
            feedback:
              "Simple, and it catches abandoned tabs. But listing a bucket that keeps growing gets slower and costs more, every upload waits up to a minute, and you have to work out \"new\" by comparing against the database. As a backstop it is fine; as the main path it is slow and expensive.",
          },
        ],
        rationale: {
          prompt: "What does your choice protect against, and what does it still need?",
          rubric: [
            {
              id: "client-vanishes",
              text: "The client can disappear between finishing the upload and reporting it, so some uploads need a backstop (a sweep or storage events).",
            },
            {
              id: "verify-not-trust",
              text: "Transitions should be driven by facts verified against storage, not by the client's assertion.",
            },
            {
              id: "trigger-fires-twice",
              text: "The trigger can fire more than once (retried request, duplicate event), so the transition must be idempotent, such as a conditional uploading → queued update.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Advance state on facts verified against storage, not on a client's claim.",
          "Make each transition a conditional update so duplicate triggers are harmless.",
          "Anything that relies on a client calling back needs a reconciler for clients that don't.",
        ],
        reasoning: md`
          Treat video status as a [[state-machines|state machine]] whose transitions are **conditional updates**:

          \`\`\`sql
          UPDATE videos SET status = 'queued'
          WHERE id = $1 AND status = 'uploading';
          \`\`\`

          If two triggers race (the client's retry and the sweep, or a duplicated storage event), only the first changes a row; the second matches zero rows and is a harmless no-op. That one \`AND status = …\` clause turns "at least once" triggers into "effectively once" transitions; see [[idempotency]].

          The sweep (the *reconciler*) handles the case the fast path cannot: any \`uploading\` video older than a few hours is checked against storage, then completed or marked \`failed: upload abandoned\`. Any design that relies on a client calling back needs something like it. Clients are not obliged to call back.
        `,
        tradeoffs: [
          {
            choice: "Client-reported completion plus a sweep",
            gains: "Fast path is immediate; abandoned uploads are eventually resolved.",
            costs: "A second moving part (the reconciler) whose correctness matters but which rarely runs on the interesting path.",
          },
        ],
        otherwise:
          "If uploads came from devices or partners you do not control, storage events would be the primary trigger and the client's call a convenience.",
      },
      reveals: { components: ["reconciler"], flows: ["complete-upload", "reconcile"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "getting-jobs-to-workers",
      title: "How do jobs reach workers?",
      phase: "decide",
      dimensions: ["defend"],
      conceptIds: ["message-queues", "transactions", "transactional-outbox"],
      competencyIds: ["job-ownership", "state-transitions"],
      context: md`
        A video is \`queued\`. Some process with CPU to spare has to find it, process it, and report back. Jobs take 5-20 minutes. You expect about 2,000 a day at launch and 10x within a year, which is still under one job every four seconds on average.

        You have Postgres. A managed message queue (at-least-once delivery, visibility timeouts) is also available if you want one.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Work that outlives a request has to become a **durable record** somewhere: a row, or a message in a queue. A job that exists only in a process's memory dies with that process, and nothing remembers it was owed.
          `,
        },
        {
          kind: "read",
          body: md`
            When one action changes two systems, say "mark the video queued" in Postgres and "publish a job" to a message queue, a crash between the two leaves them disagreeing. That's the **dual write** problem.

            If both changes live in the same database, a single [[transactions|transaction]] makes them happen together or not at all.
          `,
        },
        {
          kind: "predict",
          id: "dual-write",
          prompt: "The API updates the video to 'queued' in Postgres, then publishes a message to the queue. The process crashes between the two. What state is the system in?",
          answer: md`
            The video says \`queued\`, but no job message exists. No worker will ever pick it up, and nothing notices. The video stays queued forever.

            Writing the job as a row in the same transaction (or writing an outbox row that a relay publishes) removes that window.
          `,
        },
        {
          kind: "read",
          body: md`
            Postgres can act as a queue at modest volume. Workers claim jobs with:

            \`\`\`sql
            SELECT id FROM jobs WHERE status = 'queued'
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED LIMIT 1
            \`\`\`

            \`FOR UPDATE\` locks the chosen row; \`SKIP LOCKED\` makes other workers skip rows that are locked instead of waiting for them.
          `,
        },
        {
          kind: "estimate",
          id: "jobs-per-second",
          prompt: "20,000 jobs a day (10× launch volume). About how many jobs per second is that on average?",
          answer: 0.23,
          unit: "per second",
          working: md`
            20,000 ÷ 86,400 ≈ **0.23 a second**, or one every four seconds. A database handles thousands of small writes a second, so job traffic is a rounding error. A separate queue system would solve a problem this volume doesn't have.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should a queued video become work that a worker picks up?",
        options: [
          {
            id: "in-process",
            label: "The API server that confirmed the upload starts a background task to transcode it",
            assessment: "flawed",
            feedback:
              "The job exists only in that process's memory. The next deploy loses it with no record that it was ever running, which strands the video in processing forever. It also puts 20 minutes of CPU on the tier you need to keep responsive.",
          },
          {
            id: "jobs-table",
            label: "Insert a jobs row in the same transaction as the status change; workers claim rows with SKIP LOCKED and a lease",
            assessment: "sound",
            feedback: md`
              At this volume Postgres is an entirely respectable queue. The important property: the status change and the job are written in **one transaction**, so it is impossible to have a queued video without a job, or a job without a queued video. The costs are polling load and putting job traffic on your primary database, both negligible at a few jobs per minute.
            `,
          },
          {
            id: "message-queue",
            label: "Update the video row, then publish a message to the managed queue; workers consume it",
            assessment: "defensible",
            feedback: md`
              The queue is built for exactly this, but look at the two writes: one to Postgres, one to the queue. If the process crashes between them you get a queued video with no message, which stays stuck, or a message for a status change that rolled back. This is the dual-write problem, and the standard fix is a [[transactional-outbox]]: write the message into Postgres in the same transaction, then relay it. Worth it when you need fan-out to several consumers or very high throughput, but at this scale it adds a moving part to solve a problem the table does not have.
            `,
          },
          {
            id: "cron-batch",
            label: "A cron job runs every minute and processes queued videos one after another",
            assessment: "flawed",
            feedback:
              "It is durable, because the work is driven by database state, but it is serial: one 20-minute video blocks everything behind it, and the Sunday peak needs dozens of transcodes in parallel. If two cron runs overlap they can also process the same video at once, because nothing establishes ownership.",
          },
        ],
        rationale: {
          prompt: "Defend your choice against the strongest alternative.",
          rubric: [
            {
              id: "durable-job-record",
              text: "The job must be recorded durably, independent of any process that might die.",
            },
            {
              id: "atomic-with-status",
              text: "Recording the job atomically with the status change avoids a window where one exists without the other (or names the outbox if using a separate queue).",
            },
            {
              id: "volume-justifies",
              text: "Uses the actual volume (a few jobs a minute) to judge whether a separate queue system earns its operational cost.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Record jobs durably; a job that lives only in memory dies with its process.",
          "Write the status change and the job in one transaction to avoid a dual write.",
          "At a few jobs a minute, a Postgres table with SKIP LOCKED is a respectable queue.",
        ],
        reasoning: md`
          The deciding question is not "which tool is built for queues" but "**which design leaves no window where state and work disagree?**". With a jobs table, confirming the upload is one transaction:

          \`\`\`sql
          BEGIN;
          UPDATE videos SET status = 'queued' WHERE id = $1 AND status = 'uploading';
          INSERT INTO jobs (video_id, status, attempt) VALUES ($1, 'queued', 0);
          COMMIT;
          \`\`\`

          Either both happen or neither does; see [[transactions]]. Workers claim with \`SELECT … FOR UPDATE SKIP LOCKED\`, so concurrent workers skip rows another worker is claiming instead of blocking on them.

          A message queue is the better tool when many consumers need the same event, when claim rates reach thousands per second, or when the job database is already the bottleneck. When you adopt one, the transaction above becomes "update the row **and insert an outbox row**", and a relay publishes outbox rows to the queue. The dual write never goes away; you just move it to a place where it can be retried. See [[message-queues]].
        `,
        tradeoffs: [
          {
            choice: "Postgres jobs table",
            gains: "Transactional enqueue, one fewer system to run, jobs queryable with SQL.",
            costs: "Polling load and job traffic on the primary database; throughput tied to it.",
          },
          {
            choice: "Managed queue with an outbox",
            gains: "Push delivery, fan-out, throughput independent of the database.",
            costs: "An outbox relay to build and run, and two systems to reason about during incidents.",
          },
        ],
        otherwise:
          "A team that already runs a queue for other workloads, with the outbox pattern already in place, could reasonably reuse it here.",
      },
      reveals: { components: ["workers"], flows: ["record-state", "claim", "transcode-io"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "trace-the-happy-path",
      title: "Trace the happy path end to end",
      phase: "model",
      dimensions: ["trace"],
      conceptIds: ["object-storage", "leases-and-fencing", "caching"],
      competencyIds: ["state-transitions", "data-plane"],
      context: md`
        You have made the structural decisions. Before you start breaking things, trace one video all the way through. Getting the order right matters: several of the system's guarantees depend on which step happens before which.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            When several writes together make something visible, their **order** decides what a reader can see in between. A safe rule: write the things being pointed to before the thing that points to them.

            For a video: segments are pointed to by the manifest, and the manifest is pointed to by the video's status. So segments first, then manifest, then status.
          `,
        },
        {
          kind: "predict",
          id: "wrong-order",
          prompt: "Suppose a worker flipped the status to 'ready' first, then wrote the manifest and segments. What could a student see?",
          answer: md`
            A video marked ready whose manifest or segments don't exist yet: a player error, or a stream that stops part-way. If the worker crashed before finishing, the broken state would be permanent.

            Writing in pointer order means a reader that sees "ready" can always find everything it points to.
          `,
        },
        {
          kind: "read",
          body: md`
            A habit that catches most ordering bugs: for every write, ask **"what does a reader see if the process dies right after this?"** Acceptable answers are "garbage nobody references" or "unfinished work that a retry will finish". Unacceptable answers involve a reader following a reference to something that isn't there.
          `,
        },
        {
          kind: "choice",
          id: "after-manifest",
          prompt: "A worker dies after writing the manifest but before flipping the status. What's the state?",
          options: [
            {
              id: "unpublished",
              label: "A complete but unpublished attempt; a retry redoes it, wasting compute but breaking nothing.",
              correct: true,
              why: "Nothing points to this attempt's output yet, so no reader sees it. The lease expires, another worker reruns the job, and its own publish is what students see.",
            },
            {
              id: "broken",
              label: "A broken video visible to students.",
              why: "Students only see a video once its status says ready, and that hasn't happened.",
            },
            {
              id: "lost",
              label: "The upload is lost.",
              why: "The raw upload is untouched in storage. Only the transcode needs repeating.",
            },
          ],
        },
      ],
      interaction: {
        kind: "ordering",
        prompt: "Put the steps of a successful upload in the order they happen.",
        items: [
          { id: "authorize", label: "API authorizes the instructor and inserts the video row as uploading" },
          { id: "presign", label: "API starts a multipart upload and returns presigned part URLs" },
          { id: "upload-parts", label: "Browser uploads parts directly to object storage" },
          { id: "complete", label: "API completes the multipart upload and verifies the object's size" },
          { id: "enqueue", label: "One transaction: video uploading → queued, job row inserted" },
          { id: "claim", label: "A worker claims the job, taking a lease token and expiry" },
          { id: "renditions", label: "Worker writes all renditions under renditions/{video}/{attempt}/" },
          { id: "manifest", label: "Worker writes the master manifest for that attempt" },
          { id: "publish", label: "Fenced transaction: job succeeded, video ready, manifest pointer set" },
          { id: "play", label: "Player fetches the manifest and segments through the CDN" },
        ],
        explanation: md`
          Three orderings carry guarantees:

          - **Verify, then enqueue.** The job exists only once storage has confirmed the object, so a worker never chases a file that is not there.
          - **Renditions, then manifest, then status.** The manifest references segments, and the status references the manifest. Writing them in that order means that whenever a reader sees the newer thing, the older things it points to already exist. The status flip is the single atomic *publish* step.
          - **Claim before work.** The lease is taken before any output is written, and the output path includes the attempt number, so the attempt's identity exists before it produces anything.
        `,
      },
      reveal: {
        takeaways: [
          "Write what's pointed to before what points to it: segments, then manifest, then status.",
          "The status flip is the single atomic publish step.",
          "For every write, ask what a reader sees if the process dies right after it.",
        ],
        reasoning: md`
          A useful habit: for every write, ask what a reader sees if the process dies right after it.

          - After the renditions but before the manifest: orphaned segments nobody references. That is garbage, not corruption.
          - After the manifest but before the status flip: a complete but unpublished attempt. Another worker may redo it later, which wastes compute but breaks nothing.
          - After the status flip: done. The CDN serves immutable objects under attempt-specific keys, so long cache lifetimes are safe; see [[caching]].

          No state in that list is *wrong*, only incomplete, and incomplete states are repaired by retrying. That property is what makes the next stages survivable.
        `,
      },
      reveals: { components: ["cdn", "player"], flows: ["origin-fetch", "playback"] },
    },
    // -----------------------------------------------------------------------
    {
      id: "status-updates",
      title: "Showing the instructor what is happening",
      phase: "decide",
      dimensions: ["defend", "explain"],
      conceptIds: ["server-push", "persistent-connections"],
      competencyIds: ["state-transitions"],
      context: md`
        An instructor watches the video page after uploading. Status changes perhaps four times over 20 minutes: queued, processing, ready or failed. The status lives in Postgres and is changed by workers, which are separate processes from the API servers the browser talks to.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            There are three common ways for a page to learn about changes:

            | Method | How | Good for |
            | --- | --- | --- |
            | Polling | the client asks every few seconds | rare changes, delays of seconds acceptable |
            | Server-Sent Events | the server keeps a one-way stream open | frequent server-to-client updates |
            | WebSockets | a two-way connection | both sides sending often (chat, collaboration) |

            See [[server-push]].
          `,
        },
        {
          kind: "estimate",
          id: "poll-load",
          prompt: "200 instructors have the upload page open, and each page polls every 5 seconds. About how many requests a second does that add?",
          answer: 40,
          unit: "requests per second",
          working: md`
            200 ÷ 5 = **40 requests a second**, each a primary-key read. That is a negligible load for an API and database.
          `,
        },
        {
          kind: "choice",
          id: "who-knows",
          prompt: "With SSE, the browser is connected to an API server, but the status is changed by a worker writing to Postgres. How does the API server find out?",
          options: [
            {
              id: "pubsub",
              label: "It needs a channel from workers to API servers (pub/sub), or it polls the database itself.",
              correct: true,
              why: "The process that changes the state isn't the one holding the connection. Push needs something to carry the news between them, or the server polls on the client's behalf.",
            },
            {
              id: "automatic",
              label: "SSE notifies it automatically when the row changes.",
              why: "SSE is just a response stream from server to browser. It knows nothing about database changes.",
            },
            {
              id: "worker",
              label: "The worker sends the event straight to the browser.",
              why: "Workers don't hold browser connections and don't know which browsers care.",
            },
          ],
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How should the page learn about status changes?",
        options: [
          {
            id: "poll",
            label: "Poll GET /videos/:id every 5 seconds while the page is open, backing off when the tab is hidden",
            assessment: "sound",
            feedback:
              "With a handful of transitions over twenty minutes, a few seconds of delay costs nothing. Polling is stateless, survives deploys and proxies without special handling, and each request is a primary-key read. Two hundred open pages generate about 40 cheap requests a second.",
          },
          {
            id: "sse",
            label: "Server-Sent Events from the API server",
            assessment: "defensible",
            feedback: md`
              The delay drops to near zero, but look at who knows about the change: a worker writes to Postgres, and the browser is connected to an API server. That server has to find out somehow, either by polling the database (so you poll anyway, just on the server) or through a pub/sub channel such as Postgres \`LISTEN/NOTIFY\` or Redis. Long-lived connections also have to reconnect on every deploy. Worth it when updates are frequent or latency-sensitive.
            `,
          },
          {
            id: "websocket",
            label: "A WebSocket connection per open page",
            assessment: "defensible",
            feedback:
              "It has every cost of SSE plus a bidirectional protocol you do not need: the browser has nothing to send. WebSockets earn their cost when the client streams data to the server, as in chat or collaboration.",
          },
          {
            id: "worker-pushes",
            label: "The worker pushes status directly to the instructor's browser",
            assessment: "flawed",
            feedback:
              "Workers are not addressable from the browser and do not know which browsers care. Something has to hold the client's connection and route messages to it, and that is the API tier plus pub/sub, which is the SSE design with extra steps.",
          },
        ],
        rationale: {
          prompt: "What property of this problem makes your choice appropriate?",
          rubric: [
            {
              id: "update-rate",
              text: "Status changes a few times over many minutes, so a few seconds of latency is acceptable.",
            },
            {
              id: "who-knows",
              text: "The process that changes state (the worker) is not the one holding the client connection, so push needs pub/sub or server-side polling anyway.",
            },
            {
              id: "connection-cost",
              text: "Long-lived connections complicate deploys, load balancing and reconnection on a stateless tier.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Pick push or pull from update frequency, latency tolerance and who knows about the change.",
          "Polling a few rare transitions every few seconds costs little and survives deploys.",
          "Push needs a path from the process that changes state to the one holding the connection.",
        ],
        reasoning: md`
          Push and pull are not a matter of modern versus old-fashioned. The deciding factors are **update frequency, latency tolerance, and who knows about the change**; see [[server-push]].

          Polling here costs very little. At 5-second intervals, 200 concurrently open upload pages make 40 requests per second, each one indexed read. Push would save some of those requests and gain sub-second latency nobody needs, at the cost of a fan-out path from workers to whichever API instance holds the connection.

          The update that matters most, "your video is ready" twenty minutes later when the tab may be closed, is not solved by either: it needs an email or notification, which is a separate asynchronous job triggered by the same status transition.
        `,
        tradeoffs: [
          {
            choice: "Polling",
            gains: "Stateless, deploy-proof, trivially load-balanced.",
            costs: "Seconds of latency and a steady request rate proportional to open pages.",
          },
          {
            choice: "SSE with pub/sub",
            gains: "Near-instant updates and no idle requests.",
            costs: "Connection state on the API tier and a pub/sub dependency between workers and API servers.",
          },
        ],
        otherwise:
          "If the page showed live transcode progress (percentages updating every second) to thousands of viewers, SSE with a pub/sub channel would be the better fit.",
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "worker-dies-mid-job",
      title: "A worker dies 14 minutes in",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["leases-and-fencing", "timeouts"],
      competencyIds: ["job-ownership", "failure-recovery"],
      event: {
        kind: "failure",
        title: "Deploy kills a worker mid-transcode",
        detail:
          "A routine deploy replaces worker containers. One had been transcoding video 812 for 14 minutes. The container receives SIGTERM and is hard-killed 30 seconds later.",
      },
      context: md`
        Job 812 is marked \`running\` with the dead worker as its owner. Nothing will ever touch it again unless the design makes something do so. The requirements say a crashed or redeployed worker must not strand a job.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A process that crashes can't report that it crashed. Out-of-memory kills, hardware failures and hard kills after a shutdown grace period never run cleanup code.

            So recovery from a crashed worker can't depend on the worker doing anything.
          `,
        },
        {
          kind: "read",
          body: md`
            A **lease** is ownership with an expiry: the worker owns the job until \`leased_until\`. While it works, it **heartbeats**, pushing \`leased_until\` forward every so often. If it dies, the heartbeats stop, the lease runs out, and the job becomes claimable again.

            Use the database's clock (\`now()\`) for expiry, so machines with skewed clocks agree on when a lease ends. See [[leases-and-fencing]].
          `,
        },
        {
          kind: "choice",
          id: "lease-length",
          prompt: "Jobs take up to 20 minutes. Why use a 2-minute lease with 30-second heartbeats instead of a 25-minute lease?",
          options: [
            {
              id: "recovery",
              label: "A dead worker's job is picked up within about 2 minutes instead of 25.",
              correct: true,
              why: "Heartbeats keep a short lease alive for as long as the worker is working, so lease length no longer has to cover the whole job. It only sets how quickly a death is noticed.",
            },
            {
              id: "load",
              label: "Shorter leases put less load on the database.",
              why: "Heartbeats add a small write every 30 seconds per worker. The benefit is faster recovery, not less load.",
            },
            {
              id: "correctness",
              label: "A long lease would let two workers run the job at once.",
              why: "A long lease makes overlap less likely, not more. Its problem is slow recovery.",
            },
          ],
        },
        {
          kind: "predict",
          id: "stalled",
          prompt: "A worker is alive but its process pauses for 3 minutes (a long garbage-collection pause). Its lease is 2 minutes. What happens?",
          answer: md`
            Its lease expires during the pause and another worker claims the job. When the first worker resumes, it carries on, unaware. Now two workers are running the same job.

            Lease expiry means "probably dead", never "certainly dead". The next stage is about making that overlap harmless.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What mechanism should get job 812 finished?",
        options: [
          {
            id: "operator-retries",
            label: "Alert on failed jobs; an operator re-runs them from an admin page",
            assessment: "flawed",
            feedback:
              "Deploys happen several times a day, so this makes a person part of the normal path. Worse, the job is not *failed*. It is `running` with an owner that no longer exists, so it never shows up as failed.",
          },
          {
            id: "sigterm-handler",
            label: "The worker catches SIGTERM and marks its job as failed (or re-queued) before exiting",
            assessment: "defensible",
            feedback: md`
              This is good hygiene for graceful shutdowns and you should do it. It is not a guarantee: an out-of-memory kill, a host failure or a hard kill after the grace period never runs the handler. A process that has crashed cannot report that it has crashed. Treat the handler as an optimization layered on top of a mechanism that does not depend on it.
            `,
          },
          {
            id: "lease",
            label: "Claims are leases: the worker heartbeats to extend leased_until, and a lapsed lease makes the job claimable again",
            assessment: "sound",
            feedback: md`
              Ownership expires unless it is actively renewed. A dead worker stops renewing, and after the lease duration another worker can claim the job, with no detector, operator or cooperation from the dead process needed. The claim query simply treats \`leased_until < now()\` as available.
            `,
          },
          {
            id: "sticky-workers",
            label: "Each worker owns a fixed set of jobs and resumes them from local disk when it restarts",
            assessment: "flawed",
            feedback:
              "The replacement container is a different machine with an empty disk, and a worker that never comes back strands its jobs permanently. Ownership tied to an identity that may not return is no better than the original problem.",
          },
        ],
        rationale: {
          prompt: "Explain why your mechanism works when the worker cannot cooperate.",
          rubric: [
            {
              id: "cannot-self-report",
              text: "A crashed process cannot reliably report its own failure, so recovery cannot depend on it.",
            },
            {
              id: "expiring-ownership",
              text: "Ownership must expire unless renewed, so a dead owner's job becomes available on its own.",
            },
            {
              id: "lease-length-tradeoff",
              text: "Lease length trades recovery speed against false expiry of slow-but-alive workers; heartbeats decouple it from job length.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        takeaways: [
          "A crashed process can't report itself, so ownership must expire unless it's renewed.",
          "Short leases with heartbeats give fast recovery without limiting job length.",
          "Lease expiry means 'probably dead': a paused worker can lose its lease while still working.",
        ],
        reasoning: md`
          A [[leases-and-fencing|lease]] is ownership with a deadline. The worker claims the job with \`leased_until = now() + 2 minutes\` and heartbeats every 30 seconds to push the deadline forward. Jobs can run for 20 minutes because heartbeats keep extending a short lease; the lease does not have to cover the whole job.

          Recovery time is roughly the lease duration. Shorter leases recover faster, but a worker that stalls for longer than the lease (a long GC pause, a slow disk, a network blip to Postgres) loses its job while it is still working. **Expiry means "probably dead", never "certainly dead"**. Keep that in mind for the next stage.

          Note that expiry is computed with the database's \`now()\`, not each worker's clock, so clock skew between machines does not cause premature expiry.
        `,
        tradeoffs: [
          {
            choice: "Short lease (e.g. 2 minutes) with 30-second heartbeats",
            gains: "Crashed jobs restart within a couple of minutes.",
            costs: "A worker that stalls for more than 2 minutes loses its job while still running it.",
          },
        ],
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "two-workers-one-job",
      title: "Two workers, one job",
      phase: "break",
      dimensions: ["break", "trace"],
      conceptIds: ["leases-and-fencing", "idempotency", "concurrency-control"],
      competencyIds: ["job-ownership"],
      event: {
        kind: "failure",
        title: "Students report glitching playback",
        detail:
          "Video 812 is marked ready, but the 720p rendition stutters and jumps. Below is the reconstructed timeline from worker and database logs.",
      },
      context: md`
        Leases recover crashed workers. But this worker did not crash. It only lost contact with the database for a while. Read the timeline and select the lines where the design (not the network) is at fault.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A lease can expire while its holder is still running. The holder may not know: it may be paused, or unable to reach the database. You can't prevent this, because from the outside a paused process looks exactly like a dead one.

            What you can do is make the old holder's **writes** harmless.
          `,
        },
        {
          kind: "simulation",
          simulation: "lease-fencing",
          body: md`
            Freeze worker A for longer than its lease, then switch on **fencing**. Each new lease comes with a higher token number, and storage remembers the highest token it has accepted.
          `,
        },
        {
          kind: "choice",
          id: "fencing",
          prompt: "With fencing on, worker A resumes and writes with token 33 after worker B has written with token 34. What happens to A's write?",
          options: [
            {
              id: "rejected",
              label: "It's rejected, because storage has already seen a newer token.",
              correct: true,
              why: "The token proves which lease a write belongs to. A stale owner's write carries an old token and is refused, so it can do no damage.",
            },
            {
              id: "accepted",
              label: "It's accepted, because A did hold a lease.",
              why: "A held a lease, but not the current one. Fencing exists precisely to reject writes from owners that have been replaced.",
            },
            {
              id: "merged",
              label: "Storage merges both results.",
              why: "Storage doesn't merge; it accepts the current owner's write and rejects older ones.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            In a database, fencing is a condition on the write:

            \`\`\`sql
            UPDATE jobs SET status = 'succeeded'
            WHERE id = 812 AND lease_token = :mine;
            \`\`\`

            A stale worker's update matches zero rows. For files, which can't check tokens, give each attempt its **own output location** (for example \`renditions/812/attempt-2/\`) so two attempts never write over each other.
          `,
        },
      ],
      interaction: {
        kind: "diagnosis",
        prompt: "Select the lines that reveal a design flaw.",
        artifact: {
          type: "timeline",
          caption: "Job 812: worker and database events",
          lines: [
            { text: "12:00:00  worker-a claims job 812 (lease until 12:02:00)" },
            { text: "12:00:30  worker-a starts ffmpeg, writing to renditions/812/" },
            { text: "12:01:40  worker-a heartbeats begin timing out (packet loss to Postgres)" },
            {
              text: "12:02:00  lease expires; worker-a keeps transcoding; it never learns the lease is gone",
              fault:
                "A worker that cannot renew its lease must assume it lost the job. Continuing silently is how two owners come to exist.",
            },
            { text: "12:02:04  worker-b claims job 812 (lease until 12:04:04)" },
            {
              text: "12:02:05  worker-b starts ffmpeg, writing to renditions/812/",
              fault:
                "Both attempts write to the same prefix, so their segments overwrite each other. Output must go to a per-attempt location such as renditions/812/attempt-2/.",
            },
            { text: "12:12:40  worker-a finishes and writes renditions/812/master.m3u8" },
            {
              text: "12:12:41  worker-a: UPDATE videos SET status = 'ready' WHERE id = 812",
              fault:
                "Completion is not conditioned on still owning the job. It should require the current lease token, so a stale worker's update matches zero rows.",
            },
            { text: "12:14:02  worker-b overwrites renditions/812/720p/seg_031.ts" },
            { text: "12:16:30  support tickets: 720p playback glitches on video 812" },
          ],
        },
        rationale: {
          prompt: "What has to be true of the design so that a worker that wrongly believes it owns a job cannot do damage?",
          rubric: [
            {
              id: "expiry-does-not-stop",
              text: "Lease expiry does not stop the old worker; the system must reject its effects rather than assume it stopped.",
            },
            {
              id: "fenced-completion",
              text: "Completion must be conditional on a token identifying the current owner (a fencing token).",
            },
            {
              id: "per-attempt-output",
              text: "Each attempt writes to its own location, and publishing selects one attempt's output atomically.",
            },
            {
              id: "self-fencing",
              text: "A worker that cannot renew its lease should abort itself, as an optimization rather than the guarantee.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Lease expiry doesn't stop the old holder; reject its effects instead of assuming it stopped.",
          "Condition every completion on the current lease token (fencing).",
          "Give each attempt its own output location and publish one attempt by pointer.",
        ],
        reasoning: md`
          This is the classic failure of lease-based systems: **the lease expired, but the leaseholder did not know**. You cannot prevent it, because you cannot tell a paused process from a dead one. You can make it harmless.

          - **Fencing.** Each claim generates a new \`lease_token\`. Completion is \`UPDATE … WHERE id = 812 AND lease_token = :mine\`. Worker A's late update matches zero rows, and A treats that as "I lost; discard my work."
          - **Isolated output.** Each attempt writes to \`renditions/812/attempt-{n}/\`. Two attempts can run simultaneously without touching each other's files.
          - **Publish by pointer.** The video row stores \`manifest_key\`. Setting it inside the fenced transaction is the single step that makes one attempt's output visible. The losing attempt's files are orphans, swept later.

          Together these make the job [[idempotency|idempotent]] in the sense that matters: running it twice wastes compute but publishes exactly one consistent result. That is the realistic version of "exactly once", and it extends well beyond video: see [[leases-and-fencing]].
        `,
        tradeoffs: [
          {
            choice: "Per-attempt output prefixes",
            gains: "Concurrent attempts cannot corrupt each other; publishing is one pointer change.",
            costs: "Orphaned output from losing attempts needs a cleanup process.",
          },
        ],
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "claim-and-complete",
      title: "Write the claim and the completion",
      phase: "break",
      dimensions: ["implement"],
      conceptIds: ["leases-and-fencing", "concurrency-control", "transactions"],
      competencyIds: ["job-ownership"],
      context: md`
        Turn the last two stages into code. You need two operations: one that atomically claims the next available job, and one that completes a job only if the caller still owns it. SQL, an ORM, or pseudo-code are all fine. What matters is which conditions are checked, and where.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A claim has to be **atomic**: choosing a job and marking it taken must be one step, or two workers can choose the same job. In Postgres, one \`UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)\` statement does both.

            The row lock lasts only for that statement. The **lease** is what holds ownership for the 20 minutes the transcode takes.
          `,
        },
        {
          kind: "choice",
          id: "count-where",
          prompt: "Where should the attempt counter be incremented?",
          options: [
            {
              id: "claim",
              label: "When the job is claimed",
              correct: true,
              why: "A worker killed outright (a crash, an out-of-memory kill) never reaches an error handler. Counting at claim time means even those attempts count, so a job that crashes every worker eventually stops being claimed.",
            },
            {
              id: "catch",
              label: "In the error handler, when the job fails",
              why: "A crash never reaches the handler. A job that kills its worker would then be retried forever, with the counter never moving.",
            },
            {
              id: "complete",
              label: "When the job completes",
              why: "Successful jobs don't need counting. The counter's purpose is to stop jobs that never succeed.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Completion makes two changes that must happen together: the job becomes \`succeeded\`, and the video becomes \`ready\` with its manifest pointer. Both go in one transaction, and the job update carries the lease token. If the token no longer matches, the whole completion is abandoned and this attempt's output is left unpublished.
          `,
        },
        {
          kind: "predict",
          id: "heartbeat-false",
          prompt: "A worker's heartbeat update changes zero rows. What should the worker do?",
          answer: md`
            Stop working on the job and discard its output. Zero rows means the lease token no longer matches: another worker owns the job now. Continuing only wastes compute, and the fenced completion would be rejected anyway.
          `,
        },
      ],
      interaction: {
        kind: "implementation",
        prompt: "Implement claimJob and completeJob against these tables.",
        language: "typescript",
        starter: md`
          // jobs(id, video_id, status, attempt, lease_token, leased_until, last_error, created_at)
          // videos(id, status, manifest_key)

          async function claimJob(): Promise<Job | null> {
            // Atomically take the oldest available job.
          }

          async function heartbeat(job: Job): Promise<boolean> {
            // Extend the lease if we still hold it. Return false if we lost it.
          }

          async function completeJob(job: Job, manifestKey: string): Promise<boolean> {
            // Publish this attempt's output, but only if we still own the job.
          }
        `,
        rubric: [
          {
            id: "atomic-claim",
            text: "The claim is a single atomic statement or transaction, so two workers can never claim the same job.",
          },
          {
            id: "fresh-token",
            text: "Claiming sets a new lease token and an expiry computed by the database clock.",
          },
          {
            id: "fenced-complete",
            text: "Completion and heartbeat are conditioned on the lease token and report whether they succeeded.",
          },
          {
            id: "one-transaction",
            text: "The job status and the video status/manifest pointer change in one transaction.",
          },
          {
            id: "attempts-at-claim",
            text: "The attempt counter is incremented at claim time and capped, so a job that crashes workers eventually stops being claimed.",
            weight: "supporting",
          },
          {
            id: "skip-locked",
            text: "Uses SKIP LOCKED or an equivalent so workers do not queue behind each other's candidate rows.",
            weight: "supporting",
          },
        ],
        reference: {
          code: md`
            async function claimJob(): Promise<Job | null> {
              return db.oneOrNone(\`
                UPDATE jobs
                SET status = 'running',
                    attempt = attempt + 1,
                    lease_token = gen_random_uuid(),
                    leased_until = now() + interval '2 minutes'
                WHERE id = (
                  SELECT id FROM jobs
                  WHERE (status = 'queued'
                         OR (status = 'running' AND leased_until < now()))
                    AND attempt < 5
                  ORDER BY created_at
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1
                )
                RETURNING id, video_id, attempt, lease_token\`);
            }

            async function heartbeat(job: Job): Promise<boolean> {
              const res = await db.result(\`
                UPDATE jobs SET leased_until = now() + interval '2 minutes'
                WHERE id = $1 AND lease_token = $2 AND status = 'running'\`,
                [job.id, job.lease_token]);
              return res.rowCount === 1; // false: stop work, we are no longer the owner
            }

            async function completeJob(job: Job, manifestKey: string): Promise<boolean> {
              return db.tx(async (tx) => {
                const won = await tx.result(\`
                  UPDATE jobs SET status = 'succeeded', leased_until = NULL
                  WHERE id = $1 AND lease_token = $2 AND status = 'running'\`,
                  [job.id, job.lease_token]);
                if (won.rowCount !== 1) return false; // lost the lease: output stays unpublished

                await tx.none(\`
                  UPDATE videos SET status = 'ready', manifest_key = $2
                  WHERE id = $1 AND status = 'processing'\`,
                  [job.video_id, manifestKey]);
                return true;
              });
            }
          `,
          notes: md`
            Three details carry the correctness:

            - The claim's subquery and update run as one statement. \`FOR UPDATE SKIP LOCKED\` locks the chosen row for the duration of that statement only, not for the 20-minute transcode. The **lease** is what holds ownership for the long duration; the row lock only makes the hand-over atomic.
            - \`attempt\` increments *at claim time*. A worker killed by the poison input never reaches an error handler, so counting failures in a catch block would let a crashing job be claimed forever.
            - \`completeJob\` returns whether it won. The caller must treat \`false\` as normal: another attempt owns the job, and this attempt's output is garbage to be swept. The video update's own \`status = 'processing'\` condition also keeps a deleted video deleted.
          `,
        },
      },
      reveal: {
        takeaways: [
          "Claim with one atomic statement; the row lock makes the hand-over atomic, the lease holds ownership.",
          "Count attempts at claim time so crashes count against the budget.",
          "Complete in one transaction conditioned on the lease token, and treat a lost token as normal.",
        ],
        reasoning: md`
          The pattern generalizes: **ownership is a row; every write made by an owner is conditioned on proving it still owns the row.** Distributed locks, leader election and job queues all reduce to this shape, and the common bugs are the same everywhere: a check-then-act that is not atomic, a write that does not carry the token, or a failure count that only increments on paths a crash never reaches. See [[concurrency-control]].
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "poison-video",
      title: "The video that kills every worker",
      phase: "break",
      dimensions: ["break", "defend"],
      conceptIds: ["retries-and-backoff", "state-machines"],
      competencyIds: ["failure-recovery"],
      event: {
        kind: "failure",
        title: "A corrupt file crashes ffmpeg",
        detail:
          "An upload with a malformed container header makes ffmpeg segfault about 40 seconds in. Every worker that claims the job dies; the lease lapses; another worker claims it.",
      },
      context: md`
        The lease mechanism faithfully recovers the crashed job, again and again. Meanwhile other instructors' videos wait behind a job that will never succeed, and this instructor sees "processing" indefinitely.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Not every failure is worth retrying. Retries help only when the next attempt might behave differently:

            | Kind | Example | Retry? |
            | --- | --- | --- |
            | Transient | storage returned 503, instance reclaimed | yes, with backoff |
            | Permanent | not a valid video, unsupported codec | no: fail now, with a reason |
            | Unknown | the worker died | yes, but within a budget |
          `,
        },
        {
          kind: "choice",
          id: "crash-loop",
          prompt: "A corrupt file crashes ffmpeg 40 seconds into every attempt. Leases recover the job each time. With no attempt limit, what happens?",
          options: [
            {
              id: "loop",
              label: "It's claimed, crashes a worker, and is reclaimed forever, while the instructor sees 'processing' indefinitely.",
              correct: true,
              why: "Leases guarantee the job comes back, not that it succeeds. A failure caused by the input recurs on every attempt.",
            },
            {
              id: "succeeds",
              label: "Eventually a worker gets through it.",
              why: "The crash is caused by the file, not the worker. Every attempt fails the same way.",
            },
            {
              id: "failed",
              label: "It's marked failed after the first crash.",
              why: "Nothing marks it failed: a crashed worker can't run its error handler, and without a limit the lease just keeps re-offering the job.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Failure needs to be **visible** to the person who can act on it. The video's state machine gets a terminal move, \`processing → failed\`, with a reason written for the instructor, such as "the file appears to be corrupted; try re-exporting it", not "exit code 139". Engineers can still inspect the job record or a dead-letter table.
          `,
        },
        {
          kind: "estimate",
          id: "waste",
          prompt: "With a budget of 5 attempts, each crashing after 40 seconds, about how many worker-minutes does one poison file waste?",
          answer: 3.3,
          unit: "minutes",
          working: md`
            5 × 40 s = 200 s ≈ **3.3 worker-minutes**. Bounded and small. Without a budget, it would cost a worker every few minutes forever.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "What retry policy should the job system follow?",
        options: [
          {
            id: "retry-forever",
            label: "Keep retrying; leases guarantee it will be picked up again",
            assessment: "flawed",
            feedback:
              "Leases guarantee re-delivery, not success. A deterministic failure retried forever is a crash loop that occupies a worker every few minutes and never ends, and the instructor never learns that the file is the problem.",
          },
          {
            id: "bounded-backoff",
            label: "Count attempts at claim time; retry transient errors with backoff and jitter; after N attempts mark failed with a reason the instructor can act on",
            assessment: "sound",
            feedback: md`
              Bounded attempts turn an endless loop into a terminal, visible state. Classifying errors makes it cheaper still: "not a valid video" fails immediately on the first attempt, while "storage returned 503" is retried after a backoff. Because the attempt is counted at claim, even crashes that never reach an error handler count against the budget.
            `,
          },
          {
            id: "never-retry",
            label: "Never retry: any error marks the video failed",
            assessment: "defensible",
            feedback:
              "It is honest and simple, but transient errors (a spot instance reclaimed, a storage hiccup) would fail healthy videos and ask instructors to re-upload 4 GB. That might be acceptable for cheap, user-retriable work. Here a retry is far cheaper than the user's time.",
          },
          {
            id: "silent-dlq",
            label: "After N attempts, move the job to a dead-letter table for engineers; leave the video as processing",
            assessment: "flawed",
            feedback:
              "Dead-lettering is right for the *job*, since engineers should be able to inspect poison inputs. But the instructor's status still says processing, which violates the requirement that they see failed with a reason. The video's state machine needs a terminal transition too.",
          },
        ],
        rationale: {
          prompt: "Explain your policy, including how it handles a failure that crashes the worker outright.",
          rubric: [
            {
              id: "deterministic-failures",
              text: "Some failures are caused by the input and will recur on every attempt; retrying them only wastes capacity.",
            },
            {
              id: "bounded-and-visible",
              text: "Attempts are bounded and end in a terminal state the user can see, with a reason.",
            },
            {
              id: "count-at-claim",
              text: "Attempts must be counted at claim time because a crash never reaches a failure handler.",
            },
            {
              id: "jitter",
              text: "Backoff with jitter keeps retries from synchronizing into waves after a shared outage.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Classify failures: retry transient ones with backoff, fail permanent ones immediately, budget unknown ones.",
          "Leases guarantee re-delivery, not success; bound attempts so poison inputs stop.",
          "Give the user a terminal 'failed' state with a reason they can act on.",
        ],
        reasoning: md`
          Retries answer the question "might this succeed if tried again?", and that depends on the error; see [[retries-and-backoff]].

          - **Transient** (timeouts, 503s, reclaimed instances): retry with exponential backoff and jitter.
          - **Permanent** (invalid input, unsupported codec): fail on the first attempt with a specific reason.
          - **Unknown** (the worker died): retry, but within a budget, because a crash is exactly what a poison input looks like from outside.

          The video's state machine gains an edge: \`processing → failed(reason)\`, set in the same transaction that gives up on the job. A good failure reason is one the instructor can act on, such as "the file appears to be corrupted; try re-exporting it", not "exit code 139".
        `,
        tradeoffs: [
          {
            choice: "Attempt budget of ~5 with backoff",
            gains: "Transient failures heal themselves; poison inputs stop after bounded waste.",
            costs: "A truly transient outage longer than the backoff window still fails some healthy videos.",
          },
        ],
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "delete-while-processing",
      title: "Deleting a video mid-transcode",
      phase: "break",
      dimensions: ["break", "explain"],
      conceptIds: ["state-machines", "object-storage", "caching"],
      competencyIds: ["state-transitions", "failure-recovery"],
      event: {
        kind: "requirement-change",
        title: "Instructor deletes video 812",
        detail:
          "The instructor uploaded the wrong lecture and deletes it while worker B is eight minutes into transcoding it.",
      },
      context: md`
        Deletion touches every store in the system: the video row, the job row, raw and rendered objects, and whatever the CDN has cached. A worker may be mid-flight. Evaluate each statement about this situation.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            Deleting a video touches several stores with no shared transaction: the database rows, objects in storage, and copies cached at CDN edges. A worker may also be in the middle of a job for it.

            A **tombstone** makes deletion a state rather than an absence: \`status = 'deleted'\`. Anything later that's conditioned on another status (like the worker's \`WHERE status = 'processing'\`) quietly fails to apply.
          `,
        },
        {
          kind: "choice",
          id: "delete-order",
          prompt: "Which order is safe if the process can crash at any step?",
          options: [
            {
              id: "row-first",
              label: "Tombstone the row first, then delete objects and purge caches asynchronously.",
              correct: true,
              why: "After the tombstone, nothing references the objects. A crash leaves unreferenced files, which cost money but break nothing, and a reconciler can finish the cleanup.",
            },
            {
              id: "objects-first",
              label: "Delete the objects first, then the row.",
              why: "A crash between them leaves a 'ready' video pointing at missing files: a broken video students can still open.",
            },
            {
              id: "together",
              label: "Delete both in one transaction.",
              why: "Object storage and Postgres don't share transactions, so 'together' isn't available.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Two kinds of leftovers, and they're not equally bad:

            - **Garbage**: data nothing references. Costs money. Safe to clean up later.
            - **Dangling references**: a reference to data that's gone. Users see broken behaviour.

            Order distributed steps so that every crash leaves garbage, never dangling references.
          `,
        },
        {
          kind: "predict",
          id: "cdn-copies",
          prompt: "The original objects are deleted from storage. A student loads the video's manifest URL through the CDN a minute later. What might they get?",
          answer: md`
            Possibly the video, still playing. CDN edges keep cached copies until they expire or are purged, and deleting the origin object doesn't reach them. If deletion has to take effect quickly, it needs an explicit CDN purge, or short-lived signed URLs. See [[caching]].
          `,
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which of these hold for the design you have built?",
        claims: [
          {
            id: "delete-row-enough",
            statement: "Deleting the video row is enough; the worker will notice and stop.",
            verdict: "fails",
            explanation:
              "Nothing in the worker re-reads the video while transcoding. It runs to completion, writes renditions, and its final update finds no row. The output is orphaned in storage, and if the row was hard-deleted, the job's foreign key or a later reconciler may do something surprising. Workers do not notice anything they are not designed to check.",
          },
          {
            id: "conditional-completion",
            statement: "If deletion is a status transition (to deleted) and completion is conditioned on status = 'processing', the worker cannot resurrect the video.",
            verdict: "holds",
            explanation:
              "Treating deletion as a state, a *tombstone*, means the worker's fenced completion matches zero rows: the status is no longer `processing`. This is the same conditional-update trick as before, and it is why hard deletes are risky while anything asynchronous may still refer to the row.",
          },
          {
            id: "objects-then-row",
            statement: "Deleting the objects from storage first and then the database row is safe if the process crashes between the two.",
            verdict: "fails",
            explanation:
              "A crash between them leaves a ready video pointing at missing files, which plays as a broken video. The safe order is the reverse: tombstone the row first so nothing references the objects, then delete the objects asynchronously. A crash then leaves only unreferenced garbage, which the reconciler can clean up.",
          },
          {
            id: "orphans-are-bugs",
            statement: "Orphaned rendition files left in storage are a correctness problem.",
            verdict: "depends",
            explanation:
              "Nothing references them, so nothing behaves wrongly. That makes them a cost problem. But if deletion is a privacy promise (\"your video is gone\"), files that are still retrievable by URL are a correctness problem, and the cleanup becomes a requirement with a deadline rather than housekeeping.",
          },
          {
            id: "cdn-keeps-serving",
            statement: "The CDN may keep serving a deleted video's segments until its cached copies expire or are purged.",
            verdict: "holds",
            explanation:
              "Deleting the origin object does not reach out to every edge cache. Immutable, attempt-specific URLs let you cache for a long time, and that is exactly why deletion needs an explicit purge, or short-lived signed URLs, if it must take effect promptly. See [[caching]].",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Make deletion a tombstone state so later conditional transitions can't resurrect the video.",
          "Order distributed steps so a crash leaves garbage, never dangling references.",
          "Deleting the origin doesn't clear CDN caches; purge or use short-lived URLs.",
        ],
        reasoning: md`
          Deletion is a distributed operation across stores with no shared transaction: Postgres, object storage and every CDN edge. The recipe is the same as everywhere else in this design:

          1. **One authoritative, atomic state change.** \`status → deleted\` in Postgres. From this moment the API refuses to serve the video and every conditional transition fails.
          2. **Asynchronous, idempotent cleanup** of everything else: cancel or fence the job, delete the raw and rendition prefixes, purge CDN paths. Each step can be retried, and the reconciler re-drives anything left over.

          Order the steps so that a crash at any point leaves *unreferenced garbage* rather than *dangling references*. Garbage costs money; dangling references produce broken behaviour that users see.
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "find-the-bottleneck",
      title: "100x traffic: find the real bottleneck",
      phase: "change",
      dimensions: ["change", "explain"],
      conceptIds: ["backpressure", "message-queues", "partitioning"],
      competencyIds: ["scaling", "requirements-modeling"],
      event: {
        kind: "scale",
        title: "A university system signs on",
        detail:
          "Projected volume is 200,000 uploads a day (100x launch), with the same 5x Sunday-evening peak and the same 12.5-minute average transcode.",
      },
      context: md`
        Before you change anything, work out what actually breaks. "It needs to scale" is not a diagnosis. Find the resource that runs out first.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            "It needs to scale" isn't a diagnosis. For each resource the system uses (coordination writes, compute, storage, network out), compute the demand at the new volume and compare it with what that resource can supply. The first one to run out is the bottleneck. Fixing anything else changes nothing.
          `,
        },
        {
          kind: "estimate",
          id: "jobs-rate",
          prompt: "200,000 uploads a day. About how many jobs a second is that at the 5× Sunday peak?",
          answer: 11.6,
          unit: "per second",
          working: md`
            200,000 ÷ 86,400 ≈ 2.3 a second on average; × 5 ≈ **11.6 at peak**.

            Each job means a claim, a few heartbeats and a completion: a few dozen small database writes a second. Postgres handles thousands.
          `,
        },
        {
          kind: "estimate",
          id: "transcodes",
          prompt: "Using Little's law: 11.6 arrivals a second, 750 seconds each. About how many concurrent transcodes at peak?",
          answer: 8700,
          unit: "transcodes",
          working: md`
            11.6 × 750 ≈ **8,700 transcodes in flight**. Compute is the resource that runs out, and by a long way.
          `,
        },
        {
          kind: "choice",
          id: "parallel-chunks",
          prompt: "Splitting each video into 10 chunks transcoded in parallel. What does it change?",
          options: [
            {
              id: "latency",
              label: "Each video finishes about 10× sooner; total CPU stays about the same.",
              correct: true,
              why: "The same work is spread over more workers at once. That helps the instructor waiting for one video, not the bill.",
            },
            {
              id: "cost",
              label: "Total CPU drops by about 10×.",
              why: "Every frame still has to be encoded. Splitting adds a little overhead (stitching, keyframe alignment) rather than removing work.",
            },
            {
              id: "nothing",
              label: "Nothing, because the CPU is the bottleneck either way.",
              why: "It doesn't reduce total CPU, but it does change latency per video, which can matter to users.",
            },
          ],
        },
      ],
      interaction: {
        kind: "claims",
        prompt: "Which statements about the 100x system hold?",
        claims: [
          {
            id: "jobs-table-bottleneck",
            statement: "The Postgres jobs table becomes the bottleneck and must be replaced by a message queue.",
            verdict: "fails",
            explanation: md`
              200,000 a day is about 2.3 jobs a second on average and roughly 12 at peak. Each claim, a few heartbeats and a completion add up to a few dozen small writes a second. That is trivial for Postgres. What *can* hurt is thousands of idle workers each polling every second; that is fixed with longer poll intervals or \`LISTEN/NOTIFY\` wakeups, not a new system.
            `,
          },
          {
            id: "concurrent-transcodes",
            statement: "At peak the system needs on the order of 8,700 concurrent transcodes to avoid a backlog.",
            verdict: "holds",
            explanation:
              "Little's law: about 11.6 arrivals per second × 750 seconds ≈ 8,700 jobs in flight. Compute, not coordination, is the bottleneck by two orders of magnitude, and it is a cost problem before it is an architecture problem.",
          },
          {
            id: "parallel-segments",
            statement: "Splitting each video into chunks and transcoding them in parallel reduces the total CPU needed.",
            verdict: "fails",
            explanation:
              "It reduces latency, because a 20-minute job finishes in a couple of minutes across ten workers, but total CPU stays the same or rises slightly (keyframe alignment, stitching, coordination). It is a latency tool, not a cost tool.",
          },
          {
            id: "egress",
            statement: "Serving the output to students is likely to cost more than transcoding it.",
            verdict: "depends",
            explanation:
              "It depends on views per video. A lecture watched by 300 students at 1 GB per viewing is 300 GB of egress per video, which can easily exceed the transcode cost. CDN cache hit ratio and rendition choice (fewer students need 1080p than you think) dominate the bill at that point.",
          },
          {
            id: "storage-growth",
            statement: "Storing the raw upload forever doubles storage cost for no benefit.",
            verdict: "depends",
            explanation:
              "Keeping originals lets you re-transcode when you add a codec or fix a ladder bug. Dropping them is irreversible. A common middle ground is moving originals to a colder, cheaper storage class after the video is ready.",
          },
        ],
      },
      reveal: {
        takeaways: [
          "Find the bottleneck by comparing demand with supply for each resource at the new volume.",
          "Here coordination scales easily; compute (and then egress) is what runs out.",
          "Parallel chunking cuts latency per video, not total cost.",
        ],
        reasoning: md`
          The scale exercise has an anticlimactic answer: **the architecture holds; the bill does not.** The coordination layer (Postgres, leases, a few writes per job) scales comfortably past 100x. The resource that runs out is CPU, at about 8,700 concurrent transcodes at peak, followed by egress.

          So the useful changes are about capacity and cost: autoscale workers on backlog age, use spot or preemptible instances (leases already make preemption safe), pick a cheaper rendition ladder, and lean on the CDN. Replacing the jobs table would be work spent on a part that was never the bottleneck. See [[backpressure]] and [[partitioning]].
        `,
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "fast-lane",
      title: "Paid instructors want a fast lane",
      phase: "change",
      dimensions: ["change", "defend"],
      conceptIds: ["backpressure", "message-queues"],
      competencyIds: ["scaling"],
      event: {
        kind: "requirement-change",
        title: "New requirement: processing starts within one minute for paid accounts",
        detail:
          "Sales has promised that paid instructors' uploads begin processing within 60 seconds, even on Sunday evenings when the system is saturated.",
      },
      context: md`
        Under the Sunday peak, every worker is busy and each job holds a worker for around 12 minutes. Something has to give for a paid job to start within a minute.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            When every worker is busy, a new job starts only when some worker finishes. With 12-minute jobs on a saturated fleet, that wait depends on when the next job happens to finish: often seconds, sometimes minutes.

            **Priority** changes which job a free worker takes next. It doesn't create a free worker.
          `,
        },
        {
          kind: "choice",
          id: "priority-guarantee",
          prompt: "Paid jobs get top priority. Every worker is mid-way through a 12-minute standard job. A paid job arrives. When does it start?",
          options: [
            {
              id: "next-free",
              label: "When the next worker finishes its current job, which could be minutes away",
              correct: true,
              why: "Priority puts the paid job first in line, but the line still waits for a worker. Under saturation, a start-time guarantee needs capacity that isn't saturated.",
            },
            {
              id: "immediately",
              label: "Immediately, because it has priority",
              why: "Only if a worker is free. Priority doesn't interrupt running jobs.",
            },
            {
              id: "after-backlog",
              label: "After the whole standard backlog",
              why: "Priority prevents that: it goes ahead of everything waiting.",
            },
          ],
        },
        {
          kind: "read",
          body: md`
            Three ways to make room, each with a cost:

            - **Reserve** workers for paid jobs: some sit idle. That idle time is the price of the promise.
            - **Preempt** a running standard job: its work so far is thrown away, and standard users wait longer.
            - **Autoscale**: new instances take minutes to boot, too slow to guarantee one minute.
          `,
        },
        {
          kind: "estimate",
          id: "reserve-size",
          prompt: "Paid uploads arrive at 0.5 a second at peak and take 750 seconds each. Using Little's law, about how many paid transcodes are in flight at once?",
          answer: 375,
          unit: "transcodes",
          working: md`
            0.5 × 750 = **375**. A reserved pool needs at least that many workers, plus slack so one is almost always free when a paid job arrives.
          `,
        },
      ],
      interaction: {
        kind: "decision",
        prompt: "How do you honour the promise, and what do you pay for it?",
        options: [
          {
            id: "priority-column",
            label: "Add a priority column; workers claim paid jobs first",
            assessment: "flawed",
            feedback:
              "Priority reorders the backlog but creates no capacity. When every worker is mid-transcode, the next free worker appears whenever the soonest job finishes, which can be minutes away. Priority is the right tool for \"paid jobs go first\" and the wrong one for \"paid jobs start within 60 seconds\".",
          },
          {
            id: "reserved-pool",
            label: "Run a separate pool of workers that only claims paid jobs, sized to keep spare capacity",
            assessment: "sound",
            feedback:
              "A latency guarantee under saturation requires capacity that is not saturated. You pay for workers that are sometimes idle; that cost *is* the guarantee. The pool can still claim standard jobs when it has headroom, as long as it keeps enough idle workers to cover the paid arrival rate.",
          },
          {
            id: "preempt",
            label: "When a paid job arrives and no worker is free, preempt the standard job with the most time remaining",
            assessment: "defensible",
            feedback:
              "This meets the promise without idle capacity, but it throws away work (up to 20 minutes of CPU) and pushes standard users' latency further out at exactly the busiest moment. Leases and per-attempt output make preemption safe; whether it is fair is a product question.",
          },
          {
            id: "autoscale",
            label: "Autoscale the worker fleet on queue depth",
            assessment: "defensible",
            feedback:
              "Autoscaling tracks demand over minutes and is the right tool for cost. Instances take time to boot and pull a large image, though, so the first paid jobs in a burst still wait. It works as a complement to a small reserved pool, not as the guarantee.",
          },
        ],
        rationale: {
          prompt: "What property are you trading away, and why is it the right one to trade?",
          rubric: [
            {
              id: "priority-not-capacity",
              text: "Priority changes order, not capacity; under saturation the wait is set by when the next worker frees up.",
            },
            {
              id: "names-the-cost",
              text: "Names the cost explicitly: idle capacity, wasted work, or standard-tier latency.",
            },
            {
              id: "sizing",
              text: "Sizes the reserve from the paid arrival rate and job duration (Little's law), not a guess.",
              weight: "supporting",
            },
          ],
        },
      },
      reveal: {
        takeaways: [
          "Priority changes order, not capacity; under saturation, a start-time guarantee needs headroom.",
          "Reserved capacity, preemption and autoscaling each pay for the guarantee differently.",
          "Size a reserve with Little's law from the paid arrival rate and job duration.",
        ],
        reasoning: md`
          Latency guarantees under load are bought with **headroom**. Every option either holds spare capacity (reserved pool), takes capacity from someone else (preemption), or acquires it too slowly to guarantee anything (autoscaling).

          Sizing the reserve: if paid uploads arrive at 0.5 per second at peak and take 750 seconds, Little's law says about 375 are in flight. Add enough slack that a worker is almost always free, and the promise holds. That is the number to bring to the conversation with sales, priced in instance-hours.

          In the data model this is one column (\`lane\`) and one extra condition in each pool's claim query. The design absorbed a new requirement without a new component, which is a good sign about its boundaries.
        `,
        tradeoffs: [
          {
            choice: "Reserved paid pool",
            gains: "A real start-time guarantee under saturation.",
            costs: "Paying for idle workers, which is the price of the promise.",
          },
          {
            choice: "Preemption",
            gains: "No idle capacity.",
            costs: "Discarded work and worse latency for standard users at peak.",
          },
        ],
      },
    },
    // -----------------------------------------------------------------------
    {
      id: "defend-the-pipeline",
      title: "Defend the design",
      phase: "defend",
      dimensions: ["defend", "change"],
      conceptIds: ["asynchronous-processing", "idempotency", "webhooks"],
      competencyIds: ["job-ownership", "failure-recovery", "state-transitions"],
      context: md`
        A staff engineer reviews your design and says:

        > "This is overbuilt. Use a managed transcoding service: hand it the object key, and it calls our webhook when it's done. Delete the workers, the leases, the reconciler, all of it."

        They might be right. Respond as you would in the review.
      `,
      lesson: [

        {
          kind: "read",
          body: md`
            A managed service (here, a transcoding API) removes the parts it runs for you: workers, scaling, codecs. It doesn't remove guarantees that live at the boundary between it and your system.

            When evaluating "just use service X", list each guarantee your design provides and ask: does X provide it, or does it move to the code that talks to X?
          `,
        },
        {
          kind: "choice",
          id: "webhook",
          prompt: "The managed service calls your webhook when a transcode finishes. Which guarantee is still yours?",
          options: [
            {
              id: "dedupe",
              label: "Handling webhooks that arrive twice, late or never, and updating the video's status safely",
              correct: true,
              why: "Webhooks are delivered at least once and can be lost. Your handler needs conditional status updates, and you need a reconciler that asks the service about jobs whose webhook never came.",
            },
            {
              id: "encoding",
              label: "Running ffmpeg correctly",
              why: "That's exactly what the managed service takes off your hands.",
            },
            {
              id: "workers",
              label: "Keeping workers alive with leases",
              why: "With a managed service there are no workers of yours to lease.",
            },
          ],
        },
        {
          kind: "predict",
          id: "delete-managed",
          prompt: "An instructor deletes a video while the managed service is still transcoding it. Its webhook later reports success. What must your handler do?",
          answer: md`
            Refuse to publish: the status update must be conditional (\`WHERE status = 'processing'\`), so a deleted video stays deleted. Then clean up the service's output. The tombstone and the conditional update are still your code, whoever does the transcoding.
          `,
        },
      ],
      interaction: {
        kind: "open",
        prompt: "What does the managed service actually remove, and which guarantees still need your own code?",
        placeholder: "Start with what you agree with, then what remains your responsibility…",
        rubric: [
          {
            id: "what-it-removes",
            text: "Acknowledges what it removes: the worker fleet, leases, capacity planning and much of the poison-input handling.",
          },
          {
            id: "still-yours",
            text: "Identifies what remains: the durable video/job record, the status state machine, and the ready-means-complete invariant.",
          },
          {
            id: "webhook-semantics",
            text: "Webhooks can be duplicated, reordered or never arrive, so you still need idempotent handling plus a timeout or reconciliation for lost callbacks.",
          },
          {
            id: "honest-tradeoff",
            text: "Weighs the trade honestly: per-minute pricing and less control versus operating a fleet. Agreeing where it is the right call is part of a good defense.",
            weight: "supporting",
          },
        ],
        reference: md`
          A strong answer starts by conceding what is true: a managed transcoder removes the hardest *operational* parts, namely the fleet, autoscaling, leases, preemption and ffmpeg crash loops. For a small team at launch volume that may well be the better choice.

          Then it names what does not go away, because it was never about running ffmpeg:

          - **The system of record.** You still need the video row, its state machine, and a job record linking your video to the provider's job ID, written atomically with the transition to \`queued\`.
          - **Callback semantics.** Webhooks are delivered at least once, possibly out of order, possibly never. The handler must be idempotent (a conditional \`processing → ready\` transition keyed by provider job ID), and a reconciler must query the provider for jobs that have been processing too long. That reconciler is the same one you already built, pointed at a different source of truth; see [[webhooks]].
          - **Publish semantics.** "Ready means every rendition exists" is still your invariant. The provider writes output, but your transition is what publishes it.
          - **Deletion, fast lanes and cost** are now negotiated with a vendor's API and pricing rather than your own code.

          The general lesson is that outsourcing a component outsources its implementation, not the guarantees your product makes. The boundaries you drew (state in Postgres, bytes in storage, at-least-once work made idempotent) survive the swap, which is evidence that they are the right boundaries.
        `,
      },
      reveal: {
        takeaways: [
          "A managed service removes infrastructure, not the guarantees at your boundary with it.",
          "Webhooks can arrive twice, late or never: handle them with conditional updates and a reconciler.",
          "State machines, tombstones and status honesty stay your responsibility.",
        ],
        reasoning: md`
          A good defense is not insisting that your design is right. It is showing that you know **which parts of it are essential and which are incidental**. Here the essential parts are the state machine, the atomic transitions and the idempotent handling of at-least-once events. The workers and leases are one implementation of "run this computation reliably", and a vendor is another.
        `,
      },
    },
  ],
  synthesis: {
    whyItWorks: md`
      The design keeps three concerns apart, each with its own failure model:

      - **Bytes** live in object storage, uploaded directly and resumably, never through the request path.
      - **State** lives in Postgres: one row per video with a state machine, one row per job with a lease. Every transition that matters is a single transaction conditioned on the previous state, so concurrent or stale actors cannot move state backwards or sideways.
      - **Compute** happens in workers that hold expiring, fenced leases. Work is at-least-once by necessity; per-attempt output and fenced completion make a second execution cost compute instead of correctness.

      Every failure in the investigation (crashed worker, paused worker, poison input, abandoned upload, mid-flight delete) resolves to the same move: one atomic state change in the system of record, followed by retryable, idempotent work everywhere else.
    `,
    reliesOn: [
      "Postgres is available for confirmations and claims. While it is down nothing progresses, but nothing is lost either.",
      "Object storage writes are durable once acknowledged, and new objects are immediately readable.",
      "Lease durations comfortably exceed heartbeat intervals plus expected pauses; expiry uses the database clock.",
      "Re-running a transcode on the same input produces acceptable output, so any successful attempt may win.",
      "Clients eventually report completion or abandon the upload, and the reconciler handles the latter.",
    ],
    alternatives: [
      {
        design: "Managed transcoding service with webhooks",
        preferWhen:
          "The team is small, the ladder is standard, and per-minute pricing beats operating a fleet. The state machine, idempotent webhook handling and reconciliation remain yours.",
      },
      {
        design: "Managed message queue fed by a transactional outbox",
        preferWhen:
          "Several consumers need the same events, claim rates reach thousands per second, or job traffic is measurably hurting the primary database.",
      },
      {
        design: "Chunked, parallel transcoding",
        preferWhen:
          "Time-to-ready for long videos matters more than total compute and the added orchestration of splitting and stitching.",
      },
    ],
    tradeoffs: [
      {
        choice: "Postgres as the job queue",
        gains: "Transactional enqueue with the status change; one fewer system.",
        costs: "Polling load and job traffic on the primary database.",
      },
      {
        choice: "Direct-to-storage uploads",
        gains: "API out of the data path; resumable transfers.",
        costs: "Client complexity; validation only after the upload.",
      },
      {
        choice: "At-least-once execution with fencing",
        gains: "No stranded jobs, with no detector or operator required.",
        costs: "Duplicate compute after lease expiry; orphaned output to sweep.",
      },
      {
        choice: "Polling for status",
        gains: "Stateless, deploy-proof, simple.",
        costs: "Seconds of latency and a steady request rate.",
      },
    ],
    breaksWhen: [
      "Claim rates reach thousands per second, or job polling measurably contends with product queries on the primary database.",
      "Jobs must start within seconds under saturation without paying for reserved headroom.",
      "Processing becomes non-deterministic or has external side effects (charging, emailing), so a second execution is no longer harmless without further idempotency keys.",
      "Deletion must be guaranteed across every cache within a hard regulatory deadline.",
    ],
  },
  interviewVariants: [
    "Design YouTube's upload and processing pipeline.",
    "Design a service that generates large PDF reports that take minutes to produce.",
    "Design a background job system that survives worker crashes and deploys.",
    "How would you generate thumbnails for millions of image uploads a day?",
    "Your job queue sometimes runs the same job twice. What do you do?",
  ],
  relatedInvestigationIds: ["payment-workflow", "realtime-collaboration"],
} satisfies InvestigationInput;
