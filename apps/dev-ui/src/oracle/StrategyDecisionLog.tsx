import type { StrategyDecision } from './types'

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function scoreColor(score: number): string {
  if (score > 70) return 'text-ok'
  if (score >= 40) return 'text-warn'
  return 'text-danger'
}

function truncId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

interface Props {
  data: StrategyDecision[] | null
  loading: boolean
  error: string | null
}

export default function StrategyDecisionLog({ data, loading, error }: Props) {
  if (error && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Strategy Decision Log</div>
        <p className="text-warn text-sm">Endpoint unavailable</p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Strategy Decision Log</div>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-border rounded" />
          ))}
        </div>
      </div>
    )
  }

  const rows = data || []

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-3">
        Strategy Decision Log
        {rows.length > 0 && (
          <span className="ml-2 text-[0.65rem] opacity-60">({rows.length})</span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted text-sm">No strategy decisions yet.</p>
      ) : (
        <div className="max-h-[400px] overflow-y-auto -mx-1">
          <table className="w-full border-collapse text-xs min-w-[700px]">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Time</th>
                <th className="text-center text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Score</th>
                <th className="text-center text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Action</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Order</th>
                <th className="text-right text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Chunk</th>
                <th className="text-center text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">P / D / U</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const isSwap = d.action === 'SWAP'
                return (
                  <tr
                    key={d.id}
                    className={`hover:bg-bg/50 transition-colors ${isSwap ? 'bg-ok/[0.04]' : ''}`}
                  >
                    <td className="px-2 py-2 border-b border-border tabular-nums text-muted whitespace-nowrap">
                      {formatTimestamp(d.timestamp)}
                    </td>
                    <td className={`px-2 py-2 border-b border-border text-center tabular-nums font-bold ${scoreColor(d.score)}`}>
                      {d.score}
                    </td>
                    <td className="px-2 py-2 border-b border-border text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                          isSwap ? 'bg-ok/20 text-ok' : 'bg-warn/20 text-warn'
                        }`}
                      >
                        {d.action}
                      </span>
                    </td>
                    <td className="px-2 py-2 border-b border-border font-mono text-[0.7rem]">
                      {d.order_id ? truncId(d.order_id) : <span className="text-muted">--</span>}
                    </td>
                    <td className="px-2 py-2 border-b border-border text-right tabular-nums">
                      {d.chunk_amount
                        ? Number(d.chunk_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : <span className="text-muted">--</span>}
                    </td>
                    <td className="px-2 py-2 border-b border-border text-center tabular-nums text-[0.7rem]">
                      {d.price_score != null
                        ? `${d.price_score} / ${d.divergence_score} / ${d.urgency_score}`
                        : <span className="text-muted">--</span>}
                    </td>
                    <td className="px-2 py-2 border-b border-border text-muted max-w-[200px] truncate" title={d.reason}>
                      {d.reason}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
