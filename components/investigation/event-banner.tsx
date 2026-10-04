import { InlineText } from "@/components/prose-core";
import type { StageEvent } from "@/lib/domain/content";

const EVENT_STYLE: Record<StageEvent["kind"], { label: string; className: string }> = {
  failure: { label: "Failure", className: "border-signal-gap bg-signal-gap-soft/60" },
  "requirement-change": { label: "Requirement change", className: "border-accent bg-accent-soft/60" },
  scale: { label: "Scale change", className: "border-signal-partial bg-signal-partial-soft/60" },
};

export function EventBanner({ event }: { event: StageEvent }) {
  const style = EVENT_STYLE[event.kind];
  return (
    <aside aria-label={style.label} className={`border-l-2 rounded-r-md px-4 py-3 ${style.className}`}>
      <p className="eyebrow text-ink-2">{style.label}</p>
      <p className="mt-1 font-medium leading-snug"><InlineText text={event.title} /></p>
      <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2"><InlineText text={event.detail} /></p>
    </aside>
  );
}
