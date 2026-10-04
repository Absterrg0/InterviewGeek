"use client";

import { InlineText } from "@/components/prose-core";
import { z } from "zod";
import type { InteractionOf } from "@/lib/domain/content";
import { shuffled } from "@/lib/domain/evaluate";
import type { ResponseOf } from "@/lib/domain/learner";
import { SubmitRow } from "../fields";
import type { InputProps, InteractionSlots } from "../types";
import { useDraft } from "../use-draft";

type Ordering = InteractionOf<"ordering">;

const draftSchema = z.array(z.string());

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function OrderingInput({ interaction, draftKey, seed, onSubmit }: InputProps<Ordering, ResponseOf<"ordering">>) {
  const ids = interaction.items.map((i) => i.id);
  const [stored, setOrder, discard] = useDraft(draftKey, draftSchema, () => shuffled(ids, seed));
  // A draft from an older version of the content is ignored rather than trusted.
  const valid = stored.length === ids.length && ids.every((id) => stored.includes(id));
  const order = valid ? stored : shuffled(ids, seed);
  const byId = new Map(interaction.items.map((i) => [i.id, i]));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        discard();
        onSubmit({ kind: "ordering", order });
      }}
    >
      <div>
        <p className="font-medium text-[1.0625rem] leading-snug">{interaction.prompt}</p>
        <p className="mt-1 text-sm text-ink-2">Move each step up or down until the sequence is right.</p>
      </div>
      <ol className="space-y-1.5" aria-label="Sequence">
        {order.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <li
              key={id}
              className="flex items-center gap-3 rounded-md border border-rule bg-raised/60 py-2 pl-3 pr-1.5"
            >
              <span className="font-mono text-xs text-ink-3 w-5 text-right shrink-0">{index + 1}</span>
              <span className="flex-1 min-w-0 leading-snug text-[0.9375rem]">
                <InlineText text={item.label} />
                {item.detail && <span className="block text-sm text-ink-2"><InlineText text={item.detail} /></span>}
              </span>
              <span className="flex shrink-0">
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1.5"
                  aria-label={`Move "${item.label}" earlier`}
                  disabled={index === 0}
                  onClick={() => setOrder(move(order, index, index - 1))}
                >
                  <Chevron up />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1.5"
                  aria-label={`Move "${item.label}" later`}
                  disabled={index === order.length - 1}
                  onClick={() => setOrder(move(order, index, index + 1))}
                >
                  <Chevron />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <SubmitRow ready label="Lock in sequence" />
    </form>
  );
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={up ? "rotate-180" : ""}>
      <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OrderingFeedback({
  interaction,
  response,
  slots,
}: {
  interaction: Ordering;
  response: ResponseOf<"ordering">;
  slots: InteractionSlots;
}) {
  const position = new Map(response.order.map((id, i) => [id, i]));
  return (
    <div className="space-y-5">
      <p className="font-medium text-[1.0625rem] leading-snug">{interaction.prompt}</p>
      <ol className="space-y-1.5" aria-label="Correct sequence">
        {interaction.items.map((item, index) => {
          const mine = position.get(item.id);
          const right = mine === index;
          return (
            <li
              key={item.id}
              className={`flex items-start gap-3 rounded-md border px-3 py-2 ${right ? "border-rule" : "border-signal-partial/50 bg-signal-partial-soft/40"}`}
            >
              <span className="font-mono text-xs text-ink-3 w-5 text-right shrink-0 pt-0.5">{index + 1}</span>
              <span className="flex-1 min-w-0 leading-snug text-[0.9375rem]"><InlineText text={item.label} /></span>
              <span className={`shrink-0 text-xs pt-0.5 ${right ? "text-signal-strong" : "text-signal-partial"}`}>
                {right ? "✓" : mine === undefined ? "missing" : `you put this ${ordinal(mine + 1)}`}
              </span>
            </li>
          );
        })}
      </ol>
      <div>{slots.explanation}</div>
    </div>
  );
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}
