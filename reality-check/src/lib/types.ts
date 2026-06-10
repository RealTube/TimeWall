// Mirrors the serde structs in src-tauri (snake_case field names).

export interface ActivityLog {
  id: number;
  time: string; // HH:MM:SS, local
  activity: string;
  category_id: number | null;
  was_idle: boolean;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  is_productive: boolean;
  sort_order: number;
}

export type ThemePreference = "light" | "dark" | "system";

export interface AppSettings {
  interval_minutes: number;
  paused: boolean;
  idle_threshold_min: number;
  align_to_clock: boolean;
  theme: ThemePreference;
  notifications: boolean;
  sound: boolean;
  onboarded: boolean;
}

export interface DayTotal {
  date: string;
  worked_minutes: number;
  idle_minutes: number;
}

export interface CategorySlice {
  category_id: number | null;
  name: string;
  color: string;
  is_productive: boolean;
  minutes: number;
}
