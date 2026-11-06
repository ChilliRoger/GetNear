"use client";

import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      onClick={() => setLocale(locale === "en" ? "fr" : "en")}
      className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-xs transition-colors hover:bg-surface-hover"
      title={locale === "en" ? "Passer en français" : "Switch to English"}
    >
      <span>{locale === "en" ? "🇬🇧" : "🇫🇷"}</span>
      <span className="font-medium text-muted">{locale.toUpperCase()}</span>
    </button>
  );
}
