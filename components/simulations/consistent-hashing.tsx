"use client";

import { useId, useMemo, useState } from "react";
import { Segmented } from "@/components/ui";
import { assignKeys, hash32, rebalance, ringPoints, sampleKeys, type Placement } from "@/lib/domain/simulations";

const KEYS = sampleKeys(2000);
/** Keys drawn on the ring; all of them are counted. */
const DRAWN = KEYS.slice(0, 240);
/** Distinct mid-tones that read on both the light and the dark paper. */
const NODE_COLORS = ["#2f7ed8", "#e08a1e", "#22a55a", "#c94f9b", "#8e6bd6", "#d64545", "#1aa3a3", "#8a8f2a", "#b07a4a"];
const TWO_PI = Math.PI * 2;
const MAX32 = 2 ** 32;

const PLACEMENTS = [
  { value: "modulo", label: "hash mod N" },
  { value: "ring", label: "Hash ring" },
] as const;
const VNODES = [
  { value: "1", label: "1 point per node" },
  { value: "10", label: "10" },
  { value: "100", label: "100" },
] as const;

/** Trigonometry can differ in the last digit between the server and the browser; rounding keeps hydration stable. */
const round2 = (n: number) => Math.round(n * 100) / 100;

function polar(position: number, radius: number, c: number) {
  const angle = (position / MAX32) * TWO_PI - Math.PI / 2;
  return { x: round2(c + radius * Math.cos(angle)), y: round2(c + radius * Math.sin(angle)) };
}

/** Add a node and see how many keys have to move, and how evenly they spread. */
export function ConsistentHashing() {
  const [placement, setPlacement] = useState<Placement>("modulo");
  const [vnodes, setVnodes] = useState<"1" | "10" | "100">("1");
  const [nodes, setNodes] = useState(4);
  const [added, setAdded] = useState(false);
  const name = useId();
  const virtual = placement === "ring" ? Number(vnodes) : 1;
  const after = added ? nodes + 1 : nodes;

  const { moved, load } = useMemo(
    () => rebalance(KEYS, { from: nodes, to: after, placement, virtualNodes: virtual }),
    [nodes, after, placement, virtual],
  );
  const owners = useMemo(() => assignKeys(DRAWN, after, placement, virtual), [after, placement, virtual]);
  const points = useMemo(() => (placement === "ring" ? ringPoints(after, virtual) : []), [placement, after, virtual]);
  const average = KEYS.length / after;
  const busiest = Math.max(...load);
  const movedShare = Math.round((moved / KEYS.length) * 100);
  const ideal = Math.round((1 / after) * 100);

  return (
    <figure className="sim not-prose">
      <figcaption className="sim-head">
        <span className="font-medium">{KEYS.length.toLocaleString("en-US")} keys spread over cache nodes.</span>{" "}
        <span className="text-ink-2">
          Add a node and count the keys that now belong somewhere else: each one is a cache miss, or data to copy.
        </span>
      </figcaption>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Segmented
          name={`${name}-placement`}
          legend="Placement"
          options={PLACEMENTS}
          value={placement}
          onChange={(v) => setPlacement(v)}
        />
        {placement === "ring" && (
          <Segmented name={`${name}-vnodes`} legend="Points per node" options={VNODES} value={vnodes} onChange={(v) => setVnodes(v)} />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={added || nodes <= 2}
            onClick={() => setNodes(nodes - 1)}
            aria-label="One node fewer"
          >
            −
          </button>
          <span className="w-16 text-center text-[0.8125rem] tabular-nums">{nodes} nodes</span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={added || nodes >= 8}
            onClick={() => setNodes(nodes + 1)}
            aria-label="One node more"
          >
            +
          </button>
          <button type="button" className="btn btn-primary ml-2" onClick={() => setAdded(!added)}>
            {added ? "Undo" : `Add node ${nodes + 1}`}
          </button>
        </div>
      </div>

      <div className="well mt-4 grid gap-6 px-4 py-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center">
        <svg viewBox="0 0 200 200" className="mx-auto w-52" role="img" aria-label={`${after} nodes; ${DRAWN.length} sample keys coloured by the node that owns them.`}>
          <circle cx={100} cy={100} r={80} fill="none" className="stroke-rule-strong" />
          {DRAWN.map((key, i) => {
            const p = placement === "ring" ? polar(hash32(key), 80, 100) : polar((i / DRAWN.length) * MAX32, 80, 100);
            return <circle key={key} cx={p.x} cy={p.y} r={2.1} fill={NODE_COLORS[(owners[i] ?? 0) % NODE_COLORS.length]} />;
          })}
          {points.map((pt, i) => {
            const p = polar(pt.position, 92, 100);
            return (
              <rect
                key={i}
                x={p.x - 2.5}
                y={p.y - 2.5}
                width={5}
                height={5}
                fill={NODE_COLORS[pt.node % NODE_COLORS.length]}
                className="stroke-paper"
                strokeWidth={0.8}
              />
            );
          })}
          <text x={100} y={97} textAnchor="middle" className="fill-ink text-[13px] font-medium">
            {added ? `${movedShare}% moved` : `${after} nodes`}
          </text>
          <text x={100} y={113} textAnchor="middle" className="fill-ink-3 text-[9px]">
            {added ? `ideal: ${ideal}%` : placement === "modulo" ? "keys by hash mod N" : "squares: node points"}
          </text>
        </svg>

        <div>
          <p className="mb-2 text-[0.75rem] text-ink-3">Keys per node{added ? " after adding one" : ""}. The line is a perfectly even share.</p>
          <ul className="space-y-1.5">
            {load.map((n, i) => (
              <li key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-[0.75rem]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: NODE_COLORS[i % NODE_COLORS.length] }} />
                  Node {i + 1}
                </span>
                <span className="relative block h-3 rounded-[3px] bg-rule-soft">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[3px]"
                    style={{ width: `${(n / (average * 2)) * 100}%`, maxWidth: "100%", background: NODE_COLORS[i % NODE_COLORS.length] }}
                  />
                  <span className="absolute inset-y-[-3px] left-1/2 border-l border-dashed border-ink-2" aria-hidden="true" />
                </span>
                <span className="text-right font-mono tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.8125rem] leading-relaxed" aria-live="polite">
            {added ? (
              <>
                Adding one node moved <strong className="font-medium">{moved.toLocaleString("en-US")} keys ({movedShare}%)</strong>. The
                minimum possible is the new node&apos;s share, about {ideal}%.{" "}
              </>
            ) : null}
            <span className="text-ink-2">
              The busiest node holds {(busiest / average).toFixed(1)}× an even share.
            </span>
          </p>
        </div>
      </div>
    </figure>
  );
}
