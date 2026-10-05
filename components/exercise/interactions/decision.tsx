"use client";

import { InlineText } from "@/components/prose-core";
import { AssessmentBadge } from "@/components/ui";
import type { InteractionOf } from "@/lib/domain/content";
import { shuffled } from "@/lib/domain/evaluate";
import type { ResponseOf } from "@/lib/domain/learner";
import { LETTERS, SubmitRow, WrittenField } from "../fields";
import { MIN_RATIONALE, type InputProps, type InteractionSlots } from "../types";
import { useDraft } from "../use-draft";

type Decision = InteractionOf<"decision">;

type Draft = { optionId: string | null; rationale: string };

function parseDraft(raw: unknown): Draft | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { optionId, rationale } = raw as { optionId?: unknown; rationale?: unknown };
  if (optionId !== null && typeof optionId !== "string") return undefined;
  if (typeof rationale !== "string") return undefined;
  return { optionId, rationale };
}

export function DecisionInput({ interaction, draftKey, seed, onSubmit }: InputProps<Decision, ResponseOf<"decision">>) {
  const [draft, setDraft, discard] = useDraft<Draft>(draftKey, parseDraft, () => ({
    optionId: null,
    rationale: "",
  }));
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
        onSubmit({
          kind: "decision",
          optionId: chosen,
          rationale: draft.rationale.trim(),
        });
      }}
    >
      <fieldset>
        <legend className="font-display text-[1.125rem] leading-snug mb-4">{interaction.prompt}</legend>
        <div className="space-y-2">
          {options.map((option, i) => (
            <label key={option.id} className="choice">
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
                className="grid size-6 shrink-0 place-items-center rounded-md bg-raised font-mono text-[0.6875rem] text-ink-3 shadow-[var(--shadow-btn)] peer-checked:bg-accent-solid peer-checked:text-black peer-checked:shadow-none"
              >
                {LETTERS[i]}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-[0.875rem] font-medium leading-snug">
                  <InlineText text={option.label} />
                </span>
                {option.detail && (
                  <span className="mt-1 block text-[0.8125rem] text-ink-2">
                    <InlineText text={option.detail} />
                  </span>
                )}
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
      <p className="font-display text-[1.125rem] leading-snug mb-4">{interaction.prompt}</p>
      <ol className="space-y-2">
        {options.map((option, i) => {
          const mine = option.id === response.optionId;
          return (
            <li
              key={option.id}
              className={`rounded-xl p-4 ${mine ? "bg-accent-soft shadow-[0_0_0_1.5px_var(--accent-solid)]" : "panel"}`}
            >
              <div className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={`grid size-6 shrink-0 place-items-center rounded-md font-mono text-[0.6875rem] ${
                    mine ? "bg-accent-solid text-black" : "bg-raised text-ink-3 shadow-[var(--shadow-btn)]"
                  }`}
                >
                  {LETTERS[i]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium leading-snug">
                      <InlineText text={option.label} />
                    </span>
                    <AssessmentBadge assessment={option.assessment} />
                    {mine && <span className="chip-flat text-accent">Your choice</span>}
                  </div>
                  {mine ? (
                    <div className="mt-2.5">{slots.optionFeedback[option.id]}</div>
                  ) : (
                    <details className="mt-1.5 group">
                      <summary className="cursor-pointer text-sm font-medium text-ink-3 hover:text-ink list-none [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">Why this is {option.assessment}</span>
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
