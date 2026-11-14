interface CardProps {
  title: string;
  subtitle?: string;
  badge?: { label: React.ReactNode; color: "blue" | "green" | "amber" | "red" };
  children: React.ReactNode;
  className?: string;
}

const badgeColors = {
  blue: "bg-info/10 text-info ring-info/25",
  green: "bg-brand/10 text-brand ring-brand/25",
  amber: "bg-warn/10 text-warn ring-warn/30",
  red: "bg-danger/10 text-danger ring-danger/25",
};

export function Card({ title, subtitle, badge, children, className = "" }: CardProps) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface p-5 shadow-card transition-colors ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {badge && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${badgeColors[badge.color]}`}
          >
            {badge.label}
          </span>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}
