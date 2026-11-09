"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNearWallet } from "@/lib/near-wallet";
import { explorerAccountUrl } from "@getnear/shared";
import { ExternalLink, Check, ChevronDown } from "lucide-react";

export function WalletConnectButton() {
  const {
    accountId,
    isConnected,
    balance,
    availableAccounts,
    connect,
    disconnect,
  } = useNearWallet();

  const [isOpen, setIsOpen] = useState(false);
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

  if (!isConnected || !accountId) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 rounded-lg border border-accent-blue/40 bg-accent-blue/15 px-3 py-1.5 text-xs font-semibold text-accent-blue transition-colors hover:bg-accent-blue/25"
        >
          <span>Connect Test Wallet</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-border bg-surface p-3 shadow-xl z-50">
            <div className="mb-2 pb-2 border-b border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted font-medium">
                Select NEAR Testnet Account
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Choose an account to connect with:
              </div>
            </div>

            <div className="space-y-1.5">
              {availableAccounts.map((acc) => {
                const isOp = acc.includes("operator");
                const role = isOp
                  ? "Treasury Operator"
                  : `Council Member ${acc.replace(/.*council(\d).*/, "$1")}`;
                return (
                  <button
                    key={acc}
                    onClick={() => {
                      connect(acc);
                      setIsOpen(false);
                    }}
                    className="flex w-full items-start justify-between rounded-lg p-2 text-left text-xs border border-border bg-background hover:bg-surface-hover hover:border-zinc-700 transition-colors"
                  >
                    <div>
                      <div className="font-mono text-[11px] font-semibold text-foreground">
                        {acc}
                      </div>
                      <div className="text-[10px] text-muted">Role: {role}</div>
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
    );
  }

  // Shorten for compact UI, e.g. chilliroger-operator...
  const shortName =
    accountId.length > 20 ? `${accountId.slice(0, 16)}...` : accountId;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-hover"
      >
        <span className="h-2 w-2 rounded-full bg-accent-green" />
        <span className="font-mono text-[11px]">{shortName}</span>
        {balance && (
          <span className="text-[10px] text-muted">({balance})</span>
        )}
        <ChevronDown className="h-3 w-3 text-muted" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-surface/95 p-3 shadow-xl backdrop-blur-md z-50">
          <div className="mb-2.5 pb-2 border-b border-border">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Connected Account (NEAR Testnet)
            </div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-foreground break-all">
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

          <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
              Switch Testnet Account
            </div>
            <div className="space-y-1">
              {availableAccounts.map((acc) => (
                <button
                  key={acc}
                  onClick={() => {
                    connect(acc);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs transition-colors ${
                    acc === accountId
                      ? "bg-accent-blue/15 font-semibold text-accent-blue"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  <span className="font-mono text-[11px] truncate">{acc}</span>
                  {acc === accountId && <Check className="h-3 w-3 text-accent-blue" />}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              disconnect();
              setIsOpen(false);
            }}
            className="w-full rounded-lg border border-red-500/20 bg-red-500/10 py-1 text-center text-xs font-medium text-red-400 hover:bg-red-500/20"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
