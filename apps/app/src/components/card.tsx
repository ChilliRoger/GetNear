interface CardProps {
  title: string;
  subtitle?: string;
  badge?: { label: React.ReactNode; color: "blue" | "green" | "amber" | "red" };
  /** Optional controls rendered on the right of the header bar. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Remove body padding (tables, charts that bleed to the edges). */
  flush?: boolean;
}

const badgeColors = {
  blue: "bg-info/10 text-info",
  green: "bg-ok/10 text-ok",
  amber: "bg-warn/10 text-warn",
  red: "bg-danger/10 text-danger",
};

/** Terminal panel: hairline border, compact header bar with title + controls, body below. */
export function Card({ title, subtitle, badge, actions, children, className = "", flush = false }: CardProps) {
  return (
    <section className={`flex min-w-0 flex-col rounded-lg border border-border bg-surface ${className}`}>
      <header className="flex min-h-[44px] items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge && <span className={`rounded-sm px-2 py-0.5 text-[11px] font-medium ${badgeColors[badge.color]}`}>{badge.label}</span>}
          {actions}
        </div>
      </header>
      <div className={`min-h-0 flex-1 ${flush ? "" : "p-4"}`}>{children}</div>
    </section>
  );
}
