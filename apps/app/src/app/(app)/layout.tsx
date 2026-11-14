"use client";

import { Nav } from "@/components/nav";
import { GetNearLogo } from "@/components/getnear-logo";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastProvider } from "@/components/toast-provider";
import { NearWalletProvider } from "@/lib/near-wallet";
import { AsciiTickerBar } from "@/components/ascii-ticker-bar";
import { useI18n } from "@/lib/i18n";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useI18n();

  return (
    <ToastProvider>
      <NearWalletProvider>
        {/* Testnet & Settlement Provenance Banner */}
        <div className="bg-[#12141c] border-b border-border px-3 py-1.5 text-center font-mono text-[11px] text-amber-400 tracking-wide flex items-center justify-center gap-2">
          <span className="inline-block h-1.5 w-1.5 bg-amber-400" />
          <span>[ TESTNET · CALLBACK-VERIFIED EURe PAYOUT · SIMULATED USDC FX LEG (1Click dry:true) ]</span>
        </div>

        {/* Live ASCII Market Ticker */}
        <AsciiTickerBar />

        {/* Terminal Header */}
        <header className="sticky top-0 z-40 border-b border-border bg-[#090a0f]/95 select-none font-mono">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <GetNearLogo size={32} cropped />
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-semibold tracking-wider text-foreground">
                    GETNEAR
                  </h1>
                  <span className="border border-[#00ec97] bg-[#00ec97]/10 px-1 py-0.2 text-[9px] font-bold text-[#00ec97]">
                    TERMINAL
                  </span>
                </div>
                <p className="text-[10px] uppercase tracking-widest text-muted">
                  TREASURY FX DESK // NEAR TESTNET
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <WalletConnectButton />
            </div>
          </div>
        </header>

        {/* Main content area — padded for bottom nav */}
        <main className="mx-auto max-w-xl px-4 pb-24 pt-4 font-mono">
          <ErrorBoundary
            fallbackTitle={t("error.boundary_title")}
            fallbackRetry={t("error.boundary_retry")}
          >
            {children}
          </ErrorBoundary>
        </main>

        {/* Footer note */}
        <div className="fixed bottom-14 left-0 right-0 z-30 pointer-events-none font-mono">
          <div className="mx-auto max-w-xl px-4">
            <p className="text-center text-[10px] text-muted/60 bg-[#090a0f]/90 py-1 border-t border-border/40">
              {t("landing.display_note")}
            </p>
          </div>
        </div>

        {/* Bottom navigation */}
        <Nav />
      </NearWalletProvider>
    </ToastProvider>
  );
}
