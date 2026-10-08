/**
 * The models behind the interactive simulations in lessons. Each one is a
 * small, deterministic function of the learner's inputs, so the widgets only
 * draw and the behaviour can be tested here.
 */

export const SIMULATIONS = ["rate-limit-windows", "lease-fencing", "cache-stampede", "consistent-hashing"] as const;
export type SimulationName = (typeof SIMULATIONS)[number];

// ---------------------------------------------------------------------------
// Rate limiting: four algorithms against the same requests
// ---------------------------------------------------------------------------

export const LIMITERS = ["fixed-window", "sliding-log", "sliding-counter", "token-bucket"] as const;
export type Limiter = (typeof LIMITERS)[number];

export type LimiterResult = {
  /** One entry per request, in time order. */
  allowed: boolean[];
  /** The most requests let through in any window-length span of time. */
  peak: number;
};

/**
 * Runs each limiter over the same request times (seconds). The limit is
 * `limit` requests per `window` seconds; the token bucket holds `limit`
 * tokens and refills at `limit / window` per second.
 */
export function simulateLimiters(
  times: readonly number[],
  { limit, window }: { limit: number; window: number },
): Record<Limiter, LimiterResult> {
  const sorted = [...times].sort((a, b) => a - b);

  const fixed = (() => {
    const counts = new Map<number, number>();
    return sorted.map((t) => {
      const w = Math.floor(t / window);
      const n = counts.get(w) ?? 0;
      if (n >= limit) return false;
      counts.set(w, n + 1);
      return true;
    });
  })();

  const log = (() => {
    const accepted: number[] = [];
    return sorted.map((t) => {
      const recent = accepted.filter((a) => a > t - window).length;
      if (recent >= limit) return false;
      accepted.push(t);
      return true;
    });
  })();

  const counter = (() => {
    const counts = new Map<number, number>();
    return sorted.map((t) => {
      const w = Math.floor(t / window);
      const elapsed = (t - w * window) / window;
      const estimate = (counts.get(w - 1) ?? 0) * (1 - elapsed) + (counts.get(w) ?? 0);
      if (estimate >= limit) return false;
      counts.set(w, (counts.get(w) ?? 0) + 1);
      return true;
    });
  })();

  const bucket = (() => {
    const rate = limit / window;
    let tokens = limit;
    let last = 0;
    return sorted.map((t) => {
      tokens = Math.min(limit, tokens + (t - last) * rate);
      last = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    });
  })();

  const peak = (allowed: boolean[]) => {
    const kept = sorted.filter((_, i) => allowed[i]);
    let best = 0;
    for (let i = 0; i < kept.length; i++) {
      let n = 0;
      for (let j = i; j < kept.length && (kept[j] as number) < (kept[i] as number) + window; j++) n++;
      best = Math.max(best, n);
    }
    return best;
  };

  return {
    "fixed-window": { allowed: fixed, peak: peak(fixed) },
    "sliding-log": { allowed: log, peak: peak(log) },
    "sliding-counter": { allowed: counter, peak: peak(counter) },
    "token-bucket": { allowed: bucket, peak: peak(bucket) },
  };
}

// ---------------------------------------------------------------------------
// Leases and fencing tokens
// ---------------------------------------------------------------------------

export type LeaseEvent = {
  t: number;
  actor: "A" | "B" | "lock" | "storage";
  text: string;
  tone: "neutral" | "good" | "bad";
  /** On storage events: what happened to the write. */
  write?: "accepted" | "stale" | "rejected";
};

export type LeaseOutcome = "clean" | "stale-write-accepted" | "stale-write-rejected";

/**
 * Worker A takes a lease (TTL `ttl` seconds, renewed every `renewEvery`) and
 * then stalls for `pause` seconds starting at `pauseAt`, as in a long GC pause
 * or a VM migration. If the lease expires meanwhile, worker B takes it and
 * writes. A resumes believing it still holds the lease and writes too.
 */
export function simulateLease({
  pause,
  fencing,
  ttl = 10,
  renewEvery = 3,
  pauseAt = 2,
}: {
  pause: number;
  fencing: boolean;
  ttl?: number;
  renewEvery?: number;
  pauseAt?: number;
}): { events: LeaseEvent[]; outcome: LeaseOutcome; expiresAt: number | null; resumesAt: number } {
  const events: LeaseEvent[] = [{ t: 0, actor: "A", text: "Takes the lease with fencing token 33", tone: "neutral" }];
  const resumesAt = pauseAt + pause;
  // The last renewal before the pause decides when the lease runs out.
  const lastRenewal = Math.floor(pauseAt / renewEvery) * renewEvery;
  const expiresAt = lastRenewal + ttl;
  if (pause > 0) events.push({ t: pauseAt, actor: "A", text: `Stalls (GC pause) for ${pause} s`, tone: "neutral" });

  if (resumesAt < expiresAt) {
    events.push({ t: resumesAt, actor: "A", text: "Resumes, renews the lease in time, and writes", tone: "good" });
    events.push({ t: resumesAt, actor: "storage", text: "Accepts A's write (token 33)", tone: "good", write: "accepted" });
    return { events, outcome: "clean", expiresAt: null, resumesAt };
  }

  events.push({ t: expiresAt, actor: "lock", text: "A's lease expires", tone: "neutral" });
  events.push({ t: expiresAt, actor: "B", text: "Takes the lease with fencing token 34", tone: "neutral" });
  const bWrites = expiresAt + 1;
  if (bWrites <= resumesAt) {
    events.push({ t: bWrites, actor: "B", text: "Writes the job's result", tone: "neutral" });
    events.push({ t: bWrites, actor: "storage", text: "Accepts B's write (token 34)", tone: "good", write: "accepted" });
  }
  events.push({ t: resumesAt, actor: "A", text: "Resumes, still believes it holds the lease, and writes", tone: "bad" });
  if (fencing) {
    events.push({ t: resumesAt, actor: "storage", text: "Rejects A's write: token 33 is older than 34", tone: "good", write: "rejected" });
  } else {
    events.push({
      t: resumesAt,
      actor: "storage",
      text: bWrites <= resumesAt ? "Accepts A's write and overwrites B's result" : "Accepts A's write while B holds the lease",
      tone: "bad",
      write: "stale",
    });
  }
  if (bWrites > resumesAt) {
    events.push({ t: bWrites, actor: "B", text: "Writes the job's result", tone: "neutral" });
    events.push({ t: bWrites, actor: "storage", text: "Accepts B's write (token 34)", tone: "good", write: "accepted" });
  }
  events.sort((a, b) => a.t - b.t);
  return { events, outcome: fencing ? "stale-write-rejected" : "stale-write-accepted", expiresAt, resumesAt };
}

// ---------------------------------------------------------------------------
// Cache stampede on a hot key
// ---------------------------------------------------------------------------

export const STAMPEDE_STRATEGIES = ["none", "coalesce-per-server", "coalesce-global", "stale-while-revalidate"] as const;
export type StampedeStrategy = (typeof STAMPEDE_STRATEGIES)[number];

export type StampedeResult = {
  /** Queries that reach the database while the value is being recomputed. */
  queries: number;
  /** Requests that wait for the recompute instead of being answered from cache. */
  waiting: number;
  overloaded: boolean;
};

/**
 * A hot key expires. For the `recomputeMs` it takes to rebuild it, every
 * request that misses goes to the database unless something stops it.
 */
export function simulateStampede({
  requestsPerSecond,
  recomputeMs,
  servers,
  dbCapacity,
}: {
  requestsPerSecond: number;
  recomputeMs: number;
  servers: number;
  /** Concurrent expensive queries the database can run before latency climbs. */
  dbCapacity: number;
}): Record<StampedeStrategy, StampedeResult> {
  const arriving = Math.round((requestsPerSecond * recomputeMs) / 1000);
  const result = (queries: number, waiting: number): StampedeResult => ({
    queries,
    waiting,
    overloaded: queries > dbCapacity,
  });
  return {
    none: result(Math.max(1, arriving), Math.max(1, arriving)),
    "coalesce-per-server": result(Math.min(servers, Math.max(1, arriving)), Math.max(1, arriving)),
    "coalesce-global": result(1, Math.max(1, arriving)),
    "stale-while-revalidate": result(1, 0),
  };
}

// ---------------------------------------------------------------------------
// Consistent hashing
// ---------------------------------------------------------------------------

/** FNV-1a, 32-bit: deterministic, fast, and well spread for short strings. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Final avalanche so nearby strings land far apart on the ring.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export type Placement = "modulo" | "ring";

export type RingPoint = { position: number; node: number };

export function ringPoints(nodes: number, virtualNodes: number): RingPoint[] {
  const points: RingPoint[] = [];
  for (let node = 0; node < nodes; node++) {
    for (let v = 0; v < virtualNodes; v++) points.push({ position: hash32(`node-${node}#${v}`), node });
  }
  return points.sort((a, b) => a.position - b.position);
}

/** Which node owns each key: `hash mod N`, or the first ring point clockwise from the key's hash. */
export function assignKeys(keys: readonly string[], nodes: number, placement: Placement, virtualNodes = 1): number[] {
  if (placement === "modulo") return keys.map((k) => hash32(k) % nodes);
  const points = ringPoints(nodes, virtualNodes);
  return keys.map((k) => {
    const h = hash32(k);
    // Binary search for the first point at or after h, wrapping to the start.
    let lo = 0;
    let hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((points[mid] as RingPoint).position < h) lo = mid + 1;
      else hi = mid;
    }
    return (points[lo % points.length] as RingPoint).node;
  });
}

export function rebalance(
  keys: readonly string[],
  { from, to, placement, virtualNodes = 1 }: { from: number; to: number; placement: Placement; virtualNodes?: number },
): { moved: number; load: number[] } {
  const before = assignKeys(keys, from, placement, virtualNodes);
  const after = assignKeys(keys, to, placement, virtualNodes);
  const moved = before.filter((node, i) => node !== after[i]).length;
  const load = Array.from({ length: to }, () => 0);
  for (const node of after) load[node] = (load[node] ?? 0) + 1;
  return { moved, load };
}

export function sampleKeys(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `user:${i}`);
}
