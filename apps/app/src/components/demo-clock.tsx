"use client";

import { useState, useEffect, useCallback } from "react";

const ORACLE_URL = "/api/oracle";

export function DemoClock() {
  const [time, setTime] = useState<Date | null>(null);
  const [speed, setSpeed] = useState<1 | 10>(1);
  const [toggling, setToggling] = useState(false);

  // Tick clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll speed
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${ORACLE_URL}/api/demo/speed`);
        const data = await res.json();
        setSpeed(data.speed === 10 ? 10 : 1);
      } catch (err) {
        // #33: log poll errors
        console.error('DemoClock poll:', err);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const toggleSpeed = useCallback(async () => {
    setToggling(true);
    const newSpeed = speed === 1 ? 10 : 1;
    try {
      await fetch(`${ORACLE_URL}/api/demo/speed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed: newSpeed }),
      });
      setSpeed(newSpeed);
    } catch (err) {
      // #33: log toggleSpeed errors
      console.error('DemoClock toggleSpeed:', err);
    }
    setTimeout(() => setToggling(false), 200);
  }, [speed]);

  const is10x = speed === 10;
  if (!time) return null;
  const hh = time.getHours().toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");
  const ss = time.getSeconds().toString().padStart(2, "0");

  return (
    <button
      onClick={toggleSpeed}
      className={`fixed left-1/2 -translate-x-1/2 top-[15px] z-50 flex items-center gap-2 rounded-full border px-3 py-2 min-h-[44px] backdrop-blur-md transition-all duration-300 ${
        is10x
          ? "border-accent-green/40 bg-surface/95 shadow-[0_0_12px_rgba(34,197,94,0.15)]"
          : "border-border bg-surface/90"
      } ${toggling ? "scale-110 opacity-70" : "scale-100 opacity-100"}`}
      title={is10x ? "Switch to 1x" : "Switch to 10x"}
    >
      {is10x ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-accent-green">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-muted">
          <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" />
          <path d="M12 9v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16.5 4.5l1 1M7.5 4.5l-1 1M12 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      <span
        className={`text-xs ${
          is10x ? "text-accent-green" : "text-muted"
        }`}
      >
        {hh}:{mm}:{ss}
      </span>
      <span
        className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
          is10x
            ? "bg-accent-green/15 text-accent-green pulse-subtle"
            : "bg-border text-muted"
        }`}
      >
        {speed}x
      </span>
    </button>
  );
}
