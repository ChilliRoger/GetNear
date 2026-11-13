/**
 * Invoice display status (pure).
 *
 * "Paid" is shown ONLY when the invoice amount due reaches zero. A contract order can become
 * `Completed` because the USDC budget ran out while EURe is still due; that must never read as paid.
 */

export type ContractOrderStatus = 'Pending' | 'Active' | 'Completed' | 'Expired' | 'Cancelled'

export interface InvoiceOrderLike {
  status: ContractOrderStatus
  target_out?: string | null
  settled_out?: string | null
  pending_out?: string | null
}

export type InvoiceDisplayKind =
  | 'paid'
  | 'budget_exhausted'
  | 'closed_unpaid'
  | 'open'
  | 'pending_approval'
  | 'no_invoice'

export interface InvoiceDisplay {
  kind: InvoiceDisplayKind
  /** Short badge label, e.g. "Paid" or "Budget exhausted · €16.30 still due". */
  label: string
  /** target_out - settled_out, never negative (6-decimal EURe atomic units). */
  dueAtomic: bigint
  /** True when a due amount must stay visible next to the order. */
  showDue: boolean
}

export function formatEure(atomic: bigint): string {
  const negative = atomic < 0n
  const abs = negative ? -atomic : atomic
  // Round to the nearest cent (half up) so a balance of 417.239907 reads €417.24.
  const totalCents = (abs + 5_000n) / 10_000n
  const whole = totalCents / 100n
  const cents = totalCents % 100n
  return `${negative ? '-' : ''}€${whole.toString()}.${cents.toString().padStart(2, '0')}`
}

function big(v: string | null | undefined): bigint {
  try {
    return BigInt(v && v.length > 0 ? v : '0')
  } catch {
    return 0n
  }
}

export function deriveInvoiceDisplay(order: InvoiceOrderLike): InvoiceDisplay {
  const target = big(order.target_out)
  const settled = big(order.settled_out)
  const due = target > settled ? target - settled : 0n

  if (target === 0n) {
    return { kind: 'no_invoice', label: order.status, dueAtomic: 0n, showDue: false }
  }
  if (due === 0n) {
    return { kind: 'paid', label: 'Paid', dueAtomic: 0n, showDue: false }
  }

  const dueText = `${formatEure(due)} still due`
  switch (order.status) {
    case 'Completed':
      return { kind: 'budget_exhausted', label: `Budget exhausted · ${dueText}`, dueAtomic: due, showDue: true }
    case 'Expired':
    case 'Cancelled':
      return { kind: 'closed_unpaid', label: `${order.status} · ${dueText}`, dueAtomic: due, showDue: true }
    case 'Pending':
      return { kind: 'pending_approval', label: `Pending approval · ${formatEure(due)} due`, dueAtomic: due, showDue: true }
    default:
      return { kind: 'open', label: `Active · ${formatEure(due)} due`, dueAtomic: due, showDue: true }
  }
}
