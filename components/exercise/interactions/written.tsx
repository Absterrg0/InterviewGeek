"use client";

import { z } from "zod";
import type { InteractionOf } from "@/lib/domain/content";
import type { ResponseOf } from "@/lib/domain/learner";
import { SubmitRow, WrittenField } from "../fields";
import { MIN_ANSWER, type InputProps, type InteractionSlots } from "../types";
import { useDraft } from "../use-draft";

type Open = InteractionOf<"open">;
type Implementation = InteractionOf<"implementation">;

const textDraft = z.string();

export function OpenInput({ interaction, draftKey, onSubmit }: InputProps<Open, ResponseOf<"open">>) {
  const [text, setText, discard] = useDraft(draftKey, textDraft, () => "");
  const ready = text.trim().length >= MIN_ANSWER;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        discard();
        onSubmit({ kind: "open", text: text.trim() });
      }}
    >
      <WrittenField
        label={interaction.prompt}
        value={text}
        onChange={setText}
        min={MIN_ANSWER}
        rows={9}
        placeholder={interaction.placeholder}
        hint="Write it as you would say it in a design review. You will compare it against the points a strong answer makes."
      />
      <SubmitRow ready={ready} label="Submit answer" />
    </form>
  );
}

export function ImplementationInput({
  interaction,
  draftKey,
  onSubmit,
}: InputProps<Implementation, ResponseOf<"implementation">>) {
  const [code, setCode, discard] = useDraft(draftKey, textDraft, () => interaction.starter);
  const changed = code.trim() !== interaction.starter.trim();
  const ready = changed && code.trim().length >= MIN_ANSWER;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        discard();
        onSubmit({ kind: "implementation", code });
      }}
    >
      <WrittenField
        label={interaction.prompt}
        value={code}
        onChange={setCode}
        min={MIN_ANSWER}
        rows={Math.min(28, Math.max(14, interaction.starter.split("\n").length + 6))}
        mono
        hint={`${interaction.language}. Pseudo-code is fine; what matters is which conditions are checked, and where. Tab moves focus, so indent with spaces.`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitRow ready={ready} label="Submit implementation" reason={changed ? undefined : "Edit the starter first."} />
        {changed && (
          <button type="button" className="btn btn-ghost" onClick={() => setCode(interaction.starter)}>
            Reset to starter
          </button>
        )}
      </div>
    </form>
  );
}

export function OpenFeedback({
  interaction,
  slots,
}: {
  interaction: Open;
  slots: InteractionSlots;
}) {
  return (
    <div>
      <p className="font-display text-[1.125rem] leading-snug mb-5">{interaction.prompt}</p>
      <h3 className="eyebrow mb-3">What a strong answer covers</h3>
      <div className="panel px-5 py-4">{slots.reference}</div>
    </div>
  );
}

export function ImplementationFeedback({
  interaction,
  slots,
}: {
  interaction: Implementation;
  slots: InteractionSlots;
}) {
  return (
    <div className="space-y-4">
      <p className="font-display text-[1.125rem] leading-snug">{interaction.prompt}</p>
      <div>
        <h3 className="eyebrow mb-3">One reference implementation</h3>
        <pre className="rounded-xl bg-well px-5 py-4 shadow-[inset_0_0_0_1px_var(--rule)] overflow-x-auto font-mono text-[0.8125rem] leading-relaxed">
          <code>{interaction.reference.code}</code>
        </pre>
      </div>
      <div>{slots.reference}</div>
    </div>
  );
}
