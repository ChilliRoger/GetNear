"use client";

import { useEffect, useRef, useState } from "react";
import { useFeed, type FeedEvent } from "@/lib/live";

const TAG_STYLE: Record<FeedEvent["tag"], string> = {
  WAIT: "text-warn",
  EXECUTE: "text-brand",
  SETTLED: "text-ok",
  FAILED: "text-danger",
  INFO: "text-muted",
  SCORE: "text-info",
};

const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour12: false });

/** Streaming decision log: agent + strategy events, newest first, new rows flash in. */
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

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em]">
        <span className="inline-flex items-center gap-2">
          {online ? <span className="live-dot" /> : <span className="inline-block h-[7px] w-[7px] border border-muted" />}
          <span className={online ? "text-ok" : "text-muted"}>{online ? "Agent online" : error ? "Agent offline" : loading ? "Connecting" : "Agent offline"}</span>
        </span>
        <span className="text-muted">
          {data?.agent ? `${data.agent.strategyMode ?? "score"} mode · ${data.agent.totalChunksExecuted ?? 0} chunks this session · ${data.agent.lastStatus ?? "…"}` : "start the agent: pnpm agent:start"}
        </span>
      </div>

      <ol className="divide-y divide-dashed divide-border border-y border-dashed border-border text-xs">
        {events.slice(0, rows).map((e) => (
          <li
            key={e.id}
            className={`grid grid-cols-[64px_70px_1fr] items-baseline gap-3 px-1 py-2 ${fresh.has(e.id) ? "flash-in" : ""}`}
          >
            <time className="text-muted">{hhmmss(e.ts)}</time>
            <span className={`font-semibold tracking-wider ${TAG_STYLE[e.tag]}`}>{e.tag}</span>
            <span className="min-w-0 break-words text-foreground/90">
              {e.text}
              {typeof e.score === "number" && e.tag !== "SETTLED" ? <span className="ml-2 text-muted">[{e.score}]</span> : null}
            </span>
          </li>
        ))}
        {events.length === 0 && (
          <li className="px-1 py-6 text-center text-muted">
            {loading ? "Listening…" : "No decisions yet. Create an order and the agent's reasoning will stream here."}
            <span className="blink ml-1">▮</span>
          </li>
        )}
      </ol>
    </div>
  );
}
