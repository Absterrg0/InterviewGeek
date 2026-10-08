"use client";

import { useId, useState } from "react";
import { simulateLease, type LeaseEvent } from "@/lib/domain/simulations";

const SPAN = 26;
const W = 400;
const LANE = 26;
const PAUSE_AT = 2;
const TTL = 10;

const x = (t: number) => (Math.min(t, SPAN) / SPAN) * W;

const TONE: Record<LeaseEvent["tone"], string> = {
  neutral: "text-ink-2",
  good: "text-signal-strong",
  bad: "text-signal-gap",
};

const WRITE_STYLE = {
  accepted: { fill: "var(--mark-strong)", stroke: "none" },
  stale: { fill: "var(--mark-gap)", stroke: "none" },
  rejected: { fill: "var(--paper)", stroke: "var(--mark-gap)" },
} as const;

const OUTCOME = {
  clean: "No conflict: A was back before its lease ran out, so it renewed and nobody else took over.",
  "stale-write-accepted":
    "Two workers acted as the owner. A's lease expired during the pause, B took over, and storage accepted A's late write anyway. The job's result is now whatever A wrote last.",
  "stale-write-rejected":
    "Storage remembered the highest token it had seen (34) and refused A's write with 33. The lease still expired, but the stale owner could not do any damage.",
} as const;

/** Worker A stalls while holding a lease; what happens to its write when it wakes up. */
export function LeaseFencing() {
  const [pause, setPause] = useState(12);
  const [fencing, setFencing] = useState(false);
  const pauseId = useId();
  const fencingId = useId();
  const sim = simulateLease({ pause, fencing, ttl: TTL, pauseAt: PAUSE_AT });
  const expired = sim.expiresAt !== null;
  const writes = sim.events.filter((e) => e.write !== undefined);

  return (
    <figure className="sim not-prose">
      <figcaption className="sim-head">
        <span className="font-medium">A lease that runs out while its holder is asleep.</span>{" "}
        <span className="text-ink-2">
          The lease lasts {TTL} s and A renews it every 3 s, but A freezes at {PAUSE_AT} s (a GC pause, a VM migration, a
          slow disk). Change how long A is frozen, and whether storage checks fencing tokens.
        </span>
      </figcaption>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.8125rem]">
        <span className="inline-flex items-center gap-3">
          <label htmlFor={pauseId} className="text-ink-2">
            A is frozen for
          </label>
          <input
            id={pauseId}
            type="range"
            min={0}
            max={20}
            step={1}
            value={pause}
            onChange={(e) => setPause(Number(e.target.value))}
            className="w-40 accent-[var(--accent)]"
          />
          <span className="w-10 font-mono tabular-nums">{pause} s</span>
        </span>
        <label htmlFor={fencingId} className="inline-flex cursor-pointer items-center gap-2">
          <input
            id={fencingId}
            type="checkbox"
            checked={fencing}
            onChange={(e) => setFencing(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Storage rejects writes with an older fencing token
        </label>
      </div>

      <div className="well mt-4 px-3 py-3 sm:px-4">
        <div className="sim-grid">
          <span className="sim-label">Worker A</span>
          <svg viewBox={`0 0 ${W} ${LANE}`} className="sim-track" aria-hidden="true">
            <rect x={0} y={7} width={x(expired ? (sim.expiresAt as number) : SPAN)} height={12} rx={3} style={{ fill: "var(--accent-soft)", stroke: "var(--accent)" }} strokeWidth={1} />
            {pause > 0 && (
              <rect x={x(PAUSE_AT)} y={7} width={x(sim.resumesAt) - x(PAUSE_AT)} height={12} rx={3} style={{ fill: "var(--signal-partial-soft)", stroke: "var(--mark-partial)" }} strokeDasharray="3 2" strokeWidth={1} />
            )}
            <text x={x(PAUSE_AT) + 4} y={16.5} className="fill-ink-2 text-[9px]">
              {pause > 1 ? "frozen" : ""}
            </text>
          </svg>
          <span className="sim-label">Worker B</span>
          <svg viewBox={`0 0 ${W} ${LANE}`} className="sim-track" aria-hidden="true">
            {expired && (
              <rect x={x(sim.expiresAt as number)} y={7} width={W - x(sim.expiresAt as number)} height={12} rx={3} style={{ fill: "var(--accent-soft)", stroke: "var(--accent)" }} strokeWidth={1} />
            )}
          </svg>
          <span className="sim-label">Storage</span>
          <svg viewBox={`0 0 ${W} ${LANE}`} className="sim-track" aria-hidden="true">
            <line x1={0} x2={W} y1={LANE / 2} y2={LANE / 2} className="stroke-rule" />
            {writes.map((e, i) => (
              <circle
                key={i}
                cx={x(e.t)}
                cy={LANE / 2}
                r={5}
                style={WRITE_STYLE[e.write ?? "accepted"]}
                strokeWidth={1.8}
              />
            ))}
          </svg>
          <span />
          <svg viewBox={`0 0 ${W} 14`} className="sim-track" aria-hidden="true">
            {[0, 5, 10, 15, 20, 25].map((t) => (
              <text key={t} x={Math.max(8, x(t))} y={11} textAnchor="middle" className="fill-ink-3 text-[10px]">
                {t}s
              </text>
            ))}
          </svg>
        </div>
      </div>

      <ol className="mt-4 space-y-1 text-[0.8125rem]" aria-label="What happens, in order">
        {sim.events.map((e, i) => (
          <li key={i} className="grid grid-cols-[3rem_4.5rem_minmax(0,1fr)] gap-2">
            <span className="font-mono tabular-nums text-ink-3">{e.t} s</span>
            <span className="font-medium">{e.actor === "lock" ? "Lock" : e.actor === "storage" ? "Storage" : `Worker ${e.actor}`}</span>
            <span className={TONE[e.tone]}>{e.text}</span>
          </li>
        ))}
      </ol>

      <p
        className={`mt-4 rounded-lg px-4 py-3 text-[0.875rem] leading-relaxed ${
          sim.outcome === "stale-write-accepted" ? "bg-signal-gap-soft" : "bg-signal-strong-soft"
        }`}
        aria-live="polite"
      >
        {OUTCOME[sim.outcome]}
      </p>
    </figure>
  );
}
