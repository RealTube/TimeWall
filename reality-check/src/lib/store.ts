import { create } from "zustand";
import { emit } from "@tauri-apps/api/event";
import { api } from "./api";
import { applyTheme } from "./theme";
import type { ThemePreference } from "./types";

interface AppStore {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => Promise<void>;
  loadTheme: () => Promise<void>;
}

/** App-wide UI state. Theme changes broadcast to every window via a Tauri event
 *  so the dashboard and the always-open prompt window stay in sync. */
export const useAppStore = create<AppStore>((set) => ({
  theme: "system",
  setTheme: async (t) => {
    set({ theme: t });
    applyTheme(t);
    try {
      await api.setTheme(t);
      await emit("theme-changed", t);
    } catch (e) {
      console.error("setTheme failed", e);
    }
  },
  loadTheme: async () => {
    try {
      const s = await api.settings();
      set({ theme: s.theme });
      applyTheme(s.theme);
    } catch {
      /* keep default */
    }
  },
}));
