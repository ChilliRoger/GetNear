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

/** Desktop: inline links in the header. */
export function DesktopNav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
      {tabs.map(({ labelKey, href, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive(href)
              ? "bg-brand/10 text-brand"
              : "text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          <Icon size={16} />
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}

/** Mobile: fixed bottom tab bar. */
export function Nav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-xl items-center justify-between px-1">
        {tabs.map(({ labelKey, href, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              isActive(href) ? "text-brand" : "text-muted"
            }`}
          >
            <Icon size={20} />
            {t(labelKey)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
