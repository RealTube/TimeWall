// Findings (FR-20): the audit, said out loud. Every rule is deterministic
// arithmetic over the period's own aggregates, fires only above a confidence
// floor, and names a pattern without issuing advice, guilt, or alarm (§2.4).

import type { AnswerStats, DayTotal, FocusStats, HeatCell } from "./types";
import { formatDuration } from "./utils";

export type Period = "week" | "month" | "year";

export interface Finding {
  kind: "answer-low" | "focus" | "rhythm" | "peak" | "answer-high";
  text: string;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "9 AM", "12 PM", "12 AM" — locale-free so findings are reproducible. */
export function hourLabel(h: number): string {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${h < 12 ? "AM" : "PM"}`;
}

const MIN_HEAT_MINUTES = 300; // ≥ 5h of data before naming a rhythm
const MIN_ASKS = 20; // ≥ 20 prompts before judging the answer rate
const MIN_FOCUS_SHIFT = 0.2; // ≥ 20% change before calling a focus shift
const MIN_PEAK_PRODUCTIVE = 60; // ≥ 1h productive before naming a peak day

export interface FindingsInput {
  period: Period;
  heat: HeatCell[];
  focus: FocusStats | null;
  prevFocus: FocusStats | null;
  answer: AnswerStats | null;
  days: DayTotal[];
}

/** Up to three findings, most decision-relevant first: a data-quality caveat
 *  leads (it qualifies everything else), praise comes last. */
export function buildFindings(input: FindingsInput): Finding[] {
  const out: Finding[] = [];
  const lastLabel =
    input.period === "week" ? "last week" : input.period === "month" ? "last month" : "last year";

  // Answer rate — low first: it qualifies every other number on screen.
  const asks = input.answer ? input.answer.answered + input.answer.missed : 0;
  if (input.answer && asks >= MIN_ASKS) {
    const missedShare = input.answer.missed / asks;
    if (missedShare > 0.2) {
      out.push({
        kind: "answer-low",
        text: `${Math.round(missedShare * 100)}% of prompts went unanswered, so these totals likely undercount your time.`,
      });
    }
  }

  // Focus shift vs the previous period.
  const { focus, prevFocus } = input;
  if (
    focus &&
    prevFocus &&
    focus.days_counted > 0 &&
    prevFocus.days_counted > 0 &&
    prevFocus.avg_block_min > 0
  ) {
    const change = (focus.avg_block_min - prevFocus.avg_block_min) / prevFocus.avg_block_min;
    if (Math.abs(change) >= MIN_FOCUS_SHIFT) {
      out.push({
        kind: "focus",
        text: `Focus blocks average ${formatDuration(Math.round(focus.avg_block_min))} — ${
          change > 0 ? "up" : "down"
        } from ${formatDuration(Math.round(prevFocus.avg_block_min))} ${lastLabel}.`,
      });
    }
  }

  // Rhythm: heaviest hour of day + fullest weekday.
  const heatTotal = input.heat.reduce((a, c) => a + c.minutes, 0);
  if (heatTotal >= MIN_HEAT_MINUTES) {
    const byHour = new Map<number, number>();
    const byDay = new Map<number, number>();
    input.heat.forEach((c) => {
      byHour.set(c.hour, (byHour.get(c.hour) ?? 0) + c.minutes);
      byDay.set(c.weekday, (byDay.get(c.weekday) ?? 0) + c.minutes);
    });
    const topHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const topDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      kind: "rhythm",
      text: `Your heaviest hour is ${hourLabel(topHour)}–${hourLabel(topHour + 1)}, and ${
        WEEKDAYS[topDay]
      }s carry the most time.`,
    });
  }

  // Productive peak: the weekday with the most productive time (week/month).
  if (input.period !== "year") {
    const prodByDay = new Map<number, number>();
    input.days.forEach((d) => {
      const wd = (new Date(`${d.date}T00:00:00`).getDay() + 6) % 7;
      prodByDay.set(wd, (prodByDay.get(wd) ?? 0) + (d.productive_minutes ?? 0));
    });
    const ranked = [...prodByDay.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length > 0 && ranked[0][1] >= MIN_PEAK_PRODUCTIVE) {
      const [wd, min] = ranked[0];
      out.push({
        kind: "peak",
        text:
          input.period === "week"
            ? `${WEEKDAYS[wd]} was your most productive day (${formatDuration(min)} productive).`
            : `${WEEKDAYS[wd]}s were your most productive days (${formatDuration(min)} productive).`,
      });
    }
  }

  // Answer rate — high: the record itself deserves credit.
  if (input.answer && asks >= MIN_ASKS) {
    const rate = input.answer.answered / asks;
    if (rate >= 0.95) {
      out.push({
        kind: "answer-high",
        text: `You answered ${Math.round(rate * 100)}% of prompts — this record is solid.`,
      });
    }
  }

  return out.slice(0, 3);
}
