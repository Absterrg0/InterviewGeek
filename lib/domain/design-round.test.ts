import { describe, expect, it } from "vitest";
import { DESIGN_ROUND_MINUTES, formatClock, roundCoverage, type ReferenceIds } from "./design-round";

const reference: ReferenceIds = {
  requirements: ["fr-0", "fr-1", "nfr-0"],
  estimates: ["e1"],
  design: ["c1", "c2"],
  "deep-dives": ["s1", "s2"],
  failures: [],
};

describe("roundCoverage", () => {
  it("counts ticked items per section and overall", () => {
    const { sections, overall } = roundCoverage(
      { covered: { requirements: ["fr-0", "nfr-0"], design: ["c2"], "deep-dives": ["s1", "s2"] } },
      reference,
    );
    expect(sections.requirements).toEqual({ covered: 2, total: 3 });
    expect(sections.estimates).toEqual({ covered: 0, total: 1 });
    expect(sections.failures).toEqual({ covered: 0, total: 0 });
    expect(overall).toEqual({ covered: 5, total: 8 });
  });

  it("ignores ticks on items the reference no longer has, and duplicates", () => {
    const { sections } = roundCoverage({ covered: { design: ["c1", "c1", "gone"] } }, reference);
    expect(sections.design).toEqual({ covered: 1, total: 2 });
  });
});

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(725)).toBe("12:05");
    expect(formatClock(3725)).toBe("62:05");
    expect(formatClock(-4)).toBe("0:00");
  });
});

describe("the round", () => {
  it("fits a typical interview slot", () => {
    expect(DESIGN_ROUND_MINUTES).toBe(45);
  });
});
