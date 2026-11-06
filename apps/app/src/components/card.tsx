interface CardProps {
  title: string;
  subtitle?: string;
  badge?: { label: React.ReactNode; color: "blue" | "green" | "amber" | "red" };
  children: React.ReactNode;
  className?: string;
}

const badgeColors = {
  blue: "bg-accent-blue/15 text-accent-blue",
  green: "bg-accent-green/15 text-accent-green",
  amber: "bg-accent-amber/15 text-accent-amber",
  red: "bg-accent-red/15 text-accent-red",
};

export function Card({ title, subtitle, badge, children, className = "" }: CardProps) {
  return (
    <div
      className={`card-glow rounded-xl border border-border bg-surface p-4 transition-all ${className}`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          )}
        </div>
        {badge && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColors[badge.color]}`}
          >
            {badge.label}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
