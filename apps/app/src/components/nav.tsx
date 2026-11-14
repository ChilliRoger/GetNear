"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LineChart, ArrowLeftRight, ShieldCheck, Settings } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const tabs = [
  { labelKey: "nav.dashboard", href: "/dashboard", Icon: LayoutDashboard },
  { labelKey: "nav.analytics", href: "/analytics", Icon: LineChart },
  { labelKey: "nav.trade", href: "/trade", Icon: ArrowLeftRight },
  { labelKey: "nav.approve", href: "/approve", Icon: ShieldCheck },
  { labelKey: "nav.settings", href: "/settings", Icon: Settings },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

/** Desktop: inline links in the header. The active page gets a ▔ rule and a lit glyph. */
export function DesktopNav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav className="hidden items-center md:flex" aria-label="Primary">
      {tabs.map(({ labelKey, href }, i) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
              active ? "text-brand" : "text-muted hover:text-foreground"
            }`}
          >
            <span className={`mr-1.5 ${active ? "text-brand" : "text-border-bright group-hover:text-muted"}`}>
              {String(i + 1).padStart(2, "0")}
            </span>
            {t(labelKey)}
            <span
              className={`absolute inset-x-3.5 -bottom-[13px] h-px transition-all ${
                active ? "bg-brand shadow-[0_0_10px_rgb(var(--brand))]" : "bg-transparent group-hover:bg-border-bright"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile: fixed bottom tab bar. */
export function Nav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-dashed border-border-bright bg-background/95 backdrop-blur md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-xl items-center justify-between px-1">
        {tabs.map(({ labelKey, href, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              isActive(href) ? "text-brand" : "text-muted"
            }`}
          >
            <Icon size={18} />
            {t(labelKey)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
