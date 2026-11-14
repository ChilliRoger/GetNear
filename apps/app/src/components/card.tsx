interface CardProps {
  title: string;
  subtitle?: string;
  badge?: { label: React.ReactNode; color: "blue" | "green" | "amber" | "red" };
  children: React.ReactNode;
  className?: string;
}

const badgeColors = {
  blue: "border-info/50 text-info",
  green: "border-ok/50 text-ok",
  amber: "border-warn/50 text-warn",
  red: "border-danger/50 text-danger",
};

/** Dashed-frame panel with the title "cut into" the top rule, like a terminal window. */
export function Card({ title, subtitle, badge, children, className = "" }: CardProps) {
  return (
    <section className={`relative border border-dashed border-border-bright bg-surface/70 p-5 pt-6 backdrop-blur-sm ${className}`}>
      <div className="absolute -top-[9px] left-4 flex items-center gap-2 bg-background px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
        <span className="text-border-bright">▸</span>
        {title}
      </div>
      {badge && (
        <span
          className={`absolute -top-[10px] right-4 border bg-background px-2 py-px text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeColors[badge.color]}`}
        >
          {badge.label}
        </span>
      )}
      {subtitle && <p className="mb-4 text-[11px] leading-relaxed text-muted">{subtitle}</p>}
      <div>{children}</div>
    </section>
  );
}
