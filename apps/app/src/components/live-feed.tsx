"use client";

import { useEffect, useRef, useState } from "react";
import { useFeed, type FeedEvent } from "@/lib/live";

const TAG: Record<FeedEvent["tag"], string> = {
  WAIT: "bg-warn/10 text-warn",
  EXECUTE: "bg-brand/10 text-brand",
  SETTLED: "bg-ok/10 text-ok",
  FAILED: "bg-danger/10 text-danger",
  INFO: "bg-border text-muted",
  SCORE: "bg-info/10 text-info",
};

const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour12: false });

/** Streaming decision log: agent + strategy events, newest first; new rows flash in. */
export function LiveFeed({ rows = 10 }: { rows?: number }) {
  const { data, error, loading } = useFeed();
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const events = data?.events ?? [];

  useEffect(() => {
    if (!events.length) return;
    const isFirst = seen.current.size === 0;
    const added = new Set<string>();
    for (const e of events) {
      if (!seen.current.has(e.id)) {
        seen.current.add(e.id);
        if (!isFirst) added.add(e.id);
      }
    }
    if (added.size) {
      setFresh(added);
      const t = setTimeout(() => setFresh(new Set()), 1800);
      return () => clearTimeout(t);
    }
  }, [events]);

  const online = Boolean(data?.online);
  const agentLine = data?.agent
    ? `${data.agent.strategyMode ?? "score"} mode · ${data.agent.totalChunksExecuted ?? 0} settled · ${String(data.agent.lastStatus ?? "").slice(0, 44)}`
    : "Start the agent: pnpm agent:start";

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
        <span className="inline-flex shrink-0 items-center gap-2 font-medium">
          {online ? <span className="live-dot" /> : <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted" />}
          <span className={online ? "text-ok" : "text-muted"}>{online ? "Agent online" : loading ? "Connecting…" : error ? "Agent offline" : "Agent offline"}</span>
        </span>
        <span className="min-w-0 truncate text-muted" title={agentLine}>
          {agentLine}
        </span>
      </div>

      <ol className="-mx-5 divide-y divide-border border-t border-border text-xs">
        {events.slice(0, rows).map((e) => (
          <li key={e.id} className={`grid grid-cols-[60px_64px_1fr_auto] items-center gap-3 px-5 py-2 ${fresh.has(e.id) ? "flash-in" : ""}`}>
            <time className="num text-muted">{hhmmss(e.ts)}</time>
            <span className={`rounded-sm px-1.5 py-0.5 text-center text-[10px] font-semibold ${TAG[e.tag]}`}>{e.tag}</span>
            <span className="min-w-0 truncate text-foreground/90" title={e.text}>
              {e.text}
            </span>
            {typeof e.score === "number" && e.tag !== "SETTLED" ? <span className="num text-muted">{e.score}</span> : <span />}
          </li>
        ))}
        {events.length === 0 && (
          <li className="px-5 py-8 text-center text-muted">
            {loading ? "Listening…" : "No decisions yet. Create an order and the agent's reasoning streams here."}
          </li>
        )}
      </ol>
    </div>
  );
}
