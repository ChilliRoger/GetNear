import type { ExecutionReceipt, PendingTrade, QuoteSnapshot } from "@meridian/shared";

// ── Balances ──────────────────────────────────────────────────────────
// Raw amounts are 6-decimal USDC/EURC values.
// The UI multiplies by DISPLAY_MULTIPLIER (1,000,000) for presentation.

export const executionBalances = {
  usdc: "5000000000", // $5,000 real -> displays as $5,000,000,000 ... wait
  // Actually: formatDisplayAmount takes bigint raw (6 decimals).
  // $5 raw = 5_000_000 (6 dec) -> displays as $5 * 1M = $5,000,000
  // So for $5,000,000 display: raw = $5 = 5_000_000n
  usdcRaw: 5_000_000n, // displays as $5,000,000
  eurcRaw: 4_300_000n, // displays as $4,300,000 (EURC)
};

export const treasuryBalances = {
  usdcRaw: 100_000_000n, // displays as $100,000,000
  eurcRaw: 50_000_000n, // displays as $50,000,000 (EURC)
};

// ── Current rate ──────────────────────────────────────────────────────

export const currentRate = {
  usdcPerEurc: 1.0823,
  change24h: +0.0012,
  changePct: +0.11,
};

// Sparkline data for the last 24 hours (hourly)
export const rateHistory = [
  { time: "00:00", rate: 1.0798 },
  { time: "01:00", rate: 1.0801 },
  { time: "02:00", rate: 1.0795 },
  { time: "03:00", rate: 1.0789 },
  { time: "04:00", rate: 1.0792 },
  { time: "05:00", rate: 1.0803 },
  { time: "06:00", rate: 1.081 },
  { time: "07:00", rate: 1.0815 },
  { time: "08:00", rate: 1.0808 },
  { time: "09:00", rate: 1.0812 },
  { time: "10:00", rate: 1.082 },
  { time: "11:00", rate: 1.0825 },
  { time: "12:00", rate: 1.0818 },
  { time: "13:00", rate: 1.0811 },
  { time: "14:00", rate: 1.0806 },
  { time: "15:00", rate: 1.0815 },
  { time: "16:00", rate: 1.0821 },
  { time: "17:00", rate: 1.0828 },
  { time: "18:00", rate: 1.0832 },
  { time: "19:00", rate: 1.0826 },
  { time: "20:00", rate: 1.082 },
  { time: "21:00", rate: 1.0818 },
  { time: "22:00", rate: 1.0822 },
  { time: "23:00", rate: 1.0823 },
];

// ── Policy ────────────────────────────────────────────────────────────

export const policy = {
  thresholdRaw: 10_000_000n, // displays as $10,000,000
  rateMin: 1.07,
  rateMax: 1.09,
  thresholdDisplay: "$10,000,000",
  rateBandDisplay: "1.0700 - 1.0900",
};

// ── Recent trades ─────────────────────────────────────────────────────

const now = Date.now();
const hour = 3_600_000;

export const recentTrades: ExecutionReceipt[] = [
  {
    tradeId: "TRD-0042",
    executionType: "AUTO",
    fromToken: "USDC",
    toToken: "EURC",
    fromAmount: "2000000", // $2 raw -> $2,000,000 display
    toAmount: "1847000",
    executionRateX18: "1082300000000000000",
    txHashBase: "0xabc1...def1",
    txHashArc: "0x1234...5678",
    executedAt: now - 2 * hour,
    savingsVsBankBps: 45,
  },
  {
    tradeId: "TRD-0041",
    executionType: "APPROVED",
    fromToken: "USDC",
    toToken: "EURC",
    fromAmount: "15000000", // $15 raw -> $15,000,000 display
    toAmount: "13857000",
    executionRateX18: "1082100000000000000",
    txHashBase: "0xabc2...def2",
    txHashArc: "0x2345...6789",
    executedAt: now - 8 * hour,
    savingsVsBankBps: 52,
  },
  {
    tradeId: "TRD-0040",
    executionType: "AUTO",
    fromToken: "EURC",
    toToken: "USDC",
    fromAmount: "3000000", // 3 EURC raw -> 3,000,000 display
    toAmount: "3246000",
    executionRateX18: "1082000000000000000",
    txHashBase: "0xabc3...def3",
    txHashArc: "0x3456...7890",
    executedAt: now - 18 * hour,
    savingsVsBankBps: 38,
  },
  {
    tradeId: "TRD-0039",
    executionType: "AUTO",
    fromToken: "USDC",
    toToken: "EURC",
    fromAmount: "1500000",
    toAmount: "1385000",
    executionRateX18: "1083000000000000000",
    txHashBase: "0xabc4...def4",
    txHashArc: "0x4567...8901",
    executedAt: now - 26 * hour,
    savingsVsBankBps: 41,
  },
];

// ── Pending trades (approval queue) ───────────────────────────────────

const pendingQuote: QuoteSnapshot = {
  quoteId: "QTE-0099",
  fromToken: "USDC",
  toToken: "EURC",
  fromAmount: "50000000", // $50 raw -> $50,000,000 display
  toAmount: "46175000",
  exchangeRateX18: "1082800000000000000",
  executionChain: 8453,
  quoteMetadataJson: "{}",
  quotedAt: now - 15 * 60_000,
  expiresAt: now + 45 * 60_000,
};

export const pendingTrades: PendingTrade[] = [
  {
    tradeId: "TRD-0043",
    quote: pendingQuote,
    createdAt: now - 15 * 60_000,
    expiresAt: now + 45 * 60_000,
    status: "PENDING",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────

export function formatRate(rateX18: string): string {
  return (Number(rateX18) / 1e18).toFixed(4);
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatTimeRemaining(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (diff <= 0) return "Expired";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m remaining`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m remaining`;
}
