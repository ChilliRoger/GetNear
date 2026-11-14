"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNearWallet } from "@/lib/near-wallet";
import { explorerAccountUrl } from "@getnear/shared";
import {
  ExternalLink,
  Check,
  ChevronDown,
  Wallet,
  Shield,
  LogOut,
  RefreshCw,
} from "lucide-react";

export function WalletConnectButton() {
  const {
    accountId,
    isConnected,
    balance,
    connectionType,
    walletName,
    availableAccounts,
    demoSignerEnabled,
    openWalletModal,
    connectRole,
    disconnect,
  } = useNearWallet();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"wallets" | "roles">("wallets");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Format wallet badge label
  const getWalletBadge = () => {
    if (connectionType === "wallet-selector") {
      if (walletName?.toLowerCase().includes("meteor")) return "Meteor Wallet";
      if (walletName?.toLowerCase().includes("here")) return "Here Wallet";
      if (walletName?.toLowerCase().includes("my-near")) return "MyNearWallet";
      if (walletName?.toLowerCase().includes("sender")) return "Sender Wallet";
      return "Web3 Wallet";
    }
    if (accountId?.includes("operator")) return "Operator";
    if (accountId?.includes("council1")) return "Council 1";
    if (accountId?.includes("council2")) return "Council 2";
    if (accountId?.includes("council3")) return "Council 3";
    return "Testnet";
  };

  // ──────────────── DISCONNECTED STATE ────────────────
  if (!isConnected || !accountId) {
    return (
      <div className="relative " ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 border border-info bg-info/10 px-3 py-1.5 text-xs font-semibold text-info transition-colors hover:bg-info/20"
        >
          <Wallet className="h-3.5 w-3.5" />
          <span>[ CONNECT WALLET ]</span>
          <ChevronDown
            className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-surface/98 p-3.5 shadow-2xl backdrop-blur-md z-50">
            {/* Header Tabs */}
            <div className="flex rounded-lg border border-border bg-background p-0.5 mb-3 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("wallets")}
                className={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "wallets"
                    ? "bg-accent-blue/20 text-accent-blue font-semibold"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Wallet className="h-3 w-3" />
                <span>Crypto Wallets</span>
              </button>
              {demoSignerEnabled && (
              <button
                type="button"
                onClick={() => setActiveTab("roles")}
                className={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "roles"
                    ? "bg-accent-blue/20 text-accent-blue font-semibold"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Shield className="h-3 w-3" />
                <span>Testnet Roles</span>
              </button>
              )}
            </div>

            {/* TAB 1: CRYPTO WALLETS (UNIVERSAL WALLET SELECTOR) */}
            {activeTab === "wallets" && (
              <div className="space-y-2.5">
                <div className="text-[11px] text-zinc-300">
                  Connect your own NEAR wallet on testnet to sign orders and votes:
                </div>

                {/* Primary Button to open NEAR Wallet Selector modal */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    openWalletModal();
                  }}
                  className="w-full flex items-center justify-between rounded-lg border border-accent-blue bg-accent-blue py-2 px-3 text-xs font-semibold text-white hover:bg-accent-blue/90 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    <span>Open NEAR Wallet Selector</span>
                  </div>
                  <span className="text-[11px] opacity-90">&rarr;</span>
                </button>

                <div className="rounded-lg border border-border bg-background/60 p-2 text-[10px] space-y-1 text-muted">
                  <div className="font-semibold text-zinc-300">Supported Wallets:</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-zinc-400">
                    <div>• Meteor Wallet</div>
                    <div>• Here Wallet</div>
                    <div>• MyNearWallet</div>
                    <div>• Sender Wallet</div>
                  </div>
                  <div className="pt-1 text-[10px] text-zinc-500 border-t border-border">
                    Make sure your wallet extension is set to <strong>NEAR Testnet</strong>.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PRE-FUNDED TESTNET ROLES */}
            {demoSignerEnabled && activeTab === "roles" && (
              <div className="space-y-2">
                <div className="text-[11px] text-zinc-300 mb-1">
                  Connect as an authorized testnet account for multisig evaluation:
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {availableAccounts.map((acc) => {
                    const isOp = acc.includes("operator");
                    const roleLabel = isOp
                      ? "Treasury Operator (Order & Proposal Submitter)"
                      : `Council Member ${acc.replace(/.*council(\d).*/, "$1")} (Multisig Voter)`;

                    return (
                      <button
                        key={acc}
                        type="button"
                        onClick={() => {
                          connectRole(acc);
                          setIsOpen(false);
                        }}
                        className="flex w-full items-start justify-between rounded-lg p-2 text-left text-xs border border-border bg-background hover:bg-surface-hover hover:border-zinc-700 transition-colors"
                      >
                        <div>
                          <div className="text-[11px] font-semibold text-foreground">
                            {acc}
                          </div>
                          <div className="text-[10px] text-muted">{roleLabel}</div>
                        </div>
                        <span className="text-[10px] font-semibold text-accent-blue mt-0.5">
                          Connect &rarr;
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ──────────────── CONNECTED STATE ────────────────
  const shortName =
    accountId.length > 20 ? `${accountId.slice(0, 16)}...` : accountId;

  return (
    <div className="relative " ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand"
      >
        <span className="h-1.5 w-1.5 bg-brand" />
        <span className="border border-border bg-background px-1 py-0.5 text-[9px] uppercase text-muted">
          {getWalletBadge()}
        </span>
        <span className="text-[11px] font-semibold text-foreground">{shortName}</span>
        {balance && (
          <span className="text-[10px] text-brand">({balance})</span>
        )}
        <ChevronDown
          className={`h-3 w-3 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-surface/98 p-3.5 shadow-2xl backdrop-blur-md z-50 text-xs">
          {/* Account Details */}
          <div className="mb-2.5 pb-2.5 border-b border-border">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted font-medium">
              <span>Connected Account</span>
              <span className="text-accent-green">{getWalletBadge()}</span>
            </div>
            <div className="mt-1 text-xs font-semibold text-foreground break-all">
              {accountId}
            </div>
            {balance && (
              <div className="mt-0.5 text-xs text-accent-green font-medium">
                {balance}
              </div>
            )}
            <a
              href={explorerAccountUrl(accountId)}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 flex items-center gap-1 text-[11px] text-accent-blue hover:underline"
            >
              <span>View on NearBlocks</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Quick Actions / Switcher */}
          <div className="mb-3 space-y-1.5">
            {connectionType === "wallet-selector" ? (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  openWalletModal();
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-1.5 text-xs font-medium text-foreground hover:bg-surface-hover transition-colors"
              >
                <RefreshCw className="h-3 w-3 text-accent-blue" />
                <span>Switch / Change Wallet</span>
              </button>
            ) : (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1 font-medium">
                  Switch Testnet Role
                </div>
                <div className="space-y-1">
                  {availableAccounts.map((acc) => (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => {
                        connectRole(acc);
                        setIsOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs transition-colors ${
                        acc === accountId
                          ? "bg-accent-blue/15 font-semibold text-accent-blue"
                          : "text-muted hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      <span className="text-[11px] truncate">{acc}</span>
                      {acc === accountId && <Check className="h-3 w-3 text-accent-blue" />}
                    </button>
                  ))}
                </div>
                <div className="pt-2 mt-1 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      openWalletModal();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-1 text-[11px] text-muted hover:text-foreground transition-colors"
                  >
                    <Wallet className="h-3 w-3 text-accent-blue" />
                    <span>Connect External Crypto Wallet</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Disconnect Button */}
          <button
            type="button"
            onClick={() => {
              disconnect();
              setIsOpen(false);
            }}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 py-1.5 text-center text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="h-3 w-3" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}
