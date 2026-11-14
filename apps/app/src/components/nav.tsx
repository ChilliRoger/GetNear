"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

const tabs = [
  { id: "01", labelKey: "nav.dashboard", href: "/dashboard" },
  { id: "02", labelKey: "nav.analytics", href: "/analytics" },
  { id: "03", labelKey: "nav.trade", href: "/trade" },
  { id: "04", labelKey: "nav.approve", href: "/approve" },
  { id: "05", labelKey: "nav.settings", href: "/settings" },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[#090a0f] select-none font-mono">
      <div className="mx-auto flex max-w-xl items-center justify-between px-2">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center py-2.5 text-[11px] transition-colors border-t-2 ${
                isActive
                  ? "border-[#00ec97] bg-[#11131b] text-[#00ec97]"
                  : "border-transparent text-muted hover:text-foreground hover:bg-surface/50"
              }`}
            >
              <div className="flex items-center gap-1 font-semibold tracking-wider">
                <span className={isActive ? "text-[#00ec97]" : "text-muted/60"}>
                  {tab.id}
                </span>
                <span>{t(tab.labelKey).toUpperCase()}</span>
              </div>
              <span className="text-[9px] text-muted/60">
                {isActive ? "[ACTIVE]" : "······"}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
