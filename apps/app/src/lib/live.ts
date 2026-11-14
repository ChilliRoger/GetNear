"use client";

import { useEffect, useState } from "react";

interface Channel {
  data: unknown;
  error: boolean;
  updatedAt: number;
  subs: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  inflight: boolean;
}

const channels = new Map<string, Channel>();

async function pull(url: string, ch: Channel) {
  if (ch.inflight) return;
  ch.inflight = true;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    ch.data = await res.json();
    ch.error = false;
    ch.updatedAt = Date.now();
  } catch {
    ch.error = true;
  } finally {
    ch.inflight = false;
    ch.subs.forEach((fn) => fn());
  }
}

/**
 * Poll a JSON endpoint. All components that ask for the same URL share ONE timer and one request,
 * so the ticker, chart and feed never multiply traffic.
 */
export function useLiveJson<T>(url: string, intervalMs = 10_000) {
  const [, force] = useState(0);

  useEffect(() => {
    let ch = channels.get(url);
    if (!ch) {
      ch = { data: undefined, error: false, updatedAt: 0, subs: new Set(), timer: null, inflight: false };
      channels.set(url, ch);
    }
    const rerender = () => force((n) => n + 1);
    ch.subs.add(rerender);
    if (!ch.timer) {
      void pull(url, ch);
      ch.timer = setInterval(() => void pull(url, ch!), intervalMs);
    } else {
      rerender();
    }
    return () => {
      ch!.subs.delete(rerender);
      if (ch!.subs.size === 0 && ch!.timer) {
        clearInterval(ch!.timer);
        ch!.timer = null;
      }
    };
  }, [url, intervalMs]);

  const ch = channels.get(url);
  return {
    data: ch?.data as T | undefined,
    error: ch?.error ?? false,
    updatedAt: ch?.updatedAt ?? 0,
    loading: !ch || ch.updatedAt === 0,
  };
}

// ── Typed endpoints ────────────────────────────────────────────────────

export interface PriceNow {
  "USDC/EURe"?: { quotePrice: number; refPrice: number; deviationBps: number; timestamp: number };
}

export interface HistoryPoint {
  timestamp: number;
  quotePrice: number;
  refPrice: number;
  deviationBps: number | null;
}

export interface FeedEvent {
  id: string;
  ts: number; // ms
  tag: "WAIT" | "EXECUTE" | "SETTLED" | "FAILED" | "INFO" | "SCORE";
  text: string;
  score?: number;
  href?: string;
}

export interface FeedPayload {
  online: boolean;
  agent: { lastStatus?: string; strategyMode?: string; totalChunksExecuted?: number; isRunning?: boolean } | null;
  events: FeedEvent[];
}

export const useOraclePrice = () => useLiveJson<PriceNow>("/api/oracle/prices/current", 15_000);
export const useHistory = (hours: number) =>
  useLiveJson<{ points: HistoryPoint[] }>(`/api/oracle/prices/history?hours=${hours}`, 30_000);
export const useFeed = () => useLiveJson<FeedPayload>("/api/agent/feed", 6_000);
