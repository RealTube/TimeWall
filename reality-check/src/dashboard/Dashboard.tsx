import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TodayView } from "./views/TodayView";
import { WeekView } from "./views/WeekView";

export type DashboardTab = "today" | "week";

export default function Dashboard() {
  const [tab, setTab] = useState<DashboardTab>("today");

  return (
    <div className="app-canvas flex h-screen w-screen text-[color:var(--color-text-primary)]">
      <Sidebar tab={tab} onTabChange={setTab} />
      <main className="flex-1 overflow-y-auto">
        {tab === "today" ? <TodayView /> : <WeekView />}
      </main>
    </div>
  );
}
