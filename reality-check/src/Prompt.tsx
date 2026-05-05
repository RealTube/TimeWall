import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export default function Prompt() {
  const [activity, setActivity] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 1. Focus the input immediately when the window opens
    if (inputRef.current) {
      inputRef.current.focus();
    }

    // 2. Also force focus whenever Rust sends the "time-to-log" event
    const unlisten = listen("time-to-log", () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    });

    // 3. Cleanup the listener
    return () => {
      unlisten.then(f => f());
    };
  }, []); // Empty dependency array means this runs once on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity.trim()) return;
    
    try {
      await invoke("log_activity", { activity: activity });
      setActivity(""); 
    } catch (error) {
      alert(error);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen w-screen bg-black text-white px-8">
      <form onSubmit={handleSubmit} className="w-full">
        <input
          ref={inputRef}
          type="text"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          className="w-full bg-transparent border-b-2 border-neutral-800 text-white text-3xl pb-2 focus:outline-none focus:border-neutral-400 text-center placeholder-neutral-800 transition-colors"
          placeholder="Activity..."
          autoComplete="off"
        />
        <button type="submit" className="hidden">Log</button>
      </form>
    </div>
  );
}