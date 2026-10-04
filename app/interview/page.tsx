import type { Metadata } from "next";
import { InterviewSetup } from "@/components/interview/interview-setup";
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
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 lg:pt-14">
      <header className="max-w-2xl mb-12">
        <h1 className="font-serif text-4xl leading-tight tracking-tight">Interview</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">
          A timed session assembled from what you have been studying: explain a mechanism, make a design call, reason
          through a failure, and defend a system, ideally one you built. No interviewer persona and no score, just the
          questions and an honest debrief.
        </p>
      </header>
      <InterviewSetup candidates={candidates} />
    </div>
  );
}
