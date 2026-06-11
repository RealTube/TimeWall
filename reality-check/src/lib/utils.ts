import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conditional logic, de-duplicating conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Mirrors `db::MISSED_LABEL` — recorded when a prompt goes unanswered. */
export const MISSED_LABEL = "Missed check-in";

/** "14:32:07" → "14:32" */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** minutes → "3h 45m" | "45m" | "0m" */
export function formatDuration(min: number): string {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** minutes → decimal hours, e.g. 225 → "3.75" */
export function hoursDecimal(min: number): string {
  return (min / 60).toFixed(2);
}

/** Local date as YYYY-MM-DD (matches the backend's local `date` column). */
export function todayISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Shift an ISO date string by a number of days. */
export function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Monday of the week containing `iso`. */
export function startOfWeekISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return todayISO(d);
}

/** First day of the month containing `iso`. */
export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Last day of the month containing `iso`. */
export function endOfMonthISO(iso: string): string {
  const d = new Date(`${startOfMonthISO(iso)}T00:00:00`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return todayISO(d);
}

/** Shift `iso` by a whole number of months, clamped to the 1st. */
export function shiftMonthISO(iso: string, months: number): string {
  const d = new Date(`${startOfMonthISO(iso)}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return todayISO(d);
}

/** Signed duration for deltas: 90 → "+1h 30m", -45 → "−45m", 0 → "±0m". */
export function signedDuration(min: number): string {
  if (min === 0) return "±0m";
  const sign = min > 0 ? "+" : "−"; // typographic minus
  return sign + formatDuration(Math.abs(min));
}

/** The last `n` Monday-anchored weeks ending with the current one, oldest
 *  first. Each entry is an inclusive {start, end} ISO date range. */
export function lastNWeeks(n: number, today = todayISO()): { start: string; end: string }[] {
  const thisMonday = startOfWeekISO(today);
  return Array.from({ length: n }, (_, i) => {
    const start = shiftISO(thisMonday, -7 * (n - 1 - i));
    return { start, end: shiftISO(start, 6) };
  });
}

/** Minutes-from-midnight → "9:00 AM" style label in the user's locale. */
export function minutesToTimeLabel(min: number): string {
  const d = new Date();
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Step a minutes value for a stepper control: by 1 below 5 minutes, by 5
 *  (snapped to the nearest multiple) above — 240 should not take 240 clicks. */
export function stepValue(value: number, dir: 1 | -1): number {
  if (dir > 0) {
    return value >= 5 ? Math.ceil((value + 1) / 5) * 5 : value + 1;
  }
  return value > 5 ? Math.floor((value - 1) / 5) * 5 : value - 1;
}

/** Seconds until a unix timestamp, never negative. */
export function secondsUntil(ts: number, now = Date.now()): number {
  return Math.max(0, ts - Math.floor(now / 1000));
}

/** Compact countdown: 95s → "2 min", 45s → "<1 min". */
export function countdownLabel(secs: number): string {
  if (secs < 60) return "<1 min";
  return `${Math.ceil(secs / 60)} min`;
}
