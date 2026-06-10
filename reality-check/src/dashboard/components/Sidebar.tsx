import { SettingsPanel } from "./SettingsPanel";
import { PauseControl } from "./PauseControl";
import { ExportButton } from "./ExportButton";
import type { DashboardTab } from "../Dashboard";

interface Props {
  tab: DashboardTab;
  onTabChange: (next: DashboardTab) => void;
}

export function Sidebar({ tab, onTabChange }: Props) {
  return (
    <aside className="w-72 shrink-0 border-r border-[color:var(--color-border-subtle)] flex flex-col">
      <div className="p-6 pb-4">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-[color:var(--color-text-primary)]">
              Hima
            </div>
            <div className="text-[11px] text-[color:var(--color-text-muted)] tracking-wide uppercase">
              Reality Check
            </div>
          </div>
        </div>
      </div>

      <nav className="px-3 space-y-0.5">
        <NavItem
          label="Today"
          active={tab === "today"}
          onClick={() => onTabChange("today")}
        />
        <NavItem
          label="Last 7 days"
          active={tab === "week"}
          onClick={() => onTabChange("week")}
        />
      </nav>

      <div className="flex-1" />

      <div className="px-5 py-4 space-y-4 border-t border-[color:var(--color-border-subtle)]">
        <PauseControl />
        <ExportButton />
      </div>

      <div className="px-5 pb-5">
        <SettingsPanel />
      </div>
    </aside>
  );
}

function BrandMark() {
  return (
    <div
      aria-hidden
      className="w-9 h-9 rounded-xl flex items-center justify-center text-[15px] font-semibold"
      style={{
        background:
          "linear-gradient(135deg, rgba(168, 180, 255, 0.95), rgba(125, 220, 164, 0.85))",
        color: "#0b0c10",
        boxShadow:
          "0 6px 20px rgba(168, 180, 255, 0.18), inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      15
    </div>
  );
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? "bg-white/[0.05] text-[color:var(--color-text-primary)]"
          : "text-[color:var(--color-text-secondary)] hover:bg-white/[0.03] hover:text-[color:var(--color-text-primary)]"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-3 ${
          active ? "bg-[color:var(--color-accent)]" : "bg-white/20"
        }`}
      />
      {label}
    </button>
  );
}
