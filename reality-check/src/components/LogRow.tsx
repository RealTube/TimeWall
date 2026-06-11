import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BellOff, Check, MoonStar, Pencil, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import type { ActivityLog, Category } from "../lib/types";
import { cn, hhmm, MISSED_LABEL } from "../lib/utils";

/** One journal entry: time, category dot, text — with inline edit (text and
 *  category) and delete on hover. Away/missed rows are editable too: editing
 *  one reclaims the interval as work (the backend clears the idle flag), the
 *  recovery path for "I was reading, not away" and ignored prompts. */
export function LogRow({
  log,
  categories,
  onChanged,
}: {
  log: ActivityLog;
  categories: Category[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(log.activity);
  const [draftCat, setDraftCat] = useState<number | null>(log.category_id);
  const [removing, setRemoving] = useState(false);

  const category = useMemo(
    () => (log.category_id != null ? categories.find((c) => c.id === log.category_id) : undefined),
    [categories, log.category_id],
  );
  const missed = log.was_idle && log.activity === MISSED_LABEL;

  const beginEdit = () => {
    setDraft(log.activity);
    setDraftCat(log.category_id);
    setEditing(true);
  };

  const save = async () => {
    const value = draft.trim();
    if (!value) return;
    try {
      await api.updateActivity(log.id, value, draftCat);
      setEditing(false);
      onChanged();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await api.deleteActivity(log.id);
      onChanged();
    } catch (e) {
      console.error(e);
      setRemoving(false);
    }
  };

  return (
    <motion.li
      layout
      animate={{ opacity: removing ? 0 : 1, height: removing ? 0 : "auto" }}
      className="group flex items-center gap-4 px-5 py-3.5"
    >
      <span className="w-12 shrink-0 font-mono text-[13px] tabular-nums text-muted">
        {hhmm(log.time)}
      </span>

      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: log.was_idle ? "var(--idle)" : category?.color ?? "var(--border)",
        }}
        title={category?.name}
      />

      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            autoFocus
            value={draft}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={200}
            className="min-w-0 flex-1 rounded-md bg-surface-2 px-2 py-1 text-[15px] focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <select
            value={draftCat ?? ""}
            onChange={(e) => setDraftCat(e.target.value === "" ? null : Number(e.target.value))}
            aria-label="Category"
            className="h-8 shrink-0 cursor-pointer rounded-md bg-surface-2 px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <span className={cn("flex-1 truncate text-[15px]", log.was_idle && "text-muted")}>
          {log.activity}
          {log.was_idle &&
            (missed ? (
              <BellOff className="ml-2 inline size-3.5 -translate-y-px text-idle" />
            ) : (
              <MoonStar className="ml-2 inline size-3.5 -translate-y-px text-idle" />
            ))}
        </span>
      )}

      {category && !editing && (
        <span className="hidden shrink-0 text-[12px] text-muted sm:block">{category.name}</span>
      )}

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {editing ? (
          <>
            <IconBtn onClick={save} title="Save">
              <Check className="size-4" />
            </IconBtn>
            <IconBtn onClick={() => setEditing(false)} title="Cancel">
              <X className="size-4" />
            </IconBtn>
          </>
        ) : (
          <>
            <IconBtn
              onClick={beginEdit}
              title={log.was_idle ? "Reclaim as work" : "Edit"}
            >
              <Pencil className="size-4" />
            </IconBtn>
            <IconBtn onClick={remove} title="Delete" danger>
              <Trash2 className="size-4" />
            </IconBtn>
          </>
        )}
      </div>
    </motion.li>
  );
}

function IconBtn({
  children,
  danger,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2",
        danger ? "hover:text-red-500" : "hover:text-fg",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
