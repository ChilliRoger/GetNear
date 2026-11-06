"use client";

interface TabBarProps {
  activeTab: "public" | "private";
  onTabChange: (tab: "public" | "private") => void;
  publicLabel: string;
  privateLabel: string;
}

export function PrivacyTabBar({ activeTab, onTabChange, publicLabel, privateLabel }: TabBarProps) {
  return (
    <div className="flex rounded-xl border border-border bg-surface p-1">
      <button
        onClick={() => onTabChange("public")}
        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
          activeTab === "public"
            ? "bg-accent-blue/15 text-accent-blue shadow-sm"
            : "text-muted hover:text-foreground"
        }`}
      >
        {publicLabel}
      </button>
      <button
        onClick={() => onTabChange("private")}
        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
          activeTab === "private"
            ? "bg-purple-500/15 text-purple-400 shadow-sm"
            : "text-muted hover:text-foreground"
        }`}
      >
        <span className="flex items-center justify-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {privateLabel}
        </span>
      </button>
    </div>
  );
}
