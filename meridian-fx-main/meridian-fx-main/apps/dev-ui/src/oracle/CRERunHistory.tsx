import { useMemo } from 'react'
import type { CRERun } from './types'

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncHash(hash: string): string {
  if (hash.length <= 14) return hash
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

const RESULT_STYLES: Record<string, string> = {
  success:   'text-ok',
  pending:   'text-muted',
  failed:    'text-danger',
  skipped:   'text-warn',
  submitted: 'text-accent',
}

interface Props {
  data: CRERun[] | null
  loading: boolean
  error: string | null
}

export default function CRERunHistory({ data, loading, error }: Props) {
  // Sort most recent first — memoized to avoid re-sorting on every render
  // Hook must be called unconditionally (React rules of hooks)
  const sorted = useMemo(
    () => (data ? [...data].sort((a, b) => b.timestamp - a.timestamp) : []),
    [data],
  )

  if (error && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">CRE Run History</div>
        <p className="text-warn text-sm">Endpoint unavailable</p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">CRE Run History</div>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-border rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-3">
        CRE Run History
        {sorted.length > 0 && (
          <span className="ml-2 text-[0.65rem] opacity-60">({sorted.length})</span>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-muted text-sm">No CRE runs recorded yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full border-collapse text-xs min-w-[600px]">
            <thead>
              <tr>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Time</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Action</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Order</th>
                <th className="text-right text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Chunk</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Result</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Tx</th>
                <th className="text-right text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Duration</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((run) => {
                const resultStyle = RESULT_STYLES[run.result.toLowerCase()] || 'text-muted'
                return (
                  <tr key={run.id} className="hover:bg-bg/50 transition-colors">
                    <td className="px-2 py-2 border-b border-border tabular-nums text-muted">
                      {formatTimestamp(run.timestamp)}
                    </td>
                    <td className="px-2 py-2 border-b border-border font-semibold">
                      {run.action}
                    </td>
                    <td className="px-2 py-2 border-b border-border font-mono text-[0.7rem]">
                      {run.order_id.length > 10
                        ? `${run.order_id.slice(0, 6)}...${run.order_id.slice(-4)}`
                        : run.order_id}
                    </td>
                    <td className="px-2 py-2 border-b border-border text-right tabular-nums">
                      {run.chunk_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-2 py-2 border-b border-border font-semibold capitalize ${resultStyle}`}>
                      {run.result}
                    </td>
                    <td className="px-2 py-2 border-b border-border">
                      {run.tx_hash ? (
                        <a
                          href={`https://basescan.org/tx/${run.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline font-mono text-[0.7rem]"
                        >
                          {truncHash(run.tx_hash)}
                        </a>
                      ) : (
                        <span className="text-muted">--</span>
                      )}
                    </td>
                    <td className="px-2 py-2 border-b border-border text-right tabular-nums text-muted">
                      {run.duration_ms}ms
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
