"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

export type Locale = "en" | "fr";

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

function getInitialLocale(): Locale {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("GetNear-locale");
    if (saved === "en" || saved === "fr") return saved;
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("GetNear-locale", l);
    }
  }, []);

  const t = useCallback(
    (key: string): string =>
      translations[locale]?.[key] || translations.en?.[key] || key,
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

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
    "approve.loading_desc": "Fetching pending trades from Arc...",
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
    "approve.exceeds_threshold": "This trade exceeds the auto-execution threshold and requires manual approval via World ID verification.",
    "approve.verified_msg": "Humanity verified via World ID. In production, this approval would be submitted on-chain to the TreasuryVault contract on Arc.",
    "approve.btn_approve": "Approve with World ID",
    "approve.btn_verifying": "Verifying...",
    "approve.btn_approved": "Approved — Verified Human",
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
    "settings.policy_notice": "Policy updates are submitted as on-chain transactions to the Arc chain. Changes take effect after transaction confirmation (typically 2-3 seconds).",
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
    "landing.hero_desc": "GetNear monitors USDC/EURC rates, auto-executes optimal conversions through Uniswap, and requires World ID-verified human approval for large trades. Fully autonomous. Built on Chainlink CRE.",
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
    "landing.cost_saves_pre": "On a $1M USDC → EURC conversion, GetNear saves",
    "landing.cost_saves_post": "96% reduction in conversion costs",
    "landing.cre_section": "Chainlink CRE",
    "landing.cre_title": "Watch the Agent Think",
    "landing.cre_desc": "A single CRE workflow fetches quotes, reads policy, checks balances, and executes — all autonomously.",
    "landing.sponsors_title": "Built With the Best",
    "landing.sponsors_subtitle": "Five sponsor technologies. One unified treasury agent.",
    "landing.audit_title": "On-Chain Audit Trail",
    "landing.audit_subtitle": "Every decision. Every trade. Immutably recorded on Arc.",
    "landing.cta_1": "Stop paying banks.",
    "landing.cta_2": "Start running GetNear.",
    "landing.cta_desc": "Open source. Fully autonomous. Built for treasuries that move millions in stablecoins.",
    "landing.footer_built": "Built at",
    "landing.footer_by": "by",
    "landing.display_note": "Displayed notional x1,000,000",

    // Landing — eyebrow
    "landing.eyebrow_event": "ETHGlobal Cannes 2026",
    "landing.eyebrow_powered": "Powered by Chainlink CRE",

    // Landing — stats strip
    "landing.stats_value_fees": "$120B",
    "landing.stats_label_fees": "Annual FX fees replaced",
    "landing.stats_value_fee": "~0.05%",
    "landing.stats_label_fee": "GetNear conversion fee",
    "landing.stats_value_ops": "24/7",
    "landing.stats_label_ops": "Autonomous operation",
    "landing.stats_value_settle": "<1s",
    "landing.stats_label_settle": "Settlement on Base",

    // Landing — architecture diagram
    "landing.arch_section": "System Architecture",
    "landing.arch_title": "How the agent thinks, decides, and settles",
    "landing.arch_flow_title": "GetNear — SYSTEM FLOW",
    "landing.arch_cfo": "CFO / Treasury Ops",
    "landing.arch_sets_policy": "sets policy",
    "landing.arch_agent": "GetNear AGENT",
    "landing.arch_agent_sub": "Chainlink CRE \u00b7 Consensus-Verified",
    "landing.arch_uniswap": "UNISWAP",
    "landing.arch_uniswap_desc": "Swap on Base",
    "landing.arch_world": "WORLD APP",
    "landing.arch_world_desc": "Orb verify large",
    "landing.arch_arc": "ARC (CIRCLE)",
    "landing.arch_arc_desc": "Log + settle",
    "landing.arch_base": "BASE L2",
    "landing.arch_base_desc": "\u00b7 sub-second settlement \u00b7 deep stablecoin liquidity",
    "landing.arch_legend_auto": "auto-execute",
    "landing.arch_legend_swap": "swap path",
    "landing.arch_legend_settle": "settlement layer",
    "landing.arch_legend_human": "human approval",

    // Landing — steps section
    "landing.steps_section": "Execution Pipeline",
    "landing.steps_title": "Four steps. No banks. No delays.",
    "landing.step_monitor_desc": "Streams USDC/EURC rates from Uniswap V3 pools on Base. Computes TWAP, volatility, and optimal entry windows in real time.",
    "landing.step_decide_desc": "Chainlink CRE nodes reach consensus on the agent\u2019s conversion decision. Confidential HTTP ensures strategy parameters stay private.",
    "landing.step_execute_desc": "Small trades auto-execute on Base. Large trades trigger World ID biometric verification \u2014 a human CFO must orb-verify to approve.",
    "landing.step_log_desc": "Every conversion is settled and logged on Arc, Circle\u2019s stablecoin-native L1. Full on-chain audit trail with USDC-as-gas.",

    // Landing — comparison section (hardcoded portions)
    "landing.cost_legacy_badge": "Legacy",
    "landing.cost_bank_label": "Traditional Bank FX",
    "landing.cost_bank_fee_pct": "1.3%",
    "landing.cost_avg_fee_label": "avg fee",
    "landing.cost_GetNear_badge": "GetNear",
    "landing.cost_GetNear_fee_pct": "~0.05%",
    "landing.cost_row_1m": "$1M conversion",
    "landing.cost_row_1m_bank": "$13,000 fee",
    "landing.cost_row_1m_GetNear": "~$500 fee",
    "landing.cost_row_settlement": "Settlement",
    "landing.cost_row_settlement_bank": "1-2 business days",
    "landing.cost_row_settlement_GetNear": "Sub-second on Base",
    "landing.cost_row_transparency": "Transparency",
    "landing.cost_row_transparency_bank": "Opaque markup",
    "landing.cost_row_transparency_GetNear": "Every tx on-chain",
    "landing.cost_row_audit": "Audit trail",
    "landing.cost_row_audit_bank": "PDF statements",
    "landing.cost_row_audit_GetNear": "Arc L1 immutable log",
    "landing.cost_row_availability": "Availability",
    "landing.cost_row_availability_bank": "Banker hours only",
    "landing.cost_row_availability_GetNear": "24/7/365 autonomous",
    "landing.cost_saves_amount": "$12,500",

    // Landing — sponsors section
    "landing.sponsors_section": "Built With",
    "landing.sponsors_heading": "Five protocols. One autonomous treasury.",
    "landing.sponsor_uniswap_role": "Real-time quotes + swap execution",
    "landing.sponsor_uniswap_chain": "Base",
    "landing.sponsor_chainlink_role": "Decentralized agent brain",
    "landing.sponsor_chainlink_chain": "Consensus Runtime",
    "landing.sponsor_arc_role": "Stablecoin-native L1",
    "landing.sponsor_arc_chain": "USDC-as-gas",
    "landing.sponsor_worldid_role": "Biometric human verification",
    "landing.sponsor_worldid_chain": "Orb Protocol",
    "landing.sponsor_base_role": "Deep stablecoin liquidity",
    "landing.sponsor_base_chain": "Coinbase L2",

    // Landing — audit trail section
    "landing.audit_section": "Trust Architecture",
    "landing.audit_heading": "Every decision. Every swap. On-chain forever.",
    "landing.audit_desc": "GetNear logs every rate check, decision rationale, swap execution, and settlement to Arc \u2014 Circle\u2019s stablecoin-native L1. Auditors, regulators, and your CFO see the same immutable record.",
    "landing.audit_terminal_title": "arc-explorer \u2014 treasury audit log",

    // Landing — footer links
    "landing.footer_view_source": "View Source",
    "landing.footer_dev_console": "Dev Console \u2192",

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
    "dashboard.chainlink": "Chainlink",
    "dashboard.fynd": "Fynd",
    "dashboard.uniswap": "Uniswap",
    "dashboard.max_divergence": "Max divergence",

    // Privacy tabs
    "tabs.public_treasury": "Public Treasury",
    "tabs.private_treasury": "Private Treasury",
    "tabs.public_trades": "Public Trades",
    "tabs.private_trades": "Private Trades",

    // Privacy features
    "privacy.pool_balance": "Privacy Pool Balance",
    "privacy.request_tokens": "Request Test Tokens",
    "privacy.execute_swap": "Quick Private Swap",
    "privacy.testnet_badge": "Base Sepolia Testnet",
    "privacy.not_configured": "Privacy server not connected",
    "privacy.step_deposit": "Deposit",
    "privacy.step_execute": "Execute",
    "privacy.step_withdraw": "Withdraw",
    "privacy.comparison_title": "Privacy Comparison",
    "privacy.normal_swap": "Normal Swap",
    "privacy.private_swap": "Private Swap",
    "privacy.sender_visible": "Sender visible on-chain",
    "privacy.sender_hidden": "Sender hidden (ZK proof)",
    "privacy.comparison_explainer": "Normal swaps expose your treasury wallet address on-chain. Anyone can see who is trading, when, and how much. Private swaps route through the Unlink pool so the on-chain sender is the pool — not your wallet.",
    "privacy.comparison_footnote": "Amounts, tokens, and the target DEX remain visible for compliance. Only the sender identity is hidden.",
    "privacy.dashboard_explainer": "Private Treasury mode uses the Unlink SDK to hide your wallet identity when executing swaps. Tokens are routed through a privacy pool so on-chain observers see the pool address — not your treasury. Audit records are still logged to Arc.",
    "privacy.swap_explainer": "Enter an amount to swap privately. Your tokens will be deposited into the Unlink pool, swapped via Uniswap V3 with the pool as sender, then withdrawn back to your wallet. The on-chain transaction cannot be linked to your treasury address.",
    "privacy.swap_progress_title": "Swap Progress",
    "privacy.swap_progress_subtitle": "Deposit \u2192 Pool executes swap \u2192 Withdraw to wallet",

    // Toast / error handling
    "toast.trade_submitted": "Trade submitted successfully",
    "toast.trade_cancelled": "Trade cancelled",
    "toast.policy_updated": "Policy updated",
    "toast.error": "Something went wrong",
    "toast.oracle_offline": "Oracle offline — showing cached data",
    "error.boundary_title": "Something went wrong",
    "error.boundary_retry": "Try again",
  },

  fr: {
    // Header
    "header.title": "GetNear",
    "header.subtitle": "Trésorerie FX",
    "header.live": "En direct",

    // Nav
    "nav.dashboard": "Tableau de bord",
    "nav.analytics": "Analytiques",
    "nav.approve": "Approuver",
    "nav.settings": "Paramètres",

    // Dashboard
    "dashboard.savings_label": "Économies estimées par rapport aux banques traditionnelles",
    "dashboard.savings_value": "~625 000 $/an",
    "dashboard.rate_title": "USDC / EURC",
    "dashboard.rate_subtitle": "Base Mainnet",
    "dashboard.rate_badge": "EN DIRECT",
    "dashboard.range_24h": "Plage 24h",
    "dashboard.exec_capital": "Capital d'exécution",
    "dashboard.treasury_ledger": "Grand livre de trésorerie",
    "dashboard.active_policy": "Politique active",
    "dashboard.auto_threshold": "Seuil auto",
    "dashboard.rate_min": "Taux min",
    "dashboard.rate_max": "Taux max",
    "dashboard.recent_trades": "Transactions récentes",
    "dashboard.last_48h": "Dernières 48 heures",
    "dashboard.pending": "En attente",
    "dashboard.saved": "économisé",
    "dashboard.demo": "démo",
    "dashboard.treasury": "Trésorerie",
    "dashboard.wallet": "Portefeuille",
    "dashboard.in_execution": "En exécution",

    // Approve
    "approve.title": "File d'approbation",
    "approve.subtitle": "Transactions dépassant le seuil d'exécution automatique",
    "approve.loading": "Chargement...",
    "approve.loading_desc": "Récupération des transactions en attente depuis Arc...",
    "approve.all_clear": "Tout est en ordre",
    "approve.no_pending": "Aucune approbation en attente",
    "approve.all_within": "Toutes les transactions sont dans le seuil d'exécution automatique",
    "approve.pending": "EN ATTENTE",
    "approve.amount": "Montant",
    "approve.exchange_rate": "Taux de change",
    "approve.you_receive": "Vous recevez",
    "approve.projected_savings": "Économies projetées",
    "approve.vs_bank": "vs banque",
    "approve.expires": "Expire",
    "approve.remaining": "restant",
    "approve.exceeds_threshold": "Cette transaction dépasse le seuil d'exécution automatique et nécessite une approbation manuelle via la vérification World ID.",
    "approve.verified_msg": "Humanité vérifiée via World ID. En production, cette approbation serait soumise on-chain au contrat TreasuryVault sur Arc.",
    "approve.btn_approve": "Approuver avec World ID",
    "approve.btn_verifying": "Vérification...",
    "approve.btn_approved": "Approuvé — Humain vérifié",
    "approve.recent_title": "Approbations récentes",
    "approve.recent_subtitle": "Transactions précédemment approuvées",
    "approve.recent_empty": "Les transactions approuvées apparaîtront ici",

    // Settings
    "settings.title": "Paramètres de politique",
    "settings.subtitle": "Configurer les seuils d'exécution automatique et les bandes de taux",
    "settings.current_policy": "Politique actuelle",
    "settings.threshold": "Seuil",
    "settings.update_policy": "Mettre à jour la politique",
    "settings.changes_require": "Les modifications nécessitent une transaction on-chain",
    "settings.auto_threshold": "Seuil d'exécution automatique",
    "settings.raw_usd": "USD brut",
    "settings.multiplier_label": "multiplicateur d'affichage x1 000 000",
    "settings.displays_as": "Affiché comme",
    "settings.rate_band_min": "Taux min de la bande",
    "settings.rate_band_max": "Taux max de la bande",
    "settings.target_rate_band": "Bande de taux cible",
    "settings.current_rate": "Actuel",
    "settings.policy_notice": "Les mises à jour de politique sont soumises comme des transactions on-chain sur la chaîne Arc. Les modifications prennent effet après confirmation de la transaction (généralement 2-3 secondes).",
    "settings.btn_update": "Mettre à jour la politique",
    "settings.btn_submitting": "Soumission...",

    // Savings Calculator
    "calc.title": "Calculez vos économies",
    "calc.subtitle": "Découvrez combien votre organisation économise avec GetNear",
    "calc.annual_volume": "Volume FX annuel",
    "calc.bank_fee": "Frais FX bancaires actuels",
    "calc.traditional": "Banque traditionnelle",
    "calc.GetNear": "GetNear",
    "calc.annual_savings": "Économies annuelles",
    "calc.cost_reduction": "réduction des coûts",
    "calc.fee": "frais",
    "calc.per_yr": "/an",

    // Landing page
    "landing.agent_active": "Agent actif",
    "landing.hero_pre": "Agent de trésorerie autonome",
    "landing.hero_h1_1": "Gestion FX",
    "landing.hero_h1_2": "pour l'ère des stablecoins",
    "landing.hero_desc": "GetNear surveille les taux USDC/EURC, exécute automatiquement les conversions optimales via Uniswap, et exige une approbation humaine vérifiée par World ID pour les transactions importantes. Entièrement autonome. Construit sur Chainlink CRE.",
    "landing.btn_launch": "Lancer le tableau de bord",
    "landing.btn_source": "Voir le code source",
    "landing.stats_replaced": "remplacés annuellement",
    "landing.stats_fee": "frais de swap moyen",
    "landing.stats_operation": "opération",
    "landing.stats_settlement": "règlement",
    "landing.how_title": "Comment fonctionne GetNear",
    "landing.how_subtitle": "Quatre étapes autonomes. Zéro intervention humaine pour les transactions standard.",
    "landing.step_monitor": "Surveiller",
    "landing.step_decide": "Décider",
    "landing.step_execute": "Exécuter",
    "landing.step_log": "Enregistrer",
    "landing.cost_title": "Comparaison des coûts",
    "landing.cost_headline": "Votre banque vous surfacture. Considérablement.",
    "landing.cost_GetNear_label": "Agent GetNear",
    "landing.cost_saves_pre": "Sur une conversion de 1M$ USDC → EURC, GetNear économise",
    "landing.cost_saves_post": "96% de réduction des coûts de conversion",
    "landing.cre_section": "Chainlink CRE",
    "landing.cre_title": "Regardez l'agent réfléchir",
    "landing.cre_desc": "Un seul workflow CRE récupère les cotations, lit la politique, vérifie les soldes et exécute — le tout de manière autonome.",
    "landing.sponsors_title": "Construit avec les meilleurs",
    "landing.sponsors_subtitle": "Cinq technologies partenaires. Un agent de trésorerie unifié.",
    "landing.audit_title": "Piste d'audit on-chain",
    "landing.audit_subtitle": "Chaque décision. Chaque transaction. Enregistrée de manière immuable sur Arc.",
    "landing.cta_1": "Arrêtez de payer les banques.",
    "landing.cta_2": "Lancez GetNear.",
    "landing.cta_desc": "Open source. Entièrement autonome. Conçu pour les trésoreries qui déplacent des millions en stablecoins.",
    "landing.footer_built": "Construit à",
    "landing.footer_by": "par",
    "landing.display_note": "Notionnel affiché x1 000 000",

    // Landing — eyebrow
    "landing.eyebrow_event": "ETHGlobal Cannes 2026",
    "landing.eyebrow_powered": "Propulsé par Chainlink CRE",

    // Landing — stats strip
    "landing.stats_value_fees": "120 Md$",
    "landing.stats_label_fees": "Frais FX annuels remplacés",
    "landing.stats_value_fee": "~0,05 %",
    "landing.stats_label_fee": "Frais de conversion GetNear",
    "landing.stats_value_ops": "24/7",
    "landing.stats_label_ops": "Fonctionnement autonome",
    "landing.stats_value_settle": "<1s",
    "landing.stats_label_settle": "Règlement sur Base",

    // Landing — architecture diagram
    "landing.arch_section": "Architecture du système",
    "landing.arch_title": "Comment l'agent analyse, décide et règle",
    "landing.arch_flow_title": "GetNear — FLUX SYSTÈME",
    "landing.arch_cfo": "DAF / Ops Trésorerie",
    "landing.arch_sets_policy": "définit la politique",
    "landing.arch_agent": "AGENT GetNear",
    "landing.arch_agent_sub": "Chainlink CRE \u00b7 Vérifié par consensus",
    "landing.arch_uniswap": "UNISWAP",
    "landing.arch_uniswap_desc": "Swap sur Base",
    "landing.arch_world": "WORLD APP",
    "landing.arch_world_desc": "Vérif. orb grands montants",
    "landing.arch_arc": "ARC (CIRCLE)",
    "landing.arch_arc_desc": "Journal + règlement",
    "landing.arch_base": "BASE L2",
    "landing.arch_base_desc": "\u00b7 règlement sub-seconde \u00b7 liquidité stablecoin profonde",
    "landing.arch_legend_auto": "exécution auto",
    "landing.arch_legend_swap": "chemin de swap",
    "landing.arch_legend_settle": "couche de règlement",
    "landing.arch_legend_human": "approbation humaine",

    // Landing — steps section
    "landing.steps_section": "Pipeline d'exécution",
    "landing.steps_title": "Quatre étapes. Pas de banques. Pas de délais.",
    "landing.step_monitor_desc": "Diffuse les taux USDC/EURC depuis les pools Uniswap V3 sur Base. Calcule TWAP, volatilité et fenêtres d'entrée optimales en temps réel.",
    "landing.step_decide_desc": "Les nœuds Chainlink CRE parviennent à un consensus sur la décision de conversion de l'agent. Le HTTP confidentiel protège les paramètres de stratégie.",
    "landing.step_execute_desc": "Les petites transactions s'exécutent automatiquement sur Base. Les grosses transactions déclenchent la vérification biométrique World ID — un DAF humain doit vérifier via l'orb pour approuver.",
    "landing.step_log_desc": "Chaque conversion est réglée et enregistrée sur Arc, le L1 natif stablecoin de Circle. Piste d'audit complète on-chain avec USDC-as-gas.",

    // Landing — comparison section
    "landing.cost_legacy_badge": "Traditionnel",
    "landing.cost_bank_label": "FX bancaire traditionnel",
    "landing.cost_bank_fee_pct": "1,3 %",
    "landing.cost_avg_fee_label": "frais moyen",
    "landing.cost_GetNear_badge": "GetNear",
    "landing.cost_GetNear_fee_pct": "~0,05 %",
    "landing.cost_row_1m": "Conversion 1M$",
    "landing.cost_row_1m_bank": "13 000 $ de frais",
    "landing.cost_row_1m_GetNear": "~500 $ de frais",
    "landing.cost_row_settlement": "Règlement",
    "landing.cost_row_settlement_bank": "1-2 jours ouvrables",
    "landing.cost_row_settlement_GetNear": "Sub-seconde sur Base",
    "landing.cost_row_transparency": "Transparence",
    "landing.cost_row_transparency_bank": "Majoration opaque",
    "landing.cost_row_transparency_GetNear": "Chaque tx on-chain",
    "landing.cost_row_audit": "Piste d'audit",
    "landing.cost_row_audit_bank": "Relevés PDF",
    "landing.cost_row_audit_GetNear": "Journal immuable Arc L1",
    "landing.cost_row_availability": "Disponibilité",
    "landing.cost_row_availability_bank": "Heures bancaires uniquement",
    "landing.cost_row_availability_GetNear": "24/7/365 autonome",
    "landing.cost_saves_amount": "12 500 $",

    // Landing — sponsors section
    "landing.sponsors_section": "Construit avec",
    "landing.sponsors_heading": "Cinq protocoles. Une trésorerie autonome.",
    "landing.sponsor_uniswap_role": "Cotations en temps réel + exécution de swaps",
    "landing.sponsor_uniswap_chain": "Base",
    "landing.sponsor_chainlink_role": "Cerveau d'agent décentralisé",
    "landing.sponsor_chainlink_chain": "Consensus Runtime",
    "landing.sponsor_arc_role": "L1 natif stablecoin",
    "landing.sponsor_arc_chain": "USDC-as-gas",
    "landing.sponsor_worldid_role": "Vérification biométrique humaine",
    "landing.sponsor_worldid_chain": "Protocole Orb",
    "landing.sponsor_base_role": "Liquidité stablecoin profonde",
    "landing.sponsor_base_chain": "Coinbase L2",

    // Landing — audit trail section
    "landing.audit_section": "Architecture de confiance",
    "landing.audit_heading": "Chaque décision. Chaque swap. On-chain pour toujours.",
    "landing.audit_desc": "GetNear enregistre chaque vérification de taux, chaque justification de décision, chaque exécution de swap et chaque règlement sur Arc — le L1 natif stablecoin de Circle. Auditeurs, régulateurs et votre DAF voient le même registre immuable.",
    "landing.audit_terminal_title": "arc-explorer — journal d'audit trésorerie",

    // Landing — footer links
    "landing.footer_view_source": "Voir le code",
    "landing.footer_dev_console": "Console Dev \u2192",

    // Trade
    "nav.trade": "Trader",
    "trade.title": "Nouvelle transaction",
    "trade.subtitle": "Soumettre un ordre d'exécution TWAP",
    "trade.direction": "Direction",
    "trade.amount": "Montant",
    "trade.multiplier_note": "multiplicateur x1M",
    "trade.displays_as": "Affiché comme",
    "trade.deadline": "Fenêtre d'exécution",
    "trade.deadline_note": "L'ordre sera divisé en morceaux sur cette période",
    "trade.preview": "Aperçu de l'exécution",
    "trade.you_send": "Vous envoyez",
    "trade.you_receive": "Vous recevez",
    "trade.rate": "Taux",
    "trade.est_chunks": "Morceaux est.",
    "trade.swaps": "swaps",
    "trade.submit": "Soumettre l'ordre",
    "trade.mode": "Type d'ordre",
    "trade.mode_input": "Je veux échanger",
    "trade.mode_output": "Je veux recevoir",
    "trade.estimated_deposit": "Dépôt estimé",
    "trade.buffer_note": "Inclut 5% de marge",
    "trade.desired_output": "Sortie cible",
    "trade.submitting": "Soumission...",

    // Trades list
    "trades.title": "Ordres ouverts",
    "trades.loading": "Chargement...",
    "trades.empty": "Aucun ordre",
    "trades.empty_desc": "Soumettez une transaction pour commencer",
    "trades.filled": "Rempli",
    "trades.input": "Entrée",
    "trades.output": "Sortie",
    "trades.remaining": "restant",
    "trades.expired": "Expiré",
    "trades.cancel": "Annuler",
    "trades.cancel_confirm": "Confirmer l'annulation",
    "trades.cancel_prompt": "Êtes-vous sûr ? Cette action est irréversible.",
    "trades.timing_score": "Timing",
    "trades.strategy": "Stratégie",

    // Strategy
    "strategy.adaptive_twap": "TWAP Adaptatif",
    "strategy.chunk_plan": "Plan de découpage",
    "strategy.log_title": "Journal de Stratégie",
    "strategy.latest": "Stratégie Active",
    "strategy.no_decisions": "Aucune décision de stratégie.",
    "strategy.latest_empty": "Aucune stratégie active",

    // Price comparison
    "dashboard.price_comparison": "Sources de prix",
    "dashboard.price_comparison_subtitle": "Comparaison inter-sources oracle",
    "dashboard.source": "Source",
    "dashboard.price": "Prix",
    "dashboard.divergence": "Divergence",
    "dashboard.chainlink": "Chainlink",
    "dashboard.fynd": "Fynd",
    "dashboard.uniswap": "Uniswap",
    "dashboard.max_divergence": "Divergence max",

    // Privacy tabs
    "tabs.public_treasury": "Trésorerie Publique",
    "tabs.private_treasury": "Trésorerie Privée",
    "tabs.public_trades": "Échanges Publics",
    "tabs.private_trades": "Échanges Privés",

    // Privacy features
    "privacy.pool_balance": "Solde du Pool Privé",
    "privacy.request_tokens": "Demander des Jetons Test",
    "privacy.execute_swap": "Échange Privé Rapide",
    "privacy.testnet_badge": "Réseau Test Base Sepolia",
    "privacy.not_configured": "Serveur de confidentialité non connecté",
    "privacy.step_deposit": "Dépôt",
    "privacy.step_execute": "Exécuter",
    "privacy.step_withdraw": "Retrait",
    "privacy.comparison_title": "Comparaison de Confidentialité",
    "privacy.normal_swap": "Échange Normal",
    "privacy.private_swap": "Échange Privé",
    "privacy.sender_visible": "Expéditeur visible on-chain",
    "privacy.sender_hidden": "Expéditeur masqué (preuve ZK)",
    "privacy.comparison_explainer": "Les swaps normaux exposent l'adresse de votre portefeuille de trésorerie on-chain. Tout le monde peut voir qui trade, quand et combien. Les swaps privés passent par le pool Unlink : l'expéditeur on-chain est le pool, pas votre portefeuille.",
    "privacy.comparison_footnote": "Les montants, jetons et le DEX cible restent visibles pour la conformité. Seule l'identité de l'expéditeur est masquée.",
    "privacy.dashboard_explainer": "Le mode Trésorerie Privée utilise le SDK Unlink pour masquer l'identité de votre portefeuille lors des swaps. Les jetons transitent par un pool de confidentialité : les observateurs on-chain voient l'adresse du pool, pas votre trésorerie. Les audits sont toujours enregistrés sur Arc.",
    "privacy.swap_explainer": "Entrez un montant pour un swap privé. Vos jetons seront déposés dans le pool Unlink, échangés via Uniswap V3 avec le pool comme expéditeur, puis retirés vers votre portefeuille. La transaction on-chain ne peut pas être liée à votre adresse de trésorerie.",
    "privacy.swap_progress_title": "Progression de l'\u00e9change",
    "privacy.swap_progress_subtitle": "Dépôt \u2192 Le pool exécute le swap \u2192 Retrait vers le portefeuille",

    // Toast / error handling
    "toast.trade_submitted": "Ordre soumis avec succès",
    "toast.trade_cancelled": "Ordre annulé",
    "toast.policy_updated": "Politique mise à jour",
    "toast.error": "Une erreur est survenue",
    "toast.oracle_offline": "Oracle hors ligne — données en cache",
    "error.boundary_title": "Quelque chose s'est mal passé",
    "error.boundary_retry": "Réessayer",
  },
};
