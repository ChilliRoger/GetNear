import { useOracleData } from './useOracleData'
import TimingScorePanel from './TimingScorePanel'
import BookDepthWidget from './BookDepthWidget'
import StrategyDecisionLog from './StrategyDecisionLog'
import PriceSourcesPanel from './PriceSourcesPanel'
import TradeOrdersTable from './TradeOrdersTable'
import CRERunHistory from './CRERunHistory'
import PriceChartsWidget from './PriceChartsWidget'
import ControlsBar from './ControlsBar'
import ScoringConfigPanel from './ScoringConfigPanel'

export default function OraclePage() {
  const {
    strategy,
    prices,
    trades,
    creRuns,
    decisions,
    demoStatus,
    toggleSpeed,
    seedDemo,
  } = useOracleData()

  return (
    <div className="space-y-3">
      {/* Scoring config — collapsible panel */}
      <ScoringConfigPanel />

      {/* Timing score + Book depth — 2-column hero */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimingScorePanel
          data={strategy.data}
          loading={strategy.loading}
          error={strategy.error}
          prices={prices.data}
        />
        <BookDepthWidget />
      </div>

      {/* Price charts — 2-column: history + divergence */}
      <PriceChartsWidget />

      {/* Strategy decision log — full width */}
      <StrategyDecisionLog
        data={decisions.data}
        loading={decisions.loading}
        error={decisions.error}
      />

      {/* Price sources + Controls — side by side on wider screens */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3">
        <PriceSourcesPanel
          data={prices.data}
          loading={prices.loading}
          error={prices.error}
        />
        <ControlsBar
          demoStatus={demoStatus.data}
          onToggleSpeed={toggleSpeed}
          onSeed={seedDemo}
        />
      </div>

      {/* Trade orders — full width */}
      <TradeOrdersTable
        data={trades.data}
        loading={trades.loading}
        error={trades.error}
      />

      {/* CRE run history — full width */}
      <CRERunHistory
        data={creRuns.data}
        loading={creRuns.loading}
        error={creRuns.error}
      />
    </div>
  )
}
