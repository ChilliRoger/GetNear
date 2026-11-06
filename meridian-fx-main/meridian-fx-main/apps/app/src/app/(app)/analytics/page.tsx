"use client";

import { TimingScoreGauge } from "@/components/analytics/timing-score-gauge";
import { PriceHistoryChart } from "@/components/analytics/price-history-chart";
import { PriceSourcesPanel } from "@/components/analytics/price-sources-panel";
import { DepthChart } from "@/components/analytics/depth-chart";
import { BookDepthChart } from "@/components/analytics/book-depth-chart";
import { useI18n } from "@/lib/i18n";

export default function AnalyticsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {t("nav.analytics")}
        </h1>
        <p className="text-xs text-muted">
          Oracle charts, price sources, and liquidity depth
        </p>
      </div>

      {/* Timing score gauge at top */}
      <TimingScoreGauge />

      {/* Price history (full width) */}
      <PriceHistoryChart />

      {/* Price sources panel */}
      <PriceSourcesPanel />

      {/* Liquidity depth chart */}
      <DepthChart />

      {/* Book depth chart */}
      <BookDepthChart />
    </div>
  );
}
