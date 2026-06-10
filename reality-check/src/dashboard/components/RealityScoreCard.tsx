import { formatDuration } from "../../lib/format";
import type { RealityScore } from "../../types";

interface Props {
  score: RealityScore;
}

const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function RealityScoreCard({ score }: Props) {
  const pct = Math.max(0, Math.min(100, score.score));
  const dash = (pct / 100) * CIRC;
  const color = scoreColor(pct);
  const label = scoreLabel(pct);

  return (
    <div className="glass-panel rounded-2xl p-5 fade-in flex flex-col">
      <div className="text-[10.5px] font-medium tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">
        Reality Score
      </div>

      <div className="flex items-center gap-5 mt-3 flex-1">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={STROKE}
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRC}`}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              style={{
                transition: "stroke-dasharray 600ms ease-out",
                filter: `drop-shadow(0 0 12px ${color}55)`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="text-[36px] leading-none font-semibold tabular-nums tracking-tight"
              style={{ color }}
            >
              {pct}
            </div>
            <div className="text-[10px] text-[color:var(--color-text-muted)] mt-1 tracking-wider uppercase">
              / 100
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="text-[15px] font-medium"
            style={{ color: scoreColor(pct) }}
          >
            {label}
          </div>
          <div className="text-[12.5px] text-[color:var(--color-text-secondary)] mt-1 leading-snug">
            Weighted across output, input, recovery — leak counts zero.
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-[12px]">
            <Stat
              label="Output"
              value={formatDuration(score.outputMinutes)}
              accent="#7ddca4"
            />
            <Stat
              label="Leak"
              value={formatDuration(score.leakMinutes)}
              accent="#ff7a8a"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: accent }}
      />
      <span className="text-[color:var(--color-text-muted)]">{label}</span>
      <span className="ml-auto font-mono tabular-nums text-[color:var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

function scoreColor(pct: number): string {
  if (pct >= 75) return "#7ddca4";
  if (pct >= 50) return "#a8b4ff";
  if (pct >= 25) return "#ffb56b";
  return "#ff7a8a";
}

function scoreLabel(pct: number): string {
  if (pct >= 85) return "On the bag";
  if (pct >= 70) return "Strong day";
  if (pct >= 50) return "Decent — push more";
  if (pct >= 25) return "Drifting";
  return "Reality bites";
}
