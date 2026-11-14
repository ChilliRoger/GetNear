"use client";

const BLOCKS = "▁▂▃▄▅▆▇█";

/** Block-character sparkline, e.g. ▂▃▅▇█▆▄. */
export function Spark({ values, className = "" }: { values: number[]; className?: string }) {
  if (values.length < 2) return <span className={`text-muted ${className}`}>········</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (
    <span className={`tracking-[-0.05em] ${className}`} aria-hidden="true">
      {values.map((v) => BLOCKS[Math.min(7, Math.floor(((v - min) / span) * 7.999))]).join("")}
    </span>
  );
}

/** Text meter: [██████░░░░░░] 62 with a threshold tick. */
export function Meter({
  value,
  max = 100,
  width = 24,
  threshold,
  tone = "brand",
}: {
  value: number;
  max?: number;
  width?: number;
  threshold?: number;
  tone?: "brand" | "ok" | "warn" | "danger";
}) {
  const filled = Math.round((Math.max(0, Math.min(max, value)) / max) * width);
  const tick = threshold !== undefined ? Math.round((threshold / max) * width) : -1;
  const color = { brand: "text-brand", ok: "text-ok", warn: "text-warn", danger: "text-danger" }[tone];
  const cells = Array.from({ length: width }, (_, i) => {
    if (i === tick) return "┃";
    return i < filled ? "█" : "░";
  });
  return (
    <span className="whitespace-pre" aria-label={`${value} of ${max}`}>
      <span className="text-muted">[</span>
      <span className={color}>{cells.join("")}</span>
      <span className="text-muted">]</span>
    </span>
  );
}

/** Label / value / caption stat used in dashboards. */
export function Stat({
  label,
  value,
  caption,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "brand";
}) {
  const color = { default: "text-foreground", ok: "text-ok", warn: "text-warn", danger: "text-danger", brand: "text-brand" }[tone];
  return (
    <div className="border border-dashed border-border-bright bg-surface/50 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-semibold leading-none ${color}`}>{value}</div>
      {caption && <div className="mt-2 text-[11px] text-muted">{caption}</div>}
    </div>
  );
}
