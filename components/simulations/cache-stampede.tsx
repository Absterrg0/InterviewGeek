"use client";

import { useId, useState } from "react";
import { STAMPEDE_STRATEGIES, simulateStampede, type StampedeStrategy } from "@/lib/domain/simulations";

const SERVERS = 20;
const DB_CAPACITY = 200;
/** Request rates on the slider, roughly logarithmic. */
const RATES = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000];

const LABELS: Record<StampedeStrategy, { name: string; note: string }> = {
  none: { name: "No protection", note: "Every request that misses queries the database." },
  "coalesce-per-server": {
    name: "Coalesce per server",
    note: `Each of ${SERVERS} servers lets one request rebuild; the rest on that server wait for it.`,
  },
  "coalesce-global": {
    name: "One rebuild, fleet-wide",
    note: "A short lock in the cache lets one request in the whole fleet rebuild.",
  },
  "stale-while-revalidate": {
    name: "Serve stale, refresh behind",
    note: "Keep serving the old value while one background request rebuilds it.",
  },
};

/** Bars on a log scale: one query and forty thousand both need to be visible. */
function width(queries: number, max: number): number {
  return Math.max(2, (Math.log10(queries + 1) / Math.log10(max + 1)) * 100);
}

/** A hot cache key expires; how many queries reach the database before it is rebuilt. */
export function CacheStampede() {
  const [rateIndex, setRateIndex] = useState(5);
  const [recomputeMs, setRecomputeMs] = useState(400);
  const rateId = useId();
  const recomputeId = useId();
  const rate = RATES[rateIndex] as number;
  const results = simulateStampede({ requestsPerSecond: rate, recomputeMs, servers: SERVERS, dbCapacity: DB_CAPACITY });
  const max = Math.max(results.none.queries, DB_CAPACITY * 2);
  const capacityAt = width(DB_CAPACITY, max);

  return (
    <figure className="sim not-prose">
      <figcaption className="sim-head">
        <span className="font-medium">A hot key expires.</span>{" "}
        <span className="text-ink-2">
          Rebuilding it takes one expensive query. Until that query finishes, every request for the key misses. The
          database can run about {DB_CAPACITY} of these queries at once before it slows down.
        </span>
      </figcaption>

      <div className="grid max-w-md gap-3 text-[0.8125rem]">
        <span className="flex items-center gap-3">
          <label htmlFor={rateId} className="w-32 shrink-0 text-ink-2">
            Requests for the key
          </label>
          <input
            id={rateId}
            type="range"
            min={0}
            max={RATES.length - 1}
            step={1}
            value={rateIndex}
            onChange={(e) => setRateIndex(Number(e.target.value))}
            className="min-w-0 flex-1 accent-[var(--accent)]"
            aria-valuetext={`${rate.toLocaleString("en-US")} per second`}
          />
          <span className="w-20 text-right font-mono tabular-nums">{rate.toLocaleString("en-US")}/s</span>
        </span>
        <span className="flex items-center gap-3">
          <label htmlFor={recomputeId} className="w-32 shrink-0 text-ink-2">
            Time to rebuild
          </label>
          <input
            id={recomputeId}
            type="range"
            min={50}
            max={2000}
            step={50}
            value={recomputeMs}
            onChange={(e) => setRecomputeMs(Number(e.target.value))}
            className="min-w-0 flex-1 accent-[var(--accent)]"
          />
          <span className="w-20 text-right font-mono tabular-nums">{recomputeMs} ms</span>
        </span>
      </div>

      <div className="well mt-4 px-3 py-4 sm:px-4">
        <p className="mb-3 text-[0.75rem] text-ink-3">
          Queries reaching the database while the key is rebuilt (log scale). The dashed line is what it can run at once.
        </p>
        <ul className="space-y-3">
          {STAMPEDE_STRATEGIES.map((s) => {
            const r = results[s];
            return (
              <li key={s} className="sim-grid">
                <span className="sim-label">{LABELS[s].name}</span>
                <span className="relative block h-5">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[3px]"
                    style={{ width: `${width(r.queries, max)}%`, background: r.overloaded ? "var(--mark-gap)" : "var(--mark-strong)" }}
                  />
                  <span
                    className="absolute inset-y-[-4px] border-l border-dashed border-ink-2"
                    style={{ left: `${capacityAt}%` }}
                    aria-hidden="true"
                  />
                  <span
                    className="absolute top-0 pl-2 font-mono text-[0.75rem] leading-5 tabular-nums"
                    style={{ left: `${Math.min(width(r.queries, max), 80)}%` }}
                  >
                    {r.queries.toLocaleString("en-US")}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <dl className="mt-4 space-y-1.5 text-[0.8125rem]">
        {STAMPEDE_STRATEGIES.map((s) => {
          const r = results[s];
          return (
            <div key={s}>
              <dt className="inline font-medium">{LABELS[s].name}: </dt>
              <dd className="inline text-ink-2">
                {LABELS[s].note}{" "}
                {r.waiting === 0
                  ? "Nobody waits; a few requests see a value that is a moment old."
                  : `${r.waiting.toLocaleString("en-US")} requests wait about ${recomputeMs} ms${r.overloaded ? ", longer, because the database is past capacity and every query slows down" : ""}.`}
              </dd>
            </div>
          );
        })}
      </dl>
    </figure>
  );
}
