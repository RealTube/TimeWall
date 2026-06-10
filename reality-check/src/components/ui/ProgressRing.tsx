interface Props {
  /** Progress in 0..1. */
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  color?: string;
}

/** Minimal, Apple-flavoured progress ring with an animated sweep. */
export function ProgressRing({ value, size = 132, stroke = 9, children, color }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const center = size / 2;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={color ? "" : "stroke-accent"}
          stroke={color}
          style={{
            strokeDasharray: c,
            strokeDashoffset: c * (1 - clamped),
            transition: "stroke-dashoffset 0.8s var(--ease-out-soft)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
