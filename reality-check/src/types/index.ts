export type Category = "output" | "input" | "recovery" | "leak" | "unknown";

export const CATEGORY_ORDER: Category[] = [
  "output",
  "input",
  "recovery",
  "leak",
  "unknown",
];

export const CATEGORY_META: Record<
  Category,
  { label: string; color: string; soft: string; hint: string }
> = {
  output: {
    label: "Output",
    color: "#7ddca4",
    soft: "rgba(125, 220, 164, 0.16)",
    hint: "Built, created, shipped",
  },
  input: {
    label: "Input",
    color: "#8aa8ff",
    soft: "rgba(138, 168, 255, 0.18)",
    hint: "Meetings, comms, admin",
  },
  recovery: {
    label: "Recovery",
    color: "#ffb56b",
    soft: "rgba(255, 181, 107, 0.16)",
    hint: "Breaks, food, exercise",
  },
  leak: {
    label: "Leak",
    color: "#ff7a8a",
    soft: "rgba(255, 122, 138, 0.16)",
    hint: "Scrolling, distraction",
  },
  unknown: {
    label: "Unsorted",
    color: "rgba(255, 255, 255, 0.45)",
    soft: "rgba(255, 255, 255, 0.06)",
    hint: "Click to categorize",
  },
};

export interface ActivityLog {
  id: number;
  date: string;
  time: string;
  activity: string;
  duration: number;
  category: Category;
}

export interface PauseStatus {
  paused: boolean;
  paused_until: string | null;
}

export type PausePayload =
  | { kind: "minutes"; value: number }
  | { kind: "until_tomorrow" };

export interface DayStats {
  totalMinutes: number;
  sessions: number;
  firstLogTime: string | null;
  lastLogTime: string | null;
  uniqueActivities: number;
}

export interface CategoryBreakdown {
  output: number;
  input: number;
  recovery: number;
  leak: number;
  unknown: number;
  total: number;
}

export interface StreakInfo {
  days: number;
  today_log_count: number;
  min_logs_required: number;
  today_qualifies: boolean;
}

export interface RealityScore {
  score: number;
  outputMinutes: number;
  leakMinutes: number;
  totalMinutes: number;
}
