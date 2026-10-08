import { describe, expect, it } from "vitest";
import { rebalance, sampleKeys, simulateLease, simulateLimiters, simulateStampede } from "./simulations";

describe("simulateLimiters", () => {
  const limit = { limit: 5, window: 10 };

  it("lets a fixed window pass twice the limit across a boundary", () => {
    const burst = [9.0, 9.2, 9.4, 9.6, 9.8, 10.0, 10.2, 10.4, 10.6, 10.8];
    const result = simulateLimiters(burst, limit);
    expect(result["fixed-window"].allowed.every(Boolean)).toBe(true);
    expect(result["fixed-window"].peak).toBe(10);
    expect(result["sliding-log"].peak).toBe(5);
    expect(result["sliding-counter"].peak).toBeLessThanOrEqual(6);
    expect(result["token-bucket"].peak).toBeLessThanOrEqual(6);
  });

  it("lets everything through when traffic is under the limit", () => {
    const steady = [0, 3, 6, 9, 12, 15, 18];
    const result = simulateLimiters(steady, limit);
    for (const r of Object.values(result)) expect(r.allowed.every(Boolean)).toBe(true);
  });

  it("caps a sustained flood near the rate for every algorithm", () => {
    const flood = Array.from({ length: 120 }, (_, i) => i * 0.25);
    const result = simulateLimiters(flood, limit);
    for (const r of Object.values(result)) {
      const allowed = r.allowed.filter(Boolean).length;
      expect(allowed).toBeLessThanOrEqual(5 * 4 + 5);
      expect(allowed).toBeGreaterThanOrEqual(5 * 3);
    }
  });
});

describe("simulateLease", () => {
  it("is clean when the pause ends before the lease expires", () => {
    expect(simulateLease({ pause: 3, fencing: false }).outcome).toBe("clean");
  });

  it("accepts the stale write without fencing and rejects it with fencing", () => {
    expect(simulateLease({ pause: 12, fencing: false }).outcome).toBe("stale-write-accepted");
    const fenced = simulateLease({ pause: 12, fencing: true });
    expect(fenced.outcome).toBe("stale-write-rejected");
    expect(fenced.expiresAt).toBe(10);
    expect(fenced.events.map((e) => e.t)).toEqual([...fenced.events.map((e) => e.t)].sort((a, b) => a - b));
  });
});

describe("simulateStampede", () => {
  it("sends every request that misses to the database without protection", () => {
    const r = simulateStampede({ requestsPerSecond: 5000, recomputeMs: 400, servers: 20, dbCapacity: 200 });
    expect(r.none.queries).toBe(2000);
    expect(r.none.overloaded).toBe(true);
    expect(r["coalesce-per-server"].queries).toBe(20);
    expect(r["coalesce-global"].queries).toBe(1);
    expect(r["stale-while-revalidate"].waiting).toBe(0);
  });
});

describe("rebalance", () => {
  const keys = sampleKeys(2000);

  it("moves most keys under modulo placement and few on a ring", () => {
    const modulo = rebalance(keys, { from: 4, to: 5, placement: "modulo" });
    const ring = rebalance(keys, { from: 4, to: 5, placement: "ring", virtualNodes: 100 });
    expect(modulo.moved / keys.length).toBeGreaterThan(0.7);
    expect(ring.moved / keys.length).toBeLessThan(0.3);
  });

  it("spreads load more evenly with virtual nodes", () => {
    const spread = (load: number[]) => Math.max(...load) / (keys.length / load.length);
    const one = rebalance(keys, { from: 5, to: 5, placement: "ring", virtualNodes: 1 });
    const many = rebalance(keys, { from: 5, to: 5, placement: "ring", virtualNodes: 100 });
    expect(one.moved).toBe(0);
    expect(spread(many.load)).toBeLessThan(spread(one.load));
    expect(spread(many.load)).toBeLessThan(1.3);
  });
});
