import type { PriceComparison } from './types'

function divColor(bps: number): string {
  if (bps < 10) return 'text-ok'
  if (bps < 50) return 'text-warn'
  return 'text-danger'
}

function divBg(bps: number): string {
  if (bps < 10) return 'bg-ok'
  if (bps < 50) return 'bg-warn'
  return 'bg-danger'
}

interface Props {
  data: PriceComparison[] | null
  loading: boolean
  error: string | null
}

export default function PriceSourcesPanel({ data, loading, error }: Props) {
  if (error && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Price Sources</div>
        <p className="text-warn text-sm">Endpoint unavailable</p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Price Sources</div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-border rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Price Sources</div>
        <p className="text-muted text-sm">No comparison data yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-3">Price Sources</div>

      <div className="space-y-3">
        {data.map((comp) => {
          const avgDiffPct = comp.average_24h != null && comp.average_24h > 0
            ? ((comp.current_avg - comp.average_24h) / comp.average_24h) * 100
            : null

          return (
            <div key={comp.pair} className="bg-bg border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{comp.pair}</span>
                <span className={`text-xs font-bold tabular-nums ${divColor(comp.divergence_bps)}`}>
                  <span className={`inline-block size-1.5 rounded-full mr-1 ${divBg(comp.divergence_bps)}`} />
                  {comp.divergence_bps.toFixed(1)} bps
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                {comp.sources.map((src) => (
                  <div key={src.source} className="flex flex-col">
                    <span className="text-muted text-[0.65rem] uppercase tracking-wider">{src.source}</span>
                    <span className="font-semibold tabular-nums">{src.price.toFixed(4)}</span>
                  </div>
                ))}
              </div>

              {avgDiffPct != null && (
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-border text-[0.7rem]">
                  <span className="text-muted">24h avg: {comp.average_24h!.toFixed(4)}</span>
                  <span className={avgDiffPct > 0 ? 'text-ok' : avgDiffPct < -0.1 ? 'text-danger' : 'text-muted'}>
                    {avgDiffPct > 0 ? '+' : ''}{avgDiffPct.toFixed(3)}%
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
