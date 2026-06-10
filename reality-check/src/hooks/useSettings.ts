import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

export function useSettings() {
  const [intervalMinutes, setIntervalMinutes] = useState<number>(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await ipc.getInterval();
        if (!cancelled) setIntervalMinutes(value);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveInterval = useCallback(async (minutes: number) => {
    await ipc.setInterval(minutes);
    setIntervalMinutes(minutes);
  }, []);

  return { intervalMinutes, loading, error, saveInterval };
}
