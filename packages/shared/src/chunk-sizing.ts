/**
 * GetNear chunk sizing (pure, integer-only).
 *
 * Fixes the "final chunk over-charge": when the payout for a planned chunk would exceed the amount
 * still due on the invoice, the payout is clamped to the remaining due AND the USDC input charged is
 * reduced proportionally (rounded UP so the payout is always fully covered at the quoted rate).
 */

/** Ceiling division for non-negative bigints. */
export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('ceilDiv: denominator must be positive')
  return (numerator + denominator - 1n) / denominator
}

/** Output of `amountIn` at a quote of `quoteIn -> quoteOut` (same decimals as the quote output). */
export function computeSimulatedOutput(amountIn: bigint, quoteIn: bigint, quoteOut: bigint): bigint {
  if (quoteIn === 0n) return 0n
  return (amountIn * quoteOut) / quoteIn
}

/** Convert a quote output (any decimals) into 6-decimal NEAR EURe atomic units. */
export function computeEuReAtomicOut(
  amountIn: bigint,
  simulatedOut: bigint,
  decimalsOut: number,
  rate: number,
): bigint {
  if (simulatedOut > 0n) {
    if (decimalsOut > 6) {
      const scaled = simulatedOut / 10n ** BigInt(decimalsOut - 6)
      if (scaled > 0n) return scaled
    } else if (decimalsOut < 6) {
      const scaled = simulatedOut * 10n ** BigInt(6 - decimalsOut)
      if (scaled > 0n) return scaled
    } else {
      return simulatedOut
    }
  }
  return BigInt(Math.max(1, Math.round((Number(amountIn) / 1e6) * rate * 1e6)))
}

export interface ChunkPlanInput {
  /** Planned USDC chunk (6 decimals) that the 1Click dry quote was requested for. */
  candidateIn: bigint
  /** Raw quote input / output (output in the quote's own decimals). */
  quoteIn: bigint
  quoteOut: bigint
  decimalsOut: number
  /** Human-unit rate, only used when the quote has no usable raw amounts. */
  rate: number
  /** True when an on-chain payout ceiling exists (invoice target or explicit cap). */
  hasCeiling: boolean
  /** Remaining payout allowed by the ceiling, 6-decimal EURe atomic units. */
  remainingDueOut: bigint
  /** Remaining USDC budget (total_in - executed_in), 6 decimals. */
  remainingIn: bigint
  orderMaxChunk: bigint
  globalMaxChunk: bigint
}

export interface ChunkPlan {
  amountIn: bigint
  settlementOut: bigint
  simulatedOut: bigint
  /** True when the chunk was shrunk because the remaining due was below the quoted output. */
  adjusted: boolean
}

export type ChunkPlanResult = { ok: true; plan: ChunkPlan } | { ok: false; reason: string }

export function planChunkAmounts(p: ChunkPlanInput): ChunkPlanResult {
  // Never size a payout from nothing: a quote needs usable raw amounts or at least a positive rate.
  if (!(p.quoteIn > 0n && p.quoteOut > 0n) && !(p.rate > 0)) {
    return { ok: false, reason: 'NO_USABLE_QUOTE' }
  }

  const simulatedOut = computeSimulatedOutput(p.candidateIn, p.quoteIn, p.quoteOut)
  const quotedSettlement = computeEuReAtomicOut(p.candidateIn, simulatedOut, p.decimalsOut, p.rate)

  if (!p.hasCeiling || quotedSettlement <= p.remainingDueOut) {
    return {
      ok: true,
      plan: { amountIn: p.candidateIn, settlementOut: quotedSettlement, simulatedOut, adjusted: false },
    }
  }

  // Final chunk: remaining due is below the quoted output for the planned input.
  if (p.remainingDueOut <= 0n) return { ok: false, reason: 'NO_REMAINING_DUE' }

  let requiredIn: bigint
  if (p.quoteIn > 0n && p.quoteOut > 0n) {
    // ceil(remainingOut * quotedInput / quotedOutput), with remainingOut in the quote's decimals.
    const remainingRaw =
      p.decimalsOut >= 6
        ? p.remainingDueOut * 10n ** BigInt(p.decimalsOut - 6)
        : ceilDiv(p.remainingDueOut, 10n ** BigInt(6 - p.decimalsOut))
    requiredIn = ceilDiv(remainingRaw * p.quoteIn, p.quoteOut)
  } else if (p.rate > 0) {
    requiredIn = BigInt(Math.ceil(Number(p.remainingDueOut) / p.rate))
  } else {
    return { ok: false, reason: 'NO_USABLE_QUOTE_FOR_FINAL_CHUNK' }
  }

  if (requiredIn <= 0n) return { ok: false, reason: 'ADJUSTED_INPUT_NOT_POSITIVE' }
  if (requiredIn > p.candidateIn) return { ok: false, reason: 'ADJUSTED_INPUT_EXCEEDS_QUOTED_CHUNK' }
  if (requiredIn > p.remainingIn) return { ok: false, reason: 'ADJUSTED_INPUT_EXCEEDS_REMAINING_BUDGET' }
  if (requiredIn > p.orderMaxChunk || requiredIn > p.globalMaxChunk) {
    return { ok: false, reason: 'ADJUSTED_INPUT_EXCEEDS_CHUNK_CAP' }
  }

  return {
    ok: true,
    plan: {
      amountIn: requiredIn,
      settlementOut: p.remainingDueOut,
      simulatedOut: computeSimulatedOutput(requiredIn, p.quoteIn, p.quoteOut),
      adjusted: true,
    },
  }
}
