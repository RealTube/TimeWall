// Typed wrappers around the Tauri commands. Tauri converts camelCase arg keys
// here into the backend's snake_case parameters automatically.

import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./devMock";
import type {
  ActivityLog,
  AppSettings,
  Category,
  CategorySlice,
  DayTotal,
  ThemePreference,
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
  snooze: (minutes = 5) => call<void>("snooze", { minutes }),

  // Categories
  categories: () => call<Category[]>("list_categories"),
  addCategory: (name: string, color: string, isProductive: boolean) =>
    call<number>("add_category", { name, color, isProductive }),
  updateCategory: (id: number, name: string, color: string, isProductive: boolean) =>
    call<void>("update_category", { id, name, color, isProductive }),
  deleteCategory: (id: number) => call<void>("delete_category", { id }),

  // Insights
  dayTotals: (start: string, end: string) =>
    call<DayTotal[]>("get_day_totals", { start, end }),
  categoryBreakdown: (start: string, end: string) =>
    call<CategorySlice[]>("get_category_breakdown", { start, end }),

  // Autostart
  setAutostart: (enabled: boolean) => call<void>("set_autostart", { enabled }),
  getAutostart: () => call<boolean>("get_autostart"),
};
