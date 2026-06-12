import { describe, expect, it } from "vitest";
import { buildFindings, hourLabel, type FindingsInput } from "./findings";
import type { AnswerStats, DayTotal, FocusStats, HeatCell } from "./types";

const focus = (avg: number, days = 5): FocusStats => ({
  avg_block_min: avg,
  longest_block_min: avg * 2,
  switches_per_day: 8,
  days_counted: days,
});

const answer = (answered: number, missed: number): AnswerStats => ({
  answered,
  missed,
  away: 0,
});

const day = (date: string, productive: number): DayTotal => ({
  date,
  worked_minutes: productive + 60,
  idle_minutes: 0,
  productive_minutes: productive,
});

/** 6h on Tuesday 9–11 AM — enough heat to clear the 5h rhythm floor. */
const heavyTuesdayMornings: HeatCell[] = [
  { weekday: 1, hour: 9, minutes: 200 },
  { weekday: 1, hour: 10, minutes: 120 },
  { weekday: 3, hour: 14, minutes: 40 },
];

const base: FindingsInput = {
  period: "week",
  heat: [],
  focus: null,
  prevFocus: null,
  answer: null,
  days: [],
};

describe("hourLabel", () => {
  it("renders 12-hour labels deterministically", () => {
    expect(hourLabel(0)).toBe("12 AM");
    expect(hourLabel(9)).toBe("9 AM");
    expect(hourLabel(12)).toBe("12 PM");
    expect(hourLabel(15)).toBe("3 PM");
  });
});

describe("buildFindings", () => {
  it("stays silent on an empty period", () => {
    expect(buildFindings(base)).toEqual([]);
  });

  it("names the heaviest hour and fullest weekday once there is 5h of heat", () => {
    const found = buildFindings({ ...base, heat: heavyTuesdayMornings });
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("rhythm");
    expect(found[0].text).toContain("9 AM–10 AM");
    expect(found[0].text).toContain("Tuesdays");
  });

  it("keeps quiet about rhythm below the confidence floor", () => {
    const found = buildFindings({
      ...base,
      heat: [{ weekday: 1, hour: 9, minutes: 299 }],
    });
    expect(found).toEqual([]);
  });

  it("calls a focus shift only at ±20%", () => {
    const shifted = buildFindings({ ...base, focus: focus(36), prevFocus: focus(30) });
    expect(shifted).toHaveLength(1);
    expect(shifted[0].kind).toBe("focus");
    expect(shifted[0].text).toContain("36m");
    expect(shifted[0].text).toContain("up");
    expect(shifted[0].text).toContain("last week");

    const steady = buildFindings({ ...base, focus: focus(33), prevFocus: focus(30) });
    expect(steady).toEqual([]);
  });

  it("flags a low answer rate as an undercount, ahead of everything else", () => {
    const found = buildFindings({
      ...base,
      heat: heavyTuesdayMornings,
      answer: answer(14, 6), // 30% missed
    });
    expect(found[0].kind).toBe("answer-low");
    expect(found[0].text).toContain("30%");
  });

  it("credits a ≥95% answer rate, but only with enough asks", () => {
    const found = buildFindings({ ...base, answer: answer(19, 1) });
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("answer-high");
    expect(found[0].text).toContain("95%");
    expect(buildFindings({ ...base, answer: answer(10, 0) })).toEqual([]);
  });

  it("names the most productive weekday for a week, plural for a month", () => {
    // 2026-06-10 is a Wednesday.
    const days = [day("2026-06-08", 30), day("2026-06-10", 90)];
    const week = buildFindings({ ...base, days });
    expect(week).toHaveLength(1);
    expect(week[0].text).toContain("Wednesday was");
    const month = buildFindings({ ...base, period: "month", days });
    expect(month[0].text).toContain("Wednesdays were");
  });

  it("skips the peak-day rule for the year period and caps at three findings", () => {
    const everything: FindingsInput = {
      period: "year",
      heat: heavyTuesdayMornings,
      focus: focus(36),
      prevFocus: focus(30),
      answer: answer(40, 15), // low rate fires
      days: [day("2026-06-10", 600)],
    };
    const found = buildFindings(everything);
    expect(found).toHaveLength(3);
    expect(found.map((f) => f.kind)).toEqual(["answer-low", "focus", "rhythm"]);
    expect(found[1].text).toContain("last year");
  });
});
