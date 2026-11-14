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

/** Dependency-free SVG line chart: 1Click dry quote vs ECB reference, with a hover crosshair. */
export function RateChart({ height = 280, defaultHours = 24 }: { height?: number; defaultHours?: number }) {
  const [hours, setHours] = useState(defaultHours);
  const { data, error, loading } = useHistory(hours);
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

  const pts: HistoryPoint[] = useMemo(() => data?.points ?? [], [data]);
  const pad = { l: 58, r: 14, t: 12, b: 26 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;

  const geo = useMemo(() => {
    if (pts.length < 2) return null;
    const vals = pts.flatMap((p) => [p.quotePrice, p.refPrice]).filter((v) => Number.isFinite(v));
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const span = max - min || 0.0005;
    min -= span * 0.15;
    max += span * 0.15;
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

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo || !pts.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
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
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.14em] text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-[2px] w-5 bg-brand" /> 1Click dry quote
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-5 border-t-2 border-dashed border-info" /> ECB reference
          </span>
        </div>
        <div className="flex border border-border-bright">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setHours(r.hours)}
              className={`px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] transition-colors ${
                hours === r.hours ? "bg-brand text-background" : "text-muted hover:text-foreground"
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
                <stop offset="0%" stopColor="rgb(63 230 255)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="rgb(63 230 255)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* dashed grid + y labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const v = geo.max - f * (geo.max - geo.min);
              const yy = pad.t + f * ih;
              return (
                <g key={f}>
                  <line x1={pad.l} x2={width - pad.r} y1={yy} y2={yy} stroke="rgb(66 72 112)" strokeDasharray="3 5" strokeOpacity="0.7" />
                  <text x={pad.l - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="rgb(143 148 184)">
                    {v.toFixed(4)}
                  </text>
                </g>
              );
            })}
            {/* x labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const t = geo.t0 + f * (geo.t1 - geo.t0);
              return (
                <text key={f} x={geo.x(t)} y={height - 6} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} fontSize="10" fill="rgb(143 148 184)">
                  {fmtTime(t, hours)}
                </text>
              );
            })}

            <path d={geo.area} fill="url(#rc-fill)" />
            <path d={geo.r} fill="none" stroke="rgb(138 150 255)" strokeWidth="1.5" strokeDasharray="5 4" />
            <path d={geo.q} fill="none" stroke="rgb(63 230 255)" strokeWidth="2" strokeLinejoin="round" />

            {/* latest marker */}
            {last && (
              <g>
                <circle cx={geo.x(last.timestamp)} cy={geo.y(last.quotePrice)} r="8" fill="rgb(63 230 255)" opacity="0.18">
                  <animate attributeName="r" values="4;11;4" dur="2.2s" repeatCount="indefinite" />
                </circle>
                <circle cx={geo.x(last.timestamp)} cy={geo.y(last.quotePrice)} r="3.5" fill="rgb(63 230 255)" />
              </g>
            )}

            {/* hover crosshair */}
            {hp && (
              <g>
                <line x1={geo.x(hp.timestamp)} x2={geo.x(hp.timestamp)} y1={pad.t} y2={pad.t + ih} stroke="rgb(232 232 242)" strokeOpacity="0.5" strokeDasharray="2 3" />
                <circle cx={geo.x(hp.timestamp)} cy={geo.y(hp.quotePrice)} r="4" fill="rgb(5 6 15)" stroke="rgb(63 230 255)" strokeWidth="2" />
                <circle cx={geo.x(hp.timestamp)} cy={geo.y(hp.refPrice)} r="4" fill="rgb(5 6 15)" stroke="rgb(138 150 255)" strokeWidth="2" />
              </g>
            )}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center border border-dashed border-border-bright text-xs uppercase tracking-[0.18em] text-muted">
            {loading ? "Loading rate history…" : error ? "Oracle offline: no history" : "Collecting samples…"}
          </div>
        )}

        {/* tooltip */}
        {hp && geo && (
          <div
            className="pointer-events-none absolute z-10 border border-border-bright bg-background/95 px-3 py-2 text-[11px] leading-5 shadow-pop"
            style={{ left: Math.min(Math.max(geo.x(hp.timestamp) + 12, 4), width - 190), top: 8 }}
          >
            <div className="text-muted">{new Date(hp.timestamp * 1000).toLocaleString()}</div>
            <div>
              <span className="text-brand">QUOTE</span> {hp.quotePrice.toFixed(5)}
            </div>
            <div>
              <span className="text-info">ECB&nbsp;&nbsp;</span> {hp.refPrice.toFixed(5)}
            </div>
            <div className={hp.deviationBps !== null && Math.abs(hp.deviationBps) > 120 ? "text-warn" : "text-ok"}>
              DEV&nbsp;&nbsp; {hp.deviationBps ?? 0} bps
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
