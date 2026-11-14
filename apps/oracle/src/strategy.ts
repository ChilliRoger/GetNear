/**
 * The strategy engine (timing score + adaptive TWAP) lives in @getnear/shared so the oracle simulator
 * and the on-chain agent run exactly the same logic. This file keeps the old import path working.
 */
export {
  evaluateStrategy,
  computeAdaptiveChunkSize,
  computePriceScore,
  computeDivergenceScore,
  computeUrgencyScore,
  strategyConfig,
  updateStrategyConfig,
  TICK_INTERVAL_SEC,
  type MarketInputs,
  type OrderContext,
  type StrategyDecision,
  type StrategyConfig,
  type SizingParams,
  type StrategyScoreBreakdown as ScoreBreakdown,
} from '@getnear/shared'
