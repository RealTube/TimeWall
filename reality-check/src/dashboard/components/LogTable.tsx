import type { ActivityLog } from "../../types";
import { formatClock, formatDuration } from "../../lib/format";
import { CategoryBadge } from "./CategoryBadge";

interface Props {
  logs: ActivityLog[];
  onCategoryChanged?: () => void;
}

export function LogTable({ logs, onCategoryChanged }: Props) {
  if (logs.length === 0) return <EmptyState />;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-[color:var(--color-border-subtle)]">
        <div className="text-sm font-medium text-[color:var(--color-text-primary)]">
          Today's entries
        </div>
        <div className="text-xs text-[color:var(--color-text-secondary)] tabular-nums">
          {logs.length} {logs.length === 1 ? "entry" : "entries"} • click a tag
          to recategorize
        </div>
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-380px)]">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[color:var(--color-canvas)]/85 backdrop-blur">
            <tr className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">
              <th className="px-5 py-2.5 font-medium w-20">Time</th>
              <th className="px-5 py-2.5 font-medium">Activity</th>
              <th className="px-5 py-2.5 font-medium w-28">Tag</th>
              <th className="px-5 py-2.5 font-medium w-28 text-right">
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, idx) => (
              <tr
                key={log.id}
                className={`group transition-colors ${
                  idx % 2 === 0 ? "" : "bg-white/[0.012]"
                } hover:bg-white/[0.035]`}
              >
                <td className="px-5 py-3 font-mono text-[13px] text-[color:var(--color-text-secondary)] tabular-nums">
                  {formatClock(log.time)}
                </td>
                <td className="px-5 py-3 text-[14px] text-[color:var(--color-text-primary)]">
                  {log.activity}
                </td>
                <td className="px-5 py-3">
                  <CategoryBadge
                    id={log.id}
                    category={log.category}
                    onChanged={onCategoryChanged}
                  />
                </td>
                <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[color:var(--color-text-secondary)] tabular-nums">
                  {formatDuration(log.duration)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass-panel rounded-2xl px-8 py-16 text-center fade-in">
      <div
        className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background:
            "linear-gradient(135deg, rgba(168, 180, 255, 0.12), rgba(125, 220, 164, 0.08))",
          border: "1px solid rgba(168, 180, 255, 0.18)",
        }}
        aria-hidden
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle
            cx="11"
            cy="11"
            r="8"
            stroke="rgba(168,180,255,0.7)"
            strokeWidth="1.4"
          />
          <path
            d="M11 7V11L13.5 12.5"
            stroke="rgba(168,180,255,0.9)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="text-[15px] font-medium text-[color:var(--color-text-primary)]">
        The timer is watching.
      </div>
      <div className="text-[13px] mt-1.5 text-[color:var(--color-text-secondary)] max-w-sm mx-auto">
        Your first log will appear here when the popup fires. One or two words
        is all it takes.
      </div>
    </div>
  );
}
