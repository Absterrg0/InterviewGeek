# SysGeeks

An environment for developing engineering judgment. Interview preparation is the reason people arrive; the product is understanding *why* systems are built the way they are, how they fail, and what changes when constraints change.

The core unit is an **Investigation**: a real system worked through from requirements. The learner decides, explains why, sees the engineering reasoning, breaks the system, changes its constraints, and defends what is left. Concepts (idempotency, leases, replication, …) exist to support investigations and link back to every stage that uses them.

There is no AI interviewer and no LLM anywhere in the product. Assessment is either checked against an authored key or self-assessed against specific rubric points, and the progress view says which.

## Running it

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # domain + content integrity tests
pnpm typecheck    # next typegen && tsc
pnpm lint
pnpm build
```

Node 20.9+ and pnpm 10. Deploys to Vercel as-is; set `SITE_URL` (or rely on `VERCEL_PROJECT_PRODUCTION_URL`) for the sitemap.

## Architecture in one page

- **Next.js 16 App Router, React 19, Tailwind 4, Zod 4.** Content pages are statically generated (`generateStaticParams`, `dynamicParams = false`). Only `/interview/session` and `/projects/[id]` render on demand.
- **Curated content is TypeScript data** in `lib/content/`, validated by the Zod schemas in `lib/domain/content.ts` when the library loads (a malformed document fails the build). `lib/content/integrity.ts` checks the reference graph (concept ids, competencies, components, flows, prose `[[links]]`), and `lib/content/content.test.ts` runs it over the real library.
- **Learner state lives in `localStorage`** behind one module, `lib/store/learner-store.ts`, exposed through `useSyncExternalStore`. It is validated on read (`lib/domain/learner.ts`), unreadable data is copied to a quarantine key rather than discarded, and users can export and import JSON. State transitions are pure functions in `lib/domain/learner-state.ts`, so a server-backed store could reuse them.
- **Server renders prose, client runs exercises.** Authored markdown is rendered on the server (`components/prose.tsx`) and passed to client components as ready-made nodes (`components/exercise/slots.tsx`), so the content library never ships in client bundles.

```
app/                      routes (home, investigations, concepts, companies, practice, interview, projects, understanding)
components/exercise/      the exercise engine: workspace, interactions, rubric self-assessment
components/system-map.tsx SVG architecture maps (curated grid or auto-layout)
lib/domain/               pure domain logic: schemas, evaluation, understanding, interviews, project questions
lib/content/              investigations, concepts, integrity checks, exercise resolution
lib/store/                browser persistence
```

## Domain model

| Concept | Where | Notes |
| --- | --- | --- |
| Investigation, Stage, Interaction, Competency | `lib/domain/content.ts` | Stages carry a phase (model/decide/break/change/defend), dimensions, concepts, an optional injected event, an optional lesson, an interaction and a reveal with takeaways. |
| System model: components, flows, invariants | `lib/domain/content.ts` | Shared shape for curated systems and learners' own projects. Invariants name the components that enforce them and the mechanism. `codeLocation` evidence is reserved for repository analysis. |
| Concept | `lib/domain/content.ts` | Problem, mechanism, assumptions, alternatives, failure modes, implementations (simplest first), claims, explain prompt. |
| Attempt, Evidence | `lib/domain/learner.ts` | Every answer is an attempt; evidence records a signal (strong/partial/gap), its basis (checked/self-assessed/mixed), dimensions, concepts and competencies. |
| Project | `lib/domain/learner.ts` | A learner's own architecture model, described by hand today (`source: manual`), from a repository later (`source: repository`). |
| InterviewSession | `lib/domain/learner.ts` | A timed arrangement of existing exercises; no separate question bank. |

### Evidence

`lib/domain/evaluate.ts` turns a response into evidence. Checked parts come from the key (decision assessment, claim verdicts, sequence agreement, flagged lines). Written parts come from rubric marks: core points weigh fully and supporting points half, and a strong signal requires that no core point is missed. An exercise's signal is its **weakest part**.

`lib/domain/understanding.ts` aggregates only the **latest** assessed attempt per exercise into standings by dimension, concept and competency, and derives plain-language insights from counts (for example, "Defend is your most reliable dimension… Break is where gaps cluster").

Decision options are assessed as **sound** (preferable under these constraints), **defensible** (right under different constraints, and the feedback says which) or **flawed** (violates a requirement or correctness property). Investigations never pretend there is one correct architecture.

## Authoring content

Investigations live in `lib/content/investigations/*.ts` and are registered in `index.ts`. Concepts live in `lib/content/concepts/*.ts`, grouped by domain.

- Prose fields support a small markdown subset (`lib/prose.ts`): paragraphs, `- `/`1. ` lists, `> ` quotes, fenced code, tables, `code`, **bold**, *emphasis*, and `[[concept-id]]` / `[[concept-id|label]]` links. Use the `md` template tag to indent prose with the code.
- Short fields (option labels, claim statements, rubric points, event text) support inline markdown only.
- `stage.reveals` lists components and flows that appear on the system map once the stage is answered; parts no stage reveals are given from the start.
- Run `pnpm test` after editing; the integrity test reports dangling references, unused competencies, reserved ids and map visibility mistakes.

The standard for content: never teach terminology without mechanism, never present a design without constraints, never discuss scaling without naming the bottleneck, and never discuss reliability without failure scenarios.

### Lessons: teach before you test

A stage should not ask a question the learner has not been given the tools to answer. `stage.lesson` (and `concept.lesson`) is a list of small steps shown one chunk at a time, each chunk ending in a check that answers immediately:

- `read`: a short paragraph, list, table or code block. One idea per step.
- `choice`: one question, exactly one correct option, and a `why` on every option. A wrong pick explains itself and the learner tries again.
- `estimate`: a back-of-envelope number with a `tolerance` (default ±30%) and the worked arithmetic. Use these for sizing.
- `predict`: "what happens when…", answered by the learner (optionally in writing) before the answer is shown.
- `simulation`: an interactive model of a mechanism (`rate-limit-windows`, `lease-fencing`, `cache-stampede`, `consistent-hashing`), with an optional note on what to try. It is not a check; follow it with one that asks about what the learner saw. The models are pure functions in `lib/domain/simulations.ts` (tested there); the widgets in `components/simulations/` only draw them.

Every stage must have a lesson and `reveal.takeaways`, and every concept must have a lesson (on the concept page it replaces the problem and mechanism prose, so it has to carry the whole mechanism). The integrity test fails otherwise.

The stage's interaction comes after the lesson, and `reveal.takeaways` (two or three sentences) is what the learner should remember. Lesson checks are practice and are not recorded as evidence; progress through them is kept separately in `lib/store/lesson-progress.ts`. Written reasoning on decisions and diagnoses is optional; when it is left out the evidence rests on the checked part alone.

Write plainly. Titles say what the stage is about ("Estimate the load", not "Size it before you draw it"). No slogans, no aphorisms to close a paragraph, no "the real problem is…": state the mechanism and the numbers.

### Sources and companies

`lib/content/sources.ts` lists companies and their published writeups (engineering blog posts, papers, talks, code). One company per idea: each company is there for one problem it solved and wrote about, and is paired with exactly one investigation (the tests enforce the pairing both ways). Company pages, the "Read and practise next" links on investigations and the "Further reading" section of concepts all read from it.

Rules: link the original and credit the authors. A company's `context` is our own explanation of the idea; a writeup's `note` is a sentence or two on why to read it. Neither paraphrases the post: the original is the content. Only use numbers the authors reported. Before adding prose based on a source, check it for copied wording: download the sources and look for runs of six or more words shared with our files.

### Review, design rounds and self-assessment

- **Review queue** (`lib/domain/review.ts`): each exercise's next review is scheduled from its latest assessed answer: a gap after 1 day, partial after 3, strong after 7, 21, 60 and 180 days in a row. It is derived from attempts alone, so it needs no state of its own. A stage that is due reopens as a fresh question with the earlier answer hidden; the Progress page and the home page list what is due.
- **Design rounds** (`/investigations/[id]/design`, `lib/domain/design-round.ts`): one system, a blank page, five timed sections (requirements, estimates, design, deep dives, failure and change), then a comparison against a reference assembled by `lib/content/design-reference.ts` from the investigation itself (requirements, lesson estimates, components, decide/break/change stages). Rounds are saved in learner state (`rounds`), so export and import include them.
- **Citations** (`lib/domain/passages.ts`): marking a rubric point covered or partly requires picking the sentence (or line of code) in the learner's answer that shows it. Citations are stored on the attempt and shown with the assessment.

### Adding an interaction type

A schema in `lib/domain/content.ts`, a response schema in `lib/domain/learner.ts`, a case in `lib/domain/evaluate.ts`, and an input/feedback pair in `components/exercise/interactions/`, wired into `components/exercise/workspace.tsx`. Nothing else switches on the kind.

## Projects and future repository analysis

`lib/domain/project-questions.ts` generates questions from a project's model: trace entry-point requests, durability of stateful components, slow dependencies, redelivery of asynchronous flows, enforcement of invariants, the concurrency model, 100x scale, and why workers are separate. Answers are ordinary attempts, so they feed the same evidence model and appear in interviews.

Repository analysis is designed to fill the same `Project` shape (`source: repository`, `codeLocation` evidence on components and invariants). The question templates, evidence and interview composition then work unchanged.
