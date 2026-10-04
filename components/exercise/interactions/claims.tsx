"use client";

import { InlineText } from "@/components/prose-core";
import { z } from "zod";
import { Segmented, VERDICT_LABEL } from "@/components/ui";
import { CLAIM_VERDICTS, type ClaimVerdict, type InteractionOf } from "@/lib/domain/content";
import type { ResponseOf } from "@/lib/domain/learner";
import { SubmitRow } from "../fields";
import type { InputProps, InteractionSlots } from "../types";
import { useDraft } from "../use-draft";

type Claims = InteractionOf<"claims">;

const draftSchema = z.record(z.string(), z.enum(CLAIM_VERDICTS));
const VERDICT_OPTIONS = CLAIM_VERDICTS.map((v) => ({ value: v, label: VERDICT_LABEL[v] }));

export function ClaimsInput({ interaction, draftKey, onSubmit }: InputProps<Claims, ResponseOf<"claims">>) {
  const [verdicts, setVerdicts, discard] = useDraft<Record<string, ClaimVerdict>>(draftKey, draftSchema, () => ({}));
  const answered = interaction.claims.filter((c) => verdicts[c.id] !== undefined).length;
  const ready = answered === interaction.claims.length;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        discard();
        const picked: Record<string, ClaimVerdict> = {};
        for (const c of interaction.claims) {
          const v = verdicts[c.id];
          if (v) picked[c.id] = v;
        }
        onSubmit({ kind: "claims", verdicts: picked });
      }}
    >
      <p className="font-medium text-[1.0625rem] leading-snug">{interaction.prompt}</p>
      <p className="text-sm text-ink-2 -mt-3">
        <strong className="font-medium text-ink">Depends</strong> means the statement is true under some conditions in
        the scenario and false under others. Use it when you can name the condition.
      </p>
      <ol className="divide-y divide-rule border-y border-rule">
        {interaction.claims.map((claim, i) => (
          <li key={claim.id} className="py-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6">
            <p className="flex-1 leading-relaxed">
              <span className="font-mono text-xs text-ink-3 mr-2">{String(i + 1).padStart(2, "0")}</span>
              <InlineText text={claim.statement} />
            </p>
            <Segmented
              name={`${draftKey}-${claim.id}`}
              legend={`Verdict for statement ${i + 1}`}
              hideLegend
              options={VERDICT_OPTIONS}
              value={verdicts[claim.id]}
              onChange={(v) => setVerdicts({ ...verdicts, [claim.id]: v })}
            />
          </li>
        ))}
      </ol>
      <SubmitRow
        ready={ready}
        label="Check verdicts"
        reason={`${answered} of ${interaction.claims.length} answered.`}
      />
    </form>
  );
}

export function ClaimsFeedback({
  interaction,
  response,
  slots,
}: {
  interaction: Claims;
  response: ResponseOf<"claims">;
  slots: InteractionSlots;
}) {
  const shown = interaction.claims.filter((c) => response.verdicts[c.id] !== undefined);
  return (
    <div>
      <p className="font-medium text-[1.0625rem] leading-snug mb-3">{interaction.prompt}</p>
      <ol className="divide-y divide-rule border-y border-rule">
        {shown.map((claim, i) => {
          const mine = response.verdicts[claim.id];
          const right = mine === claim.verdict;
          return (
            <li key={claim.id} className="py-4">
              <p className="leading-relaxed">
                <span className="font-mono text-xs text-ink-3 mr-2">{String(i + 1).padStart(2, "0")}</span>
                <InlineText text={claim.statement} />
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className={right ? "text-signal-strong" : "text-signal-gap"}>
                  {right ? "✓" : "✗"} You said <strong className="font-medium">{mine ? VERDICT_LABEL[mine] : "nothing"}</strong>
                </span>
                {!right && (
                  <span className="text-ink-2">
                    It <strong className="font-medium text-ink">{VERDICT_LABEL[claim.verdict].toLowerCase()}</strong>
                  </span>
                )}
              </p>
              <div className="mt-2 text-ink-2">{slots.claimExplanations[claim.id]}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
