/**
 * GetNear Typed Config Loader (P3)
 *
 * Reads environment variables, validates with zod, and fails fast
 * if any critical value is wrong (especially NEAR_NETWORK_ID != testnet).
 *
 * Usage:
 *   import { loadConfig } from '@getnear/shared/config'
 *   const cfg = loadConfig()  // throws if invalid
 */

import { z } from 'zod'

// ── Validators ───────────────────────────────────────────────────────

const NetworkIdSchema = z.enum(['testnet', 'mainnet'], {
  message: 'NEAR_NETWORK_ID must be "testnet" or "mainnet".',
}).default('testnet')

const CommaSeparatedUrls = z
  .string()
  .min(1)
  .transform((s) => s.split(',').map((u) => u.trim()).filter(Boolean))

const GetnearModeSchema = z.enum(['mock', 'testnet']).default('mock')

// ── Main Config Schema ───────────────────────────────────────────────

export const ConfigSchema = z.object({
  // Network
  NEAR_NETWORK_ID: NetworkIdSchema,
  NEAR_RPC_URLS: CommaSeparatedUrls,
  NEAR_EXPLORER_BASE: z.string().url().default('https://testnet.nearblocks.io'),

  // 1Click API (mainnet read-only, dry quotes ONLY)
  ONECLICK_BASE_URL: z.string().url().default('https://1click.chaindefuser.com'),
  ONECLICK_JWT: z.string().optional(),

  // Contracts and accounts (empty until P7/P8)
  FX_BUDGET_CONTRACT_ID: z.string().default(''),
  DAO_ACCOUNT_ID: z.string().default(''),
  AGENT_ACCOUNT_ID: z.string().default(''),

  // Agent signing key — restricted function-call key, local only, never committed
  // Set in .env only. Never log or print this value.
  AGENT_PRIVATE_KEY: z.string().optional(),

  // Mode
  GETNEAR_MODE: GetnearModeSchema,
  DEMO_MODE: z
    .string()
    .optional()
    .transform((s) => s === 'true' || s === '1'),

  // Optional NEAR AI (P11)
  NEAR_AI_API_KEY: z.string().optional(),
})

export type GetnearConfig = z.output<typeof ConfigSchema>

// ── Network Constants ───────────────────────────────────────────────

export const CIRCLE_USDC_CONTRACT_IDS = {
  testnet: '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
  mainnet: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
} as const

export const DEFAULT_RPC_URLS = {
  testnet: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  mainnet: ['https://rpc.mainnet.near.org', 'https://free.rpc.fastnear.com'],
} as const

export const DEFAULT_EXPLORER_BASES = {
  testnet: 'https://testnet.nearblocks.io',
  mainnet: 'https://nearblocks.io',
} as const

// ── Loader ───────────────────────────────────────────────────────────

/**
 * Load and validate configuration from process.env.
 * Throws a descriptive error immediately if any value is invalid.
 * Never returns AGENT_PRIVATE_KEY in logs.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): GetnearConfig {
  const networkId = (env.NEAR_NETWORK_ID as 'testnet' | 'mainnet') || 'testnet'
  const isMainnet = networkId === 'mainnet'
  const defaultRpcs = isMainnet
    ? DEFAULT_RPC_URLS.mainnet.join(',')
    : DEFAULT_RPC_URLS.testnet.join(',')
  const defaultExplorer = isMainnet
    ? DEFAULT_EXPLORER_BASES.mainnet
    : DEFAULT_EXPLORER_BASES.testnet

  const result = ConfigSchema.safeParse({
    NEAR_NETWORK_ID: env.NEAR_NETWORK_ID ?? 'testnet',
    NEAR_RPC_URLS: env.NEAR_RPC_URLS ?? defaultRpcs,
    NEAR_EXPLORER_BASE: env.NEAR_EXPLORER_BASE ?? defaultExplorer,
    ONECLICK_BASE_URL: env.ONECLICK_BASE_URL,
    ONECLICK_JWT: env.ONECLICK_JWT,
    FX_BUDGET_CONTRACT_ID: env.FX_BUDGET_CONTRACT_ID,
    DAO_ACCOUNT_ID: env.DAO_ACCOUNT_ID,
    AGENT_ACCOUNT_ID: env.AGENT_ACCOUNT_ID,
    AGENT_PRIVATE_KEY: env.AGENT_PRIVATE_KEY,
    GETNEAR_MODE: env.GETNEAR_MODE,
    DEMO_MODE: env.DEMO_MODE,
    NEAR_AI_API_KEY: env.NEAR_AI_API_KEY,
  })

  if (!result.success) {
    const issues = result.error.issues ?? (result.error as any).errors ?? []
    const messages = issues
      .map((e: any) => `  [${e.path.join('.')}] ${e.message}`)
      .join('\n')
    throw new Error(`GetNear config validation failed:\n${messages}`)
  }

  return result.data
}

/**
 * Returns a safe (no secrets) summary of the config for logging.
 */
export function configSummary(cfg: GetnearConfig): Record<string, unknown> {
  return {
    NEAR_NETWORK_ID: cfg.NEAR_NETWORK_ID,
    NEAR_RPC_URLS: cfg.NEAR_RPC_URLS,
    NEAR_EXPLORER_BASE: cfg.NEAR_EXPLORER_BASE,
    ONECLICK_BASE_URL: cfg.ONECLICK_BASE_URL,
    FX_BUDGET_CONTRACT_ID: cfg.FX_BUDGET_CONTRACT_ID || '(not set)',
    DAO_ACCOUNT_ID: cfg.DAO_ACCOUNT_ID || '(not set)',
    AGENT_ACCOUNT_ID: cfg.AGENT_ACCOUNT_ID || '(not set)',
    GETNEAR_MODE: cfg.GETNEAR_MODE,
    DEMO_MODE: cfg.DEMO_MODE,
    AGENT_PRIVATE_KEY: cfg.AGENT_PRIVATE_KEY ? '[SET — hidden]' : '(not set)',
    NEAR_AI_API_KEY: cfg.NEAR_AI_API_KEY ? '[SET — hidden]' : '(not set)',
  }
}

