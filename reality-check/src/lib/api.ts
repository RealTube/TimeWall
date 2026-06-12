// Typed wrappers around the Tauri commands. Tauri converts camelCase arg keys
// here into the backend's snake_case parameters automatically.

import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./devMock";
import type {
  ActivityLog,
  AnswerStats,
  AppSettings,
  Category,
  CategorySlice,
  DayTotal,
  FocusStats,
  HeatCell,
  ImportSummary,
  MergeOutcome,
  SearchHit,
  Streaks,
  ThemePreference,
  TopActivity,
} from "./types";

const hasTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Route to the real Tauri IPC, or to fixtures when previewing in a browser. */
function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasTauri && import.meta.env.DEV) return mockInvoke<T>(cmd, args);
  return invoke<T>(cmd, args);
}

export const api = {
  // Logging
  log: (activity: string, categoryId: number | null = null) =>
    call<void>("log_activity", { activity, categoryId }),
  todaysLogs: () => call<ActivityLog[]>("get_todays_logs"),
  logsForDate: (date: string) => call<ActivityLog[]>("get_logs_for_date", { date }),
  recent: (limit = 8) => call<string[]>("get_recent_activities", { limit }),
  updateActivity: (id: number, activity: string, categoryId: number | null) =>
    call<void>("update_activity", { id, activity, categoryId }),
  deleteActivity: (id: number) => call<void>("delete_activity", { id }),

  // Settings & scheduling
  settings: () => call<AppSettings>("get_settings"),
  getInterval: () => call<number>("get_interval"),
  setInterval: (minutes: number) => call<void>("set_interval", { minutes }),
  updateSetting: (key: string, value: string) =>
    call<void>("update_setting", { key, value }),
  setTheme: (theme: ThemePreference) =>
    call<void>("update_setting", { key: "theme", value: theme }),
  setPause: (paused: boolean) => call<void>("set_pause", { paused }),
  pauseFor: (minutes: number) => call<void>("pause_for", { minutes }),
  snooze: (minutes = 5) => call<void>("snooze", { minutes }),
  checkInNow: () => call<void>("check_in_now"),
  nextPromptAt: () => call<number>("get_next_prompt_at"),

  // Categories
  categories: () => call<Category[]>("list_categories"),
  addCategory: (name: string, color: string, isProductive: boolean) =>
    call<number>("add_category", { name, color, isProductive }),
  updateCategory: (
    id: number,
    name: string,
    color: string,
    isProductive: boolean,
    weeklyTargetMin = 0,
  ) => call<void>("update_category", { id, name, color, isProductive, weeklyTargetMin }),
  deleteCategory: (id: number) => call<void>("delete_category", { id }),

  // Insights
  dayTotals: (start: string, end: string) =>
    call<DayTotal[]>("get_day_totals", { start, end }),
  categoryBreakdown: (start: string, end: string) =>
    call<CategorySlice[]>("get_category_breakdown", { start, end }),
  hourlyHeatmap: (start: string, end: string) =>
    call<HeatCell[]>("get_hourly_heatmap", { start, end }),
  topActivities: (start: string, end: string, limit = 8) =>
    call<TopActivity[]>("get_top_activities", { start, end, limit }),
  focusStats: (start: string, end: string) =>
    call<FocusStats>("get_focus_stats", { start, end }),
  search: (query: string, limit = 60) =>
    call<SearchHit[]>("search_entries", { query, limit }),
  streaks: () => call<Streaks>("get_streaks"),
  answerStats: (start: string, end: string) =>
    call<AnswerStats>("get_answer_stats", { start, end }),

  // Data ownership
  exportCsv: (start: string, end: string) =>
    call<string | null>("export_csv", { start, end }),
  saveReport: (content: string) => call<string | null>("save_report", { content }),
  eraseAllEntries: () => call<number>("erase_all_entries"),
  backupCreate: (passphrase: string) =>
    call<string | null>("backup_create", { passphrase }),
  backupRestore: (passphrase: string) =>
    call<MergeOutcome | null>("backup_restore", { passphrase }),
  importCsv: () => call<ImportSummary | null>("import_csv"),

  // Autostart
  setAutostart: (enabled: boolean) => call<void>("set_autostart", { enabled }),
  getAutostart: () => call<boolean>("get_autostart"),
};
