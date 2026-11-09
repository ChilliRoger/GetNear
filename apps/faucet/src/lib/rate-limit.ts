/**
 * In-memory sliding window rate limiter for faucet dispensing
 * Protects operator reserves and testnet gas against abuse.
 */

interface RateLimitRecord {
  lastClaimTime: number
  claimsCount: number
}

// 24 hours cooldown per account or IP (Standard crypto faucet frequency)
export const COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS) || 24 * 60 * 60 * 1000

export function formatRemainingTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return `${hours}h ${remainingMins}m`
}

const accountCache = new Map<string, RateLimitRecord>()
const ipCache = new Map<string, RateLimitRecord>()

// Clean up stale entries every 15 minutes
setInterval(() => {
  const now = Date.now()
  accountCache.forEach((record, key) => {
    if (now - record.lastClaimTime > COOLDOWN_MS * 2) {
      accountCache.delete(key)
    }
  })
  ipCache.forEach((record, key) => {
    if (now - record.lastClaimTime > COOLDOWN_MS * 2) {
      ipCache.delete(key)
    }
  })
}, 15 * 60 * 1000).unref()

export interface RateLimitCheck {
  allowed: boolean
  remainingSeconds: number
  reason?: string
}

export function checkRateLimit(accountId: string, clientIp?: string): RateLimitCheck {
  const now = Date.now()

  // 1. Check account rate limit
  const accRecord = accountCache.get(accountId.toLowerCase())
  if (accRecord) {
    const elapsed = now - accRecord.lastClaimTime
    if (elapsed < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
      return {
        allowed: false,
        remainingSeconds,
        reason: `Account "${accountId}" is on 24-hour cooldown. Please wait ${formatRemainingTime(remainingSeconds)} before requesting again.`,
      }
    }
  }

  // 2. Check IP rate limit (if provided)
  if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
    const ipRecord = ipCache.get(clientIp)
    if (ipRecord) {
      const elapsed = now - ipRecord.lastClaimTime
      if (elapsed < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
        return {
          allowed: false,
          remainingSeconds,
          reason: `Too many requests from this IP address. Please wait ${formatRemainingTime(remainingSeconds)} before requesting again.`,
        }
      }
    }
  }

  return { allowed: true, remainingSeconds: 0 }
}

export function recordClaim(accountId: string, clientIp?: string): void {
  const now = Date.now()
  const key = accountId.toLowerCase()
  const existingAcc = accountCache.get(key)
  accountCache.set(key, {
    lastClaimTime: now,
    claimsCount: (existingAcc?.claimsCount || 0) + 1,
  })

  if (clientIp) {
    const existingIp = ipCache.get(clientIp)
    ipCache.set(clientIp, {
      lastClaimTime: now,
      claimsCount: (existingIp?.claimsCount || 0) + 1,
    })
  }
}
