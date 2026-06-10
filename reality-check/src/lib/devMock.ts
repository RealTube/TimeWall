// DEV-only fixture data so the UI can be developed/previewed in a plain browser
// (no Tauri host). Tree-shaken out of production builds via `import.meta.env.DEV`.

import type { ActivityLog, AppSettings, Category, CategorySlice, DayTotal } from "./types";

const categories: Category[] = [
  { id: 1, name: "Deep Work", color: "#5B8DEF", is_productive: true, sort_order: 0 },
  { id: 2, name: "Meetings", color: "#A78BFA", is_productive: true, sort_order: 1 },
  { id: 3, name: "Sales", color: "#34D399", is_productive: true, sort_order: 2 },
  { id: 4, name: "Admin", color: "#FBBF24", is_productive: true, sort_order: 3 },
  { id: 5, name: "Break", color: "#9CA3AF", is_productive: false, sort_order: 4 },
];

const logs: ActivityLog[] = [
  { id: 9, time: "14:30:00", activity: "Outreach emails", category_id: 3, was_idle: false },
  { id: 8, time: "14:15:00", activity: "Outreach emails", category_id: 3, was_idle: false },
  { id: 7, time: "14:00:00", activity: "Reviewed Q3 numbers", category_id: 4, was_idle: false },
  { id: 6, time: "13:45:00", activity: "Away from desk", category_id: null, was_idle: true },
  { id: 5, time: "13:30:00", activity: "Spec for v2 dashboard", category_id: 1, was_idle: false },
  { id: 4, time: "13:15:00", activity: "Spec for v2 dashboard", category_id: 1, was_idle: false },
  { id: 3, time: "13:00:00", activity: "Team standup", category_id: 2, was_idle: false },
  { id: 2, time: "12:45:00", activity: "Code review", category_id: 1, was_idle: false },
  { id: 1, time: "12:30:00", activity: "Inbox zero", category_id: 4, was_idle: false },
];

const settings: AppSettings = {
  interval_minutes: 15,
  paused: false,
  idle_threshold_min: 5,
  align_to_clock: true,
  theme: "dark",
  notifications: true,
  sound: true,
  onboarded: true,
};

const breakdown: CategorySlice[] = [
  { category_id: 1, name: "Deep Work", color: "#5B8DEF", is_productive: true, minutes: 480 },
  { category_id: 3, name: "Sales", color: "#34D399", is_productive: true, minutes: 360 },
  { category_id: 2, name: "Meetings", color: "#A78BFA", is_productive: true, minutes: 240 },
  { category_id: 4, name: "Admin", color: "#FBBF24", is_productive: true, minutes: 150 },
  { category_id: 5, name: "Break", color: "#9CA3AF", is_productive: false, minutes: 120 },
];

function weekTotals(start?: string): DayTotal[] {
  const base = start ? new Date(`${start}T00:00:00`) : new Date();
  const worked = [330, 300, 360, 270, 240, 60, 0];
  const idle = [30, 45, 15, 60, 30, 0, 0];
  const p = (n: number) => String(n).padStart(2, "0");
  return worked.map((w, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return {
      date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      worked_minutes: w,
      idle_minutes: idle[i],
    };
  });
}

export function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const value: Record<string, unknown> = {
    get_settings: settings,
    get_todays_logs: logs,
    get_logs_for_date: logs,
    list_categories: categories,
    get_recent_activities: ["Outreach emails", "Spec for v2 dashboard", "Code review", "Team standup"],
    get_interval: 15,
    get_autostart: false,
    get_day_totals: weekTotals(args?.start as string | undefined),
    get_category_breakdown: breakdown,
  };
  return Promise.resolve((value[cmd] ?? null) as T);
}
