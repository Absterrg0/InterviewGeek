import { InlineText } from "@/components/prose-core";
import type { Interaction } from "@/lib/domain/content";
import { shuffled } from "@/lib/domain/evaluate";

const LETTERS = "ABCDEFGHIJ";

/**
 * The question as static HTML, shown until the learner's browser state loads.
 * The answer form itself needs browser storage, so without this the server
 * would send only a skeleton and crawlers would never see what a stage asks.
 * Presentation order matches the form's (same seed); no answers are included.
 */
export function QuestionPreview({ interaction, seed }: { interaction: Interaction; seed: string }) {
  return (
    <div className="space-y-4">
      <p className="font-display text-[1.125rem] leading-snug">{interaction.prompt}</p>
      {interaction.kind === "decision" && (
        <ol className="space-y-2">
          {shuffled(interaction.options, seed).map((option, i) => (
            <li key={option.id} className="choice cursor-default">
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-md bg-raised font-mono text-[0.6875rem] text-ink-3 shadow-[var(--shadow-btn)]"
              >
                {LETTERS[i]}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-medium leading-snug">
                  <InlineText text={option.label} />
                </span>
                {option.detail && (
                  <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-ink-2">
                    <InlineText text={option.detail} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {interaction.kind === "claims" && (
        <ol className="list-decimal space-y-2 pl-5 text-[0.9375rem] leading-relaxed">
          {interaction.claims.map((claim) => (
            <li key={claim.id}>
              <InlineText text={claim.statement} />
            </li>
          ))}
        </ol>
      )}
      {interaction.kind === "ordering" && (
        <ul className="space-y-2 text-[0.9375rem] leading-relaxed">
          {shuffled(interaction.items, seed).map((item) => (
            <li key={item.id}>
              <InlineText text={item.label} />
              {item.detail && (
                <span className="text-ink-2">
                  {" "}
                  · <InlineText text={item.detail} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {interaction.kind === "diagnosis" && (
        <figure className="panel overflow-x-auto px-4 py-3">
          {interaction.artifact.caption && (
            <figcaption className="mb-2 text-xs text-ink-3">{interaction.artifact.caption}</figcaption>
          )}
          <pre className="font-mono text-[0.8125rem] leading-relaxed">
            {interaction.artifact.lines.map((line) => line.text).join("\n")}
          </pre>
        </figure>
      )}
      {interaction.kind === "implementation" && interaction.starter && (
        <pre className="panel overflow-x-auto px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
          {interaction.starter}
        </pre>
      )}
    </div>
  );
}
