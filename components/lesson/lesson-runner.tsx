"use client";

import { useState, type ReactNode } from "react";
import { formatEstimate, judgeEstimate, parseEstimate, type EstimateResult } from "@/lib/domain/estimate";
import { completeStep, resetLesson, SKIPPED, useLessonProgress } from "@/lib/store/lesson-progress";

export type StepView =
  | { kind: "read"; body: ReactNode }
  | {
      kind: "choice";
      id: string;
      prompt: ReactNode;
      options: { id: string; label: ReactNode; correct: boolean; why: ReactNode }[];
    }
  | {
      kind: "estimate";
      id: string;
      prompt: ReactNode;
      answer: number;
      unit?: string;
      tolerance: number;
      working: ReactNode;
    }
  | { kind: "predict"; id: string; prompt: ReactNode; answer: ReactNode };

type CheckView = Exclude<StepView, { kind: "read" }>;

const CHECK_LABEL: Record<CheckView["kind"], string> = {
  choice: "Check",
  estimate: "Work it out",
  predict: "Think first",
};

/**
 * Shows a lesson one chunk at a time: everything up to and including the next
 * unanswered check. Answering it reveals the next chunk. Later steps are in
 * the page (for search and find-in-page) but hidden until reached.
 */
export function LessonRunner({
  lessonKey,
  steps,
  children,
  finishLabel = "the question",
}: {
  lessonKey: string;
  steps: StepView[];
  children?: ReactNode;
  finishLabel?: string;
}) {
  const progress = useLessonProgress(lessonKey);
  // Bumped on "start over" so every check remounts with its local attempts cleared.
  const [generation, setGeneration] = useState(0);
  const done = new Set(progress ?? []);
  const skipped = done.has(SKIPPED);
  const checks = steps.filter((s): s is CheckView => s.kind !== "read");
  const solved = checks.filter((s) => done.has(s.id)).length;

  let visible = steps.length;
  if (!skipped) {
    const next = steps.findIndex((s) => s.kind !== "read" && !done.has(s.id));
    if (next >= 0) visible = next + 1;
  }
  const finished = visible === steps.length && (skipped || solved === checks.length);
  // Before hydration nothing is known, so nothing is marked as reached by a returning visitor.
  const hydrated = progress !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[0.8125rem] text-ink-3">
        <span aria-live="polite">
          {checks.length > 0 && (
            <>
              {solved} of {checks.length} checks done
            </>
          )}
        </span>
        {hydrated && !finished && children && (
          <button type="button" className="link font-normal" onClick={() => completeStep(lessonKey, SKIPPED)}>
            I know this, skip to {finishLabel}
          </button>
        )}
        {hydrated && finished && done.size > 0 && (
          <button
            type="button"
            className="hover:text-ink"
            onClick={() => {
              resetLesson(lessonKey);
              setGeneration(generation + 1);
            }}
          >
            Start the lesson over
          </button>
        )}
      </div>

      <ol className="lesson">
        {steps.map((step, i) => {
          const hidden = i >= visible;
          const last = i === visible - 1;
          return (
            <li key={step.kind === "read" ? `read-${i}` : step.id} hidden={hidden} className="lesson-step rise">
              {!last && <span className="lesson-rail" aria-hidden="true" />}
              {step.kind === "read" ? (
                <>
                  <span className="lesson-dot" aria-hidden="true" />
                  <div className="max-w-[66ch]">{step.body}</div>
                </>
              ) : (
                <Check
                  key={`${step.id}-${generation}`}
                  step={step}
                  solved={done.has(step.id)}
                  onSolve={() => completeStep(lessonKey, step.id)}
                />
              )}
            </li>
          );
        })}
      </ol>

      {children && (
        <div hidden={!finished} className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function Check({ step, solved, onSolve }: { step: CheckView; solved: boolean; onSolve: () => void }) {
  return (
    <>
      <span className={`lesson-mark ${solved ? "lesson-mark-done" : ""}`} aria-hidden="true">
        {solved ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 5.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          "?"
        )}
      </span>
      <div className="lesson-check">
        <p className="eyebrow mb-1.5">{CHECK_LABEL[step.kind]}</p>
        <div className="mb-4 text-[1rem] font-medium leading-snug">{step.prompt}</div>
        {step.kind === "choice" && <ChoiceCheck step={step} solved={solved} onSolve={onSolve} />}
        {step.kind === "estimate" && <EstimateCheck step={step} solved={solved} onSolve={onSolve} />}
        {step.kind === "predict" && <PredictCheck step={step} solved={solved} onSolve={onSolve} />}
      </div>
    </>
  );
}

type CheckProps<K extends CheckView["kind"]> = {
  step: Extract<CheckView, { kind: K }>;
  solved: boolean;
  onSolve: () => void;
};

function ChoiceCheck({ step, solved, onSolve }: CheckProps<"choice">) {
  const [tried, setTried] = useState<string[]>([]);
  return (
    <ul className="space-y-2">
      {step.options.map((option) => {
        const wrong = tried.includes(option.id);
        const right = solved && option.correct;
        const state = right ? "right" : wrong ? "wrong" : "idle";
        return (
          <li key={option.id} className={`lesson-option lesson-option-${state}`}>
            <button
              type="button"
              disabled={solved || wrong}
              aria-pressed={right || wrong}
              onClick={() => (option.correct ? onSolve() : setTried([...tried, option.id]))}
              className="lesson-option-button"
            >
              <span className="lesson-option-led" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug">{option.label}</span>
            </button>
            {(right || wrong) && (
              <div className="lesson-option-why">
                <p className={`text-[0.8125rem] font-medium ${right ? "text-signal-strong" : "text-signal-gap"}`}>
                  {right ? "Right." : "Not this one."}
                </p>
                <div className="mt-1 text-ink-2">{option.why}</div>
              </div>
            )}
          </li>
        );
      })}
      {!solved && tried.length > 0 && <li className="pt-1 text-[0.8125rem] text-ink-3">Try another.</li>}
    </ul>
  );
}

function EstimateCheck({ step, solved, onSolve }: CheckProps<"estimate">) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<(EstimateResult & { value: number }) | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  const check = () => {
    const parsed = parseEstimate(value);
    setUnreadable(parsed === null);
    if (parsed === null) return;
    const judged = judgeEstimate(parsed, step.answer, step.tolerance);
    setResult({ ...judged, value: parsed });
    if (judged.verdict === "close") onSolve();
  };

  const off = result && result.verdict !== "close" ? missBy(result) : null;

  return (
    <div className="space-y-4">
      {!solved && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <label className="sr-only" htmlFor={`estimate-${step.id}`}>
            Your estimate
          </label>
          <input
            id={`estimate-${step.id}`}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 40 or 20k"
            className="field w-48 font-mono tabular-nums"
          />
          {step.unit && <span className="text-[0.875rem] text-ink-2">{step.unit}</span>}
          <button type="submit" className="btn btn-primary ml-1" disabled={value.trim() === ""}>
            Check
          </button>
        </form>
      )}
      {unreadable && !solved && <p className="text-[0.8125rem] text-signal-gap">Enter a number, like 40, 20k or 3.5 billion.</p>}
      {off && !solved && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.875rem]">
          <span className="text-signal-gap">{off}</span>
          <button type="button" className="link font-normal" onClick={onSolve}>
            Show me the working
          </button>
        </div>
      )}
      {solved && (
        <div className="lesson-answer">
          <p className="mb-2 text-[0.875rem]">
            {result?.verdict === "close" ? (
              <span className="font-medium text-signal-strong">Close enough. </span>
            ) : null}
            <span className="text-ink-2">
              About{" "}
              <strong className="font-mono font-medium text-ink tabular-nums">{formatEstimate(step.answer)}</strong>
              {step.unit ? ` ${step.unit}` : ""}.
            </span>
          </p>
          {step.working}
        </div>
      )}
    </div>
  );
}

function missBy(result: EstimateResult): string {
  const factor = result.verdict === "high" ? result.ratio : 1 / result.ratio;
  const direction = result.verdict === "high" ? "high" : "low";
  if (!Number.isFinite(factor) || factor >= 1000) return `Way too ${direction}. Check your units.`;
  if (factor >= 1.95) return `About ${Math.round(factor)}× too ${direction}. Try again.`;
  return `A bit too ${direction}. Try again.`;
}

function PredictCheck({ step, solved, onSolve }: CheckProps<"predict">) {
  const [guess, setGuess] = useState("");
  return (
    <div className="space-y-4">
      {!solved ? (
        <>
          <label className="sr-only" htmlFor={`predict-${step.id}`}>
            Your guess
          </label>
          <textarea
            id={`predict-${step.id}`}
            rows={2}
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Jot down your guess (optional)"
            className="field resize-y leading-relaxed"
          />
          <button type="button" className="btn btn-secondary" onClick={onSolve}>
            Show the answer
          </button>
        </>
      ) : (
        <>
          {guess.trim() && (
            <p className="text-[0.875rem] text-ink-2">
              <span className="font-medium text-ink">You guessed:</span> {guess.trim()}
            </p>
          )}
          <div className="lesson-answer">{step.answer}</div>
        </>
      )}
    </div>
  );
}
