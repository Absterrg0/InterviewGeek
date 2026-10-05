import { InlineText } from "@/components/prose-core";
import type { StageEvent } from "@/lib/domain/content";

const EVENT_STYLE: Record<StageEvent["kind"], { label: string; led: string; text: string }> = {
  failure: { label: "Failure", led: "led-gap", text: "text-signal-gap" },
  "requirement-change": {
    label: "Requirement change",
    led: "led-accent",
    text: "text-accent",
  },
  scale: {
    label: "Scale change",
    led: "led-partial",
    text: "text-signal-partial",
  },
};

/** Something just happened to the system: an alarm plate with a lit indicator. */
export function EventBanner({ event }: { event: StageEvent }) {
  const style = EVENT_STYLE[event.kind];
  return (
    <aside aria-label={style.label} className="panel flex gap-3 p-4 sm:p-5">
      <span className={`led ${style.led} led-pulse mt-[0.45rem]`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-medium leading-snug">
          <span className={style.text}>{style.label}: </span>
          <InlineText text={event.title} />
        </p>
        <p className="mt-1.5 max-w-[66ch] text-[0.875rem] leading-relaxed text-ink-2">
          <InlineText text={event.detail} />
        </p>
      </div>
    </aside>
  );
}
