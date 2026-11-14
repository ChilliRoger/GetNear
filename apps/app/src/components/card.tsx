interface CardProps {
  title: string;
  subtitle?: string;
  badge?: { label: React.ReactNode; color: "blue" | "green" | "amber" | "red" };
  children: React.ReactNode;
  className?: string;
}

const badgeColors = {
  blue: "border-[#38bdf8] text-[#38bdf8] bg-[#38bdf8]/10",
  green: "border-[#00ec97] text-[#00ec97] bg-[#00ec97]/10",
  amber: "border-amber-400 text-amber-400 bg-amber-400/10",
  red: "border-red-400 text-red-400 bg-red-400/10",
};

export function Card({ title, subtitle, badge, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-none border border-border bg-surface p-4 transition-colors font-mono hover:border-border-bright ${className}`}
    >
      <div className="mb-3 flex items-start justify-between border-b border-border/60 pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[#00ec97] text-xs">┌─</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              [ {title} ]
            </h3>
          </div>
          {subtitle && (
            <p className="mt-1 text-[11px] text-muted pl-4">
              {subtitle}
            </p>
          )}
        </div>
        {badge && (
          <span
            className={`border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${badgeColors[badge.color]}`}
          >
            {badge.label}
          </span>
        )}
      </div>
      <div className="pt-1">{children}</div>
    </div>
  );
}
