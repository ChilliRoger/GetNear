import { useState } from 'react'
import type { TradeOrder } from './types'

const STATUS_STYLES: Record<string, string> = {
  PENDING:   'bg-muted/15 text-muted',
  APPROVED:  'bg-accent/15 text-accent',
  FILLING:   'bg-accent/15 text-accent',
  COMPLETE:  'bg-ok/15 text-ok',
  CANCELLED: 'bg-danger/15 text-danger',
}

function formatCountdown(deadline: number): string {
  const now = Date.now() / 1000
  const diff = deadline - now
  if (diff <= 0) return 'Expired'
  const m = Math.floor(diff / 60)
  const s = Math.floor(diff % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// NOTE: Must match TICK_INTERVAL in apps/oracle/src/strategy.ts (currently 30s).
// dev-ui cannot import from oracle directly; keep these in sync manually.
const TICK_INTERVAL = 30

/** Compute a lightweight adaptive TWAP preview for display purposes. */
function computeChunkPlan(order: TradeOrder): { chunkDisplay: string; urgencyPct: number; label: string } | null {
  const isActive = order.status === 'FILLING' || order.status === 'APPROVED' || order.status === 'PENDING'
  if (!isActive) return null

  const now = Math.floor(Date.now() / 1000)
  const createdAt = order.created_at ?? now
  const deadline = order.deadline

  // Parse amounts from raw fields (fall back to display fields)
  const inputAmt = order.input_amount ? Number(order.input_amount) : (order.amount * 1e6)
  const filledAmt = order.filled_amount ? Number(order.filled_amount) : (inputAmt * order.filled_pct / 100)
  const remainingAmt = inputAmt - filledAmt
  if (remainingAmt <= 0) return null

  const totalDuration = deadline - createdAt
  const elapsed = now - createdAt
  if (totalDuration <= 0 || now >= deadline) return null

  const timeProgress = Math.min(1, Math.max(0, elapsed / totalDuration))
  const urgencyPct = Math.round(timeProgress * timeProgress * 100)

  const ticksLeft = Math.max(1, Math.floor((totalDuration - elapsed) / TICK_INTERVAL))
  const baseChunk = remainingAmt / ticksLeft
  const urgencyMul = 1.0 + (timeProgress * timeProgress)

  // Approximate score — use 75 as a neutral default for display
  const scoreMul = 1.0
  const chunk = Math.floor(baseChunk * urgencyMul * scoreMul)

  // Format for display (in human-readable units, assuming 6 decimals for stablecoins)
  const chunkHuman = chunk / 1e6
  const chunkDisplay = chunkHuman >= 1000
    ? `${(chunkHuman / 1000).toFixed(1)}K`
    : chunkHuman >= 1
      ? chunkHuman.toFixed(0)
      : chunkHuman.toFixed(2)

  return { chunkDisplay, urgencyPct, label: `~${chunkDisplay}/tick` }
}

interface Props {
  data: TradeOrder[] | null
  loading: boolean
  error: string | null
}

const DISPLAY_MULTIPLIER = 1_000_000

export default function TradeOrdersTable({ data, loading, error }: Props) {
  const [showScaled, setShowScaled] = useState(true)
  if (error && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Trade Orders</div>
        <p className="text-warn text-sm">Endpoint unavailable</p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Trade Orders</div>
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
        Trade Orders
        {data && data.length > 0 && (
          <span className="ml-2 text-[0.65rem] opacity-60">({data.length})</span>
        )}
      </div>

      {!data || data.length === 0 ? (
        <p className="text-muted text-sm">No trade orders yet. Use seed to create demo data.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full border-collapse text-xs min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">ID</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Dir</th>
                <th className="text-right text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">
                  <span className="mr-1">Amount</span>
                  <button
                    type="button"
                    onClick={() => setShowScaled((s) => !s)}
                    className="inline-block text-[0.55rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/20 text-accent cursor-pointer hover:bg-accent/30 transition-colors"
                  >
                    {showScaled ? 'x1M' : 'Raw'}
                  </button>
                </th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border w-28">Filled</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Status</th>
                <th className="text-right text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Deadline</th>
                <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">TWAP</th>
              </tr>
            </thead>
            <tbody>
              {data.map((order) => {
                const statusStyle = STATUS_STYLES[order.status] || STATUS_STYLES.PENDING
                const fillPct = Math.min(100, Math.max(0, order.filled_pct))
                return (
                  <tr key={order.id} className="hover:bg-bg/50 transition-colors">
                    <td className="px-2 py-2 border-b border-border font-mono text-[0.7rem]">
                      {order.id.length > 10 ? `${order.id.slice(0, 6)}...${order.id.slice(-4)}` : order.id}
                    </td>
                    <td className={`px-2 py-2 border-b border-border font-semibold ${
                      order.direction === 'BUY' ? 'text-ok' : 'text-danger'
                    }`}>
                      {order.direction}
                    </td>
                    <td className="px-2 py-2 border-b border-border text-right tabular-nums">
                      {showScaled
                        ? (Number(order.amount) * DISPLAY_MULTIPLIER).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
                        : `$${Number(order.amount).toFixed(2)}`}
                    </td>
                    <td className="px-2 py-2 border-b border-border">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              fillPct >= 100 ? 'bg-ok' : fillPct > 0 ? 'bg-accent' : 'bg-border'
                            }`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <span className="text-[0.65rem] tabular-nums text-muted w-8 text-right">
                          {fillPct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 border-b border-border">
                      <span className={`inline-block text-[0.6rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${statusStyle}`}>
                        {order.status}
                      </span>
                      {order.mode === 'OUTPUT' && (
                        <span className="ml-1 inline-block text-[0.55rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                          TARGET
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 border-b border-border text-right tabular-nums text-muted">
                      {order.mode === 'OUTPUT' && order.desired_output ? (
                        <span title={`Target: ${order.desired_output}`}>
                          {formatCountdown(order.deadline)}
                        </span>
                      ) : (
                        formatCountdown(order.deadline)
                      )}
                    </td>
                    <td className="px-2 py-2 border-b border-border">
                      {(() => {
                        const plan = computeChunkPlan(order)
                        if (!plan) return <span className="text-muted text-[0.6rem]">--</span>
                        return (
                          <div className="text-[0.6rem] leading-tight">
                            <span className="font-semibold text-accent">Adaptive TWAP</span>
                            <br />
                            <span className="text-muted">{plan.label} (urgency: {plan.urgencyPct}%)</span>
                          </div>
                        )
                      })()}
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
