import { describe, expect, it } from "vitest";
import {
  countdownLabel,
  endOfMonthISO,
  formatDuration,
  hhmm,
  hoursDecimal,
  secondsUntil,
  shiftISO,
  shiftMonthISO,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
} from "./utils";

describe("formatDuration", () => {
  it("formats minutes, hours, and mixes", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-5)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(225)).toBe("3h 45m");
  });
});

describe("hoursDecimal", () => {
  it("converts minutes to two-decimal hours", () => {
    expect(hoursDecimal(225)).toBe("3.75");
    expect(hoursDecimal(0)).toBe("0.00");
  });
});

describe("hhmm", () => {
  it("trims seconds from HH:MM:SS", () => {
    expect(hhmm("14:32:07")).toBe("14:32");
  });
});

describe("date math", () => {
  it("todayISO formats a known date", () => {
    expect(todayISO(new Date(2026, 5, 10))).toBe("2026-06-10");
  });

  it("shiftISO crosses month boundaries", () => {
    expect(shiftISO("2026-06-10", 1)).toBe("2026-06-11");
    expect(shiftISO("2026-06-30", 1)).toBe("2026-07-01");
    expect(shiftISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("startOfWeekISO anchors on Monday", () => {
    expect(startOfWeekISO("2026-06-10")).toBe("2026-06-08"); // Wed → Mon
    expect(startOfWeekISO("2026-06-08")).toBe("2026-06-08"); // Mon stays
    expect(startOfWeekISO("2026-06-14")).toBe("2026-06-08"); // Sun → prior Mon
  });

  it("month helpers clamp correctly, including leap February", () => {
    expect(startOfMonthISO("2026-06-10")).toBe("2026-06-01");
    expect(endOfMonthISO("2026-06-10")).toBe("2026-06-30");
    expect(endOfMonthISO("2028-02-11")).toBe("2028-02-29");
    expect(shiftMonthISO("2026-01-15", 1)).toBe("2026-02-01");
    expect(shiftMonthISO("2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("countdown", () => {
  it("secondsUntil never goes negative", () => {
    const now = 1_700_000_000_000; // ms
    expect(secondsUntil(1_700_000_060, now)).toBe(60);
    expect(secondsUntil(1_600_000_000, now)).toBe(0);
  });

  it("countdownLabel rounds up to whole minutes", () => {
    expect(countdownLabel(45)).toBe("<1 min");
    expect(countdownLabel(61)).toBe("2 min");
    expect(countdownLabel(900)).toBe("15 min");
  });
});
