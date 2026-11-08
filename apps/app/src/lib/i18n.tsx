"use client";

import { createContext, useContext, useCallback, useMemo, type ReactNode } from "react";

export type Locale = "en";

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale: Locale = "en";
  const setLocale = useCallback(() => {}, []);

  const t = useCallback(
    (key: string): string => translations.en?.[key] || key,
    []
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [t]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Header
    "header.title": "GetNear",
    "header.subtitle": "Treasury FX",
    "header.live": "Live",

    // Nav
    "nav.dashboard": "Dashboard",
    "nav.analytics": "Analytics",
    "nav.approve": "Approve",
    "nav.settings": "Settings",

    // Dashboard
    "dashboard.savings_label": "Estimated savings vs traditional banking",
    "dashboard.savings_value": "~$625,000/yr",
    "dashboard.rate_title": "USDC / EURC",
    "dashboard.rate_subtitle": "Base Mainnet",
    "dashboard.rate_badge": "LIVE",
    "dashboard.range_24h": "24h range",
    "dashboard.exec_capital": "Execution Capital",
    "dashboard.treasury_ledger": "Treasury Ledger",
    "dashboard.active_policy": "Active Policy",
    "dashboard.auto_threshold": "Auto Threshold",
    "dashboard.rate_min": "Rate Min",
    "dashboard.rate_max": "Rate Max",
    "dashboard.recent_trades": "Recent Trades",
    "dashboard.last_48h": "Last 48 hours",
    "dashboard.pending": "Pending",
    "dashboard.saved": "saved",
    "dashboard.demo": "demo",
    "dashboard.treasury": "Treasury",
    "dashboard.wallet": "Wallet",
    "dashboard.in_execution": "In Execution",

    // Approve
    "approve.title": "Approval Queue",
    "approve.subtitle": "Trades exceeding the auto-execution threshold",
    "approve.loading": "Loading...",
    "approve.loading_desc": "Fetching pending trades from Sputnik DAO...",
    "approve.all_clear": "All Clear",
    "approve.no_pending": "No pending approvals",
    "approve.all_within": "All trades within auto-execution threshold",
    "approve.pending": "PENDING",
    "approve.amount": "Amount",
    "approve.exchange_rate": "Exchange Rate",
    "approve.you_receive": "You Receive",
    "approve.projected_savings": "Projected Savings",
    "approve.vs_bank": "vs bank",
    "approve.expires": "Expires",
    "approve.remaining": "remaining",
    "approve.exceeds_threshold": "This trade exceeds the auto-execution threshold and requires manual approval via Sputnik DAO 2-of-3 council vote.",
    "approve.verified_msg": "Council vote cast on NEAR testnet.",
    "approve.btn_approve": "Approve via Sputnik DAO",
    "approve.btn_verifying": "Casting Vote...",
    "approve.btn_approved": "Approved by Council",
    "approve.recent_title": "Recent Approvals",
    "approve.recent_subtitle": "Previously approved trades",
    "approve.recent_empty": "Approved trades will appear here",

    // Settings
    "settings.title": "Policy Settings",
    "settings.subtitle": "Configure auto-execution thresholds and rate bands",
    "settings.current_policy": "Current Policy",
    "settings.threshold": "Threshold",
    "settings.update_policy": "Update Policy",
    "settings.changes_require": "Changes require on-chain transaction",
    "settings.auto_threshold": "Auto-Execution Threshold",
    "settings.raw_usd": "raw USD",
    "settings.multiplier_label": "x1,000,000 display multiplier",
    "settings.displays_as": "Displays as",
    "settings.rate_band_min": "Rate Band Min",
    "settings.rate_band_max": "Rate Band Max",
    "settings.target_rate_band": "Target Rate Band",
    "settings.current_rate": "Current",
    "settings.policy_notice": "Policy updates are submitted as on-chain transactions to the FxBudget contract on NEAR testnet.",
    "settings.btn_update": "Update Policy",
    "settings.btn_submitting": "Submitting...",

    // Savings Calculator
    "calc.title": "Calculate Your Savings",
    "calc.subtitle": "See how much your organization saves with GetNear",
    "calc.annual_volume": "Annual FX Volume",
    "calc.bank_fee": "Current Bank FX Fee",
    "calc.traditional": "Traditional Bank",
    "calc.GetNear": "GetNear",
    "calc.annual_savings": "Annual Savings",
    "calc.cost_reduction": "cost reduction",
    "calc.fee": "fee",
    "calc.per_yr": "/yr",

    // Landing page
    "landing.agent_active": "Agent Active",
    "landing.hero_pre": "Autonomous Treasury Agent",
    "landing.hero_h1_1": "FX management",
    "landing.hero_h1_2": "for the stablecoin era",
    "landing.hero_desc": "GetNear monitors USDC/EURe rates, auto-executes optimal conversions via NEAR Intents dry-quotes, and requires Sputnik DAO 2-of-3 council approval for large trades. Fully autonomous.",
    "landing.btn_launch": "Launch Dashboard",
    "landing.btn_source": "View Source",
    "landing.stats_replaced": "replaced annually",
    "landing.stats_fee": "avg swap fee",
    "landing.stats_operation": "operation",
    "landing.stats_settlement": "settlement",
    "landing.how_title": "How GetNear Works",
    "landing.how_subtitle": "Four autonomous steps. Zero human intervention for standard trades.",
    "landing.step_monitor": "Monitor",
    "landing.step_decide": "Decide",
    "landing.step_execute": "Execute",
    "landing.step_log": "Log",
    "landing.cost_title": "Cost Comparison",
    "landing.cost_headline": "Your bank is overcharging you. Dramatically.",
    "landing.cost_GetNear_label": "GetNear Agent",
    "landing.cost_saves_pre": "On a $1M USDC → EURe conversion, GetNear saves",
    "landing.cost_saves_post": "96% reduction in conversion costs",
    "landing.cre_section": "NEAR Intents & Strategy",
    "landing.cre_title": "Watch the Agent Think",
    "landing.cre_desc": "A strategy engine fetches 1Click quotes, reads ECB reference rates, checks limits, and executes chunks autonomously.",
    "landing.sponsors_title": "Built With the Best",
    "landing.sponsors_subtitle": "NEAR Protocol, 1Click API, Sputnik DAO, and FxBudget Contract.",
    "landing.audit_title": "On-Chain Audit Trail",
    "landing.audit_subtitle": "Every decision. Every trade. Immutably recorded on NEAR testnet.",
    "landing.cta_1": "Stop paying banks.",
    "landing.cta_2": "Start running GetNear.",
    "landing.cta_desc": "Open source. Fully autonomous. Built for treasuries that move millions in stablecoins.",
    "landing.footer_built": "Built for",
    "landing.footer_by": "by",
    "landing.display_note": "Displayed notional x1,000,000",

    // Landing — eyebrow
    "landing.eyebrow_event": "NEAR Hackathon 2026",
    "landing.eyebrow_powered": "Powered by NEAR Protocol & 1Click",

    // Landing — stats strip
    "landing.stats_value_fees": "$120B",
    "landing.stats_label_fees": "Annual FX fees replaced",
    "landing.stats_value_fee": "~0.05%",
    "landing.stats_label_fee": "GetNear conversion fee",
    "landing.stats_value_ops": "24/7",
    "landing.stats_label_ops": "Autonomous operation",
    "landing.stats_value_settle": "<1s",
    "landing.stats_label_settle": "Settlement on NEAR",

    // Landing — steps section
    "landing.steps_section": "Execution Pipeline",
    "landing.steps_title": "Four steps. No banks. No delays.",
    "landing.step_monitor_desc": "Streams USDC/EURe dry quotes from 1Click API. Computes TWAP, spread deviation, and optimal entry windows in real time.",
    "landing.step_decide_desc": "Strategy engine evaluates price vs rolling average, ECB reference divergence, and quadratic deadline urgency.",
    "landing.step_execute_desc": "Small trades auto-execute via a restricted access key on NEAR testnet. Large trades trigger Sputnik DAO 2-of-3 council voting.",
    "landing.step_log_desc": "Every conversion is logged in SQLite and emitted on-chain via NEP-297 events. Full testnet audit trail.",

    // Trade
    "nav.trade": "Trade",
    "trade.title": "New Trade",
    "trade.subtitle": "Submit an order for TWAP execution",
    "trade.direction": "Direction",
    "trade.amount": "Amount",
    "trade.multiplier_note": "x1M display multiplier",
    "trade.displays_as": "Displays as",
    "trade.deadline": "Execution Window",
    "trade.deadline_note": "Order will be split into chunks over this window",
    "trade.preview": "Execution Preview",
    "trade.you_send": "You send",
    "trade.you_receive": "You receive",
    "trade.rate": "Rate",
    "trade.est_chunks": "Est. chunks",
    "trade.swaps": "swaps",
    "trade.submit": "Submit Trade Order",
    "trade.mode": "Order Type",
    "trade.mode_input": "I want to swap",
    "trade.mode_output": "I want to receive",
    "trade.estimated_deposit": "Estimated deposit",
    "trade.buffer_note": "Includes 5% buffer",
    "trade.desired_output": "Target output",
    "trade.submitting": "Submitting...",

    // Trades list
    "trades.title": "Open Orders",
    "trades.loading": "Loading...",
    "trades.empty": "No Orders",
    "trades.empty_desc": "Submit a trade to get started",
    "trades.filled": "Filled",
    "trades.input": "Input",
    "trades.output": "Output",
    "trades.remaining": "remaining",
    "trades.expired": "Expired",
    "trades.cancel": "Cancel",
    "trades.cancel_confirm": "Confirm Cancel",
    "trades.cancel_prompt": "Are you sure? This cannot be undone.",
    "trades.timing_score": "Timing",
    "trades.strategy": "Strategy",

    // Strategy
    "strategy.adaptive_twap": "Adaptive TWAP",
    "strategy.chunk_plan": "Chunk plan",
    "strategy.log_title": "Strategy Log",
    "strategy.latest": "Active Strategy",
    "strategy.no_decisions": "No strategy decisions yet.",
    "strategy.latest_empty": "No active strategy",

    // Price comparison
    "dashboard.price_comparison": "Price Sources",
    "dashboard.price_comparison_subtitle": "Cross-source oracle comparison",
    "dashboard.source": "Source",
    "dashboard.price": "Price",
    "dashboard.divergence": "Divergence",
    "dashboard.chainlink": "ECB Ref",
    "dashboard.fynd": "1Click Quote",
    "dashboard.uniswap": "1Click Quote",
    "dashboard.max_divergence": "Max divergence",

    // Toast / error handling
    "toast.trade_submitted": "Trade submitted successfully",
    "toast.trade_cancelled": "Trade cancelled",
    "toast.policy_updated": "Policy updated",
    "toast.error": "Something went wrong",
    "toast.oracle_offline": "Oracle offline — showing cached data",
    "error.boundary_title": "Something went wrong",
    "error.boundary_retry": "Try again",
  },
};
