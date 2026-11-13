/**
 * Pure builders for FxBudget order-creation arguments (no I/O, no signing).
 *
 * The upgraded contract REJECTS orders without an invoice target (`target_out > 0`, 6-decimal EURe atomic
 * units), so every active order-creation script builds its arguments here and is checked by
 * `order-args.test.ts`, which also scans the scripts so a call that omits `target_out` cannot slip back in.
 *
 * All amounts are decimal STRINGS of atomic units (6 decimals for both USDC and EURe), never floats.
 */

/** Parse a human decimal ("8", "8.5", "0.000001") into 6-decimal atomic units without floating point. */
export function parseAtomic6(human: string): bigint {
  const m = /^\s*(\d+)(?:\.(\d{1,6}))?\s*$/.exec(human)
  if (!m) throw new Error(`Invalid amount ${JSON.stringify(human)}: expected a decimal with at most 6 fraction digits`)
  return BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0') || '0')
}

export function formatAtomic6(atomic: bigint): string {
  const whole = atomic / 1_000_000n
  const frac = (atomic % 1_000_000n).toString().padStart(6, '0')
  return `${whole}.${frac}`
}

const NEAR_ACCOUNT_RE = /^(?=.{2,64}$)(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*$/
const MAX_INVOICE_REF_LEN = 64

export interface InvoiceOrderParams {
  /** USDC budget (and, for escrow, the funded amount), atomic units. */
  totalInAtomic: bigint
  /** Maximum USDC consumed per chunk, atomic units. */
  maxChunkInAtomic: bigint
  /** Invoice amount due to the supplier in demo EURe, atomic units. REQUIRED and > 0. */
  targetOutAtomic: bigint
  recipient: string
  invoiceRef: string
  /** Absolute NEAR block-time deadline in nanoseconds. */
  deadlineNs: bigint
  maxDevBps: number
  pairLabel?: string
}

export function validateInvoiceOrder(p: InvoiceOrderParams, nowNs: bigint = BigInt(Date.now()) * 1_000_000n): void {
  if (!(p.targetOutAtomic > 0n)) {
    throw new Error('target_out is required: the contract rejects orders without an invoice target (> 0 atomic EURe)')
  }
  if (!(p.totalInAtomic > 0n)) throw new Error('total_in must be positive')
  if (!(p.maxChunkInAtomic > 0n) || p.maxChunkInAtomic > p.totalInAtomic) {
    throw new Error('max_chunk_in must be positive and not exceed total_in')
  }
  if (!NEAR_ACCOUNT_RE.test(p.recipient)) throw new Error(`Invalid recipient account ${JSON.stringify(p.recipient)}`)
  if (p.invoiceRef.length === 0 || p.invoiceRef.length > MAX_INVOICE_REF_LEN) {
    throw new Error(`invoice_ref must be 1-${MAX_INVOICE_REF_LEN} characters`)
  }
  if (p.deadlineNs <= nowNs) throw new Error('deadline_ns must be in the future')
  if (!Number.isInteger(p.maxDevBps) || p.maxDevBps < 0 || p.maxDevBps > 5000) {
    throw new Error('max_dev_bps must be an integer in 0..5000')
  }
}

/** Arguments for `FxBudget.create_order` (accounting-only budget, no escrow). */
export function buildCreateOrderArgs(p: InvoiceOrderParams): Record<string, unknown> {
  validateInvoiceOrder(p)
  return {
    pair_label: p.pairLabel ?? 'USDC/EURe',
    total_in: p.totalInAtomic.toString(),
    max_chunk_in: p.maxChunkInAtomic.toString(),
    // u64 as a JSON number, exactly like the dashboard sends it (sub-microsecond float rounding is irrelevant).
    deadline_ns: Number(p.deadlineNs),
    max_dev_bps: p.maxDevBps,
    recipient: p.recipient,
    target_out: p.targetOutAtomic.toString(),
    invoice_ref: p.invoiceRef,
  }
}

/** The `msg` JSON for `ft_transfer_call` funding that `FxBudget.ft_on_transfer` parses. */
export function buildEscrowMsg(p: InvoiceOrderParams): string {
  validateInvoiceOrder(p)
  return JSON.stringify({
    action: 'create_escrowed_order',
    pair_label: p.pairLabel ?? 'USDC/EURe',
    max_chunk_in: p.maxChunkInAtomic.toString(),
    deadline_ns: Number(p.deadlineNs),
    max_dev_bps: p.maxDevBps,
    recipient: p.recipient,
    target_out: p.targetOutAtomic.toString(),
    invoice_ref: p.invoiceRef,
  })
}

/** Arguments for the canonical Circle USDC `ft_transfer_call` (attach exactly 1 yoctoNEAR). */
export function buildEscrowTransferCallArgs(fxBudgetId: string, p: InvoiceOrderParams, memo?: string): Record<string, unknown> {
  return {
    receiver_id: fxBudgetId,
    amount: p.totalInAtomic.toString(),
    memo: memo ?? `GetNear Circle USDC escrow: ${p.invoiceRef}`,
    msg: buildEscrowMsg(p),
  }
}

/** Sputnik DAO `add_proposal` args that call `FxBudget.approve_order({ id })`. */
export function buildApproveOrderProposalArgs(fxBudgetId: string, orderId: number, description: string): Record<string, unknown> {
  return {
    proposal: {
      description,
      kind: {
        FunctionCall: {
          receiver_id: fxBudgetId,
          actions: [
            {
              method_name: 'approve_order',
              args: Buffer.from(JSON.stringify({ id: orderId })).toString('base64'),
              deposit: '0',
              gas: '30000000000000',
            },
          ],
        },
      },
    },
  }
}

/** Find the order created by a script by its unique invoice_ref, paging past the contract's 100-order view cap. */
export async function findOrderByInvoiceRef<T extends { invoice_ref?: string | null; id: number }>(
  listOrders: (fromIndex: number, limit: number) => Promise<T[]>,
  invoiceRef: string,
): Promise<T | undefined> {
  const PAGE = 100
  let found: T | undefined
  for (let from = 0; ; from += PAGE) {
    const page = await listOrders(from, PAGE)
    for (const o of page) if (o.invoice_ref === invoiceRef) found = o
    if (page.length < PAGE) break
  }
  return found
}
