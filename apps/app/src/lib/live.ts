"use client";

import { useEffect, useMemo, useState } from "react";

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
    // "loading" ends as soon as the request has failed, otherwise a down service looks like an endless spinner
    loading: (!ch || ch.updatedAt === 0) && !ch?.error,
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

// ── Browser-side live samples ──────────────────────────────────────────
// The recorded history comes from the oracle service. When it is not connected (for example the dashboard is
// deployed on its own), the chart still works: every live rate read is kept here (localStorage, last 24 h) and
// drawn instead. These are real quote/ECB readings taken while the page is open, not invented data.

const SAMPLE_KEY = "getnear_rate_samples_v1";
interface Sample {
  t: number; // seconds
  q: number;
  r: number;
}
let samples: Sample[] | null = null;

function loadSamples(): Sample[] {
  if (samples) return samples;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SAMPLE_KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as Sample[]) : [];
    samples = Array.isArray(parsed) ? parsed.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.q) && Number.isFinite(s.r)) : [];
  } catch {
    samples = [];
  }
  return samples;
}

function recordSample(t: number, q: number, r: number) {
  const list = loadSamples();
  const last = list[list.length - 1];
  if (last && t - last.t < 10) return;
  list.push({ t, q, r });
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600;
  while (list.length && (list[0].t < cutoff || list.length > 2880)) list.shift();
  try {
    localStorage.setItem(SAMPLE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: samples stay in memory for this visit */
  }
}

export function useOraclePrice() {
  const res = useLiveJson<PriceNow>("/api/oracle/prices/current", 15_000);
  const p = res.data?.["USDC/EURe"];
  const ts = p?.timestamp;
  const q = p?.quotePrice;
  const r = p?.refPrice;
  useEffect(() => {
    if (typeof ts === "number" && typeof q === "number" && typeof r === "number") recordSample(ts, q, r);
  }, [ts, q, r]);
  return res;
}

export function useHistory(hours: number) {
  const res = useLiveJson<{ points: HistoryPoint[] }>(`/api/oracle/prices/history?hours=${hours}`, 30_000);
  const price = useOraclePrice(); // keeps the browser-side samples growing
  const local = useMemo<HistoryPoint[]>(() => {
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    return loadSamples()
      .filter((s) => s.t >= since)
      .map((s) => ({ timestamp: s.t, quotePrice: s.q, refPrice: s.r, deviationBps: Math.round(((s.q - s.r) / s.r) * 10_000) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, price.updatedAt]);

  const fromOracle = (res.data?.points?.length ?? 0) >= 2;
  return {
    data: fromOracle ? res.data : { points: local },
    source: (fromOracle ? "oracle" : "browser") as "oracle" | "browser",
    error: res.error,
    loading: res.loading && local.length < 2,
    updatedAt: res.updatedAt,
  };
}
export const useFeed = () => useLiveJson<FeedPayload>("/api/agent/feed", 6_000);
