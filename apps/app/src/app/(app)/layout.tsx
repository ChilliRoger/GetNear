"use client";

import { Nav } from "@/components/nav";
import { GetNearLogo } from "@/components/getnear-logo";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastProvider } from "@/components/toast-provider";
import { NearWalletProvider } from "@/lib/near-wallet";
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
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 text-center text-[11px] font-medium text-amber-400 tracking-wide flex items-center justify-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>TESTNET · CALLBACK-VERIFIED EURe PAYOUT · SIMULATED USDC FX LEG (1Click dry:true)</span>
        </div>

        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <GetNearLogo size={36} cropped />
              <div>
                <h1 className="text-base font-semibold tracking-tight">
                  {t("header.title")}
                </h1>
                <p className="text-[11px] uppercase tracking-widest text-muted">
                  {t("header.subtitle")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <WalletConnectButton />
            </div>
          </div>
        </header>

      {/* DemoClock hidden for video recording */}
      {/* {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && <DemoClock />} */}

      {/* Main content area — padded for bottom nav */}
      <main className="mx-auto max-w-lg px-4 pb-24 pt-4">
        <ErrorBoundary
          fallbackTitle={t("error.boundary_title")}
          fallbackRetry={t("error.boundary_retry")}
        >
          {children}
        </ErrorBoundary>
      </main>

      {/* Footer note */}
      <div className="fixed bottom-16 left-0 right-0 z-30 pointer-events-none">
        <div className="mx-auto max-w-lg px-4">
          <p className="text-center text-[11px] text-muted/70">
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
