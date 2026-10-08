/**
 * Back-of-envelope answers: reading what someone typed and deciding whether it
 * is in the right ballpark.
 */

const MAGNITUDES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  trillion: 1e12,
};

const NUMBER = /^\s*([-+]?(?:\d[\d,_ ]*)?\.?\d+(?:e[-+]?\d+)?)\s*([a-z]+)?/i;

/**
 * Parses "40", "20,000", "20k", "3.5 trillion", "3.5e12" or "38/s" into a
 * number. Text after the number that is not a magnitude (a unit, "per second")
 * is ignored. Returns null when there is no number to read.
 */
export function parseEstimate(input: string): number | null {
  const match = NUMBER.exec(input.trim());
  if (!match) return null;
  const digits = (match[1] ?? "").replace(/[,_ ]/g, "");
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  const word = match[2]?.toLowerCase();
  const scale = word ? (MAGNITUDES[word] ?? 1) : 1;
  return value * scale;
}

export type EstimateResult = { verdict: "close" | "high" | "low"; ratio: number };

/** Within `tolerance` relative error of the answer counts as close. */
export function judgeEstimate(value: number, answer: number, tolerance: number): EstimateResult {
  const ratio = answer === 0 ? (value === 0 ? 1 : Infinity) : value / answer;
  if (Math.abs(value - answer) <= Math.abs(answer) * tolerance) return { verdict: "close", ratio };
  return { verdict: value > answer ? "high" : "low", ratio };
}

/** "20,000", "3.5 trillion": numbers as a person would say them. */
export function formatEstimate(value: number): string {
  const abs = Math.abs(value);
  const short = (n: number, word: string) => `${Number(n.toPrecision(3)).toLocaleString("en-US")} ${word}`;
  if (abs >= 1e12) return short(value / 1e12, "trillion");
  if (abs >= 1e9) return short(value / 1e9, "billion");
  if (abs >= 1e6) return short(value / 1e6, "million");
  return Number(value.toPrecision(3)).toLocaleString("en-US");
}
