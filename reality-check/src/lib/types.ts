// Mirrors the serde structs in src-tauri (snake_case field names).

export interface ActivityLog {
  id: number;
  time: string; // HH:MM:SS, local
  activity: string;
  category_id: number | null;
  was_idle: boolean;
  /** Minutes this entry covered when it was logged — totals always use this,
   *  never the current interval setting. */
  interval_min: number;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  is_productive: boolean;
  sort_order: number;
  /** Optional weekly target in minutes; 0 = no target. */
  weekly_target_min: number;
}

export type ThemePreference = "light" | "dark" | "system";

export interface AppSettings {
  interval_minutes: number;
  paused: boolean;
  paused_until: number; // unix ts; 0 = no temporary pause
  idle_threshold_min: number;
  align_to_clock: boolean;
  theme: ThemePreference;
  notifications: boolean;
  sound: boolean;
  onboarded: boolean;
  schedule_enabled: boolean;
  schedule_start_min: number; // minutes from local midnight
  schedule_end_min: number;
  schedule_days: string; // CSV of ISO weekdays, Mon=1 … Sun=7
}

export interface DayTotal {
  date: string;
  worked_minutes: number;
  idle_minutes: number;
  /** Worked minutes in categories flagged productive. */
  productive_minutes: number;
}

export interface CategorySlice {
  category_id: number | null;
  name: string;
  color: string;
  is_productive: boolean;
  minutes: number;
}

/** One heatmap cell; weekday 0 = Monday … 6 = Sunday. */
export interface HeatCell {
  weekday: number;
  hour: number;
  minutes: number;
}

export interface TopActivity {
  activity: string;
  minutes: number;
  count: number;
}

export interface FocusStats {
  avg_block_min: number;
  longest_block_min: number;
  switches_per_day: number;
  days_counted: number;
}

/** A journal entry matched by search (newest first). */
export interface SearchHit {
  id: number;
  date: string;
  time: string;
  activity: string;
  category_id: number | null;
}

/** Consecutive logged-day streaks; a day counts with ≥1 non-away check-in. */
export interface Streaks {
  current: number;
  best: number;
  days_logged: number;
}
