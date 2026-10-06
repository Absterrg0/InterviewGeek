import { InlineText } from "@/components/prose-core";
import type { StageEvent } from "@/lib/domain/content";

const EVENT_STYLE: Record<StageEvent["kind"], { label: string; rule: string; text: string }> = {
  failure: { label: "Failure", rule: "border-signal-gap", text: "text-signal-gap" },
  "requirement-change": {
    label: "Requirement change",
    rule: "border-accent-solid",
    text: "text-accent",
  },
  scale: {
    label: "Scale change",
    rule: "border-mark-partial",
    text: "text-signal-partial",
  },
};

/** Something just happened to the system: a note pinned to the design, ruled in the colour of what happened. */
export function EventBanner({ event }: { event: StageEvent }) {
  const style = EVENT_STYLE[event.kind];
  return (
    <aside aria-label={style.label} className={`border-l-2 py-1 pl-5 ${style.rule}`}>
      <p className={`text-[0.8125rem] font-medium ${style.text}`}>{style.label}</p>
      <p className="mt-1 font-display text-[1.25rem] leading-snug">
        <InlineText text={event.title} />
      </p>
      <p className="mt-2 max-w-[66ch] text-[0.9375rem] leading-relaxed text-ink-2">
        <InlineText text={event.detail} />
      </p>
    </aside>
  );
}
