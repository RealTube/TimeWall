import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../lib/ipc";

export function useRecentActivities(limit = 5) {
  const [items, setItems] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await ipc.getRecentActivities(limit);
      setItems(data);
    } catch (e) {
      console.error(e);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
    const unlisten = listen("time-to-log", () => {
      void refresh();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  return { items, refresh };
}
