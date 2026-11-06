import type { TimingStrategy, PriceComparison } from './types'

function scoreColor(score: number): string {
  if (score > 70) return 'text-ok'
  if (score >= 40) return 'text-warn'
  return 'text-danger'
}

function scoreBg(score: number): string {
  if (score > 70) return 'bg-ok'
  if (score >= 40) return 'bg-warn'
  return 'bg-danger'
}

function actionBadge(action: string) {
  const isSwap = action === 'SWAP'
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider ${
        isSwap ? 'bg-ok/20 text-ok' : 'bg-warn/20 text-warn'
      }`}
    >
      {action}
    </span>
  )
}

const COMPONENT_LABELS: Record<string, { label: string; weight: string }> = {
  price_vs_avg:       { label: 'Price vs Avg',      weight: '40%' },
  source_divergence:  { label: 'Source Divergence',  weight: '20%' },
  urgency:            { label: 'Urgency',            weight: '40%' },
}

interface Props {
  data: TimingStrategy | null
  loading: boolean
  error: string | null
  prices?: PriceComparison[] | null
}

export default function TimingScorePanel({ data, loading, error, prices }: Props) {
  if (error && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Timing Score</div>
        <p className="text-warn text-sm">Waiting for oracle strategy endpoint...</p>
        <p className="text-muted text-xs mt-1">
          Start the oracle: <code className="bg-bg px-1.5 py-0.5 rounded text-xs">cd apps/oracle && pnpm dev</code>
        </p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Timing Score</div>
        <div className="animate-pulse flex items-center gap-4">
          <div className="size-20 rounded-full bg-border" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-border rounded w-1/3" />
            <div className="h-3 bg-border rounded w-2/3" />
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const score = data.score ?? 0

  // Normalize breakdown: API returns {priceScore, divergenceScore, urgencyScore} object
  // but the UI expects [{name, weight, raw_score}] array
  const rawBreakdown = data.breakdown as Record<string, number | undefined> | undefined
  const breakdownArray = Array.isArray(data.breakdown)
    ? data.breakdown
    : rawBreakdown && typeof rawBreakdown === 'object'
      ? [
          { name: 'price_vs_avg', weight: 0.4, raw_score: rawBreakdown.priceScore ?? 0 },
          { name: 'source_divergence', weight: 0.2, raw_score: rawBreakdown.divergenceScore ?? 0 },
          { name: 'urgency', weight: 0.4, raw_score: rawBreakdown.urgencyScore ?? 0 },
        ]
      : []
  const hasBreakdown = breakdownArray.length > 0

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="text-xs uppercase tracking-wide text-muted mb-4">Timing Score</div>

      <div className="flex items-center gap-6 mb-4">
        {/* Big score circle */}
        <div className="relative flex items-center justify-center">
          <svg className="size-24" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="6"
            />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 264} 264`}
              transform="rotate(-90 50 50)"
              className={scoreColor(score)}
            />
          </svg>
          <span className={`absolute text-2xl font-bold tabular-nums ${scoreColor(score)}`}>
            {score}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {actionBadge(data.action)}
          </div>
          <p className="text-sm text-muted leading-relaxed break-words">{data.reason}</p>
        </div>
      </div>

      {/* Compact price source row */}
      {prices && prices.length > 0 && prices[0].sources.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted mb-4 px-1">
          {prices[0].sources.map((s) => (
            <span key={s.source}>
              <span className="opacity-60">{s.source}:</span>{' '}
              <span className="font-semibold tabular-nums text-text">{s.price.toFixed(4)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Breakdown bars */}
      {hasBreakdown && (
        <div className="space-y-2.5 pt-3 border-t border-border">
          {breakdownArray.map((comp) => {
            const meta = COMPONENT_LABELS[comp.name] || { label: comp.name, weight: `${(comp.weight * 100).toFixed(0)}%` }
            const pct = Math.min(100, Math.max(0, comp.raw_score))
            return (
              <div key={comp.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted">
                    {meta.label} <span className="opacity-60">({meta.weight})</span>
                  </span>
                  <span className="tabular-nums font-semibold">{comp.raw_score.toFixed(0)}</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${scoreBg(comp.raw_score)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
