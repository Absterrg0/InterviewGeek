import type { Metadata } from "next";
import { Prose } from "@/components/prose";
import { buildSlots, Reveal } from "@/components/exercise/slots";
import { EventBanner } from "@/components/investigation/event-banner";
import { InterviewRunner, type CuratedItem } from "@/components/interview/interview-runner";
import { listConcepts } from "@/lib/content";
import { resolveExercise } from "@/lib/content/exercises";
import { parseExerciseKey } from "@/lib/domain/learner";

export const metadata: Metadata = { title: "Interview session", robots: { index: false } };

const MAX_ITEMS = 12;

export default async function InterviewSessionPage(props: PageProps<"/interview/session">) {
  const params = await props.searchParams;
  const sessionId = typeof params.id === "string" ? params.id : null;
  const keys = typeof params.items === "string" ? params.items.split(",").slice(0, MAX_ITEMS) : [];

  const curated: CuratedItem[] = keys.flatMap((key) => {
    const ref = parseExerciseKey(key);
    if (!ref || ref.kind === "project-question") return [];
    const resolved = resolveExercise(ref);
    if (!resolved) return [];
    const { summary, interaction, tags, context, event, reveal } = resolved;
    return [
      {
        key,
        title: summary.title,
        source: summary.source,
        href: summary.href,
        spec: { ref, interaction, tags },
        slots: buildSlots(interaction),
        context: (
          <>
            {event && <EventBanner event={event} />}
            {context && <Prose text={context} />}
          </>
        ),
        reveal: reveal ? <Reveal reveal={reveal} /> : null,
      },
    ];
  });
  const concepts = Object.fromEntries(listConcepts().map((c) => [c.id, { title: c.title, summary: c.summary }]));

  return (
    <div className="measure">
      <InterviewRunner sessionId={sessionId} curated={curated} concepts={concepts} />
    </div>
  );
}
