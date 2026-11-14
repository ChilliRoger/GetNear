import type { ElementType } from "react";

interface CardProps {
  title: string;
  subtitle?: string;
  badge?: { label: React.ReactNode; color: "blue" | "green" | "amber" | "red" };
  /** Optional controls rendered on the right of the header. */
  actions?: React.ReactNode;
  /** Optional lucide icon shown in a small chip before the title. */
  icon?: ElementType;
  children: React.ReactNode;
  className?: string;
  /** Let the body run edge to edge (tables). */
  flush?: boolean;
}

const badgeColors = {
  blue: "bg-brand/15 text-brand",
  green: "bg-ok/15 text-ok",
  amber: "bg-warn/15 text-warn",
  red: "bg-danger/15 text-danger",
};

/** Bento card: 2px bright border, hard offset shadow, rounded corners. */
export function Card({ title, subtitle, badge, actions, icon: Icon, children, className = "", flush = false }: CardProps) {
  return (
    <section className={`min-w-0 rounded-2xl border-2 border-brand bg-surface p-5 shadow-brutal ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="chip-icon">
              <Icon size={18} />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold leading-6 text-foreground">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs leading-5 text-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badgeColors[badge.color]}`}>{badge.label}</span>}
          {actions}
        </div>
      </header>
      <div className={flush ? "-mx-5 -mb-5 overflow-hidden rounded-b-2xl" : ""}>{children}</div>
    </section>
  );
}
