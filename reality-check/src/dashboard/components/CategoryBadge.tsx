import { useState } from "react";
import { CATEGORY_META, CATEGORY_ORDER } from "../../types";
import type { Category } from "../../types";
import { ipc } from "../../lib/ipc";

interface Props {
  id: number;
  category: Category;
  onChanged?: () => void;
}

export function CategoryBadge({ id, category, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Category>(category);
  const meta = CATEGORY_META[current];

  const cycle = async (next: Category) => {
    setCurrent(next);
    setOpen(false);
    try {
      await ipc.updateLogCategory(id, next);
      onChanged?.();
    } catch (e) {
      console.error(e);
      setCurrent(category);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all active:scale-95"
        style={{
          background: meta.soft,
          color: meta.color,
          border: `1px solid ${meta.color}22`,
        }}
        title={meta.hint}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: meta.color }}
        />
        {meta.label}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full mt-1.5 glass-strong rounded-xl overflow-hidden z-20 fade-in min-w-[160px]">
            {CATEGORY_ORDER.map((opt) => {
              const m = CATEGORY_META[opt];
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => void cycle(opt)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.05] transition-colors"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: m.color }}
                  />
                  <span
                    style={{
                      color:
                        opt === current
                          ? m.color
                          : "var(--color-text-primary)",
                    }}
                  >
                    {m.label}
                  </span>
                  <span className="ml-auto text-[10.5px] text-[color:var(--color-text-muted)]">
                    {m.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
