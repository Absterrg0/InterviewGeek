import { describe, expect, it } from "vitest";
import type { Attempt, Signal } from "./learner";
import { daysAgo, daysUntil, dueReview, intervalDays, reviewQueue, reviewSchedule } from "./review";

let n = 0;
function attempt(stageId: string, signal: Signal | null, at: string): Attempt {
  n++;
  return {
    id: `a${n}`,
    exercise: { kind: "stage", investigationId: "inv", stageId },
    context: "investigation",
    response: { kind: "open", text: "x" },
    submittedAt: at,
    selfAssessment: null,
    evidence: signal
      ? {
          signal,
          basis: "checked",
          parts: [{ label: "x", signal, basis: "checked" }],
          dimensions: ["defend"],
          conceptIds: [],
          competencyIds: [],
        }
      : null,
  };
}

const day = (d: number) => new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString();
const at = (d: number) => Date.parse(day(d));
const ref = (stageId: string) => ({ kind: "stage" as const, investigationId: "inv", stageId });

describe("intervalDays", () => {
  it("brings gaps back sooner than partial answers, and strong answers at growing intervals", () => {
    expect(intervalDays("gap", 0)).toBe(1);
    expect(intervalDays("partial", 0)).toBe(3);
    expect(intervalDays("strong", 1)).toBe(7);
    expect(intervalDays("strong", 2)).toBe(21);
    expect(intervalDays("strong", 3)).toBe(60);
    expect(intervalDays("strong", 9)).toBe(180);
  });
});

describe("reviewSchedule", () => {
  it("schedules from the latest assessed answer and counts the strong streak", () => {
    const schedule = reviewSchedule([
      attempt("s1", "gap", day(0)),
      attempt("s1", "strong", day(2)),
      attempt("s1", "strong", day(10)),
      attempt("s2", "partial", day(0)),
    ]);
    const s1 = schedule.get("stage:inv/s1");
    expect(s1?.streak).toBe(2);
    expect(s1?.dueAt).toBe(day(31));
    expect(schedule.get("stage:inv/s2")?.dueAt).toBe(day(3));
  });

  it("ignores answers that have not been assessed", () => {
    const schedule = reviewSchedule([attempt("s1", null, day(0))]);
    expect(schedule.size).toBe(0);
  });

  it("resets the streak after a weaker answer", () => {
    const schedule = reviewSchedule([
      attempt("s1", "strong", day(0)),
      attempt("s1", "partial", day(7)),
      attempt("s1", "strong", day(10)),
    ]);
    expect(schedule.get("stage:inv/s1")?.streak).toBe(1);
    expect(schedule.get("stage:inv/s1")?.dueAt).toBe(day(17));
  });
});

describe("reviewQueue", () => {
  it("splits due from upcoming and puts the weakest due items first", () => {
    const { due, upcoming } = reviewQueue(
      [attempt("strong", "strong", day(0)), attempt("partial", "partial", day(0)), attempt("gap", "gap", day(4)), attempt("fresh", "strong", day(5))],
      at(8),
    );
    expect(due.map((d) => d.exercise.kind === "stage" && d.exercise.stageId)).toEqual(["gap", "partial", "strong"]);
    expect(upcoming.map((d) => d.exercise.kind === "stage" && d.exercise.stageId)).toEqual(["fresh"]);
  });
});

describe("dueReview", () => {
  it("is due only once the interval has passed", () => {
    const attempts = [attempt("s1", "partial", day(0))];
    expect(dueReview(attempts, ref("s1"), at(2))).toBeNull();
    expect(dueReview(attempts, ref("s1"), at(3))?.signal).toBe("partial");
    expect(dueReview(attempts, ref("other"), at(30))).toBeNull();
  });

  it("is not due while a newer answer is waiting for its assessment", () => {
    const attempts = [attempt("s1", "gap", day(0)), attempt("s1", null, day(5))];
    expect(dueReview(attempts, ref("s1"), at(6))).toBeNull();
  });
});

describe("relative days", () => {
  it("reads naturally", () => {
    expect(daysAgo(day(0), at(0))).toBe("today");
    expect(daysAgo(day(0), at(1))).toBe("yesterday");
    expect(daysAgo(day(0), at(5))).toBe("5 days ago");
    expect(daysAgo(day(0), at(21))).toBe("3 weeks ago");
    expect(daysUntil(day(1), at(0))).toBe("tomorrow");
    expect(daysUntil(day(7), at(0))).toBe("in 7 days");
    expect(daysUntil(day(0), at(3))).toBe("today");
  });
});
