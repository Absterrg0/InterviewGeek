import Link from "next/link";
import { Reveal } from "@/components/exercise/slots";
import { EventBanner } from "@/components/investigation/event-banner";
import { DashList } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { InlineText } from "@/components/prose-core";
import { AssessmentBadge, VerdictBadge } from "@/components/ui";
import { getConcept } from "@/lib/content";
import { PHASE_LABELS, type Interaction, type InteractionOf, type RubricPoint, type Stage } from "@/lib/domain/content";

/**
 * The answer key for one investigation: every stage's question with the full
 * reasoning that answers it. This is the content a learner only sees after
 * answering, gathered on the finished-design page so search engines and AI
 * assistants can read it too. Stage pages stay spoiler-free.
 */
export function StageWalkthrough({
  investigationId,
  stage,
  index,
  total,
}: {
  investigationId: string;
  stage: Stage;
  index: number;
  total: number;
}) {
  const concepts = stage.conceptIds.flatMap((id) => {
    const concept = getConcept(id);
    return concept ? [concept] : [];
  });

  return (
    <article id={`stage-${stage.id}`} className="scroll-mt-14">
      <header className="border-t border-rule-soft pt-8">
        <p className="eyebrow">
          Stage {index + 1} of {total} · {PHASE_LABELS[stage.phase]}
        </p>
        <h3 className="mt-1 font-display text-[1.25rem] leading-tight">{stage.title}</h3>
      </header>

      <div className="mt-4 space-y-6">
        {stage.event && <EventBanner event={stage.event} />}
        <div className="max-w-[66ch]">
          <Prose text={stage.context} />
        </div>

        <div className="max-w-[70ch]">
          <h4 className="eyebrow mb-2">What the stage asks</h4>
          <p className="font-display text-[1.0625rem] leading-snug">{stage.interaction.prompt}</p>
        </div>

        <div className="max-w-[70ch]">
          <Answer interaction={stage.interaction} />
        </div>

        <div className="max-w-[66ch]">
          <h4 className="eyebrow mb-3">The reasoning</h4>
          <Reveal reveal={stage.reveal} headingLevel={4} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-rule-soft pt-3">
          <p className="text-[0.8125rem] text-ink-2">
            {concepts.length > 0 && (
              <>
                Concepts:{" "}
                {concepts.map((concept, i) => (
                  <span key={concept.id}>
                    {i > 0 && ", "}
                    <Link href={`/concepts/${concept.id}`} className="concept-link text-ink">
                      {concept.title}
                    </Link>
                  </span>
                ))}
              </>
            )}
          </p>
          <Link href={`/investigations/${investigationId}/${stage.id}`} className="link text-[0.875rem]">
            Work through this stage yourself
          </Link>
        </div>
      </div>
    </article>
  );
}

/** The points a strong written answer makes, as a checklist. */
function AnswerPoints({ title, rubric }: { title: string; rubric: readonly RubricPoint[] }) {
  return (
    <div>
      <h4 className="eyebrow mb-2">{title}</h4>
      <DashList
        muted
        items={rubric.map((point) => (
          <span key={point.id}>
            <InlineText text={point.text} />
            {point.weight === "supporting" && <span className="chip-flat ml-2 align-middle">Supporting</span>}
          </span>
        ))}
      />
    </div>
  );
}

function Answer({ interaction }: { interaction: Interaction }) {
  switch (interaction.kind) {
    case "decision":
      return <DecisionAnswer interaction={interaction} />;
    case "claims":
      return <ClaimsAnswer interaction={interaction} />;
    case "ordering":
      return <OrderingAnswer interaction={interaction} />;
    case "diagnosis":
      return <DiagnosisAnswer interaction={interaction} />;
    case "open":
      return <OpenAnswer interaction={interaction} />;
    case "implementation":
      return <ImplementationAnswer interaction={interaction} />;
  }
}

function DecisionAnswer({ interaction }: { interaction: InteractionOf<"decision"> }) {
  return (
    <div className="space-y-5">
      <ol className="space-y-3">
        {interaction.options.map((option) => (
          <li key={option.id} className={`px-4 py-3.5 sm:px-5 ${option.assessment === "sound" ? "panel" : "well"}`}>
            <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1.5">
              <AssessmentBadge assessment={option.assessment} />
              <p className="min-w-[12rem] flex-1 text-[0.9375rem] font-medium leading-snug">
                <InlineText text={option.label} />
              </p>
            </div>
            {option.detail && (
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
                <InlineText text={option.detail} />
              </p>
            )}
            <Prose text={option.feedback} className="prose-sm mt-2" />
          </li>
        ))}
      </ol>
      <AnswerPoints title="What a strong answer covers" rubric={interaction.rationale.rubric} />
    </div>
  );
}

function ClaimsAnswer({ interaction }: { interaction: InteractionOf<"claims"> }) {
  return (
    <ol className="space-y-3">
      {interaction.claims.map((claim) => (
        <li key={claim.id} className="well px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1.5">
            <VerdictBadge verdict={claim.verdict} />
            <p className="min-w-[12rem] flex-1 text-[0.9375rem] font-medium leading-snug">
              <InlineText text={claim.statement} />
            </p>
          </div>
          <Prose text={claim.explanation} className="prose-sm mt-2" />
        </li>
      ))}
    </ol>
  );
}

function OrderingAnswer({ interaction }: { interaction: InteractionOf<"ordering"> }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="eyebrow mb-2">In this order</h4>
        <ol className="space-y-2">
          {interaction.items.map((item, i) => (
            <li key={item.id} className="flex gap-3">
              <span className="mt-[0.2em] grid size-5 shrink-0 place-items-center rounded-md bg-raised font-mono text-[0.6875rem] text-ink-3 shadow-[var(--shadow-btn)]">
                {i + 1}
              </span>
              <span className="text-[0.9375rem] leading-relaxed">
                <InlineText text={item.label} />
                {item.detail && (
                  <span className="text-ink-2">
                    {" — "}
                    <InlineText text={item.detail} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <Prose text={interaction.explanation} className="prose-sm" />
    </div>
  );
}

const ARTIFACT_NAME = {
  code: "Code",
  timeline: "Timeline",
  log: "Log",
} as const;

function DiagnosisAnswer({ interaction }: { interaction: InteractionOf<"diagnosis"> }) {
  const { artifact } = interaction;
  return (
    <div className="space-y-5">
      <figure className="overflow-hidden rounded-xl bg-well shadow-[inset_0_0_0_1px_var(--rule)]">
        <figcaption className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-2">
          <span className="inline-flex items-center gap-2 font-mono text-[0.625rem] tracking-wider text-ink-3 uppercase">
            <span className="text-ink">{ARTIFACT_NAME[artifact.type]}</span>
            {artifact.language && <span>{artifact.language}</span>}
          </span>
          {artifact.caption && <span className="truncate text-xs text-ink-3">{artifact.caption}</span>}
        </figcaption>
        <ol className="overflow-x-auto py-2 font-mono text-[0.8125rem] leading-relaxed">
          {artifact.lines.map((line, i) => (
            <li key={i} className={line.fault ? "bg-signal-gap-soft" : undefined}>
              <div className="flex gap-3 px-4 py-1">
                <span className="w-5 shrink-0 text-right text-ink-3 select-none">{i + 1}</span>
                <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{line.text || " "}</span>
              </div>
              {line.fault && (
                <p className="max-w-[70ch] px-4 pt-1 pb-1.5 pl-12 font-sans text-[0.875rem] leading-relaxed text-ink-2">
                  <InlineText text={line.fault} />
                </p>
              )}
            </li>
          ))}
        </ol>
      </figure>
      <AnswerPoints title="What the fix has to do" rubric={interaction.rationale.rubric} />
    </div>
  );
}

function OpenAnswer({ interaction }: { interaction: InteractionOf<"open"> }) {
  return (
    <div className="space-y-5">
      <div>
        <h4 className="eyebrow mb-2">Reference answer</h4>
        <Prose text={interaction.reference} />
      </div>
      <AnswerPoints title="What a strong answer covers" rubric={interaction.rubric} />
    </div>
  );
}

function ImplementationAnswer({ interaction }: { interaction: InteractionOf<"implementation"> }) {
  return (
    <div className="space-y-5">
      <div>
        <h4 className="eyebrow mb-2">Reference implementation</h4>
        <pre className="panel overflow-x-auto px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
          {interaction.reference.code}
        </pre>
        <div className="mt-3">
          <Prose text={interaction.reference.notes} className="prose-sm" />
        </div>
      </div>
      <AnswerPoints title="What a strong answer covers" rubric={interaction.rubric} />
    </div>
  );
}
