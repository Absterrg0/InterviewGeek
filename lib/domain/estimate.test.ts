import { describe, expect, it } from "vitest";
import { formatEstimate, judgeEstimate, parseEstimate } from "./estimate";

describe("parseEstimate", () => {
  it("reads plain, grouped and scientific numbers", () => {
    expect(parseEstimate("40")).toBe(40);
    expect(parseEstimate("20,000")).toBe(20_000);
    expect(parseEstimate("3.5e12")).toBe(3.5e12);
    expect(parseEstimate(".5")).toBe(0.5);
  });

  it("reads magnitude words and suffixes", () => {
    expect(parseEstimate("20k")).toBe(20_000);
    expect(parseEstimate("3.5 trillion")).toBe(3.5e12);
    expect(parseEstimate("1.2B")).toBe(1.2e9);
    expect(parseEstimate("600 million")).toBe(6e8);
  });

  it("ignores units after the number", () => {
    expect(parseEstimate("38/s")).toBe(38);
    expect(parseEstimate("600 GB")).toBe(600);
    expect(parseEstimate("200 ms")).toBe(200);
  });

  it("returns null without a number", () => {
    expect(parseEstimate("")).toBeNull();
    expect(parseEstimate("lots")).toBeNull();
  });
});

describe("judgeEstimate", () => {
  it("accepts answers within tolerance", () => {
    expect(judgeEstimate(40, 38, 0.3).verdict).toBe("close");
    expect(judgeEstimate(30, 38, 0.3).verdict).toBe("close");
  });

  it("says which way a miss went", () => {
    expect(judgeEstimate(400, 38, 0.3).verdict).toBe("high");
    expect(judgeEstimate(4, 38, 0.3).verdict).toBe("low");
  });
});

describe("formatEstimate", () => {
  it("names large magnitudes", () => {
    expect(formatEstimate(3.52e12)).toBe("3.52 trillion");
    expect(formatEstimate(19_230)).toBe("19,200");
  });
});
