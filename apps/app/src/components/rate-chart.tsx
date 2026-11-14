"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useHistory, type HistoryPoint } from "@/lib/live";

const RANGES = [
  { label: "1H", hours: 1 },
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 168 },
];

const fmtTime = (ts: number, hours: number) => {
  const d = new Date(ts * 1000);
  return hours > 24
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
};

/** Average samples into at most `max` buckets so one noisy quote never draws a spike. */
function bucket(points: HistoryPoint[], max: number): HistoryPoint[] {
  if (points.length <= max) return points;
  const size = Math.ceil(points.length / max);
  const out: HistoryPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    const avg = (f: (p: HistoryPoint) => number) => chunk.reduce((a, p) => a + f(p), 0) / chunk.length;
    out.push({
      timestamp: Math.round(avg((p) => p.timestamp)),
      quotePrice: avg((p) => p.quotePrice),
      refPrice: avg((p) => p.refPrice),
      deviationBps: Math.round(avg((p) => p.deviationBps ?? 0)),
    });
  }
  return out;
}

/** 3-point moving average on the quote line: removes tick noise without hiding the trend. */
function smooth(points: HistoryPoint[]): HistoryPoint[] {
  if (points.length < 4) return points;
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)].quotePrice;
    const c = points[Math.min(points.length - 1, i + 1)].quotePrice;
    return { ...p, quotePrice: (a + p.quotePrice * 2 + c) / 4 };
  });
}

/** Dependency-free SVG line chart: 1Click dry quote vs ECB reference, with last-price tag and hover crosshair. */
export function RateChart({ height = 280, defaultHours = 24 }: { height?: number; defaultHours?: number }) {
  const [hours, setHours] = useState(defaultHours);
  const { data, error, loading, source } = useHistory(hours);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(() => setWidth(wrap.current?.clientWidth || 640));
    ro.observe(wrap.current);
    setWidth(wrap.current.clientWidth || 640);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 8, r: 64, t: 10, b: 24 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;

  const pts: HistoryPoint[] = useMemo(() => smooth(bucket(data?.points ?? [], Math.max(24, Math.floor(iw / 10)))), [data, iw]);

  const geo = useMemo(() => {
    if (pts.length < 2) return null;
    const vals = pts.flatMap((p) => [p.quotePrice, p.refPrice]).filter((v) => Number.isFinite(v));
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const MIN_SPAN = 0.002;
    const span2 = Math.max(max - min, MIN_SPAN);
    const mid = (max + min) / 2;
    min = mid - span2 / 2 - span2 * 0.1;
    max = mid + span2 / 2 + span2 * 0.1;
    const t0 = pts[0].timestamp;
    const t1 = pts[pts.length - 1].timestamp;
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * iw;
    const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * ih;
    const line = (key: "quotePrice" | "refPrice") =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.timestamp).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
    const q = line("quotePrice");
    const area = `${q} L${x(t1).toFixed(1)},${pad.t + ih} L${x(t0).toFixed(1)},${pad.t + ih} Z`;
    return { min, max, x, y, q, r: line("refPrice"), area, t0, t1 };
  }, [pts, iw, ih, pad.l, pad.t]);

  const hp = hover !== null && pts[hover] ? pts[hover] : null;
  const last = pts[pts.length - 1];
  const first = pts[0];
  const change = last && first ? ((last.quotePrice - first.quotePrice) / first.quotePrice) * 100 : 0;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo || !pts.length) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(geo.x(pts[i].timestamp) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    setHover(best);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="num text-2xl font-semibold leading-none">{last ? last.quotePrice.toFixed(4) : "--"}</span>
          <span className={`num text-xs font-medium ${change >= 0 ? "text-ok" : "text-danger"}`}>
            {last ? `${change >= 0 ? "+" : ""}${change.toFixed(3)}%` : ""}
          </span>
          <span className="hidden items-center gap-3 text-[11px] text-muted sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-brand" /> 1Click dry quote
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-info" /> ECB reference
            </span>
          </span>
        </div>
        <div className="flex rounded-md border border-border-bright bg-surface-2 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setHours(r.hours)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                hours === r.hours ? "bg-border-bright text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrap} className="relative w-full" style={{ height }}>
        {geo ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="USDC to EURe quote versus ECB reference rate"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            className="touch-none select-none"
          >
            <defs>
              <linearGradient id="rc-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgb(34 197 94)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="rgb(34 197 94)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const v = geo.max - f * (geo.max - geo.min);
              const yy = pad.t + f * ih;
              return (
                <g key={f}>
                  <line x1={pad.l} x2={width - pad.r} y1={yy} y2={yy} stroke="rgb(28 46 36)" />
                  <text x={width - pad.r + 8} y={yy + 3.5} fontSize="10" fill="rgb(160 168 163)" className="num">
                    {v.toFixed(4)}
                  </text>
                </g>
              );
            })}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const t = geo.t0 + f * (geo.t1 - geo.t0);
              return (
                <text key={f} x={geo.x(t)} y={height - 6} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} fontSize="10" fill="rgb(160 168 163)" className="num">
                  {fmtTime(t, hours)}
                </text>
              );
            })}

            <path d={geo.area} fill="url(#rc-fill)" />
            <path d={geo.r} fill="none" stroke="rgb(190 200 195)" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.8" />
            <path d={geo.q} fill="none" stroke="rgb(34 197 94)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />

            {/* last-price tag on the right axis */}
            {last && (
              <g>
                <line x1={pad.l} x2={width - pad.r} y1={geo.y(last.quotePrice)} y2={geo.y(last.quotePrice)} stroke="rgb(34 197 94)" strokeOpacity="0.45" strokeDasharray="2 3" />
                <rect x={width - pad.r + 2} y={geo.y(last.quotePrice) - 9} width={pad.r - 4} height="18" rx="3" fill="rgb(34 197 94)" />
                <text x={width - pad.r + 8} y={geo.y(last.quotePrice) + 3.5} fontSize="10" fontWeight="600" fill="rgb(4 6 5)" className="num">
                  {last.quotePrice.toFixed(4)}
                </text>
              </g>
            )}

            {hp && (
              <g>
                <line x1={geo.x(hp.timestamp)} x2={geo.x(hp.timestamp)} y1={pad.t} y2={pad.t + ih} stroke="rgb(244 242 240)" strokeOpacity="0.35" strokeDasharray="2 3" />
                <circle cx={geo.x(hp.timestamp)} cy={geo.y(hp.quotePrice)} r="3.5" fill="rgb(4 6 5)" stroke="rgb(34 197 94)" strokeWidth="1.5" />
                <circle cx={geo.x(hp.timestamp)} cy={geo.y(hp.refPrice)} r="3.5" fill="rgb(4 6 5)" stroke="rgb(190 200 195)" strokeWidth="1.5" />
              </g>
            )}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border-bright text-xs text-muted">
            {loading ? "Loading rate history…" : error ? "Collecting live samples: the history service is not connected (updates every 15 s)" : "Collecting samples…"}
          </div>
        )}

        {source === "browser" && geo && (
          <p className="pointer-events-none absolute left-2 top-0 text-[10px] text-muted">Live samples from this browser (history service not connected)</p>
        )}

        {hp && geo && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border-bright bg-background/95 px-3 py-2 text-[11px] leading-5 shadow-pop"
            style={{ left: Math.min(Math.max(geo.x(hp.timestamp) + 12, 4), width - pad.r - 168), top: 6 }}
          >
            <div className="text-muted">{new Date(hp.timestamp * 1000).toLocaleString()}</div>
            <div className="num flex justify-between gap-6">
              <span className="text-brand">Quote</span> {hp.quotePrice.toFixed(5)}
            </div>
            <div className="num flex justify-between gap-6">
              <span className="text-info">ECB</span> {hp.refPrice.toFixed(5)}
            </div>
            <div className={`num flex justify-between gap-6 ${Math.abs(hp.deviationBps ?? 0) > 120 ? "text-warn" : "text-ok"}`}>
              <span>Deviation</span> {hp.deviationBps ?? 0} bps
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
