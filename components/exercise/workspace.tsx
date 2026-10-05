"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Interaction } from "@/lib/domain/content";
import { checkedParts, responseMatches, rubricFor } from "@/lib/domain/evaluate";
import { exerciseKey, type Attempt, type AttemptContext, type Response } from "@/lib/domain/learner";
import { latestAttempt } from "@/lib/domain/understanding";
import { assessAttempt, submitAttempt, useLearnerState } from "@/lib/store/learner-store";
import { useHydrated } from "@/lib/use-hydrated";
import { EvidenceSummary } from "./evidence";
import { ClaimsFeedback, ClaimsInput } from "./interactions/claims";
import { DecisionFeedback, DecisionInput } from "./interactions/decision";
import { DiagnosisFeedback, DiagnosisInput } from "./interactions/diagnosis";
import { OrderingFeedback, OrderingInput } from "./interactions/ordering";
import { ImplementationFeedback, ImplementationInput, OpenFeedback, OpenInput } from "./interactions/written";
import { RubricAssessment, RubricResult, type Written } from "./rubric";
import type { ExerciseSpec, InteractionSlots } from "./types";

type Props = {
  spec: ExerciseSpec;
  slots: InteractionSlots;
  /** Server-rendered reasoning shown after answering. */
  reveal?: ReactNode;
  context: AttemptContext;
  /** Interview conditions: record the answer, hold feedback for the debrief. */
  deferFeedback?: boolean;
  /**
   * Bind the workspace to one specific attempt instead of the latest one,
   * as interview sessions do. `attemptId` is null until the item is answered.
   */
  pinned?: {
    attemptId: string | null;
    draftKey: string;
    onRecorded: (attemptId: string) => void;
  };
};

export function ExerciseWorkspace({ spec, slots, reveal, context, deferFeedback = false, pinned }: Props) {
  const state = useLearnerState();
  const hydrated = useHydrated();
  const [retrying, setRetrying] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  // The answer form is what a first-time visitor sees, so it is rendered on the
  // server. Whether an answer already exists is only knowable after hydration;
  // returning visitors then swap to the review of their attempt.
  const attempt =
    hydrated && state
      ? pinned
        ? pinned.attemptId
          ? state.attempts.find((a) => a.id === pinned.attemptId)
          : undefined
        : retrying
          ? undefined
          : latestAttempt(state.attempts, spec.ref)
      : undefined;

  if (!attempt) {
    return (
      <AnswerForm
        interaction={spec.interaction}
        draftKey={pinned?.draftKey ?? exerciseKey(spec.ref)}
        seed={exerciseKey(spec.ref)}
        onSubmit={(response) => {
          const recorded = submitAttempt({
            exercise: spec.ref,
            interaction: spec.interaction,
            tags: spec.tags,
            response,
            context,
          });
          setRetrying(false);
          setJustSubmitted(true);
          pinned?.onRecorded(recorded.id);
        }}
      />
    );
  }

  if (deferFeedback) return <Recorded focusOnMount={justSubmitted} />;

  return (
    <AttemptReview
      attempt={attempt}
      spec={spec}
      slots={slots}
      reveal={reveal}
      focusOnMount={justSubmitted}
      onRetry={
        pinned
          ? undefined
          : () => {
              setRetrying(true);
              setJustSubmitted(false);
            }
      }
    />
  );
}

function AnswerForm({
  interaction,
  draftKey,
  seed,
  onSubmit,
}: {
  interaction: Interaction;
  draftKey: string;
  seed: string;
  onSubmit: (response: Response) => void;
}) {
  const props = { draftKey, seed, onSubmit };
  switch (interaction.kind) {
    case "decision":
      return <DecisionInput interaction={interaction} {...props} />;
    case "claims":
      return <ClaimsInput interaction={interaction} {...props} />;
    case "ordering":
      return <OrderingInput interaction={interaction} {...props} />;
    case "diagnosis":
      return <DiagnosisInput interaction={interaction} {...props} />;
    case "open":
      return <OpenInput interaction={interaction} {...props} />;
    case "implementation":
      return <ImplementationInput interaction={interaction} {...props} />;
  }
}

const FEEDBACK_TITLE: Record<Interaction["kind"], string> = {
  decision: "Your decision",
  claims: "Your verdicts",
  ordering: "Your sequence",
  diagnosis: "Your diagnosis",
  open: "Reference answer",
  implementation: "Reference",
};

function Feedback({
  interaction,
  attempt,
  slots,
  seed,
}: {
  interaction: Interaction;
  attempt: Attempt;
  slots: InteractionSlots;
  seed: string;
}) {
  const response = attempt.response;
  switch (interaction.kind) {
    case "decision":
      return responseMatches(interaction, response) ? (
        <DecisionFeedback interaction={interaction} response={response} slots={slots} seed={seed} />
      ) : null;
    case "claims":
      return responseMatches(interaction, response) ? (
        <ClaimsFeedback interaction={interaction} response={response} slots={slots} />
      ) : null;
    case "ordering":
      return responseMatches(interaction, response) ? (
        <OrderingFeedback interaction={interaction} response={response} slots={slots} />
      ) : null;
    case "diagnosis":
      return responseMatches(interaction, response) ? (
        <DiagnosisFeedback interaction={interaction} response={response} />
      ) : null;
    case "open":
      return <OpenFeedback interaction={interaction} slots={slots} />;
    case "implementation":
      return <ImplementationFeedback interaction={interaction} slots={slots} />;
  }
}

function writtenPart(response: Response): Written | null {
  switch (response.kind) {
    case "decision":
      return { label: "Your reasoning", text: response.rationale };
    case "diagnosis":
      return { label: "Your explanation", text: response.rationale };
    case "open":
      return { label: "Your answer", text: response.text };
    case "implementation":
      return { label: "Your implementation", text: response.code, mono: true };
    default:
      return null;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-[1.25rem] leading-tight">{title}</h2>
      {children}
    </section>
  );
}

function AttemptReview({
  attempt,
  spec,
  slots,
  reveal,
  focusOnMount,
  onRetry,
}: {
  attempt: Attempt;
  spec: ExerciseSpec;
  slots: InteractionSlots;
  reveal?: ReactNode;
  focusOnMount: boolean;
  onRetry?: () => void;
}) {
  const focusRef = useFocusOnMount<HTMLDivElement>(focusOnMount);
  const { interaction } = spec;
  const seed = exerciseKey(spec.ref);
  const stale = checkedParts(interaction, attempt.response) === null;
  const rubric = rubricFor(interaction);
  const written = writtenPart(attempt.response);
  const answeredOn = new Date(attempt.submittedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (stale) {
    return (
      <div className="well px-5 py-4 space-y-3">
        <p>
          This exercise has changed since you answered it on {answeredOn}, so your earlier answer can no longer be
          checked.
        </p>
        {onRetry && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Answer it again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div tabIndex={-1} className="outline-none scroll-mt-16" ref={focusRef}>
        <Section title={FEEDBACK_TITLE[interaction.kind]}>
          <Feedback interaction={interaction} attempt={attempt} slots={slots} seed={seed} />
        </Section>
      </div>

      {reveal && <Section title="Engineering reasoning">{reveal}</Section>}

      {rubric && written && (
        <Section title="Assess your writing">
          {attempt.selfAssessment && attempt.evidence ? (
            <RubricResult rubric={rubric} marks={attempt.selfAssessment} written={written} />
          ) : (
            <RubricAssessment
              rubric={rubric}
              written={written}
              name={`assess-${attempt.id}`}
              onSubmit={(marks) =>
                assessAttempt({
                  attempt,
                  interaction,
                  tags: spec.tags,
                  selfAssessment: marks,
                })
              }
            />
          )}
        </Section>
      )}

      <div className="space-y-3">
        {attempt.evidence ? (
          <EvidenceSummary evidence={attempt.evidence} />
        ) : (
          <p className="text-sm text-ink-3">Evidence is recorded once you have assessed your writing.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-3">
          <span>Answered {answeredOn}</span>
          {onRetry && (
            <button type="button" className="btn btn-ghost -mr-2" onClick={onRetry}>
              Answer again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Moves focus (and the viewport) to a view that just replaced the form, so
 * keyboard and screen-reader users land on the feedback rather than on <body>.
 * Runs when the view mounts, not on later re-renders of it.
 */
function useFocusOnMount<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    ref.current.focus({ preventScroll: true });
    ref.current.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [enabled]);
  return ref;
}

function Recorded({ focusOnMount }: { focusOnMount: boolean }) {
  const ref = useFocusOnMount<HTMLDivElement>(focusOnMount);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="tint flex gap-3 px-4 py-3.5 scroll-mt-16">
      <span className="led led-strong mt-1.5" aria-hidden="true" />
      <div>
        <p className="font-medium">Answer recorded.</p>
        <p className="mt-1 text-sm text-ink-2">
          As in a real interview, feedback waits until the end. You will review and assess every answer in the debrief.
        </p>
      </div>
    </div>
  );
}
