"use client";

import { useState, useEffect, useCallback } from "react";

const PRIVACY_API = "/api/privacy";

// ── Types ──────────────────────────────────────────────────────────

export interface PrivacyBalance {
  publicBalance: string;
  poolBalance: string;
  token: string;
}

export interface PrivacyTransaction {
  id: string;
  type: "deposit" | "withdraw" | "swap";
  amount: string;
  token: string;
  status: "pending" | "confirming" | "complete" | "failed";
  txHash?: string;
  timestamp: number;
}

export interface PrivacyStatus {
  connected: boolean;
  network: string;
  sidecarVersion?: string;
}

// ── usePrivacyBalances ─────────────────────────────────────────────

export function usePrivacyBalances(interval = 10000) {
  const [data, setData] = useState<PrivacyBalance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch(`${PRIVACY_API}/balances`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!controller.signal.aborted) {
          setData(Array.isArray(json) ? json : (json?.balances ?? []));
          setError(null);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Failed to fetch balances");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, interval);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [interval]);

  return { data, loading, error };
}

// ── usePrivacyTransactions ─────────────────────────────────────────

export function usePrivacyTransactions(interval = 5000) {
  const [data, setData] = useState<PrivacyTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch(`${PRIVACY_API}/transactions`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!controller.signal.aborted) {
          setData(Array.isArray(json) ? json : (json?.transactions ?? []));
          setError(null);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Failed to fetch transactions");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, interval);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [interval]);

  return { data, loading, error };
}

// ── usePrivacyStatus ───────────────────────────────────────────────

export function usePrivacyStatus() {
  const [data, setData] = useState<PrivacyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${PRIVACY_API}/health`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!controller.signal.aborted) {
          setData({
            connected: true,
            network: json.network || "base-sepolia",
            sidecarVersion: json.version,
          });
          setError(null);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setData({ connected: false, network: "base-sepolia" });
          setError(e instanceof Error ? e.message : "Privacy server unavailable");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => { controller.abort(); };
  }, []);

  return { data, loading, error };
}

// ── usePublicBalances ─────────────────────────────────────────────

import type { PublicBalancesResponse, ShieldedBalancesResponse, ShieldHistoryResponse } from "@meridian/shared";

export function usePublicBalances(interval = 10000) {
  const [data, setData] = useState<PublicBalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch(`${PRIVACY_API}/balances/public`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: PublicBalancesResponse = await res.json();
        if (!controller.signal.aborted) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Failed to fetch public balances");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, interval);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [interval, tick]);

  return { data, loading, error, refetch };
}

// ── useShieldedBalances ───────────────────────────────────────────

export function useShieldedBalances(interval = 10000) {
  const [data, setData] = useState<ShieldedBalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch(`${PRIVACY_API}/balances/shielded`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ShieldedBalancesResponse = await res.json();
        if (!controller.signal.aborted) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Failed to fetch shielded balances");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, interval);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [interval, tick]);

  return { data, loading, error, refetch };
}

// ── useShieldHistory ──────────────────────────────────────────────

export function useShieldHistory(interval = 8000) {
  const [data, setData] = useState<ShieldHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch(`${PRIVACY_API}/shield/history`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ShieldHistoryResponse = await res.json();
        if (!controller.signal.aborted) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Failed to fetch shield history");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, interval);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [interval, tick]);

  return { data, loading, error, refetch };
}
