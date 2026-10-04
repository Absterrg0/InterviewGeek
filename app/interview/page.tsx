import type { Metadata } from "next";
import { InterviewSetup } from "@/components/interview/interview-setup";
import { PageHeader } from "@/components/page-header";
import { listExercises } from "@/lib/content/exercises";
import type { InterviewCandidate } from "@/lib/domain/interview";

export const metadata: Metadata = {
  title: "Interview",
  description: "A timed session drawn from the same systems you study, ending with a defense of your own project.",
};

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
      <PageHeader title="Interview">
        A timed session assembled from what you have been studying: explain a mechanism, make a design call, reason
        through a failure, and defend a system, ideally one you built. No interviewer persona and no score, just the
        questions and an honest debrief.
      </PageHeader>
      <InterviewSetup candidates={candidates} />
    </div>
  );
}
