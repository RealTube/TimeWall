import { cn } from "../../lib/utils";

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  dot?: string;
}

/** Pill button used for recent entries (1-tap re-log) and category selection. */
export function Chip({ active, dot, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-medium border transition-all duration-150 active:scale-[0.96] whitespace-nowrap",
        active
          ? "bg-accent text-accent-fg border-transparent shadow-soft"
          : "bg-surface-2 text-fg border-border hover:border-muted/50",
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: active ? "currentColor" : dot }}
        />
      )}
      {children}
    </button>
  );
}
