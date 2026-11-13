"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { NearClient } from "@getnear/near-client";
import { yoctoToNear, nearToYocto, explorerTxUrl } from "@getnear/shared";

import "@near-wallet-selector/modal-ui/styles.css";

export type WalletConnectionType = "wallet-selector" | "testnet-role";

export interface NearWalletContextValue {
  accountId: string | null;
  isConnected: boolean;
  balance: string | null;
  networkId: string;
  isConnecting: boolean;
  connectionType: WalletConnectionType | null;
  walletName: string | null;
  availableAccounts: string[];
  /** True only when the team's server-side demo signer is explicitly enabled (NEXT_PUBLIC_DEMO_SIGNER=1). */
  demoSignerEnabled: boolean;
  connectRole: (accountId: string) => Promise<void>;
  openWalletModal: () => void;
  connect: (accountId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (params: {
    receiverId: string;
    methodName: string;
    args: Record<string, unknown>;
    depositYocto?: string;
    depositNear?: string;
    gasUnits?: string;
  }) => Promise<{ txHash: string; explorerUrl: string }>;
}

const DEFAULT_ACCOUNTS = [
  "chilliroger-operator.testnet",
  "chilliroger-council1.testnet",
  "chilliroger-council2.testnet",
  "chilliroger-council3.testnet",
];

/**
 * Server-side "testnet role" signing (operator / council keys held by the Next.js server) is OFF by default.
 * Ordinary users sign with their own wallet through the wallet selector.
 * Enable for the team demo with NEXT_PUBLIC_DEMO_SIGNER=1 (client) + GETNEAR_DEMO_SIGNER=1 and
 * GETNEAR_DEMO_TOKEN (server).
 */
const DEMO_SIGNER_ENABLED = process.env.NEXT_PUBLIC_DEMO_SIGNER === "1";
const DEMO_TOKEN_STORAGE_KEY = "getnear_demo_token";

/** The bearer token is never bundled: it is typed once per browser session and kept in sessionStorage. */
function getDemoToken(): string {
  let token = "";
  try {
    token = sessionStorage.getItem(DEMO_TOKEN_STORAGE_KEY) || "";
  } catch {}
  if (!token && typeof window !== "undefined") {
    token = (window.prompt("Demo signer token (GETNEAR_DEMO_TOKEN)") || "").trim();
    if (token) {
      try {
        sessionStorage.setItem(DEMO_TOKEN_STORAGE_KEY, token);
      } catch {}
    }
  }
  if (!token) throw new Error("Demo signer token required");
  return token;
}

const STORAGE_ACCOUNT_KEY = "getnear_connected_account";
const STORAGE_TYPE_KEY = "getnear_connection_type";

const defaultNearClient = new NearClient({
  networkId: "testnet",
  rpcUrls: [
    "https://rpc.testnet.near.org",
    "https://test.rpc.fastnear.com",
  ],
});

const NearWalletContext = createContext<NearWalletContextValue | null>(null);

export function NearWalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [connectionType, setConnectionType] = useState<WalletConnectionType | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch balance for an account
  const refreshBalance = useCallback(async (account: string) => {
    try {
      const view = await defaultNearClient.viewAccount(account);
      const near = yoctoToNear(view.amount);
      setBalance(`${near.toFixed(2)} NEAR`);
    } catch (err) {
      console.warn("Failed to fetch balance for", account, err);
      setBalance("10.00 NEAR");
    }
  }, []);

  // Initialize NEAR Wallet Selector (Meteor, Here, MyNearWallet, Sender)
  useEffect(() => {
    let isCancelled = false;

    async function initSelector() {
      try {
        const { setupWalletSelector } = await import("@near-wallet-selector/core");
        const { setupModal } = await import("@near-wallet-selector/modal-ui");
        const { setupMeteorWallet } = await import("@near-wallet-selector/meteor-wallet");
        const { setupHereWallet } = await import("@near-wallet-selector/here-wallet");
        const { setupMyNearWallet } = await import("@near-wallet-selector/my-near-wallet");
        const { setupSender } = await import("@near-wallet-selector/sender");

        const _selector = await setupWalletSelector({
          network: "testnet",
          modules: [
            setupMeteorWallet(),
            setupHereWallet(),
            setupMyNearWallet(),
            setupSender(),
          ],
        });

        const _modal = setupModal(_selector, {
          contractId: "fx-budget.chilliroger-operator.testnet",
          description: "Connect your NEAR wallet to manage Treasury FX goals and approvals.",
        });

        if (isCancelled) return;

        setSelector(_selector);
        setModal(_modal);

        // Check if an external wallet is already signed in via selector
        const state = _selector.store.getState();
        const selectedWalletId = state.selectedWalletId;
        const savedType = localStorage.getItem(STORAGE_TYPE_KEY) as WalletConnectionType | null;
        const savedAccount = localStorage.getItem(STORAGE_ACCOUNT_KEY);

        if (state.accounts.length > 0 && selectedWalletId && savedType !== "testnet-role") {
          const activeAccount = state.accounts[0].accountId;
          setAccountId(activeAccount);
          setConnectionType("wallet-selector");
          setWalletName(selectedWalletId);
          localStorage.setItem(STORAGE_ACCOUNT_KEY, activeAccount);
          localStorage.setItem(STORAGE_TYPE_KEY, "wallet-selector");
          refreshBalance(activeAccount);
        } else if (
          DEMO_SIGNER_ENABLED &&
          savedType === "testnet-role" &&
          savedAccount &&
          savedAccount !== "disconnected" &&
          DEFAULT_ACCOUNTS.includes(savedAccount)
        ) {
          setAccountId(savedAccount);
          setConnectionType("testnet-role");
          setWalletName("Testnet Role");
          refreshBalance(savedAccount);
        }

        // Subscribe to selector account changes
        const subscription = _selector.store.observable.subscribe(async (s) => {
          if (s.accounts.length > 0 && s.selectedWalletId) {
            const acc = s.accounts[0].accountId;
            setAccountId(acc);
            setConnectionType("wallet-selector");
            setWalletName(s.selectedWalletId);
            localStorage.setItem(STORAGE_ACCOUNT_KEY, acc);
            localStorage.setItem(STORAGE_TYPE_KEY, "wallet-selector");
            refreshBalance(acc);
          }
        });

        return () => subscription.unsubscribe();
      } catch (err) {
        console.error("Failed to initialize NEAR Wallet Selector:", err);
      }
    }

    initSelector();

    return () => {
      isCancelled = true;
    };
  }, [refreshBalance]);

  // Connect via testnet role (Operator / Council)
  const connectRole = async (targetAccount: string) => {
    if (!DEMO_SIGNER_ENABLED) {
      openWalletModal();
      return;
    }
    setIsConnecting(true);
    try {
      if (selector && selector.isSignedIn()) {
        try {
          const w = await selector.wallet();
          await w.signOut();
        } catch {}
      }
      setAccountId(targetAccount);
      setConnectionType("testnet-role");
      setWalletName("Testnet Role");
      localStorage.setItem(STORAGE_ACCOUNT_KEY, targetAccount);
      localStorage.setItem(STORAGE_TYPE_KEY, "testnet-role");
      await refreshBalance(targetAccount);
    } finally {
      setIsConnecting(false);
    }
  };

  // Open official NEAR Wallet Selector Modal (Meteor, Here, MyNearWallet, etc.)
  const openWalletModal = () => {
    if (modal) {
      modal.show();
    } else {
      console.warn("Wallet Selector modal not yet initialized");
    }
  };

  // Generic connect method
  const connect = async (accountOrTarget?: string) => {
    if (DEMO_SIGNER_ENABLED && accountOrTarget && DEFAULT_ACCOUNTS.includes(accountOrTarget)) {
      await connectRole(accountOrTarget);
    } else {
      openWalletModal();
    }
  };

  // Disconnect any active wallet or role
  const disconnect = async () => {
    if (selector && selector.isSignedIn()) {
      try {
        const w = await selector.wallet();
        await w.signOut();
      } catch (err) {
        console.warn("Error signing out from wallet selector:", err);
      }
    }
    setAccountId(null);
    setBalance(null);
    setConnectionType(null);
    setWalletName(null);
    localStorage.setItem(STORAGE_ACCOUNT_KEY, "disconnected");
    localStorage.setItem(STORAGE_TYPE_KEY, "disconnected");
  };

  // Sign and send transaction (routes to Wallet Selector or backend runner depending on connection type)
  const signAndSendTransaction = async (params: {
    receiverId: string;
    methodName: string;
    args: Record<string, unknown>;
    depositYocto?: string;
    depositNear?: string;
    gasUnits?: string;
  }): Promise<{ txHash: string; explorerUrl: string }> => {
    if (!accountId) throw new Error("Wallet not connected");

    let depositStr = "0 NEAR";
    let depositYocto = "0";

    if (params.depositNear) {
      depositStr = params.depositNear.includes("NEAR")
        ? params.depositNear
        : `${params.depositNear} NEAR`;
      const numNear = parseFloat(params.depositNear.replace(/[^\d.]/g, ""));
      depositYocto = nearToYocto(isNaN(numNear) ? 0 : numNear);
    } else if (params.depositYocto) {
      depositYocto = params.depositYocto;
      depositStr =
        params.depositYocto === "1"
          ? "1 yoctoNEAR"
          : `${yoctoToNear(params.depositYocto)} NEAR`;
    }

    // Convert gas units to yoctoGas string
    let gasUnitsBigInt = "100000000000000"; // 100 Tgas default
    if (params.gasUnits) {
      const match = params.gasUnits.match(/([\d.]+)\s*Tgas/i);
      if (match) {
        gasUnitsBigInt = BigInt(Math.round(parseFloat(match[1]) * 1e12)).toString();
      }
    }

    // Route A: External Web3 Wallet via Wallet Selector (Meteor, Here, MyNearWallet, Sender)
    if (connectionType === "wallet-selector" && selector && selector.isSignedIn()) {
      const { actionCreators } = await import("@near-wallet-selector/core");
      const wallet = await selector.wallet();
      const outcome = await wallet.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: [
          actionCreators.functionCall(
            params.methodName,
            params.args,
            BigInt(gasUnitsBigInt),
            BigInt(depositYocto)
          ),
        ],
      });

      let txHash = "";
      if (outcome && typeof outcome === "object") {
        const obj = outcome as unknown as Record<string, unknown>;
        if ("transaction" in obj && typeof obj.transaction === "object" && obj.transaction && "hash" in obj.transaction) {
          txHash = String((obj.transaction as Record<string, unknown>).hash || "");
        } else if ("transaction_outcome" in obj && typeof obj.transaction_outcome === "object" && obj.transaction_outcome && "id" in obj.transaction_outcome) {
          txHash = String((obj.transaction_outcome as Record<string, unknown>).id || "");
        }
      }

      return {
        txHash: txHash || "tx_confirmed",
        explorerUrl: txHash
          ? explorerTxUrl(txHash)
          : `https://testnet.nearblocks.io/address/${params.receiverId}`,
      };
    }

    // Route B (opt-in, team demo only): allow-listed testnet role signed by the local server keychain.
    if (!DEMO_SIGNER_ENABLED) {
      throw new Error("No wallet connected. Connect your own NEAR testnet wallet to sign.");
    }
    const res = await fetch("/api/near/tx", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getDemoToken()}` },
      body: JSON.stringify({
        contractId: params.receiverId,
        methodName: params.methodName,
        args: params.args,
        signerId: accountId,
        deposit: depositStr,
        gas: params.gasUnits || "100.0 Tgas",
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Transaction execution failed on NEAR testnet");
    }

    return {
      txHash: data.txHash,
      explorerUrl: data.explorerUrl || explorerTxUrl(data.txHash),
    };
  };

  return (
    <NearWalletContext.Provider
      value={{
        accountId,
        isConnected: Boolean(accountId),
        balance,
        networkId: "testnet",
        isConnecting,
        connectionType,
        walletName,
        availableAccounts: DEFAULT_ACCOUNTS,
        demoSignerEnabled: DEMO_SIGNER_ENABLED,
        connectRole,
        openWalletModal,
        connect,
        disconnect,
        signAndSendTransaction,
      }}
    >
      {children}
    </NearWalletContext.Provider>
  );
}

export function useNearWallet() {
  const ctx = useContext(NearWalletContext);
  if (!ctx) {
    throw new Error("useNearWallet must be used within a NearWalletProvider");
  }
  return ctx;
}

/** Authorization header for the opt-in server-side demo routes (/api/faucet, /api/agent/trigger). */
export function demoAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getDemoToken()}` };
}
