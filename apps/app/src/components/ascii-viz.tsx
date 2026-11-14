"use client";

/** Mini bar series (SVG): used for deviation / score history. */
export function Spark({
  values,
  height = 36,
  className = "",
  color = "rgb(56 204 230)",
}: {
  values: number[];
  height?: number;
  className?: string;
  color?: string;
}) {
  if (values.length < 2) {
    return <div className={`flex items-center text-xs text-muted ${className}`} style={{ height }}>Collecting samples…</div>;
  }
  const max = Math.max(...values, 1e-9);
  const w = 100 / values.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(1.5, (v / max) * (height - 2));
        return <rect key={i} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} fill={color} opacity={0.35 + 0.65 * (i / values.length)} />;
      })}
    </svg>
  );
}

/** Horizontal meter with an optional threshold tick (e.g. score vs the 70 execute line). */
export function Meter({
  value,
  max = 100,
  threshold,
  tone = "brand",
  className = "",
}: {
  value: number;
  max?: number;
  threshold?: number;
  tone?: "brand" | "ok" | "warn" | "danger";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[tone];
  return (
    <div className={`relative h-1.5 w-full overflow-hidden rounded-full bg-border ${className}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`h-full rounded-full transition-[width] duration-700 ${fill}`} style={{ width: `${pct}%` }} />
      {threshold !== undefined && <span className="absolute top-0 h-full w-px bg-foreground/70" style={{ left: `${(threshold / max) * 100}%` }} />}
    </div>
  );
}

export interface Kpi {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "brand";
}

/** One bordered row of key figures with hairline dividers, like the stat bar on a trading terminal. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  const color = { default: "text-foreground", ok: "text-ok", warn: "text-warn", danger: "text-danger", brand: "text-brand" };
  return (
    <div className="grid grid-cols-2 divide-border rounded-lg border border-border bg-surface md:grid-cols-4 md:divide-x lg:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: items.length }}>
      {items.map((k, i) => (
        <div key={k.label} className={`px-4 py-3 ${i >= 2 ? "border-t border-border md:border-t-0" : ""} ${i % 2 === 1 ? "border-l border-border md:border-l-0" : ""}`}>
          <div className="text-[11px] text-muted">{k.label}</div>
          <div className={`num mt-1 text-lg font-semibold leading-none ${color[k.tone ?? "default"]}`}>{k.value}</div>
          {k.sub && <div className="mt-1.5 truncate text-[11px] text-muted">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}
