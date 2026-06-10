import type { ThemePreference } from "./types";

const mql = () => window.matchMedia("(prefers-color-scheme: dark)");

export function resolveDark(theme: ThemePreference): boolean {
  return theme === "dark" || (theme === "system" && mql().matches);
}

export function applyTheme(theme: ThemePreference): void {
  document.documentElement.classList.toggle("dark", resolveDark(theme));
}

/**
 * Apply the theme now and, while in "system" mode, keep it in sync with the OS.
 * Returns a cleanup function.
 */
export function watchTheme(theme: ThemePreference): () => void {
  applyTheme(theme);
  const m = mql();
  const handler = () => applyTheme(theme);
  m.addEventListener("change", handler);
  return () => m.removeEventListener("change", handler);
}
