"use client";

import { DesktopNav, Nav } from "@/components/nav";
import { BrandMark } from "@/components/brand";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { TickerTape } from "@/components/ticker-tape";
import { SiteFooter } from "@/components/site-footer";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastProvider } from "@/components/toast-provider";
import { NearWalletProvider } from "@/lib/near-wallet";
import { useI18n } from "@/lib/i18n";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <ToastProvider>
      <NearWalletProvider>
        <div className="border-b border-dashed border-warn/40 bg-warn/5 px-4 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-warn">
          Testnet demo · EURe payout = callback-verified demo token · USDC→EUR conversion is simulated
        </div>

        <header className="sticky top-0 z-40 border-b border-border-bright bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <BrandMark />
            <DesktopNav />
            <WalletConnectButton />
          </div>
        </header>

        <TickerTape />

        <main className="mx-auto min-h-[70vh] max-w-6xl px-4 pb-28 pt-8 md:pb-16">
          <ErrorBoundary fallbackTitle={t("error.boundary_title")} fallbackRetry={t("error.boundary_retry")}>
            {children}
          </ErrorBoundary>
        </main>

        <SiteFooter />
        <Nav />
      </NearWalletProvider>
    </ToastProvider>
  );
}
