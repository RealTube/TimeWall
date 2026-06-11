import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SearchOverlay } from "./SearchOverlay";
import Onboarding from "../screens/Onboarding";
import { api } from "../lib/api";

export function Layout() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .settings()
      .then((s) => setOnboarded(s.onboarded))
      .catch(() => setOnboarded(true));
  }, []);

  // Avoid a flash of the dashboard before we know the onboarding state.
  if (onboarded === null) return <div className="h-full w-full bg-bg" />;

  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;

  return (
    <div className="flex h-full w-full bg-bg text-fg">
      <Sidebar />
      <main className="h-full flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <SearchOverlay />
    </div>
  );
}
