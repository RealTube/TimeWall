// DEV-only fixture data so the UI can be developed/previewed in a plain browser
// (no Tauri host). Tree-shaken out of production builds via `import.meta.env.DEV`.

import type {
  ActivityLog,
  AppSettings,
  Category,
  CategorySlice,
  DayTotal,
  FocusStats,
  HeatCell,
  SearchHit,
  Streaks,
  TopActivity,
} from "./types";

const categories: Category[] = [
  { id: 1, name: "Deep Work", color: "#5B8DEF", is_productive: true, sort_order: 0, weekly_target_min: 720 },
  { id: 2, name: "Meetings", color: "#A78BFA", is_productive: true, sort_order: 1, weekly_target_min: 0 },
  { id: 3, name: "Sales", color: "#34D399", is_productive: true, sort_order: 2, weekly_target_min: 300 },
  { id: 4, name: "Admin", color: "#FBBF24", is_productive: true, sort_order: 3, weekly_target_min: 0 },
  { id: 5, name: "Break", color: "#9CA3AF", is_productive: false, sort_order: 4, weekly_target_min: 0 },
];

const logs: ActivityLog[] = [
  { id: 9, time: "14:30:00", activity: "Outreach emails", category_id: 3, was_idle: false, interval_min: 15 },
  { id: 8, time: "14:15:00", activity: "Outreach emails", category_id: 3, was_idle: false, interval_min: 15 },
  { id: 7, time: "14:00:00", activity: "Reviewed Q3 numbers", category_id: 4, was_idle: false, interval_min: 15 },
  { id: 6, time: "13:45:00", activity: "Away from desk", category_id: null, was_idle: true, interval_min: 15 },
  { id: 5, time: "13:30:00", activity: "Spec for v2 dashboard", category_id: 1, was_idle: false, interval_min: 15 },
  { id: 4, time: "13:15:00", activity: "Spec for v2 dashboard", category_id: 1, was_idle: false, interval_min: 15 },
  { id: 3, time: "13:00:00", activity: "Team standup", category_id: 2, was_idle: false, interval_min: 15 },
  { id: 2, time: "12:45:00", activity: "Code review", category_id: 1, was_idle: false, interval_min: 15 },
  { id: 1, time: "12:30:00", activity: "Inbox zero", category_id: 4, was_idle: false, interval_min: 15 },
];

const settings: AppSettings = {
  interval_minutes: 15,
  paused: false,
  paused_until: 0,
  idle_threshold_min: 5,
  align_to_clock: true,
  theme: "dark",
  notifications: true,
  sound: true,
  onboarded: true,
  schedule_enabled: true,
  schedule_start_min: 540,
  schedule_end_min: 1080,
  schedule_days: "1,2,3,4,5",
};

const breakdown: CategorySlice[] = [
  { category_id: 1, name: "Deep Work", color: "#5B8DEF", is_productive: true, minutes: 480 },
  { category_id: 3, name: "Sales", color: "#34D399", is_productive: true, minutes: 360 },
  { category_id: 2, name: "Meetings", color: "#A78BFA", is_productive: true, minutes: 240 },
  { category_id: 4, name: "Admin", color: "#FBBF24", is_productive: true, minutes: 150 },
  { category_id: 5, name: "Break", color: "#9CA3AF", is_productive: false, minutes: 120 },
];

const topActivities: TopActivity[] = [
  { activity: "Spec for v2 dashboard", minutes: 330, count: 22 },
  { activity: "Outreach emails", minutes: 240, count: 16 },
  { activity: "Code review", minutes: 180, count: 12 },
  { activity: "Team standup", minutes: 120, count: 8 },
  { activity: "Inbox zero", minutes: 90, count: 6 },
  { activity: "Reviewed Q3 numbers", minutes: 60, count: 4 },
];

const focus: FocusStats = {
  avg_block_min: 38,
  longest_block_min: 105,
  switches_per_day: 9.4,
  days_counted: 5,
};

const streaks: Streaks = { current: 12, best: 15, days_logged: 38 };

function heatmap(): HeatCell[] {
  // A believable shape: deep mornings, meeting-heavy early afternoons.
  const cells: HeatCell[] = [];
  for (let d = 0; d < 5; d++) {
    for (let h = 8; h <= 18; h++) {
      const morning = h >= 9 && h <= 11 ? 45 : 0;
      const afternoon = h >= 13 && h <= 16 ? 30 : 0;
      const noise = ((d * 7 + h * 3) % 4) * 5;
      const minutes = Math.min(60, morning + afternoon + noise);
      if (minutes > 0) cells.push({ weekday: d, hour: h, minutes });
    }
  }
  return cells;
}

function rangeTotals(start?: string, end?: string): DayTotal[] {
  const first = start ? new Date(`${start}T00:00:00`) : new Date();
  const last = end ? new Date(`${end}T00:00:00`) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const out: DayTotal[] = [];
  const d = new Date(first);
  let i = 0;
  while (d <= last && out.length < 70) {
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 6;
    const worked = weekend ? (dow === 6 ? 60 : 0) : 240 + ((i * 53) % 180);
    out.push({
      date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      worked_minutes: worked,
      idle_minutes: weekend ? 0 : 15 + ((i * 31) % 60),
      productive_minutes: Math.round(worked * (0.55 + ((i * 17) % 25) / 100)),
    });
    d.setDate(d.getDate() + 1);
    i++;
  }
  return out;
}

function searchHits(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const p = (n: number) => String(n).padStart(2, "0");
  const today = new Date();
  return logs
    .filter((l) => !l.was_idle && l.activity.toLowerCase().includes(q))
    .map((l, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (i % 3));
      return {
        id: l.id,
        date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
        time: l.time,
        activity: l.activity,
        category_id: l.category_id,
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
    get_next_prompt_at: Math.floor(Date.now() / 1000) + 540,
    get_day_totals: rangeTotals(args?.start as string | undefined, args?.end as string | undefined),
    get_category_breakdown: breakdown,
    get_hourly_heatmap: heatmap(),
    get_top_activities: topActivities,
    get_focus_stats: focus,
    get_streaks: streaks,
    search_entries: searchHits((args?.query as string) ?? ""),
    export_csv: "C:/Users/dev/Downloads/hima-export.csv",
    save_report: "C:/Users/dev/Downloads/hima-report.md",
    erase_all_entries: logs.length,
  };
  return Promise.resolve((value[cmd] ?? null) as T);
}
