import { invoke } from "@tauri-apps/api/core";
import type {
  ActivityLog,
  Category,
  PausePayload,
  PauseStatus,
  StreakInfo,
} from "../types";

export const ipc = {
  getTodaysLogs: () => invoke<ActivityLog[]>("get_todays_logs"),
  getLogsInRange: (startDate: string, endDate: string) =>
    invoke<ActivityLog[]>("get_logs_in_range", {
      startDate,
      endDate,
    }),
  logActivity: (activity: string) =>
    invoke<number>("log_activity", { activity }),
  updateLogCategory: (id: number, category: Category) =>
    invoke<void>("update_log_category", { id, category }),
  getRecentActivities: (limit = 5) =>
    invoke<string[]>("get_recent_activities", { limit }),
  getInterval: () => invoke<number>("get_interval"),
  setInterval: (minutes: number) => invoke<void>("set_interval", { minutes }),
  getDailyGoal: () => invoke<number>("get_daily_goal"),
  setDailyGoal: (minutes: number) =>
    invoke<void>("set_daily_goal", { minutes }),
  getStreak: () => invoke<StreakInfo>("get_streak"),
  getStreakMinLogs: () => invoke<number>("get_streak_min_logs"),
  setStreakMinLogs: (count: number) =>
    invoke<void>("set_streak_min_logs", { count }),
  pauseDaemon: (payload: PausePayload) =>
    invoke<PauseStatus>("pause_daemon", { payload }),
  resumeDaemon: () => invoke<PauseStatus>("resume_daemon"),
  getPauseStatus: () => invoke<PauseStatus>("get_pause_status"),
  exportCsv: (destination: string) =>
    invoke<string>("export_csv", { destination }),
  suggestExportFilename: () => invoke<string>("suggest_export_filename"),
};
