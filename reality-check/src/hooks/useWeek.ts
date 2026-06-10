import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../lib/ipc";
import { lastNDates } from "../lib/format";
import type { ActivityLog, Category, CategoryBreakdown } from "../types";

export interface DayBucket {
  date: string;
  logs: ActivityLog[];
  breakdown: CategoryBreakdown;
}

function emptyBreakdown(): CategoryBreakdown {
  return {
    output: 0,
    input: 0,
    recovery: 0,
    leak: 0,
    unknown: 0,
    total: 0,
  };
}

function bucketByDate(logs: ActivityLog[], dates: string[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const date of dates) {
    map.set(date, { date, logs: [], breakdown: emptyBreakdown() });
  }
  for (const log of logs) {
    const bucket = map.get(log.date);
    if (!bucket) continue;
    bucket.logs.push(log);
    const minutes = log.duration || 15;
    bucket.breakdown[log.category as Category] += minutes;
    bucket.breakdown.total += minutes;
  }
  return dates.map((d) => map.get(d)!);
}

export function useWeek(days = 7) {
  const dates = useMemo(() => lastNDates(days), [days]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const start = dates[0];
      const end = dates[dates.length - 1];
      const data = await ipc.getLogsInRange(start, end);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dates]);

  useEffect(() => {
    refresh();
    const unlisten = listen("refresh-dashboard", () => {
      void refresh();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const buckets = useMemo(() => bucketByDate(logs, dates), [logs, dates]);

  return { buckets, loading, refresh };
}
