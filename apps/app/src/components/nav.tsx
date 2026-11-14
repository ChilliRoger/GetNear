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

/** Desktop header navigation: active page is a raised, bordered button. */
export function DesktopNav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
      {tabs.map(({ labelKey, href }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border-2 px-3 py-1 text-[13px] font-bold transition-all ${
              active
                ? "border-brand bg-black text-foreground shadow-brutal-xs"
                : "border-transparent text-muted hover:border-border-bright hover:text-foreground"
            }`}
          >
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile bottom tab bar. */
export function Nav() {
  const isActive = useActive();
  const { t } = useI18n();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-brand bg-black/95 backdrop-blur md:hidden" aria-label="Primary">
      <div className="mx-auto flex max-w-xl items-center justify-between px-1">
        {tabs.map(({ labelKey, href, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${
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
