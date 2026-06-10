import type { StreakInfo } from "../../types";

interface Props {
  streak: StreakInfo;
}

export function StreakCard({ streak }: Props) {
  const todayPct = Math.min(
    100,
    streak.min_logs_required > 0
      ? (streak.today_log_count / streak.min_logs_required) * 100
      : 0,
  );
  const safe = streak.today_qualifies;
  const inProgress =
    !safe && streak.today_log_count > 0 && streak.today_log_count < streak.min_logs_required;

  return (
    <div className="glass-panel rounded-2xl p-5 fade-in flex flex-col">
      <div className="text-[10.5px] font-medium tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">
        Streak
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className="text-[44px] font-semibold leading-none tabular-nums tracking-tight"
          style={{ color: streak.days > 0 ? "#ffb56b" : undefined }}
        >
          {streak.days}
        </span>
        <span className="text-[14px] text-[color:var(--color-text-secondary)]">
          {streak.days === 1 ? "day" : "days"}
        </span>
        {streak.days > 0 && (
          <span aria-hidden className="text-[20px] ml-0.5">
            🔥
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${todayPct}%`,
              background: safe
                ? "linear-gradient(90deg, #7ddca4, #a8e8c4)"
                : "linear-gradient(90deg, #ffb56b, #ff9a55)",
            }}
          />
        </div>
        <span className="text-[11.5px] font-mono text-[color:var(--color-text-muted)] tabular-nums">
          {streak.today_log_count}/{streak.min_logs_required}
        </span>
      </div>

      <div className="mt-3 text-[12.5px] text-[color:var(--color-text-secondary)] leading-snug">
        {safe ? (
          <>Today secured. Don't break the chain.</>
        ) : inProgress ? (
          <>
            {streak.min_logs_required - streak.today_log_count} more log
            {streak.min_logs_required - streak.today_log_count === 1 ? "" : "s"}{" "}
            to lock today in.
          </>
        ) : streak.days > 0 ? (
          <>Log {streak.min_logs_required}+ entries today to hold the streak.</>
        ) : (
          <>
            Log {streak.min_logs_required}+ entries each day. Streak starts
            tomorrow.
          </>
        )}
      </div>
    </div>
  );
}
