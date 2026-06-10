import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { Layout } from "./components/Layout";
import Dashboard from "./screens/Dashboard";
import Insights from "./screens/Insights";
import SettingsScreen from "./screens/Settings";
import Prompt from "./screens/Prompt";
import { useAppStore } from "./lib/store";
import { watchTheme } from "./lib/theme";
import type { ThemePreference } from "./lib/types";

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const loadTheme = useAppStore((s) => s.loadTheme);

  useEffect(() => {
    loadTheme();
    const un = listen<ThemePreference>("theme-changed", (e) =>
      useAppStore.setState({ theme: e.payload }),
    );
    return () => {
      un.then((f) => f());
    };
  }, [loadTheme]);

  // Re-apply (and keep watching the OS) whenever the preference changes.
  useEffect(() => watchTheme(theme), [theme]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
        <Route path="/prompt" element={<Prompt />} />
      </Routes>
    </HashRouter>
  );
}
