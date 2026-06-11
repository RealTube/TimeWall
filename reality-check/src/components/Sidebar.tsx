import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import {
  ChartNoAxesColumn,
  Clock3,
  Pause,
  Play,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import { isMac } from "./SearchOverlay";
import { cn } from "../lib/utils";

const NAV = [
  { to: "/", label: "Today", icon: Clock3, end: true },
  { to: "/insights", label: "Insights", icon: ChartNoAxesColumn, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
];

export function Sidebar() {
  const [paused, setPaused] = useState(false);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);

  const refresh = () =>
    api
      .settings()
      .then((s) => setPaused(s.paused))
      .catch(() => {});

  useEffect(() => {
    refresh();
    const un = listen("refresh-dashboard", refresh);
    return () => {
      un.then((f) => f());
    };
  }, []);

  const togglePause = async () => {
    const next = !paused;
    setPaused(next);
    try {
      await api.setPause(next);
    } catch {
      refresh();
    }
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface/30 px-4 py-5">
      <div className="mb-9 flex items-center gap-2.5 px-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">Hima</span>
      </div>

      <button
        onClick={() => setSearchOpen(true)}
        className="mb-4 flex h-10 items-center gap-3 rounded-xl border border-border/70 bg-surface-2/50 px-3 text-sm font-medium text-muted transition-colors hover:border-muted/40 hover:text-fg"
      >
        <Search className="size-[18px]" strokeWidth={2} />
        Search
        <kbd className="ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] tracking-wide">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-surface-2 text-fg shadow-soft"
                  : "text-muted hover:bg-surface-2/60 hover:text-fg",
              )
            }
          >
            <Icon className="size-[18px]" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={togglePause}
        className={cn(
          "mt-auto flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
          paused
            ? "text-busywork hover:bg-busywork/10"
            : "text-muted hover:bg-surface-2/60 hover:text-fg",
        )}
      >
        {paused ? <Play className="size-[18px]" /> : <Pause className="size-[18px]" />}
        {paused ? "Resume timer" : "Pause timer"}
      </button>
    </aside>
  );
}

function Logo() {
  return (
    <span className="grid size-7 place-items-center rounded-[9px] bg-accent shadow-soft">
      <span className="size-2.5 rounded-full bg-accent-fg" />
    </span>
  );
}
