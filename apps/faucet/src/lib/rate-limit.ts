/**
 * In-memory sliding window rate limiter for faucet dispensing
 * Protects operator reserves and testnet gas against abuse.
 */

interface RateLimitRecord {
  lastClaimTime: number
  claimsCount: number
}

// 10 minutes cooldown per account or IP
export const COOLDOWN_MS = 10 * 60 * 1000

const accountCache = new Map<string, RateLimitRecord>()
const ipCache = new Map<string, RateLimitRecord>()

// Clean up stale entries every 15 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of accountCache.entries()) {
    if (now - record.lastClaimTime > COOLDOWN_MS * 2) {
      accountCache.delete(key)
    }
  }
  for (const [key, record] of ipCache.entries()) {
    if (now - record.lastClaimTime > COOLDOWN_MS * 2) {
      ipCache.delete(key)
    }
  }
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
        reason: `Account ${accountId} is on cooldown. Please wait ${remainingSeconds}s before requesting again.`,
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
          reason: `Too many requests from this IP. Please wait ${remainingSeconds}s before requesting again.`,
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
