"use client";

import Link from "next/link";
import { MeridianLogo } from "@/components/meridian-logo";
import { SavingsCalculator } from "@/components/savings-calculator";
import { TerminalReplay } from "@/components/terminal-replay";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/lib/i18n";

/* ─── Sponsor data (name/letter/gradient are brand, i18n keys for role/chain) ─── */
const sponsors = [
  { name: "Uniswap", letter: "U", gradient: "from-[#ff007a] to-[#ff5ca0]", roleKey: "landing.sponsor_uniswap_role", chainKey: "landing.sponsor_uniswap_chain" },
  { name: "Chainlink CRE", letter: "C", gradient: "from-[#375bd2] to-[#5a8dee]", roleKey: "landing.sponsor_chainlink_role", chainKey: "landing.sponsor_chainlink_chain" },
  { name: "Arc (Circle)", letter: "A", gradient: "from-[#00d4aa] to-[#00f5c4]", roleKey: "landing.sponsor_arc_role", chainKey: "landing.sponsor_arc_chain" },
  { name: "World ID", letter: "W", gradient: "from-[#1a1a2e] to-[#4a4a6a]", roleKey: "landing.sponsor_worldid_role", chainKey: "landing.sponsor_worldid_chain" },
  { name: "Base", letter: "B", gradient: "from-[#0052ff] to-[#3377ff]", roleKey: "landing.sponsor_base_role", chainKey: "landing.sponsor_base_chain" },
];

const steps = [
  { num: "01", titleKey: "landing.step_monitor", descKey: "landing.step_monitor_desc", tag: "UNISWAP" },
  { num: "02", titleKey: "landing.step_decide", descKey: "landing.step_decide_desc", tag: "CHAINLINK CRE" },
  { num: "03", titleKey: "landing.step_execute", descKey: "landing.step_execute_desc", tag: "BASE + WORLD ID" },
  { num: "04", titleKey: "landing.step_log", descKey: "landing.step_log_desc", tag: "ARC" },
];

export default function LandingPage() {
  const { t } = useI18n();
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ─── Background texture ─── */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Radial glow from top */}
        <div
          className="absolute -top-[40%] left-1/2 h-[800px] w-[800px] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse, rgba(0,212,170,0.06) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* ─── Navigation ─── */}
      <nav className="relative z-10 border-b border-white/[0.04]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <MeridianLogo size={36} cropped />
            <div>
              <span className="text-sm font-semibold tracking-tight">
                Meridian
              </span>
              <span className="ml-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#00d4aa]/60">
                FX
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs text-muted sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00d4aa] shadow-[0_0_6px_rgba(0,212,170,0.5)]" />
              {t("landing.agent_active")}
            </span>
            <LanguageToggle />
            <a
              href="https://dev.omnipass.world"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white/5 px-4 py-2.5 text-xs font-medium text-white/70 ring-1 ring-inset ring-white/10 transition-all hover:bg-white/10 hover:text-white/90 hover:ring-white/20 min-h-[44px] flex items-center"
            >
              Oracle Inspector
            </a>
            <Link
              href="/dashboard"
              className="rounded-lg bg-[#00d4aa]/10 px-4 py-2.5 text-xs font-medium text-[#00d4aa] ring-1 ring-inset ring-[#00d4aa]/20 transition-all hover:bg-[#00d4aa]/20 hover:ring-[#00d4aa]/40 min-h-[44px] flex items-center"
            >
              {t("landing.btn_launch")}
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════
          HERO SECTION
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 px-6 pb-20 pt-20 sm:pb-28 sm:pt-28">
        <div className="mx-auto max-w-4xl">
          {/* Eyebrow */}
          <div className="mb-6 flex items-center gap-3">
            <span className="rounded-full bg-[#00d4aa]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#00d4aa] ring-1 ring-inset ring-[#00d4aa]/20">
              {t("landing.eyebrow_event")}
            </span>
            <span className="text-xs text-muted/60">
              {t("landing.eyebrow_powered")}
            </span>
          </div>

          {/* Main headline */}
          <h1 className="text-[clamp(2.25rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-tight">
            {t("landing.hero_h1_1")}
            <br />
            <span className="bg-gradient-to-r from-[#00d4aa] via-[#00e8bd] to-[#00d4aa] bg-clip-text text-transparent">
              {t("landing.hero_h1_2")}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            {t("landing.hero_desc")}
          </p>

          {/* CTA row */}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/dashboard"
              className="group relative inline-flex items-center gap-2 rounded-xl bg-[#00d4aa] px-6 py-3.5 text-sm font-semibold text-[#0a0a0a] shadow-[0_0_24px_rgba(0,212,170,0.25)] transition-all hover:shadow-[0_0_40px_rgba(0,212,170,0.4)]"
            >
              {t("landing.btn_launch")}
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
            <a
              href="https://github.com/meridian-fx/meridian-fx"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-medium text-muted ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.03] hover:text-foreground"
            >
              {t("landing.btn_source")}
              <svg
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] sm:grid-cols-4">
            {[
              { valueKey: "landing.stats_value_fees", labelKey: "landing.stats_label_fees" },
              { valueKey: "landing.stats_value_fee", labelKey: "landing.stats_label_fee" },
              { valueKey: "landing.stats_value_ops", labelKey: "landing.stats_label_ops" },
              { valueKey: "landing.stats_value_settle", labelKey: "landing.stats_label_settle" },
            ].map((stat) => (
              <div
                key={stat.labelKey}
                className="border-r border-b border-white/[0.04] px-5 py-5 last:border-r-0 sm:[&:nth-child(n+3)]:border-b-0 [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r"
              >
                <div className="font-[family-name:var(--font-geist-mono)] text-xl font-bold tracking-tight text-[#00d4aa] sm:text-2xl">
                  {t(stat.valueKey)}
                </div>
                <div className="mt-1 text-[11px] leading-tight text-muted">
                  {t(stat.labelKey)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          ARCHITECTURE DIAGRAM
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.04] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="font-[family-name:var(--font-geist-mono)] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00d4aa]/60">
              {t("landing.arch_section")}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {t("landing.arch_title")}
            </h2>
          </div>

          {/* ASCII-style system diagram */}
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-6 sm:p-10">
            <div className="mx-auto min-w-[600px] max-w-3xl font-[family-name:var(--font-geist-mono)] text-[11px] leading-relaxed sm:text-xs">
              {/* Row 1: CFO trigger */}
              <div className="mb-1 text-center text-muted/60">
                {"┌─────────────────────────────────────────────────────────────────────┐"}
              </div>
              <div className="mb-1 flex items-center justify-center text-muted/60">
                <span>{"│"}</span>
                <span className="flex-1 text-center text-muted">
                  {t("landing.arch_flow_title")}
                </span>
                <span>{"│"}</span>
              </div>
              <div className="mb-4 text-center text-muted/60">
                {"└─────────────────────────────────────────────────────────────────────┘"}
              </div>

              {/* CFO Node */}
              <div className="flex items-center justify-center gap-2">
                <span className="text-muted/60">{"     "}</span>
                <span className="rounded border border-white/10 bg-white/[0.03] px-3 py-1">
                  <span className="text-foreground">{t("landing.arch_cfo")}</span>
                </span>
              </div>
              <div className="text-center text-muted/50">
                {"           │"}
              </div>
              <div className="text-center text-[10px] text-muted/60">
                {t("landing.arch_sets_policy")}
              </div>
              <div className="text-center text-muted/50">
                {"           ▼"}
              </div>

              {/* Meridian Agent */}
              <div className="my-2 flex items-center justify-center">
                <span className="rounded-lg border border-[#00d4aa]/30 bg-[#00d4aa]/[0.06] px-5 py-2.5 text-center shadow-[0_0_20px_rgba(0,212,170,0.08)]">
                  <span className="font-bold text-[#00d4aa]">
                    {t("landing.arch_agent")}
                  </span>
                  <br />
                  <span className="text-[10px] text-[#00d4aa]/60">
                    {t("landing.arch_agent_sub")}
                  </span>
                </span>
              </div>

              {/* Three output branches */}
              <div className="text-center text-muted/50">
                {"      ┌──────────┼──────────┐"}
              </div>
              <div className="text-center text-muted/50">
                {"      │          │          │"}
              </div>
              <div className="text-center text-muted/50">
                {"      ▼          ▼          ▼"}
              </div>

              {/* Three destination nodes */}
              <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                <div className="rounded border border-[#ff007a]/20 bg-[#ff007a]/[0.04] px-2 py-2">
                  <span className="font-semibold text-[#ff5ca0]">
                    {t("landing.arch_uniswap")}
                  </span>
                  <br />
                  <span className="text-[10px] text-muted/60">
                    {t("landing.arch_uniswap_desc")}
                  </span>
                </div>
                <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">
                  <span className="font-semibold text-foreground/80">
                    {t("landing.arch_world")}
                  </span>
                  <br />
                  <span className="text-[10px] text-muted/60">
                    {t("landing.arch_world_desc")}
                  </span>
                </div>
                <div className="rounded border border-[#00d4aa]/20 bg-[#00d4aa]/[0.04] px-2 py-2">
                  <span className="font-semibold text-[#00d4aa]">
                    {t("landing.arch_arc")}
                  </span>
                  <br />
                  <span className="text-[10px] text-muted/60">
                    {t("landing.arch_arc_desc")}
                  </span>
                </div>
              </div>

              {/* Execution layer */}
              <div className="mt-4 text-center text-muted/50">
                {"      └──────────┴──────────┘"}
              </div>
              <div className="text-center text-muted/50">{"           │"}</div>
              <div className="text-center text-muted/50">{"           ▼"}</div>
              <div className="mt-1 flex items-center justify-center">
                <span className="rounded border border-[#0052ff]/20 bg-[#0052ff]/[0.04] px-4 py-1.5">
                  <span className="font-semibold text-[#3377ff]">
                    {t("landing.arch_base")}
                  </span>
                  <span className="text-muted/50">
                    {" "}{t("landing.arch_base_desc")}
                  </span>
                </span>
              </div>

              {/* Legend */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-white/[0.04] pt-4 text-[11px] text-muted/60">
                <span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00d4aa]" />{" "}
                  {t("landing.arch_legend_auto")}
                </span>
                <span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#ff007a]" />{" "}
                  {t("landing.arch_legend_swap")}
                </span>
                <span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#3377ff]" />{" "}
                  {t("landing.arch_legend_settle")}
                </span>
                <span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />{" "}
                  {t("landing.arch_legend_human")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          HOW IT WORKS — 4 STEPS
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.04] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <span className="font-[family-name:var(--font-geist-mono)] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00d4aa]/60">
              {t("landing.steps_section")}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {t("landing.steps_title")}
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div
                key={step.num}
                className="group relative rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-6 transition-all hover:border-white/[0.12] hover:bg-[#111]"
              >
                {/* Step number */}
                <div className="mb-4 font-[family-name:var(--font-geist-mono)] text-3xl font-bold text-white/[0.06] transition-colors group-hover:text-[#00d4aa]/10">
                  {step.num}
                </div>
                {/* Tag */}
                <span className="mb-3 inline-block rounded-md bg-white/[0.04] px-2 py-0.5 font-[family-name:var(--font-geist-mono)] text-[11px] font-semibold uppercase tracking-[0.15em] text-muted/60">
                  {step.tag}
                </span>
                {/* Title */}
                <h3 className="mb-2 text-lg font-bold tracking-tight">
                  {t(step.titleKey)}
                </h3>
                {/* Description */}
                <p className="text-[13px] leading-relaxed text-muted/80">
                  {t(step.descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SAVINGS COMPARISON
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.04] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl">
          <div className="mb-14 text-center">
            <span className="font-[family-name:var(--font-geist-mono)] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00d4aa]/60">
              {t("landing.cost_title")}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {t("landing.cost_headline")}
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Bank column */}
            <div className="relative rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-8">
              <div className="absolute right-4 top-4 rounded-full bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-red-400">
                {t("landing.cost_legacy_badge")}
              </div>
              <div className="mb-1 text-sm font-medium text-muted">
                {t("landing.cost_bank_label")}
              </div>
              <div className="mb-6 font-[family-name:var(--font-geist-mono)] text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                {t("landing.cost_bank_fee_pct")}
                <span className="ml-1 text-base font-normal text-muted/60">
                  {t("landing.cost_avg_fee_label")}
                </span>
              </div>
              <div className="space-y-3 border-t border-white/[0.04] pt-6">
                <ComparisonRow label={t("landing.cost_row_1m")} value={t("landing.cost_row_1m_bank")} negative />
                <ComparisonRow label={t("landing.cost_row_settlement")} value={t("landing.cost_row_settlement_bank")} negative />
                <ComparisonRow label={t("landing.cost_row_transparency")} value={t("landing.cost_row_transparency_bank")} negative />
                <ComparisonRow label={t("landing.cost_row_audit")} value={t("landing.cost_row_audit_bank")} negative />
                <ComparisonRow label={t("landing.cost_row_availability")} value={t("landing.cost_row_availability_bank")} negative />
              </div>
            </div>

            {/* Meridian column */}
            <div className="relative rounded-2xl border border-[#00d4aa]/20 bg-[#00d4aa]/[0.02] p-8 shadow-[0_0_40px_rgba(0,212,170,0.04)]">
              <div className="absolute right-4 top-4 rounded-full bg-[#00d4aa]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#00d4aa]">
                {t("landing.cost_meridian_badge")}
              </div>
              <div className="mb-1 text-sm font-medium text-muted">
                {t("landing.cost_meridian_label")}
              </div>
              <div className="mb-6 font-[family-name:var(--font-geist-mono)] text-4xl font-bold tracking-tight text-[#00d4aa] sm:text-5xl">
                {t("landing.cost_meridian_fee_pct")}
                <span className="ml-1 text-base font-normal text-[#00d4aa]/50">
                  {t("landing.cost_avg_fee_label")}
                </span>
              </div>
              <div className="space-y-3 border-t border-[#00d4aa]/10 pt-6">
                <ComparisonRow label={t("landing.cost_row_1m")} value={t("landing.cost_row_1m_meridian")} positive />
                <ComparisonRow label={t("landing.cost_row_settlement")} value={t("landing.cost_row_settlement_meridian")} positive />
                <ComparisonRow label={t("landing.cost_row_transparency")} value={t("landing.cost_row_transparency_meridian")} positive />
                <ComparisonRow label={t("landing.cost_row_audit")} value={t("landing.cost_row_audit_meridian")} positive />
                <ComparisonRow label={t("landing.cost_row_availability")} value={t("landing.cost_row_availability_meridian")} positive />
              </div>
            </div>
          </div>

          {/* Savings callout */}
          <div className="mt-6 rounded-2xl border border-[#00d4aa]/10 bg-[#00d4aa]/[0.03] px-6 py-5 text-center">
            <span className="text-sm text-muted">
              {t("landing.cost_saves_pre")}
            </span>
            <div className="mt-1 font-[family-name:var(--font-geist-mono)] text-3xl font-bold tracking-tight text-[#00d4aa]">
              {t("landing.cost_saves_amount")}
            </div>
            <span className="text-xs text-muted/60">
              {t("landing.cost_saves_post")}
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          INTERACTIVE SAVINGS CALCULATOR
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.04] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl">
          <SavingsCalculator />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          CRE AGENT DEMO
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.04] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <span className="font-[family-name:var(--font-geist-mono)] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#375bd2]/60">
              {t("landing.cre_section")}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {t("landing.cre_title")}
            </h2>
            <p className="mt-3 text-sm text-[#a3a3a3]">
              {t("landing.cre_desc")}
            </p>
          </div>
          <TerminalReplay />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SPONSOR TECHNOLOGIES
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.04] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <span className="font-[family-name:var(--font-geist-mono)] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00d4aa]/60">
              {t("landing.sponsors_section")}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {t("landing.sponsors_heading")}
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {sponsors.map((s) => (
              <div
                key={s.name}
                className="group rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-5 text-center transition-all hover:border-white/[0.12]"
              >
                <div
                  className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${s.gradient} text-sm font-bold text-white shadow-lg`}
                >
                  {s.letter}
                </div>
                <div className="text-sm font-semibold tracking-tight">
                  {s.name}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-muted/60">
                  {t(s.roleKey)}
                </div>
                <div className="mt-2 font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-[0.15em] text-muted/50">
                  {t(s.chainKey)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          ON-CHAIN AUDIT TRAIL
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.04] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <span className="font-[family-name:var(--font-geist-mono)] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00d4aa]/60">
            {t("landing.audit_section")}
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {t("landing.audit_heading")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted/80">
            {t("landing.audit_desc")}
          </p>

          {/* Mini terminal preview */}
          <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-xl border border-white/[0.06] bg-[#0d0d0d] text-left">
            {/* Terminal chrome */}
            <div className="flex items-center gap-1.5 border-b border-white/[0.04] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/[0.06]" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/[0.06]" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/[0.06]" />
              <span className="ml-3 text-[11px] text-muted/60">
                {t("landing.audit_terminal_title")}
              </span>
            </div>
            <div className="p-5 font-[family-name:var(--font-geist-mono)] text-[11px] leading-relaxed">
              <LogLine
                time="14:32:01"
                tag="RATE"
                color="text-[#3377ff]"
                msg="USDC/EURC 1.0814 | TWAP₆₀ 1.0811 | vol 0.03%"
              />
              <LogLine
                time="14:32:01"
                tag="DECIDE"
                color="text-[#00d4aa]"
                msg="AUTO — 25,000 USDC → EURC | within policy band"
              />
              <LogLine
                time="14:32:02"
                tag="EXEC"
                color="text-[#ff5ca0]"
                msg="Uniswap V3 | Base | 23,109.42 EURC received"
              />
              <LogLine
                time="14:32:02"
                tag="SETTLE"
                color="text-[#00d4aa]"
                msg="Arc tx 0x4a2f...c891 | gas 0.0002 USDC"
              />
              <LogLine
                time="14:32:02"
                tag="SAVE"
                color="text-[#f59e0b]"
                msg="$312.50 saved vs bank rate (1.25 bps)"
              />
              <div className="mt-2 text-muted/20">
                {"─".repeat(60)}
              </div>
              <LogLine
                time="14:45:18"
                tag="RATE"
                color="text-[#3377ff]"
                msg="USDC/EURC 1.0819 | TWAP₆₀ 1.0815 | vol 0.02%"
              />
              <LogLine
                time="14:45:18"
                tag="DECIDE"
                color="text-[#f59e0b]"
                msg="HOLD — rate deteriorating, waiting for reentry"
              />
              <span className="animate-pulse text-[#00d4aa]">{"█"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FINAL CTA
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.04] px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("landing.cta_1")}
            <br />
            <span className="bg-gradient-to-r from-[#00d4aa] to-[#00e8bd] bg-clip-text text-transparent">
              {t("landing.cta_2")}
            </span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted/80">
            {t("landing.cta_desc")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-xl bg-[#00d4aa] px-8 py-4 text-sm font-semibold text-[#0a0a0a] shadow-[0_0_24px_rgba(0,212,170,0.25)] transition-all hover:shadow-[0_0_40px_rgba(0,212,170,0.4)]"
            >
              {t("landing.btn_launch")}
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-white/[0.04] px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-[#00d4aa] to-[#00a888] text-[11px] font-bold text-[#0a0a0a]">
                M
              </div>
              <span className="text-xs font-medium text-muted/60">
                Meridian FX
              </span>
            </div>
            <div className="text-center text-xs text-muted/80">
              {t("landing.footer_built")}{" "}
              <span className="font-medium text-muted/80">
                ETHGlobal Cannes 2026
              </span>{" "}
              {t("landing.footer_by")}{" "}
              <span className="font-medium text-muted/80">Team Ippo</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted/70">
              <span>Chainlink CRE</span>
              <span className="hidden sm:inline">&middot;</span>
              <span>Uniswap</span>
              <span className="hidden sm:inline">&middot;</span>
              <span>Circle Arc</span>
              <span className="hidden sm:inline">&middot;</span>
              <span>World ID</span>
              <span className="hidden sm:inline">&middot;</span>
              <span>Base</span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4">
              <a
                href="https://github.com/meridian-fx/meridian-fx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted hover:text-accent-blue transition-colors"
              >
                {t("landing.footer_view_source")}
              </a>
              <a
                href="https://dev.omnipass.world"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted hover:text-accent-blue transition-colors"
              >
                {t("landing.footer_dev_console")}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Sub-components ─── */

function ComparisonRow({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted/60">{label}</span>
      <span
        className={
          positive
            ? "font-medium text-[#00d4aa]"
            : negative
              ? "font-medium text-red-400/80"
              : "text-muted"
        }
      >
        {value}
      </span>
    </div>
  );
}

function LogLine({
  time,
  tag,
  color,
  msg,
}: {
  time: string;
  tag: string;
  color: string;
  msg: string;
}) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="shrink-0 text-muted/50">{time}</span>
      <span className={`shrink-0 font-semibold ${color}`}>[{tag}]</span>
      <span className="text-muted/70 truncate">{msg}</span>
    </div>
  );
}
