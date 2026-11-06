"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchBalances, fetchPolicy, fetchPendingTrades, fetchTreasuryBalances, type ActivePendingTrade } from "./contracts";

// Consecutive failure threshold before slowing polling to 60s
const FAILURE_THRESHOLD = 3;
const SLOW_INTERVAL = 60000;

export function useBalances(interval = 15000) {
  const [data, setData] = useState<{
    usdcBal: bigint | null;
    eurcBal: bigint | null;
  }>({ usdcBal: null, eurcBal: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const failCount = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchBalances();
      setData({ usdcBal: result.usdcBal, eurcBal: result.eurcBal });
      setError(null);
      failCount.current = 0;
    } catch (e) {
      failCount.current++;
      const msg = e instanceof Error ? e.message : "Failed to fetch balances";
      console.warn("Failed to fetch balances:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      await load();
      if (!cancelled) {
        const effectiveInterval = failCount.current >= FAILURE_THRESHOLD ? SLOW_INTERVAL : interval;
        timeoutRef.current = setTimeout(poll, effectiveInterval);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [load, interval]);

  return { ...data, loading, error };
}

export function usePolicy(interval = 30000) {
  const [data, setData] = useState<{
    threshold: bigint | null;
    rateMin: bigint | null;
    rateMax: bigint | null;
    version: bigint | null;
  }>({ threshold: null, rateMin: null, rateMax: null, version: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const failCount = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchPolicy();
      setData(result);
      setError(null);
      failCount.current = 0;
    } catch (e) {
      failCount.current++;
      const msg = e instanceof Error ? e.message : "Failed to fetch policy";
      console.warn("Failed to fetch policy:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      await load();
      if (!cancelled) {
        const effectiveInterval = failCount.current >= FAILURE_THRESHOLD ? SLOW_INTERVAL : interval;
        timeoutRef.current = setTimeout(poll, effectiveInterval);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [load, interval]);

  return { ...data, loading, error };
}

export function usePendingTrades(interval = 10000) {
  const [trades, setTrades] = useState<ActivePendingTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const failCount = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchPendingTrades();
      setTrades(result);
      setError(null);
      failCount.current = 0;
    } catch (e) {
      failCount.current++;
      const msg = e instanceof Error ? e.message : "Failed to fetch pending trades";
      console.warn("Failed to fetch pending trades:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      await load();
      if (!cancelled) {
        const effectiveInterval = failCount.current >= FAILURE_THRESHOLD ? SLOW_INTERVAL : interval;
        timeoutRef.current = setTimeout(poll, effectiveInterval);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [load, interval]);

  return { trades, loading, error };
}

export function useTreasuryBalances(interval = 15000) {
  const [data, setData] = useState<{
    usdcBal: bigint | null;
    eurcBal: bigint | null;
  }>({ usdcBal: null, eurcBal: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const failCount = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchTreasuryBalances();
      setData({ usdcBal: result.usdcBal, eurcBal: result.eurcBal });
      setError(null);
      failCount.current = 0;
    } catch (e) {
      failCount.current++;
      const msg = e instanceof Error ? e.message : "Failed to fetch treasury balances";
      console.warn("Failed to fetch treasury balances:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      await load();
      if (!cancelled) {
        const effectiveInterval = failCount.current >= FAILURE_THRESHOLD ? SLOW_INTERVAL : interval;
        timeoutRef.current = setTimeout(poll, effectiveInterval);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [load, interval]);

  return { ...data, loading, error };
}
