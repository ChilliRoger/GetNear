import { createPublicClient, http, defineChain } from "viem";
import { base } from "viem/chains";
import { CONTRACTS, TOKENS } from "@meridian/shared";

// Arc testnet — no built-in viem chain definition
const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ARC_RPC || "https://rpc-testnet.arc.money",
      ],
    },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
});

export const baseClient = createPublicClient({
  chain: base,
  transport: http(
    process.env.NEXT_PUBLIC_BASE_RPC || "https://base.llamarpc.com"
  ),
});

export const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(
    process.env.NEXT_PUBLIC_ARC_RPC || "https://rpc-testnet.arc.money"
  ),
});

const TREASURY_WALLET = "0xB60679110E14D2291f8105EF002A49809cfB283b" as `0x${string}`;

const erc20BalanceOfAbi = [
  {
    type: "function" as const,
    name: "balanceOf" as const,
    inputs: [{ name: "account", type: "address" as const }],
    outputs: [{ name: "", type: "uint256" as const }],
    stateMutability: "view" as const,
  },
] as const;

// --- ABIs (view functions only) ---

const swapExecutorAbi = [
  {
    type: "function" as const,
    name: "getBalances" as const,
    inputs: [],
    outputs: [
      { name: "usdcBal", type: "uint256" as const },
      { name: "eurcBal", type: "uint256" as const },
    ],
    stateMutability: "view" as const,
  },
] as const;

const treasuryVaultAbi = [
  {
    type: "function" as const,
    name: "getPolicy" as const,
    inputs: [],
    outputs: [
      { name: "threshold", type: "uint256" as const },
      { name: "rateMin", type: "uint256" as const },
      { name: "rateMax", type: "uint256" as const },
      { name: "version", type: "uint256" as const },
    ],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "getActivePendingTrades" as const,
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]" as const,
        components: [
          { name: "tradeId", type: "bytes32" as const },
          { name: "fromAmount", type: "uint256" as const },
          { name: "toAmount", type: "uint256" as const },
          { name: "exchangeRate", type: "uint256" as const },
          { name: "createdAt", type: "uint256" as const },
          { name: "expiresAt", type: "uint256" as const },
          { name: "status", type: "uint8" as const },
          { name: "approvedBy", type: "address" as const },
          { name: "approvedAt", type: "uint256" as const },
        ],
      },
    ],
    stateMutability: "view" as const,
  },
] as const;

// --- Read helpers ---

export async function fetchBalances() {
  const [usdcBal, eurcBal] = await baseClient.readContract({
    address: CONTRACTS.SWAP_EXECUTOR_BASE as `0x${string}`,
    abi: swapExecutorAbi,
    functionName: "getBalances",
  });
  return { usdcBal, eurcBal };
}

export async function fetchPolicy() {
  const [threshold, rateMin, rateMax, version] = await arcClient.readContract({
    address: CONTRACTS.TREASURY_VAULT_ARC as `0x${string}`,
    abi: treasuryVaultAbi,
    functionName: "getPolicy",
  });
  return { threshold, rateMin, rateMax, version };
}

export async function fetchPendingTrades() {
  const trades = await arcClient.readContract({
    address: CONTRACTS.TREASURY_VAULT_ARC as `0x${string}`,
    abi: treasuryVaultAbi,
    functionName: "getActivePendingTrades",
  });
  return trades;
}

export async function fetchTreasuryBalances() {
  const [usdcBal, eurcBal] = await Promise.all([
    baseClient.readContract({
      address: TOKENS.USDC_BASE as `0x${string}`,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [TREASURY_WALLET],
    }),
    baseClient.readContract({
      address: TOKENS.EURC_BASE as `0x${string}`,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [TREASURY_WALLET],
    }),
  ]);
  return { usdcBal, eurcBal };
}
