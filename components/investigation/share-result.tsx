"use client";

import { ShareLinks } from "@/components/share";
import { latestEvidence, summarize } from "@/lib/domain/understanding";
import { SITE_NAME } from "@/lib/site";
import { useLearnerState } from "@/lib/store/learner-store";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** A post about this investigation; once there is evidence, it says how it went. */
export function ShareResult({
  investigationId,
  searchTitle,
  stageCount,
  url,
}: {
  investigationId: string;
  searchTitle: string;
  stageCount: number;
  /** Absolute URL of the investigation. */
  url: string;
}) {
  const state = useLearnerState();
  if (!state) return null;
  const scoped = [...latestEvidence(state.attempts).values()].filter(
    (e) => e.exercise.kind === "stage" && e.exercise.investigationId === investigationId,
  );
  const { counts } = summarize(scoped);
  const text =
    scoped.length > 0
      ? `I worked through "${searchTitle}" on ${SITE_NAME}: ${counts.strong} strong, ${counts.partial} partial, ${plural(counts.gap, "gap")} across ${scoped.length} of ${stageCount} stages.`
      : `${searchTitle}, worked through like a real system design interview. Free, no signup.`;

  return (
    <div className="tint mt-6 p-4">
      <p className="text-[0.875rem] font-medium">
        {scoped.length > 0 ? "Post how it went" : "Know someone preparing for system design interviews?"}
      </p>
      <p className="mt-1 mb-3 max-w-[62ch] text-[0.8125rem] leading-relaxed text-ink-2">{text}</p>
      <ShareLinks url={url} text={text} />
    </div>
  );
}
