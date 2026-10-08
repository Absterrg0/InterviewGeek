import { Prose } from "@/components/prose";
import { InlineText } from "@/components/prose-core";
import { Simulation } from "@/components/simulations/simulation";
import { getConcept } from "@/lib/content";
import type { Lesson } from "@/lib/domain/content";
import { formatEstimate } from "@/lib/domain/estimate";

/**
 * A lesson laid out flat, with every check already answered: for write-ups
 * that are read rather than worked through.
 */
export function LessonStatic({ steps }: { steps: Lesson }) {
  return (
    <div className="space-y-5">
      {steps.map((step, i) => {
        switch (step.kind) {
          case "read":
            return <Prose key={i} text={step.body} />;
          case "simulation":
            return (
              <div key={i} className="space-y-4">
                {step.body && <Prose text={step.body} />}
                <Simulation name={step.simulation} />
              </div>
            );
          case "choice": {
            const answer = step.options.find((o) => o.correct);
            return (
              <div key={step.id} className="lesson-answer">
                <p className="text-[0.9375rem] font-medium leading-snug">
                  <InlineText text={step.prompt} resolve={getConcept} />
                </p>
                {answer && (
                  <>
                    <p className="mt-1.5 text-[0.9375rem]">
                      <InlineText text={answer.label} resolve={getConcept} />
                    </p>
                    <Prose text={answer.why} className="prose-sm mt-1 text-ink-2" />
                  </>
                )}
              </div>
            );
          }
          case "estimate":
            return (
              <div key={step.id} className="lesson-answer">
                <p className="text-[0.9375rem] font-medium leading-snug">
                  <InlineText text={step.prompt} resolve={getConcept} />
                </p>
                <p className="mt-1.5 text-[0.9375rem]">
                  About <span className="font-mono tabular-nums">{formatEstimate(step.answer)}</span>
                  {step.unit ? ` ${step.unit}` : ""}.
                </p>
                <Prose text={step.working} className="prose-sm mt-1 text-ink-2" />
              </div>
            );
          case "predict":
            return (
              <div key={step.id} className="lesson-answer">
                <p className="text-[0.9375rem] font-medium leading-snug">
                  <InlineText text={step.prompt} resolve={getConcept} />
                </p>
                <Prose text={step.answer} className="prose-sm mt-1.5" />
              </div>
            );
        }
      })}
    </div>
  );
}
