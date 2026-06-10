import { useEffect, useState } from "react";
import { useGoal } from "../../hooks/useGoal";
import { formatDuration, formatHours } from "../../lib/format";

interface Props {
  outputMinutes: number;
}

export function GoalCard({ outputMinutes }: Props) {
  const { goalMinutes, save } = useGoal();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("4");

  useEffect(() => {
    setDraft(String(Math.round((goalMinutes / 60) * 10) / 10));
  }, [goalMinutes]);

  const pct = Math.max(
    0,
    Math.min(100, goalMinutes > 0 ? (outputMinutes / goalMinutes) * 100 : 0),
  );
  const remaining = Math.max(0, goalMinutes - outputMinutes);
  const overshoot = outputMinutes > goalMinutes;

  const onSave = async () => {
    const hours = parseFloat(draft);
    if (Number.isNaN(hours) || hours <= 0 || hours > 24) return;
    await save(Math.round(hours * 60));
    setEditing(false);
  };

  return (
    <div className="glass-panel rounded-2xl p-5 fade-in flex flex-col">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] font-medium tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">
          Output Goal
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[10.5px] font-medium tracking-wider uppercase text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSave();
              if (e.key === "Escape") setEditing(false);
            }}
            className="input-field w-full px-3 py-2 rounded-lg text-sm tabular-nums"
          />
          <span className="text-[12px] text-[color:var(--color-text-secondary)]">
            hours
          </span>
          <button
            type="button"
            onClick={() => void onSave()}
            className="button-primary px-3 py-2 rounded-lg text-sm font-medium"
          >
            Set
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-[34px] font-semibold tracking-tight leading-none ${
                overshoot
                  ? "text-[color:var(--color-success)]"
                  : "text-[color:var(--color-text-primary)]"
              }`}
            >
              {formatHours(outputMinutes)}
            </span>
            <span className="text-[15px] text-[color:var(--color-text-muted)]">
              / {formatHours(goalMinutes)}
            </span>
          </div>

          <div className="mt-3 h-2 rounded-full bg-white/[0.05] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: overshoot
                  ? "linear-gradient(90deg, #7ddca4, #a8e8c4)"
                  : "linear-gradient(90deg, #7ddca4, rgba(168,180,255,0.85))",
                boxShadow: "0 0 16px rgba(125,220,164,0.25)",
              }}
            />
          </div>

          <div className="mt-3 text-[12.5px] text-[color:var(--color-text-secondary)]">
            {overshoot
              ? `Crushed it — ${formatDuration(outputMinutes - goalMinutes)} over`
              : remaining > 0
                ? `${formatDuration(remaining)} of focused output remaining`
                : "Set today's target"}
          </div>
        </>
      )}
    </div>
  );
}
