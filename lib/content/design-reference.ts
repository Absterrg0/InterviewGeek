/**
 * The reference a design round is compared against, assembled from what an
 * investigation already says: its requirements, the numbers its lessons work
 * out, its components, and the decisions and failures its stages walk through.
 * Nothing here is authored separately, so the reference can't drift from the
 * investigation.
 */
import type { Investigation, Stage } from "@/lib/domain/content";
import type { DesignSectionId } from "@/lib/domain/design-round";
import { formatEstimate } from "@/lib/domain/estimate";

export type ReferenceItem = {
  id: string;
  /** Inline markdown. */
  text: string;
  /** Inline markdown: the reference answer, or what to remember. */
  detail?: string;
};

export type DesignReference = Record<DesignSectionId, ReferenceItem[]>;

/** The option an investigation considers sound, when the stage is a decision. */
function chosen(stage: Stage): string | undefined {
  if (stage.interaction.kind !== "decision") return undefined;
  return stage.interaction.options.find((o) => o.assessment === "sound")?.label;
}

function stageItem(stage: Stage): ReferenceItem {
  const choice = chosen(stage);
  const takeaway = stage.reveal.takeaways?.[0];
  const parts = [choice ? `Reference: ${choice}.` : undefined, takeaway].filter(Boolean);
  return {
    id: `stage-${stage.id}`,
    text: stage.event ? `${stage.title}: ${stage.event.title}` : stage.title,
    detail: parts.length > 0 ? parts.join(" ") : undefined,
  };
}

export function designReference(inv: Investigation): DesignReference {
  const estimates: ReferenceItem[] = inv.stages.flatMap((stage) =>
    (stage.lesson ?? []).flatMap((step) =>
      step.kind === "estimate"
        ? [
            {
              id: `estimate-${stage.id}-${step.id}`,
              text: step.prompt,
              detail: `About **${formatEstimate(step.answer)}**${step.unit ? ` ${step.unit}` : ""}.`,
            },
          ]
        : [],
    ),
  );
  // Without worked numbers, the stated volumes are what the estimates start from.
  const fallbackEstimates: ReferenceItem[] = inv.constraints.map((text, i) => ({ id: `constraint-${i}`, text }));

  return {
    requirements: [
      ...inv.requirements.functional.map((text, i) => ({ id: `functional-${i}`, text })),
      ...inv.requirements.nonFunctional.map((text, i) => ({ id: `non-functional-${i}`, text })),
    ],
    estimates: estimates.length > 0 ? estimates : fallbackEstimates,
    design: inv.system.components.map((c) => ({
      id: `component-${c.id}`,
      text: `**${c.label}**`,
      detail: c.durableState ? `${c.responsibility} Owns ${c.durableState}.` : c.responsibility,
    })),
    "deep-dives": inv.stages.filter((s) => s.phase === "decide").map(stageItem),
    failures: inv.stages.filter((s) => s.phase === "break" || s.phase === "change").map(stageItem),
  };
}

/**
 * The scenario as an interviewer would state it: sentences that talk about the
 * investigation itself ("This investigation follows…") are dropped, and so is
 * any paragraph left empty.
 */
export function interviewPrompt(scenario: string): string {
  return scenario
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !/\bthis investigation\b/i.test(sentence))
        .join(" ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n");
}
