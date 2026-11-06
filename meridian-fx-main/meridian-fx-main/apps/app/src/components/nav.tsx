"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

const tabs = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: DashboardIcon },
  { labelKey: "nav.analytics", href: "/analytics", icon: AnalyticsIcon },
  { labelKey: "nav.trade", href: "/trade", icon: TradeIcon },
  { labelKey: "nav.approve", href: "/approve", icon: ApproveIcon },
  { labelKey: "nav.settings", href: "/settings", icon: SettingsIcon },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors min-h-[48px] justify-center ${
                isActive
                  ? "text-accent-blue"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <tab.icon active={isActive} />
              <span className={isActive ? "font-medium" : ""}>{t(tab.labelKey)}</span>
              {isActive && (
                <span className="absolute top-0 h-0.5 w-12 rounded-b bg-accent-blue" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={active ? "text-accent-blue" : "text-muted"}>
      <rect x="2" y="2" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="12" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="10" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ApproveIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={active ? "text-accent-blue" : "text-muted"}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TradeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={active ? "text-accent-blue" : "text-muted"}>
      <path d="M4 8l4-4m0 0l4 4M8 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12l-4 4m0 0l-4-4m4 4V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AnalyticsIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={active ? "text-accent-blue" : "text-muted"}>
      <path d="M3 17V9l3-3 4 4 4-6 3 3v10H3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13l3-3 4 4 4-6 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={active ? "text-accent-blue" : "text-muted"}>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2v2m0 12v2m-8-8h2m12 0h2M4.93 4.93l1.41 1.41m7.32 7.32l1.41 1.41M4.93 15.07l1.41-1.41m7.32-7.32l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
