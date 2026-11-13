/**
 * Invoice reconciliation from contract views (pure; no I/O).
 *
 * Every check is DERIVED from the order / chunk / escrow views, never from hard-coded numbers, so it works for
 * whichever fresh invoice gets captured. Used by `pnpm verify:readonly`, the evidence capture tool and the
 * scripted escrow drill.
 */

import { deriveInvoiceDisplay, formatEure } from '@getnear/shared'

export interface OrderView {
  id: number
  status: 'Pending' | 'Active' | 'Completed' | 'Expired' | 'Cancelled'
  total_in: string
  executed_in: string
  pending_in: string
  target_out: string
  settled_out: string
  pending_out: string
  max_chunk_in: string
  chunks_count: number
  recipient: string
  invoice_ref?: string | null
}

export interface ChunkView {
  key: string
  status: 'InFlight' | 'Settled' | 'Failed'
  amount_in: string
  settlement_out: string
  simulated_out: string
  quote_ref: string
  attempts: number
}

export interface EscrowView {
  order_id: number
  escrowed_in: string
  executed_in: string
  refunded_in: string
  remaining_escrow_in: string
}

export interface Check {
  name: string
  expected: string
  observed: string
  ok: boolean
  note?: string
}

export interface InvoiceReconciliation {
  fundedIn: bigint
  chargedIn: bigint
  refundedIn: bigint
  remainingEscrowIn: bigint
  targetOut: bigint
  paidOut: bigint
  dueOut: bigint
  displayLabel: string
  /** Final settled chunk, if any. */
  finalChunk?: ChunkView
  /** True when the final chunk charged less than the planned maximum chunk (i.e. it was recalculated). */
  finalChunkAdjusted: boolean
  checks: Check[]
}

const E12 = 10n ** 12n
const big = (v: string | undefined | null): bigint => BigInt(v && v.length > 0 ? v : '0')
const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b

export interface ReconcileOptions {
  /** Require the escrow to be fully refunded (remaining_escrow_in == 0 and refunded == funded - charged). */
  expectRefunded?: boolean
  /** Require that the final chunk was shrunk because the remaining due was below the quoted output. */
  expectAdjustedFinalChunk?: boolean
}

export function reconcileInvoice(
  order: OrderView,
  chunks: ChunkView[],
  escrow: EscrowView,
  opts: ReconcileOptions = {},
): InvoiceReconciliation {
  const settled = chunks.filter((c) => c.status === 'Settled')
  const sumIn = settled.reduce((a, c) => a + big(c.amount_in), 0n)
  const sumOut = settled.reduce((a, c) => a + big(c.settlement_out), 0n)

  const fundedIn = big(escrow.escrowed_in)
  const chargedIn = big(escrow.executed_in)
  const refundedIn = big(escrow.refunded_in)
  const remainingEscrowIn = big(escrow.remaining_escrow_in)
  const targetOut = big(order.target_out)
  const paidOut = big(order.settled_out)
  const dueOut = targetOut > paidOut ? targetOut - paidOut : 0n
  const display = deriveInvoiceDisplay(order)
  const finalChunk = settled[settled.length - 1]

  const checks: Check[] = []
  const add = (name: string, expected: string, observed: string, ok: boolean, note?: string) =>
    checks.push({ name, expected, observed, ok, note })

  add(
    'funded USDC = charged + refunded + remaining escrow',
    fundedIn.toString(),
    `${chargedIn} + ${refundedIn} + ${remainingEscrowIn} = ${chargedIn + refundedIn + remainingEscrowIn}`,
    fundedIn === chargedIn + refundedIn + remainingEscrowIn,
  )
  add('charged USDC = sum of settled chunk inputs', chargedIn.toString(), sumIn.toString(), chargedIn === sumIn && big(order.executed_in) === sumIn)
  add('EURe paid = sum of settled chunk payouts', paidOut.toString(), sumOut.toString(), paidOut === sumOut)
  add('payout never exceeds the invoice target', `<= ${targetOut}`, paidOut.toString(), targetOut > 0n && paidOut <= targetOut)
  add('no settlement in flight', '0 / 0', `${order.pending_in} / ${order.pending_out}`, big(order.pending_in) === 0n && big(order.pending_out) === 0n)

  // "Paid" must appear if and only if the amount due is zero.
  add(
    'status label is "Paid" only when the amount due is zero',
    dueOut === 0n ? 'Paid' : 'not Paid',
    display.label,
    (dueOut === 0n) === (display.kind === 'paid'),
    dueOut === 0n ? undefined : `${formatEure(dueOut)} still due`,
  )

  let finalChunkAdjusted = false
  if (finalChunk) {
    finalChunkAdjusted = big(finalChunk.amount_in) < big(order.max_chunk_in)
    const settlementOut = big(finalChunk.settlement_out)
    const quotedOut = big(finalChunk.simulated_out)
    const amountIn = big(finalChunk.amount_in)

    if (opts.expectAdjustedFinalChunk) {
      add(
        'final chunk input was recalculated (charged < planned max chunk)',
        `< ${order.max_chunk_in}`,
        finalChunk.amount_in,
        finalChunkAdjusted,
      )
      add('final payout equals the remaining invoice balance', dueOut === 0n ? 'due 0' : 'due 0', `due ${dueOut}`, dueOut === 0n)
      // Full quote precision (18-decimal quote output): input = ceil(remainingOut * quotedIn / quotedOut) means the
      // quoted output at the charged input exceeds the payout by LESS than the value of one atomic USDC unit.
      const remaining18 = settlementOut * E12
      const diff = quotedOut - remaining18
      const oneUnit = ceilDiv(quotedOut, amountIn) + 1n
      add(
        'charged input is the minimal covering input at full quote precision',
        `0 <= quotedOut - payout*1e12 < ~1 atomic USDC (${oneUnit})`,
        `${diff}`,
        diff >= 0n && diff < oneUnit,
        'quotedOut is the 18-decimal live-quote output recorded on-chain for the charged input',
      )
    }
  } else if (opts.expectAdjustedFinalChunk) {
    add('a settled chunk exists', '>= 1', '0', false)
  }

  if (opts.expectRefunded) {
    add('unused escrow fully refunded (remaining = 0)', '0', remainingEscrowIn.toString(), remainingEscrowIn === 0n)
    add('refunded = funded - charged', (fundedIn - chargedIn).toString(), refundedIn.toString(), refundedIn === fundedIn - chargedIn)
  }

  return {
    fundedIn,
    chargedIn,
    refundedIn,
    remainingEscrowIn,
    targetOut,
    paidOut,
    dueOut,
    displayLabel: display.label,
    finalChunk,
    finalChunkAdjusted,
    checks,
  }
}

/** What the previous build would have charged for the same payout: the full planned chunk. */
export function previousBuildOvercharge(order: OrderView, rec: InvoiceReconciliation): bigint {
  const planned = big(order.max_chunk_in)
  return rec.finalChunk && planned > big(rec.finalChunk.amount_in) ? planned - big(rec.finalChunk.amount_in) : 0n
}

// ── Evidence manifest (docs/evidence/fresh-invoice.json) ─────────────────────────────────────────

export interface Receipt {
  txHash: string
  signer: string
  method: string
  /** All links are the PARENT transaction; the receipt tree contains the token transfers and callbacks. */
  explorerUrl: string
  note?: string
}

export interface FreshInvoiceManifest {
  status: 'pending' | 'captured'
  note: string
  /** Inputs to enter in the dashboard for the capture run. */
  plan: {
    fundCircleUsdc: string
    maxChunkUsdc: string
    targetEure: string
    recipient: string
    invoiceRef: string
    why: string
  }
  orderId?: number
  invoiceRef?: string
  capturedAt?: string
  /** sha256 of the on-chain contract code when the invoice ran (must equal the upgrade artifact). */
  contractCodeSha256?: string
  receipts?: { funding?: Receipt; payout?: Receipt; refund?: Receipt }
  /** Balances measured around the run (atomic units), for the funded/charged/refunded/remaining reconciliation. */
  balances?: {
    walletCircleUsdcBefore: string
    walletCircleUsdcAfter: string
    fxBudgetCircleUsdcBefore: string
    fxBudgetCircleUsdcAfter: string
    supplierEureBefore: string
    supplierEureAfter: string
  }
}

export const TX_LINK = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`
