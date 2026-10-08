"use client";

import { useId, useState, type MouseEvent } from "react";
import { LIMITERS, simulateLimiters, type Limiter } from "@/lib/domain/simulations";

const LIMIT = 5;
const WINDOW = 10;
const SPAN = 20;
const W = 400;
const H = 26;

const LABELS: Record<Limiter, { name: string; note: string }> = {
  "fixed-window": { name: "Fixed window", note: "Counts per calendar window; the count resets at 10 s." },
  "sliding-log": { name: "Sliding log", note: "Keeps every accepted timestamp from the last 10 s." },
  "sliding-counter": {
    name: "Sliding window counter",
    note: "Weights the previous window's count by how much of it still overlaps: an estimate, slightly off either way.",
  },
  "token-bucket": {
    name: "Token bucket",
    note: "Holds 5 tokens and refills one every 2 s, so a full bucket plus refills can admit a little over 5 in a 10 s span.",
  },
};

const round = (t: number) => Math.round(t * 10) / 10;
const range = (from: number, step: number, n: number) => Array.from({ length: n }, (_, i) => round(from + i * step));

const PRESETS: { label: string; times: number[] }[] = [
  { label: "Burst at the boundary", times: [...range(8, 0.4, 5), ...range(10.2, 0.4, 5)] },
  { label: "Honest burst, then quiet", times: [...range(2, 0.4, 7), 14, 18] },
  { label: "Retry loop that never stops", times: range(0.5, 0.75, 26) },
];

const x = (t: number) => (t / SPAN) * W;

/** Requests on a 30-second timeline, and what each of four limiters does with them. */
export function RateLimitWindows() {
  const [times, setTimes] = useState<number[]>(PRESETS[0]!.times);
  const [manual, setManual] = useState(15);
  const sliderId = useId();
  const sorted = [...times].sort((a, b) => a - b);
  const results = simulateLimiters(sorted, { limit: LIMIT, window: WINDOW });

  const add = (t: number) => {
    const clamped = round(Math.min(SPAN - 0.1, Math.max(0, t)));
    setTimes([...times, clamped]);
  };

  const onTimelineClick = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    add(((e.clientX - box.left) / box.width) * SPAN);
  };

  return (
    <figure className="sim not-prose">
      <figcaption className="sim-head">
        <span className="font-medium">Same requests, four limiters.</span>{" "}
        <span className="text-ink-2">
          The limit is {LIMIT} requests per {WINDOW} seconds. Pick a pattern or click the timeline to add requests.
        </span>
      </figcaption>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="btn btn-secondary"
            aria-pressed={p.times.length === times.length && p.times.every((t, i) => t === times[i])}
            onClick={() => setTimes(p.times)}
          >
            {p.label}
          </button>
        ))}
        <button type="button" className="btn btn-ghost" onClick={() => setTimes([])} disabled={times.length === 0}>
          Clear
        </button>
      </div>

      <div className="well mt-4 px-3 py-3 sm:px-4">
        <div className="sim-grid">
          <span className="sim-label">
            Requests <span className="text-ink-3">({times.length})</span>
          </span>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="sim-track cursor-crosshair"
            onClick={onTimelineClick}
            role="img"
            aria-label={`${times.length} requests at ${sorted.map((t) => `${t} s`).join(", ") || "no times"}`}
          >
            <Windows />
            {sorted.map((t, i) => (
              <circle key={i} cx={x(t)} cy={H / 2} r={3.5} className="fill-ink" />
            ))}
          </svg>

          {LIMITERS.map((limiter) => {
            const r = results[limiter];
            const passed = r.allowed.filter(Boolean).length;
            // A bucket or a counter can admit slightly more than the limit in a span (refills, estimates);
            // only flag the overshoot that defeats the limit.
            const over = r.peak >= LIMIT * 1.5;
            return (
              <div key={limiter} className="contents">
                <span className="sim-label">
                  {LABELS[limiter].name}
                  <span className={`block text-[0.6875rem] ${over ? "font-medium text-signal-gap" : "text-ink-3"}`}>
                    {passed} through · most in any 10 s: {r.peak}
                  </span>
                </span>
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="sim-track"
                  role="img"
                  aria-label={`${LABELS[limiter].name}: lets ${passed} of ${times.length} through; at most ${r.peak} in any ${WINDOW}-second span.`}
                >
                  <Windows />
                  {sorted.map((t, i) =>
                    r.allowed[i] ? (
                      <circle key={i} cx={x(t)} cy={H / 2} r={3.5} style={{ fill: "var(--mark-strong)" }} />
                    ) : (
                      <g key={i} style={{ stroke: "var(--mark-gap)" }} strokeWidth={1.8} strokeLinecap="round">
                        <path d={`M${x(t) - 3} ${H / 2 - 3}l6 6M${x(t) + 3} ${H / 2 - 3}l-6 6`} />
                      </g>
                    ),
                  )}
                </svg>
              </div>
            );
          })}

          <span />
          <svg viewBox={`0 0 ${W} 14`} className="sim-track" aria-hidden="true">
            {[0, 5, 10, 15, 20].map((t) => (
              <text key={t} x={Math.min(W - 8, Math.max(8, x(t)))} y={11} textAnchor="middle" className="fill-ink-3 text-[10px]">
                {t}s
              </text>
            ))}
          </svg>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.8125rem]">
        <label htmlFor={sliderId} className="text-ink-2">
          Add a request at
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={SPAN - 0.1}
          step={0.1}
          value={manual}
          onChange={(e) => setManual(Number(e.target.value))}
          className="w-40 accent-[var(--accent)]"
        />
        <span className="w-12 font-mono tabular-nums">{manual.toFixed(1)}s</span>
        <button type="button" className="btn btn-secondary" onClick={() => add(manual)}>
          Add
        </button>
        <span className="ml-auto inline-flex items-center gap-3 text-[0.75rem] text-ink-3" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <span className="led led-strong" /> let through
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono text-signal-gap">×</span> rejected (429)
          </span>
        </span>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-[0.75rem] sm:grid-cols-2">
        {LIMITERS.map((l) => (
          <div key={l}>
            <dt className="inline font-medium">{LABELS[l].name}: </dt>
            <dd className="inline text-ink-2">{LABELS[l].note}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

function Windows() {
  return (
    <g aria-hidden="true">
      {[1].map((w) => (
        <line
          key={w}
          x1={x(w * WINDOW)}
          x2={x(w * WINDOW)}
          y1={0}
          y2={H}
          strokeDasharray="3 3"
          className="stroke-rule-strong"
        />
      ))}
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-rule" />
    </g>
  );
}
