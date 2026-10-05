import type { Metadata } from "next";
import { InterviewSetup } from "@/components/interview/interview-setup";
import { PageHeader } from "@/components/page-header";
import { listInvestigations } from "@/lib/content";
import { listExercises } from "@/lib/content/exercises";
import type { InterviewCandidate } from "@/lib/domain/interview";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Mock System Design Interview",
  description:
    "A timed mock interview drawn from real systems: decisions, failure diagnosis, concept recall and a defense of your own project.",
  path: "/interview",
});

export default function InterviewPage() {
  const candidates: InterviewCandidate[] = listExercises().map((e) => ({
    key: e.key,
    ref: e.ref,
    interactionKind: e.interactionKind,
    phase: e.phase,
    eventKind: e.eventKind,
    dimensions: e.dimensions,
    conceptIds: e.conceptIds,
    minutes: e.minutes,
  }));
  return (
    <div>
      <PageHeader
        title="Mock system design interview"
        meta={`Drawn from ${candidates.length} questions across ${listInvestigations().length} systems · free, no signup`}
      >
        A timed session assembled from what you have been studying: explain a mechanism, make a design call, reason
        through a failure, and defend a system, ideally one you built. No interviewer persona and no score, just the
        questions and an honest debrief.
      </PageHeader>
      <InterviewSetup candidates={candidates} />
    </div>
  );
}
