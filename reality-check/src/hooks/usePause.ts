import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../lib/ipc";
import type { PausePayload, PauseStatus } from "../types";

const DEFAULT: PauseStatus = { paused: false, paused_until: null };

export function usePause() {
  const [status, setStatus] = useState<PauseStatus>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await ipc.getPauseStatus();
      setStatus(next);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("pause-changed", () => {
      void refresh();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  useEffect(() => {
    if (!status.paused) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [status.paused, refresh]);

  const pause = useCallback(
    async (payload: PausePayload) => {
      const next = await ipc.pauseDaemon(payload);
      setStatus(next);
    },
    [],
  );

  const resume = useCallback(async () => {
    const next = await ipc.resumeDaemon();
    setStatus(next);
  }, []);

  return { status, loading, error, pause, resume, refresh };
}
