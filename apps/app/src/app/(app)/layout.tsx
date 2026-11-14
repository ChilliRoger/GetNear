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
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-4">
            <div className="flex items-center gap-8">
              <BrandMark />
              <DesktopNav />
            </div>
            <WalletConnectButton />
          </div>
          <TickerTape />
        </header>

        <div className="border-b border-warn/20 bg-warn/[0.04] px-4 py-1 text-center text-[11px] text-warn/90">
          Testnet demo · EURe payout is a callback-verified demo token · USDC to EUR conversion is simulated (1Click dry quotes)
        </div>

        <main className="mx-auto min-h-[70vh] max-w-[1440px] px-4 pb-28 pt-5 md:pb-12">
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
