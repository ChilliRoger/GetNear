/**
 * In-memory sliding window rate limiter for faucet dispensing
 * Protects operator reserves and testnet gas against abuse.
 */

interface RateLimitRecord {
  lastClaimTime: number
  claimsCount: number
}

// 24 hours cooldown strictly per user account (Standard crypto faucet frequency)
export const COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS) || 24 * 60 * 60 * 1000

// 15 seconds anti-bot burst throttle per IP (prevents rapid hammering without blocking multi-account testing)
export const IP_BURST_MS = 15 * 1000

// Limit native NEAR gas sponsorships per IP per 24h so zero-balance account farming cannot drain operator NEAR
export const NEAR_DRIP_WINDOW_MS = Number(process.env.FAUCET_NEAR_DRIP_WINDOW_MS) || 24 * 60 * 60 * 1000
export const MAX_NEAR_DRIPS_PER_IP = Number(process.env.FAUCET_MAX_NEAR_DRIPS_PER_IP) || 2

export function formatRemainingTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return `${hours}h ${remainingMins}m`
}

interface NearDripRecord {
  windowStart: number
  count: number
}

const accountCache = new Map<string, RateLimitRecord>()
const ipCache = new Map<string, RateLimitRecord>()
const nearDripIpCache = new Map<string, NearDripRecord>()

// Clean up stale entries every 15 minutes
setInterval(() => {
  const now = Date.now()
  accountCache.forEach((record, key) => {
    if (now - record.lastClaimTime > COOLDOWN_MS * 2) {
      accountCache.delete(key)
    }
  })
  ipCache.forEach((record, key) => {
    if (now - record.lastClaimTime > IP_BURST_MS * 4) {
      ipCache.delete(key)
    }
  })
  nearDripIpCache.forEach((record, key) => {
    if (now - record.windowStart > NEAR_DRIP_WINDOW_MS * 2) {
      nearDripIpCache.delete(key)
    }
  })
}, 15 * 60 * 1000).unref()

export interface RateLimitCheck {
  allowed: boolean
  remainingSeconds: number
  reason?: string
}

/**
 * Check whether a specific account is on 24-hour cooldown.
 * Rate limiting is strictly scoped per user account address.
 */
export function checkAccountCooldown(accountId: string): RateLimitCheck {
  const now = Date.now()
  const clean = accountId.toLowerCase().trim()
  const accRecord = accountCache.get(clean)

  if (accRecord) {
    const elapsed = now - accRecord.lastClaimTime
    if (elapsed < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
      return {
        allowed: false,
        remainingSeconds,
        reason: `Account "${clean}" is on 24-hour cooldown. Please wait ${formatRemainingTime(remainingSeconds)} before requesting again.`,
      }
    }
  }

  return { allowed: true, remainingSeconds: 0 }
}

/**
 * Validate dispense request:
 * 1. Checks per-account 24h cooldown
 * 2. Checks short 15s IP burst throttle to deter automated bots
 */
export function checkRateLimit(accountId: string, clientIp?: string): RateLimitCheck {
  const now = Date.now()

  // 1. Check strict per-account 24-hour rate limit
  const accountCheck = checkAccountCooldown(accountId)
  if (!accountCheck.allowed) {
    return accountCheck
  }

  // 2. Short anti-bot rapid burst throttle per IP (15 seconds)
  if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
    const ipRecord = ipCache.get(clientIp)
    if (ipRecord) {
      const elapsed = now - ipRecord.lastClaimTime
      if (elapsed < IP_BURST_MS) {
        const remainingSeconds = Math.ceil((IP_BURST_MS - elapsed) / 1000)
        return {
          allowed: false,
          remainingSeconds,
          reason: `Rapid request detected. Please wait ${remainingSeconds}s before making another request from this network.`,
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

export interface NearDripLimitCheck {
  allowed: boolean
  remainingInWindow: number
}

function isLocalhostIp(clientIp?: string): boolean {
  return !clientIp || clientIp === '127.0.0.1' || clientIp === '::1'
}

/**
 * Check whether the client IP may receive another native NEAR gas/import stipend
 * within the current 24h sliding window.
 */
export function checkNearDripIpLimit(clientIp?: string): NearDripLimitCheck {
  if (isLocalhostIp(clientIp)) {
    return { allowed: true, remainingInWindow: MAX_NEAR_DRIPS_PER_IP }
  }

  const now = Date.now()
  const record = nearDripIpCache.get(clientIp!)
  if (!record || now - record.windowStart >= NEAR_DRIP_WINDOW_MS) {
    return { allowed: true, remainingInWindow: MAX_NEAR_DRIPS_PER_IP }
  }

  const remaining = Math.max(0, MAX_NEAR_DRIPS_PER_IP - record.count)
  return { allowed: remaining > 0, remainingInWindow: remaining }
}

export function recordNearDrip(clientIp?: string): void {
  if (isLocalhostIp(clientIp)) return

  const now = Date.now()
  const record = nearDripIpCache.get(clientIp!)
  if (!record || now - record.windowStart >= NEAR_DRIP_WINDOW_MS) {
    nearDripIpCache.set(clientIp!, { windowStart: now, count: 1 })
    return
  }

  nearDripIpCache.set(clientIp!, {
    windowStart: record.windowStart,
    count: record.count + 1,
  })
}
