import type { ReactNode } from "react";
import { Prose } from "@/components/prose";
import { Simulation } from "@/components/simulations/simulation";
import { InlineText } from "@/components/prose-core";
import { getConcept } from "@/lib/content";
import type { Lesson as LessonSteps } from "@/lib/domain/content";
import { shuffled } from "@/lib/domain/evaluate";
import { LessonRunner, type StepView } from "./lesson-runner";

const resolve = (id: string) => getConcept(id);

function inline(text: string): ReactNode {
  return <InlineText text={text} resolve={resolve} />;
}

/**
 * A lesson rendered on the server: prose becomes ready-made nodes, and the
 * client runner only decides how much of it to show.
 */
export function Lesson({
  lessonKey,
  steps,
  children,
  finishLabel,
}: {
  /** Where progress through this lesson is remembered. */
  lessonKey: string;
  steps: LessonSteps;
  /** What the lesson leads to (a question, usually), shown once it is finished. */
  children?: ReactNode;
  /** Names what `children` is, for the skip link. */
  finishLabel?: string;
}) {
  const views: StepView[] = steps.map((step) => {
    switch (step.kind) {
      case "read":
        return { kind: "read", body: <Prose text={step.body} /> };
      case "simulation":
        return {
          kind: "read",
          body: (
            <div className="space-y-4">
              {step.body && <Prose text={step.body} />}
              <Simulation name={step.simulation} />
            </div>
          ),
        };
      case "choice":
        return {
          kind: "choice",
          id: step.id,
          prompt: inline(step.prompt),
          options: shuffled(step.options, `${lessonKey}/${step.id}`).map((o) => ({
            id: o.id,
            label: inline(o.label),
            correct: o.correct,
            why: <Prose text={o.why} className="prose-sm" />,
          })),
        };
      case "estimate":
        return {
          kind: "estimate",
          id: step.id,
          prompt: inline(step.prompt),
          answer: step.answer,
          unit: step.unit,
          tolerance: step.tolerance,
          working: <Prose text={step.working} className="prose-sm" />,
        };
      case "predict":
        return {
          kind: "predict",
          id: step.id,
          prompt: inline(step.prompt),
          answer: <Prose text={step.answer} className="prose-sm" />,
        };
    }
  });
  return (
    <LessonRunner lessonKey={lessonKey} steps={views} finishLabel={finishLabel}>
      {children}
    </LessonRunner>
  );
}
