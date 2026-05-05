import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Define what a "Log" looks like in TypeScript (matching our Rust struct)
interface ActivityLog {
  id: number;
  time: string;
  activity: string;
}

export default function Dashboard() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  // This runs automatically exactly once when the Dashboard opens
  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      // Call the Rust backend to get the SQLite data
      const data: ActivityLog[] = await invoke("get_todays_logs");
      setLogs(data);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  };

  // Calculate total hours based on 15-minute intervals
  const totalHours = (logs.length * 15) / 60;

  return (
    <div className="flex h-screen w-screen bg-black text-white font-sans">
      
      {/* Sidebar */}
      <div className="w-64 border-r border-neutral-800 p-6 flex flex-col">
        <h1 className="text-xl font-bold mb-10 tracking-tight">Reality Check</h1>
        <nav className="flex flex-col gap-4 text-neutral-400">
          <button className="text-left text-white font-medium transition-colors">Today</button>
          <button className="text-left hover:text-white transition-colors">History</button>
          <button className="text-left hover:text-white transition-colors mt-auto">Export Data</button>
          <button className="text-left text-red-500 hover:text-red-400 transition-colors">Pause Timer</button>
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-10 bg-neutral-950 overflow-y-auto">
        <header className="mb-8 border-b border-neutral-800 pb-6">
          <h2 className="text-3xl font-semibold">Today's Log</h2>
          <p className="text-neutral-400 mt-2 text-lg">
            <span className="text-white font-bold">{totalHours.toFixed(2)} hours</span> tracked today.
          </p>
        </header>

        {/* The Data Table / List */}
        <div className="bg-black border border-neutral-800 rounded-lg overflow-hidden">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-neutral-600">
              No activities logged today yet. The 15-minute timer is watching.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-neutral-900 text-neutral-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium w-32">Time</th>
                  <th className="p-4 font-medium">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-900/50 transition-colors">
                    <td className="p-4 text-neutral-400 font-mono text-sm">
                      {log.time.slice(0, 5)}
                    </td>
                    <td className="p-4 text-neutral-200">
                      {log.activity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
    </div>
  );
}