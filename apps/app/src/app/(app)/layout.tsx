"use client";

import Link from "next/link";
import { DesktopNav, Nav } from "@/components/nav";
import { GetNearLogo } from "@/components/getnear-logo";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { RateBar } from "@/components/rate-bar";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastProvider } from "@/components/toast-provider";
import { NearWalletProvider } from "@/lib/near-wallet";
import { useI18n } from "@/lib/i18n";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <ToastProvider>
      <NearWalletProvider>
        {/* Honesty banner: testnet + what is simulated */}
        <div className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-xs font-medium text-warn">
          Testnet demo · EURe payout is a callback-verified demo token · USDC→EUR conversion is simulated (1Click dry quotes)
        </div>

        <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <GetNearLogo size={32} cropped />
              <div className="leading-tight">
                <div className="text-sm font-bold tracking-tight">GetNear</div>
                <div className="hidden text-[11px] text-muted sm:block">Treasury FX agent · NEAR testnet</div>
              </div>
            </Link>
            <DesktopNav />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <WalletConnectButton />
            </div>
          </div>
        </header>

        <RateBar />

        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-12">
          <ErrorBoundary
            fallbackTitle={t("error.boundary_title")}
            fallbackRetry={t("error.boundary_retry")}
          >
            {children}
          </ErrorBoundary>
        </main>

        <Nav />
      </NearWalletProvider>
    </ToastProvider>
  );
}
