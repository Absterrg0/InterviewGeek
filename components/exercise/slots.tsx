import type { ReactNode } from "react";
import { Prose } from "@/components/prose";
import type { Interaction, Stage } from "@/lib/domain/content";
import { EMPTY_SLOTS, type InteractionSlots } from "./types";

export function buildSlots(interaction: Interaction): InteractionSlots {
  switch (interaction.kind) {
    case "decision":
      return {
        ...EMPTY_SLOTS,
        optionFeedback: Object.fromEntries(
          interaction.options.map((o) => [o.id, <Prose key={o.id} text={o.feedback} className="prose-sm" />]),
        ),
      };
    case "claims":
      return {
        ...EMPTY_SLOTS,
        claimExplanations: Object.fromEntries(
          interaction.claims.map((c) => [c.id, <Prose key={c.id} text={c.explanation} className="prose-sm" />]),
        ),
      };
    case "ordering":
      return { ...EMPTY_SLOTS, explanation: <Prose text={interaction.explanation} className="prose-sm" /> };
    case "open":
      return { ...EMPTY_SLOTS, reference: <Prose text={interaction.reference} /> };
    case "implementation":
      return { ...EMPTY_SLOTS, reference: <Prose text={interaction.reference.notes} className="prose-sm" /> };
    case "diagnosis":
      return EMPTY_SLOTS;
  }
}

/** The engineering reasoning shown once a stage has been answered. */
export function Reveal({ reveal }: { reveal: Stage["reveal"] }): ReactNode {
  return (
    <div className="space-y-6">
      <Prose text={reveal.reasoning} />
      {reveal.tradeoffs && reveal.tradeoffs.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Tradeoffs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[520px]">
              <thead>
                <tr className="text-left text-ink-3">
                  <th scope="col" className="font-normal py-2 pr-4 border-b border-rule w-[34%]">Choice</th>
                  <th scope="col" className="font-normal py-2 pr-4 border-b border-rule">Gains</th>
                  <th scope="col" className="font-normal py-2 border-b border-rule">Costs</th>
                </tr>
              </thead>
              <tbody>
                {reveal.tradeoffs.map((t) => (
                  <tr key={t.choice} className="align-top">
                    <th scope="row" className="text-left font-medium py-2.5 pr-4 border-b border-rule">{t.choice}</th>
                    <td className="py-2.5 pr-4 border-b border-rule text-ink-2">{t.gains}</td>
                    <td className="py-2.5 border-b border-rule text-ink-2">{t.costs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {reveal.otherwise && (
        <div className="border-l-2 border-accent pl-4">
          <h3 className="eyebrow mb-1">Where another engineer could land differently</h3>
          <p className="text-[0.9375rem] leading-relaxed text-ink-2">{reveal.otherwise}</p>
        </div>
      )}
    </div>
  );
}
