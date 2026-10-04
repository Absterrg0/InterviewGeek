import type { ReactNode } from "react";
import type { Assessment, ClaimVerdict, Dimension } from "@/lib/domain/content";
import { DIMENSION_LABELS } from "@/lib/domain/content";
import type { Basis, Signal } from "@/lib/domain/learner";
import type { Standing } from "@/lib/domain/understanding";

export const SIGNAL_LABEL: Record<Signal, string> = {
  strong: "Strong",
  partial: "Partial",
  gap: "Gap",
};

export const SIGNAL_FILL: Record<Signal, string> = {
  strong: "bg-mark-strong",
  partial: "bg-mark-partial",
  gap: "bg-mark-gap",
};

export const SIGNAL_LED: Record<Signal, string> = {
  strong: "led led-strong",
  partial: "led led-partial",
  gap: "led led-gap",
};

const SIGNAL_TEXT: Record<Signal, string> = {
  strong: "text-signal-strong",
  partial: "text-signal-partial",
  gap: "text-signal-gap",
};

/** A tag with a coloured dot: the signal is carried by the word, the dot repeats it. */
export function SignalBadge({ signal, children }: { signal: Signal; children?: ReactNode }) {
  return (
    <span className={`chip-flat ${SIGNAL_TEXT[signal]}`}>
      <span className={`${SIGNAL_LED[signal]} size-1.5`} aria-hidden="true" />
      {children ?? SIGNAL_LABEL[signal]}
    </span>
  );
}

export function SignalDot({ signal, label }: { signal: Signal | null; label: string }) {
  return <span className={signal ? SIGNAL_LED[signal] : "led led-off"} role="img" aria-label={label} />;
}

export const BASIS_LABEL: Record<Basis, string> = {
  checked: "checked against the key",
  "self-assessed": "self-assessed",
  mixed: "checked and self-assessed",
};

export const STANDING_LABEL: Record<Standing, string> = {
  unexplored: "Not yet exercised",
  weak: "Weak",
  developing: "Developing",
  strong: "Strong",
};

export const STANDING_SIGNAL: Record<Standing, Signal | null> = {
  unexplored: null,
  weak: "gap",
  developing: "partial",
  strong: "strong",
};

const ASSESSMENT: Record<Assessment, { label: string; signal: Signal; description: string }> = {
  sound: {
    label: "Sound",
    signal: "strong",
    description: "Preferable under the stated constraints.",
  },
  defensible: {
    label: "Defensible",
    signal: "partial",
    description: "Workable, and the better call under different constraints.",
  },
  flawed: {
    label: "Flawed",
    signal: "gap",
    description: "Violates a stated requirement or a correctness property.",
  },
};

export function AssessmentBadge({ assessment }: { assessment: Assessment }) {
  const a = ASSESSMENT[assessment];
  return (
    <span title={a.description}>
      <SignalBadge signal={a.signal}>{a.label}</SignalBadge>
    </span>
  );
}

export const VERDICT_LABEL: Record<ClaimVerdict, string> = {
  holds: "Holds",
  fails: "Fails",
  depends: "Depends",
};

export function DimensionTags({ dimensions }: { dimensions: readonly Dimension[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Dimensions exercised">
      {dimensions.map((d) => (
        <li key={d} title={DIMENSION_LABELS[d].description} className="chip-flat">
          {DIMENSION_LABELS[d].label}
        </li>
      ))}
    </ul>
  );
}

/** A row of radio buttons styled as a segmented control. Native inputs keep keyboard behaviour. */
export function Segmented<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled,
  hideLegend,
}: {
  name: string;
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
  hideLegend?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={hideLegend ? "sr-only" : "eyebrow mb-2"}>{legend}</legend>
      <div className="inline-flex gap-0.5 rounded-[10px] bg-sunken p-[3px] shadow-[inset_0_0_0_1px_var(--rule-soft)]">
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={`relative cursor-pointer rounded-[7px] px-2.5 py-1 text-[0.75rem] font-medium transition-[box-shadow,color,background-color] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-solid ${
                checked ? "bg-raised text-ink shadow-[var(--shadow-btn)]" : "text-ink-3 hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SectionHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-display text-[1.0625rem] leading-tight mb-3 scroll-mt-14">
      {children}
    </h2>
  );
}

/**
 * A proportion meter for evidence counts. Always paired with written counts so
 * the signal never depends on colour alone; segments keep a fixed order
 * (strong, partial, gap) and are separated by a surface gap.
 */
export function SignalMeter({ counts, label }: { counts: Record<Signal, number>; label: string }) {
  const total = counts.strong + counts.partial + counts.gap;
  const order: Signal[] = ["strong", "partial", "gap"];
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div
        className="flex h-1.5 flex-1 min-w-16 gap-[2px] overflow-hidden rounded-full bg-sunken"
        role="img"
        aria-label={`${label}: ${counts.strong} strong, ${counts.partial} partial, ${counts.gap} gap`}
      >
        {total > 0 &&
          order.map((s) =>
            counts[s] > 0 ? (
              <span
                key={s}
                title={`${counts[s]} ${SIGNAL_LABEL[s].toLowerCase()}`}
                className={`h-full first:rounded-l-full last:rounded-r-full ${SIGNAL_FILL[s]}`}
                style={{ width: `${(counts[s] / total) * 100}%` }}
              />
            ) : null,
          )}
      </div>
      <span
        className="shrink-0 inline-flex items-center gap-2 font-mono text-[0.6875rem] text-ink-2 tabular-nums"
        aria-hidden="true"
      >
        {total === 0
          ? "no evidence"
          : order.map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className={`${SIGNAL_LED[s]} size-1`} />
                {counts[s]}
              </span>
            ))}
      </span>
    </div>
  );
}
