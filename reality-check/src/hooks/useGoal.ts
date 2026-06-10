import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

export function useGoal() {
  const [goalMinutes, setGoalMinutes] = useState<number>(240);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await ipc.getDailyGoal();
        if (!cancelled) setGoalMinutes(v);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (minutes: number) => {
    await ipc.setDailyGoal(minutes);
    setGoalMinutes(minutes);
  }, []);

  return { goalMinutes, loading, save };
}
