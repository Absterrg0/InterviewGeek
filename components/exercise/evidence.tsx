import { BASIS_LABEL, SIGNAL_LABEL, SignalBadge } from "@/components/ui";
import type { Evidence } from "@/lib/domain/learner";

export function EvidenceSummary({ evidence }: { evidence: Evidence }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-2 rounded-md border border-rule bg-raised px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="eyebrow">Evidence</span>
        <SignalBadge signal={evidence.signal} />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        {evidence.parts.map((part) => (
          <li key={part.label}>
            {part.label}: <span className="text-ink">{SIGNAL_LABEL[part.signal].toLowerCase()}</span>{" "}
            <span className="text-ink-3">({BASIS_LABEL[part.basis]})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
