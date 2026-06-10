import { useMemo } from "react";
import { useLogs } from "../../hooks/useLogs";
import { useSettings } from "../../hooks/useSettings";
import { useStreak } from "../../hooks/useStreak";
import { breakdown, realityScore } from "../../lib/format";
import { CategoryBar } from "../components/CategoryBar";
import { GoalCard } from "../components/GoalCard";
import { LogTable } from "../components/LogTable";
import { RealityScoreCard } from "../components/RealityScoreCard";
import { StreakCard } from "../components/StreakCard";

function todayHeadline(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function TodayView() {
  const { logs, refresh } = useLogs();
  const { intervalMinutes } = useSettings();
  const { streak } = useStreak();

  const data = useMemo(() => breakdown(logs), [logs]);
  const score = useMemo(() => realityScore(data), [data]);

  return (
    <div className="max-w-6xl mx-auto px-10 pt-10 pb-12 fade-in">
      <header className="mb-8">
        <div className="text-[11px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] font-medium">
          {todayHeadline()}
        </div>
        <h1 className="mt-2 text-[34px] leading-[1.15] font-semibold tracking-tight">
          Where did your last{" "}
          <span className="text-[color:var(--color-accent)]">
            {intervalMinutes} minutes
          </span>{" "}
          go?
        </h1>
        <p className="mt-3 text-[15px] text-[color:var(--color-text-secondary)] max-w-2xl">
          A raw, honest audit of your day. Reality doesn't lie — it just gets
          ignored.
        </p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <RealityScoreCard score={score} />
        <GoalCard outputMinutes={data.output} />
        <StreakCard streak={streak} />
      </section>

      <section className="mb-5">
        <CategoryBar data={data} />
      </section>

      <section>
        <LogTable logs={logs} onCategoryChanged={refresh} />
      </section>
    </div>
  );
}
