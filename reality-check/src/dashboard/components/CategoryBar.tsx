import { CATEGORY_META, CATEGORY_ORDER } from "../../types";
import type { CategoryBreakdown } from "../../types";
import { formatDuration } from "../../lib/format";

interface Props {
  data: CategoryBreakdown;
}

export function CategoryBar({ data }: Props) {
  if (data.total === 0) return null;

  const segments = CATEGORY_ORDER.map((key) => ({
    key,
    minutes: data[key],
    meta: CATEGORY_META[key],
  })).filter((s) => s.minutes > 0);

  return (
    <div className="glass-panel rounded-2xl p-5 fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10.5px] font-medium tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">
          Where your time went
        </div>
        <div className="text-[12px] font-mono tabular-nums text-[color:var(--color-text-secondary)]">
          {formatDuration(data.total)}
        </div>
      </div>

      <div className="flex h-3 rounded-full overflow-hidden bg-white/[0.03] gap-[2px]">
        {segments.map((s) => (
          <div
            key={s.key}
            className="h-full transition-all duration-500"
            style={{
              width: `${(s.minutes / data.total) * 100}%`,
              background: s.meta.color,
              boxShadow: `inset 0 0 10px ${s.meta.color}33`,
            }}
            title={`${s.meta.label}: ${formatDuration(s.minutes)}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        {CATEGORY_ORDER.map((key) => {
          const minutes = data[key];
          const meta = CATEGORY_META[key];
          const pct = data.total > 0 ? (minutes / data.total) * 100 : 0;
          return (
            <div key={key} className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: meta.color }}
                />
                <span className="text-[12.5px] text-[color:var(--color-text-secondary)] truncate">
                  {meta.label}
                </span>
              </div>
              <div className="mt-1 text-[15px] font-semibold tabular-nums tracking-tight text-[color:var(--color-text-primary)]">
                {formatDuration(minutes)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[color:var(--color-text-muted)]">
                {pct.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
