import type {
  ActivityLog,
  Category,
  CategoryBreakdown,
  DayStats,
  RealityScore,
} from "../types";

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 10) return `${hours.toFixed(1)}h`;
  return `${hours.toFixed(2)}h`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

export function formatClock(time: string): string {
  return time.slice(0, 5);
}

export function summarize(logs: ActivityLog[]): DayStats {
  if (logs.length === 0) {
    return {
      totalMinutes: 0,
      sessions: 0,
      firstLogTime: null,
      lastLogTime: null,
      uniqueActivities: 0,
    };
  }

  const totalMinutes = logs.reduce((sum, l) => sum + (l.duration || 15), 0);
  const times = logs.map((l) => l.time).sort();
  const unique = new Set(logs.map((l) => l.activity.trim().toLowerCase()));

  return {
    totalMinutes,
    sessions: logs.length,
    firstLogTime: times[0] ?? null,
    lastLogTime: times[times.length - 1] ?? null,
    uniqueActivities: unique.size,
  };
}

export function breakdown(logs: ActivityLog[]): CategoryBreakdown {
  const acc: CategoryBreakdown = {
    output: 0,
    input: 0,
    recovery: 0,
    leak: 0,
    unknown: 0,
    total: 0,
  };
  for (const log of logs) {
    const minutes = log.duration || 15;
    acc[log.category] += minutes;
    acc.total += minutes;
  }
  return acc;
}

const SCORE_WEIGHTS: Record<Category, number> = {
  output: 1.0,
  input: 0.5,
  recovery: 0.3,
  unknown: 0.4,
  leak: 0,
};

export function realityScore(b: CategoryBreakdown): RealityScore {
  if (b.total === 0) {
    return { score: 0, outputMinutes: 0, leakMinutes: 0, totalMinutes: 0 };
  }
  const weighted =
    b.output * SCORE_WEIGHTS.output +
    b.input * SCORE_WEIGHTS.input +
    b.recovery * SCORE_WEIGHTS.recovery +
    b.unknown * SCORE_WEIGHTS.unknown +
    b.leak * SCORE_WEIGHTS.leak;
  return {
    score: Math.round((weighted / b.total) * 100),
    outputMinutes: b.output,
    leakMinutes: b.leak,
    totalMinutes: b.total,
  };
}

export function formatPauseCountdown(isoUntil: string | null): string | null {
  if (!isoUntil) return null;
  const until = new Date(isoUntil);
  const now = new Date();
  const diff = until.getTime() - now.getTime();
  if (diff <= 0) return null;

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m remaining`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (remMin === 0) return `${hours}h remaining`;
  return `${hours}h ${remMin}m remaining`;
}

export function shortDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function dayOfMonth(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric" });
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function lastNDates(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(toIsoDate(d));
  }
  return out;
}
