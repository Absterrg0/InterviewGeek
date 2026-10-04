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
      return {
        ...EMPTY_SLOTS,
        explanation: <Prose text={interaction.explanation} className="prose-sm" />,
      };
    case "open":
      return {
        ...EMPTY_SLOTS,
        reference: <Prose text={interaction.reference} />,
      };
    case "implementation":
      return {
        ...EMPTY_SLOTS,
        reference: <Prose text={interaction.reference.notes} className="prose-sm" />,
      };
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
          <h3 className="eyebrow mb-3">Tradeoffs</h3>
          <div className="panel overflow-x-auto px-5 py-1">
            <table className="data-table min-w-[520px]">
              <thead>
                <tr>
                  <th scope="col" className="w-[34%]">
                    Choice
                  </th>
                  <th scope="col">Gains</th>
                  <th scope="col">Costs</th>
                </tr>
              </thead>
              <tbody>
                {reveal.tradeoffs.map((t) => (
                  <tr key={t.choice}>
                    <th scope="row">{t.choice}</th>
                    <td>{t.gains}</td>
                    <td>{t.costs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {reveal.otherwise && (
        <div className="tint flex gap-3 p-4">
          <span className="led led-accent mt-1.5" aria-hidden="true" />
          <div>
            <h3 className="text-[0.875rem] font-medium mb-1">Where another engineer could land differently</h3>
            <p className="text-[0.8125rem] leading-relaxed text-ink-2">{reveal.otherwise}</p>
          </div>
        </div>
      )}
    </div>
  );
}
