"use client";

import { InlineText } from "@/components/prose-core";
import { z } from "zod";
import { AssessmentBadge } from "@/components/ui";
import type { InteractionOf } from "@/lib/domain/content";
import { shuffled } from "@/lib/domain/evaluate";
import type { ResponseOf } from "@/lib/domain/learner";
import { LETTERS, SubmitRow, WrittenField } from "../fields";
import { MIN_RATIONALE, type InputProps, type InteractionSlots } from "../types";
import { useDraft } from "../use-draft";

type Decision = InteractionOf<"decision">;

const draftSchema = z.object({ optionId: z.string().nullable(), rationale: z.string() });

export function DecisionInput({ interaction, draftKey, seed, onSubmit }: InputProps<Decision, ResponseOf<"decision">>) {
  const [draft, setDraft, discard] = useDraft(draftKey, draftSchema, () => ({ optionId: null, rationale: "" }));
  const options = shuffled(interaction.options, seed);
  const chosen = options.some((o) => o.id === draft.optionId) ? draft.optionId : null;
  const ready = chosen !== null && draft.rationale.trim().length >= MIN_RATIONALE;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || chosen === null) return;
        discard();
        onSubmit({ kind: "decision", optionId: chosen, rationale: draft.rationale.trim() });
      }}
    >
      <fieldset>
        <legend className="font-medium text-[1.0625rem] leading-snug mb-3">{interaction.prompt}</legend>
        <div className="space-y-2">
          {options.map((option, i) => (
            <label
              key={option.id}
              className="flex gap-3 rounded-md border border-rule bg-raised/60 p-3.5 cursor-pointer transition-colors hover:border-rule-strong has-[:checked]:border-ink has-[:checked]:bg-raised has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name={`${draftKey}-option`}
                value={option.id}
                checked={chosen === option.id}
                onChange={() => setDraft({ ...draft, optionId: option.id })}
                className="sr-only peer"
              />
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-rule-strong font-mono text-[0.6875rem] text-ink-3 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper"
              >
                {LETTERS[i]}
              </span>
              <span className="min-w-0">
                <span className="block leading-snug"><InlineText text={option.label} /></span>
                {option.detail && <span className="mt-1 block text-sm text-ink-2"><InlineText text={option.detail} /></span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <WrittenField
        label={interaction.rationale.prompt}
        value={draft.rationale}
        onChange={(rationale) => setDraft({ ...draft, rationale })}
        min={MIN_RATIONALE}
        placeholder="Because…"
      />
      <SubmitRow
        ready={ready}
        label="Commit decision"
        reason={chosen === null ? "Choose an option, then explain why." : undefined}
      />
    </form>
  );
}

export function DecisionFeedback({
  interaction,
  response,
  slots,
  seed,
}: {
  interaction: Decision;
  response: ResponseOf<"decision">;
  slots: InteractionSlots;
  seed: string;
}) {
  const options = shuffled(interaction.options, seed);
  return (
    <div>
      <p className="font-medium text-[1.0625rem] leading-snug mb-3">{interaction.prompt}</p>
      <ol className="space-y-2">
        {options.map((option, i) => {
          const mine = option.id === response.optionId;
          return (
            <li
              key={option.id}
              className={`rounded-md border p-3.5 ${mine ? "border-ink bg-raised" : "border-rule"}`}
            >
              <div className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border font-mono text-[0.6875rem] ${
                    mine ? "border-ink bg-ink text-paper" : "border-rule-strong text-ink-3"
                  }`}
                >
                  {LETTERS[i]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="leading-snug"><InlineText text={option.label} /></span>
                    <AssessmentBadge assessment={option.assessment} />
                    {mine && <span className="eyebrow text-ink">Your choice</span>}
                  </div>
                  {mine ? (
                    <div className="mt-2.5">{slots.optionFeedback[option.id]}</div>
                  ) : (
                    <details className="mt-1.5 group">
                      <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink list-none [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">Why this is {option.assessment} →</span>
                        <span className="hidden group-open:inline">Hide</span>
                      </summary>
                      <div className="mt-2">{slots.optionFeedback[option.id]}</div>
                    </details>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
