import { NextRequest, NextResponse } from 'next/server'
import { NearClient } from '@getnear/near-client'
import { resolveNetworkId } from '@getnear/shared'

export const dynamic = 'force-dynamic'

const NETWORK_ID = resolveNetworkId(process.env.NEAR_NETWORK_ID, process.env.ALLOW_MAINNET)
const isMainnet = NETWORK_ID === 'mainnet'

const RPC_URLS = process.env.NEAR_RPC_URLS
  ? process.env.NEAR_RPC_URLS.split(',').map((s) => s.trim())
  : isMainnet
    ? ['https://rpc.mainnet.near.org', 'https://free.rpc.fastnear.com']
    : [
        process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
        'https://test.rpc.fastnear.com',
      ]

const nearClient = new NearClient({
  networkId: NETWORK_ID,
  rpcUrls: RPC_URLS,
})

const CIRCLE_NEAR_MAINNET_USDC = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'
const CIRCLE_NEAR_TESTNET_USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const OPERATOR = process.env.OPERATOR_ACCOUNT_ID || (isMainnet ? 'operator.near' : 'chilliroger-operator.testnet')
const FX_BUDGET_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR}`
const DAO_ID = process.env.SPUTNIK_DAO_ACCOUNT_ID || process.env.DAO_ACCOUNT_ID || (isMainnet ? 'sputnik-v2.near' : 'chilliroger-dao.sputnik-v2.testnet')
const USDC_ID = process.env.USDC_CONTRACT_ID || (isMainnet ? CIRCLE_NEAR_MAINNET_USDC : CIRCLE_NEAR_TESTNET_USDC)
const FAUCET_USDC_ID = process.env.FAUCET_USDC_CONTRACT_ID || `usdc.${OPERATOR}`
const EURE_ID = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR}`

// The agent runs as its own service. Its fills and decisions are read over its read-only HTTP API
// (never from its SQLite file), so this route also works when the dashboard is deployed separately.
const AGENT_API_URL = (process.env.AGENT_API_URL || process.env.AGENT_TRIGGER_URL || 'http://127.0.0.1:38175').replace(/\/+$/, '')

async function getAgentJson<T>(pathAndQuery: string): Promise<T | null> {
  try {
    const res = await fetch(`${AGENT_API_URL}${pathAndQuery}`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

const cacheMap = new Map<string, { timestamp: number; data: unknown }>()
const CACHE_TTL_MS = 3000

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userAccount = searchParams.get('account')?.trim()
    const bypassCache = searchParams.get('fresh') === 'true'
    const cacheKey = userAccount || '__default__'
    const cached = cacheMap.get(cacheKey)
    if (!bypassCache && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data)
    }

    const [ordersRes, limitsRes, isPausedRes, settlementTokenRes, inputTokenRes, proposalsRes, vaultEureRes, vaultUsdcRes, userUsdcRes, userDemoUsdcRes, userEureRes, isRequesterRes] = await Promise.allSettled([
      nearClient.callView(FX_BUDGET_ID, 'list_orders', { from_index: 0, limit: 50 }),
      nearClient.callView(FX_BUDGET_ID, 'get_limits', {}),
      nearClient.callView(FX_BUDGET_ID, 'is_paused', {}),
      nearClient.callView<string>(FX_BUDGET_ID, 'get_settlement_token', {}),
      nearClient.callView<string | null>(FX_BUDGET_ID, 'get_input_token', {}),
      nearClient.callView(DAO_ID, 'get_proposals', { from_index: 0, limit: 50 }),
      nearClient.callView<string>(EURE_ID, 'ft_balance_of', { account_id: FX_BUDGET_ID }),
      nearClient.callView<string>(USDC_ID, 'ft_balance_of', { account_id: FX_BUDGET_ID }),
      userAccount ? nearClient.callView<string>(USDC_ID, 'ft_balance_of', { account_id: userAccount }) : Promise.resolve('0'),
      userAccount ? nearClient.callView<string>(FAUCET_USDC_ID, 'ft_balance_of', { account_id: userAccount }) : Promise.resolve('0'),
      userAccount ? nearClient.callView<string>(EURE_ID, 'ft_balance_of', { account_id: userAccount }) : Promise.resolve('0'),
      userAccount ? nearClient.callView<boolean>(FX_BUDGET_ID, 'is_requester', { account: userAccount }) : Promise.resolve(null),
    ])

    const orders = (ordersRes.status === 'fulfilled' ? ordersRes.value : []) as Array<{
      id: number
      chunks_count?: number
      pending_in?: string
      pending_out?: string
    }>

    // Dynamically fetch on-chain chunk records and per-order Circle USDC escrow balances
    const [chunkEntries, escrowEntries] = await Promise.all([
      Promise.allSettled(
        orders.slice(-15).map(async (o) => {
          const list = await nearClient.callView<unknown[]>(FX_BUDGET_ID, 'list_order_chunks', {
            order_id: o.id,
          })
          return [o.id, list] as const
        }),
      ),
      Promise.allSettled(
        orders.slice(-15).map(async (o) => {
          const escrow = await nearClient.callView<unknown>(FX_BUDGET_ID, 'get_order_escrow', {
            id: o.id,
          })
          return [o.id, escrow] as const
        }),
      ),
    ])
    const chunksByOrder: Record<number, unknown[]> = {}
    for (const entry of chunkEntries) {
      if (entry.status === 'fulfilled') {
        const [orderId, list] = entry.value
        chunksByOrder[orderId] = list
      }
    }
    const escrowByOrder: Record<number, unknown> = {}
    for (const entry of escrowEntries) {
      if (entry.status === 'fulfilled' && entry.value[1]) {
        const [orderId, escrow] = entry.value
        escrowByOrder[orderId] = escrow
      }
    }
    const limits = limitsRes.status === 'fulfilled' ? limitsRes.value : {
      auto_cap_in: '100000000',
      max_chunk_in: '20000000',
      min_interval_ns: 60000000000,
      max_horizon_ns: 604800000000000,
    }
    const isPaused = isPausedRes.status === 'fulfilled' ? isPausedRes.value : false
    const settlementToken = settlementTokenRes.status === 'fulfilled' ? settlementTokenRes.value : EURE_ID
    const inputToken = inputTokenRes.status === 'fulfilled' ? inputTokenRes.value : USDC_ID
    const proposals = proposalsRes.status === 'fulfilled' ? proposalsRes.value : []
    const vaultEure = vaultEureRes.status === 'fulfilled' ? (Number(vaultEureRes.value || '0') / 1e6) : 0
    const vaultUsdc = vaultUsdcRes.status === 'fulfilled' ? (Number(vaultUsdcRes.value || '0') / 1e6) : 0
    const userUsdc = userUsdcRes.status === 'fulfilled' ? (Number(userUsdcRes.value || '0') / 1e6) : 0
    const userDemoUsdc = userDemoUsdcRes.status === 'fulfilled' ? (Number(userDemoUsdcRes.value || '0') / 1e6) : 0
    const userEure = userEureRes.status === 'fulfilled' ? (Number(userEureRes.value || '0') / 1e6) : 0

    // Only authorized requesters (or the DAO owner) can open orders: ft_on_transfer from anyone else is refunded.
    const requesterAuthorized =
      !userAccount || isRequesterRes.status !== 'fulfilled' ? null : Boolean(isRequesterRes.value)

    // Agent fills and decisions (empty when the agent service is not reachable)
    const [fillsRes, decisionsRes] = await Promise.all([
      getAgentJson<{ fills: Record<string, unknown>[] }>('/fills?limit=100'),
      getAgentJson<{ decisions: Record<string, unknown>[] }>('/decisions?limit=20'),
    ])
    const fills = (fillsRes?.fills ?? []).map((f) => ({ ...f, is_simulated: Boolean(f.is_simulated) }))
    const decisions = decisionsRes?.decisions ?? []

    const payload = {
      success: true,
      networkId: NETWORK_ID,
      accounts: {
        operator: OPERATOR,
        contractId: FX_BUDGET_ID,
        daoId: DAO_ID,
        agentId: process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet',
        councils: [
          'chilliroger-council1.testnet',
          'chilliroger-council2.testnet',
          'chilliroger-council3.testnet',
        ],
      },
      requester: { account: userAccount ?? null, authorized: requesterAuthorized },
      tokens: {
        usdcId: USDC_ID,
        faucetUsdcId: FAUCET_USDC_ID,
        eureId: EURE_ID,
        userUsdc,
        userDemoUsdc,
        userEure,
        vaultUsdc,
        vaultEure,
      },
      contract: {
        id: FX_BUDGET_ID,
        settlementToken,
        inputToken,
        isPaused,
        limits,
        orders,
        chunksByOrder,
        escrowByOrder,
      },
      dao: {
        id: DAO_ID,
        proposals,
      },
      agent: {
        fills,
        decisions,
      },
    }

    cacheMap.set(cacheKey, { timestamp: Date.now(), data: payload })
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/near error]', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to fetch NEAR state' },
      { status: 500 },
    )
  }
}
