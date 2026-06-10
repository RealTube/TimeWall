import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../lib/ipc";
import type { StreakInfo } from "../types";

const DEFAULT: StreakInfo = {
  days: 0,
  today_log_count: 0,
  min_logs_required: 4,
  today_qualifies: false,
};

export function useStreak() {
  const [streak, setStreak] = useState<StreakInfo>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const v = await ipc.getStreak();
      setStreak(v);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("refresh-dashboard", () => {
      void refresh();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  return { streak, loading, refresh };
}
