/**
 * Server-side demo signer access control (pure functions, no framework imports).
 *
 * The dashboard's "testnet role" mode lets the Next.js server sign with LOCAL near-cli credentials
 * (operator / council keys). That is a powerful capability, so it is:
 *   1. OFF by default            — requires GETNEAR_DEMO_SIGNER=1
 *   2. authenticated             — requires `Authorization: Bearer $GETNEAR_DEMO_TOKEN` (>= 16 chars)
 *   3. same-origin only          — cross-site Origin / Sec-Fetch-Site and non-JSON bodies are rejected
 *   4. narrowly allow-listed     — only exact (signer, contract, method, deposit) combinations used by the UI
 *
 * Ordinary users sign with their own wallet (wallet selector); this path is for the team's demo roles.
 */

import { timingSafeEqual } from 'node:crypto'

export const MIN_DEMO_TOKEN_LENGTH = 16
export const MAX_FAUCET_AMOUNT = 1000
export const DEFAULT_FAUCET_AMOUNT = 500
export const MAX_GAS_TGAS = 300

const CIRCLE_NEAR_TESTNET_USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'

export type GuardResult = { ok: true } | { ok: false; status: number; error: string }

type Env = Record<string, string | undefined>

// ── Access boundary ────────────────────────────────────────────────────────────────────────

export function isDemoSignerEnabled(env: Env = process.env): boolean {
  return env.GETNEAR_DEMO_SIGNER === '1'
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Gate for every route that can sign or spend on the server's behalf.
 * Order: opt-in -> content type -> same origin -> bearer token.
 */
export function checkDemoAccess(req: Request, env: Env = process.env): GuardResult {
  if (!isDemoSignerEnabled(env)) {
    return {
      ok: false,
      status: 403,
      error:
        'Server-side demo signer is disabled. Sign with your own wallet, or set GETNEAR_DEMO_SIGNER=1 and GETNEAR_DEMO_TOKEN to opt in.',
    }
  }

  const token = (env.GETNEAR_DEMO_TOKEN ?? '').trim()
  if (token.length < MIN_DEMO_TOKEN_LENGTH) {
    return {
      ok: false,
      status: 503,
      error: `Demo signer is enabled but GETNEAR_DEMO_TOKEN is not configured (>= ${MIN_DEMO_TOKEN_LENGTH} characters).`,
    }
  }

  if (req.method !== 'POST') return { ok: false, status: 405, error: 'Method not allowed' }

  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.startsWith('application/json')) {
    return { ok: false, status: 415, error: 'Content-Type must be application/json' }
  }

  const url = new URL(req.url)
  const origin = req.headers.get('origin')
  if (origin) {
    let originHost = ''
    try {
      originHost = new URL(origin).host
    } catch {
      return { ok: false, status: 403, error: 'Invalid Origin' }
    }
    const extra = (env.GETNEAR_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (originHost !== url.host && !extra.includes(origin)) {
      return { ok: false, status: 403, error: 'Cross-origin requests are not allowed' }
    }
  }
  const fetchSite = req.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return { ok: false, status: 403, error: 'Cross-site requests are not allowed' }
  }

  const header = req.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!provided || !tokensMatch(provided, token)) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}

// ── Signer allow-list ──────────────────────────────────────────────────────────────────────

export interface DemoContext {
  operator: string
  councils: string[]
  fxBudget: string
  dao: string
  circleUsdc: string
}

export function getDemoContext(env: Env = process.env): DemoContext {
  const operator = env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
  return {
    operator,
    councils: [
      env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet',
      env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet',
      env.COUNCIL3_ACCOUNT_ID || 'chilliroger-council3.testnet',
    ],
    fxBudget: env.FX_BUDGET_CONTRACT_ID || `fx-budget.${operator}`,
    dao: env.SPUTNIK_DAO_ACCOUNT_ID || 'chilliroger-dao.sputnik-v2.testnet',
    circleUsdc: env.USDC_CONTRACT_ID || CIRCLE_NEAR_TESTNET_USDC,
  }
}

const YOCTO_PER_NEAR = 10n ** 24n

/** Parse "0 NEAR", "0.1 NEAR", "1 yoctoNEAR" into yoctoNEAR. Returns null for anything else. */
export function parseDeposit(value: unknown): bigint | null {
  if (value === undefined || value === null || value === '') return 0n
  if (typeof value !== 'string') return null
  const m = /^\s*(\d+(?:\.\d{1,24})?)\s*(near|yoctonear)?\s*$/i.exec(value)
  if (!m) return null
  const unit = (m[2] ?? 'near').toLowerCase()
  if (unit === 'yoctonear') return m[1].includes('.') ? null : BigInt(m[1])
  const [whole, frac = ''] = m[1].split('.')
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt(frac.padEnd(24, '0'))
}

/** The only deposits the allow-list ever accepts, in the exact format near-cli-rs expects. */
function formatDeposit(yocto: bigint): string {
  if (yocto === 0n) return '0 NEAR'
  if (yocto === 1n) return '1 yoctoNEAR'
  if (yocto === YOCTO_PER_NEAR / 10n) return '0.1 NEAR'
  throw new Error('deposit is not allow-listed')
}

export function parseTgas(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 100
  if (typeof value !== 'string') return null
  const m = /^\s*(\d+(?:\.\d+)?)\s*Tgas\s*$/i.exec(value)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

export interface SignerRequest {
  contractId?: unknown
  methodName?: unknown
  args?: unknown
  signerId?: unknown
  deposit?: unknown
  gas?: unknown
}

export type SignerAuthorization =
  | { ok: true; contractId: string; methodName: string; signerId: string; args: Record<string, unknown>; deposit: string; gas: string }
  | { ok: false; status: number; error: string }

const deny = (error: string, status = 403): SignerAuthorization => ({ ok: false, status, error })

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Authorize one signing request against the exact combinations the dashboard needs.
 * Anything else (other signers, contracts, methods, deposits, malformed args) is rejected.
 */
export function authorizeSignerRequest(body: SignerRequest, ctx: DemoContext = getDemoContext()): SignerAuthorization {
  const { contractId, methodName, signerId } = body
  if (typeof contractId !== 'string' || typeof methodName !== 'string' || typeof signerId !== 'string') {
    return deny('Missing or invalid contractId, methodName or signerId', 400)
  }
  const args = body.args === undefined ? {} : body.args
  if (!isRecord(args)) return deny('args must be a JSON object', 400)
  if (JSON.stringify(args).length > 4096) return deny('args too large', 400)

  const deposit = parseDeposit(body.deposit)
  if (deposit === null) return deny('Invalid deposit', 400)
  const tgas = parseTgas(body.gas)
  if (tgas === null || tgas > MAX_GAS_TGAS) return deny(`Invalid or excessive gas (max ${MAX_GAS_TGAS} Tgas)`, 400)

  const isOperator = signerId === ctx.operator
  const isCouncil = ctx.councils.includes(signerId)
  if (!isOperator && !isCouncil) return deny(`Signer "${signerId}" is not an allow-listed demo role`)

  const ok = (): SignerAuthorization => ({
    ok: true,
    contractId,
    methodName,
    signerId,
    args,
    deposit: formatDeposit(deposit),
    gas: `${tgas.toFixed(1)} Tgas`,
  })

  // Operator -> FxBudget: create a budget-only order, or claim an unspent-escrow refund. No deposit.
  if (isOperator && contractId === ctx.fxBudget && (methodName === 'create_order' || methodName === 'refund_unused_escrow')) {
    return deposit === 0n ? ok() : deny('This method must not attach a deposit')
  }

  // Operator -> Circle USDC: fund an escrowed order. 1 yoctoNEAR, receiver must be the FxBudget contract.
  if (isOperator && contractId === ctx.circleUsdc && methodName === 'ft_transfer_call') {
    if (deposit !== 1n) return deny('ft_transfer_call requires exactly 1 yoctoNEAR')
    if (args.receiver_id !== ctx.fxBudget) return deny('ft_transfer_call receiver must be the FxBudget contract')
    return ok()
  }

  // Operator -> DAO: propose approve_order on FxBudget (0.1 NEAR proposal bond).
  if (isOperator && contractId === ctx.dao && methodName === 'add_proposal') {
    if (deposit !== YOCTO_PER_NEAR / 10n) return deny('add_proposal requires exactly the 0.1 NEAR proposal bond')
    const proposal = isRecord(args.proposal) ? args.proposal : null
    const kind = proposal && isRecord(proposal.kind) ? proposal.kind : null
    const fc = kind && isRecord(kind.FunctionCall) ? kind.FunctionCall : null
    const actions = fc && Array.isArray(fc.actions) ? fc.actions : null
    if (
      !fc ||
      fc.receiver_id !== ctx.fxBudget ||
      !actions ||
      actions.length !== 1 ||
      !isRecord(actions[0]) ||
      actions[0].method_name !== 'approve_order'
    ) {
      return deny('DAO proposals are limited to a single FxBudget.approve_order action')
    }
    return ok()
  }

  // Council -> DAO: vote on a proposal. No deposit, approve/reject only.
  if (isCouncil && contractId === ctx.dao && methodName === 'act_proposal') {
    if (deposit !== 0n) return deny('act_proposal must not attach a deposit')
    if (!Number.isInteger(args.id) || (args.id as number) < 0) return deny('act_proposal requires an integer proposal id', 400)
    if (args.action !== 'VoteApprove' && args.action !== 'VoteReject') return deny('act_proposal action must be VoteApprove or VoteReject')
    return ok()
  }

  return deny(`Combination ${signerId} -> ${contractId}.${methodName} is not allow-listed for the demo signer`)
}

// ── Faucet ─────────────────────────────────────────────────────────────────────────────────

/** NEAR implicit/named account IDs that end in ".testnet" (no shell metacharacters possible). */
const TESTNET_ACCOUNT_RE = /^(?=.{8,64}$)(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*\.testnet$/

export type FaucetValidation =
  | { ok: true; accountId: string; amount: number }
  | { ok: false; status: number; error: string }

export function validateFaucetRequest(body: unknown): FaucetValidation {
  if (!isRecord(body)) return { ok: false, status: 400, error: 'Request body must be a JSON object' }
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
  if (!TESTNET_ACCOUNT_RE.test(accountId)) {
    return { ok: false, status: 400, error: 'Invalid NEAR testnet account ID (must be a valid name ending in .testnet)' }
  }

  let amount = DEFAULT_FAUCET_AMOUNT
  if (body.amount !== undefined && body.amount !== null) {
    if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount < 1 || body.amount > MAX_FAUCET_AMOUNT) {
      return { ok: false, status: 400, error: `amount must be an integer between 1 and ${MAX_FAUCET_AMOUNT}` }
    }
    amount = body.amount
  }
  return { ok: true, accountId, amount }
}

export interface FaucetCommand {
  command: string
  args: string[]
  options: { cwd: string; shell: false; encoding: 'utf-8'; timeout: number; maxBuffer: number }
}

/**
 * Build the faucet process invocation. The executable is Node itself and every user-controlled value is a
 * separate argv entry: there is NO shell, so metacharacters in an account ID can never be interpreted.
 */
export function buildFaucetCommand(repoRoot: string, scriptPath: string, accountId: string, amount: number): FaucetCommand {
  return {
    command: process.execPath,
    args: ['--import', 'tsx', scriptPath, accountId, String(amount)],
    options: { cwd: repoRoot, shell: false, encoding: 'utf-8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
  }
}
