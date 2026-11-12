import { NextRequest, NextResponse } from 'next/server'
import { NearClient } from '@getnear/near-client'
import Database from 'better-sqlite3'
import * as path from 'node:path'
import * as fs from 'node:fs'

export const dynamic = 'force-dynamic'

const RPC_URLS = [
  process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
  'https://test.rpc.fastnear.com',
]

const nearClient = new NearClient({
  networkId: 'testnet',
  rpcUrls: RPC_URLS,
})

const OPERATOR = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const FX_BUDGET_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR}`
const DAO_ID = process.env.SPUTNIK_DAO_ACCOUNT_ID || 'chilliroger-dao.sputnik-v2.testnet'
const USDC_ID = process.env.USDC_CONTRACT_ID || `usdc.${OPERATOR}`
const EURE_ID = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR}`

// SQLite connection for agent fills and decisions
function getAgentDb() {
  try {
    const envPath = process.env.GETNEAR_AGENT_DB_PATH?.trim()
    const dbPath = envPath
      ? path.resolve(envPath)
      : path.resolve(process.cwd(), '..', 'agent', 'data', 'agent.db')
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true })
      return db
    }
  } catch (err) {
    console.warn('[API/Near] Could not open agent database:', err)
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userAccount = searchParams.get('account')?.trim()

    const [ordersRes, limitsRes, isPausedRes, settlementTokenRes, proposalsRes, vaultEureRes, userUsdcRes, userEureRes] = await Promise.allSettled([
      nearClient.callView(FX_BUDGET_ID, 'list_orders', { from_index: 0, limit: 50 }),
      nearClient.callView(FX_BUDGET_ID, 'get_limits', {}),
      nearClient.callView(FX_BUDGET_ID, 'is_paused', {}),
      nearClient.callView<string>(FX_BUDGET_ID, 'get_settlement_token', {}),
      nearClient.callView(DAO_ID, 'get_proposals', { from_index: 0, limit: 50 }),
      nearClient.callView<string>(EURE_ID, 'ft_balance_of', { account_id: FX_BUDGET_ID }),
      userAccount ? nearClient.callView<string>(USDC_ID, 'ft_balance_of', { account_id: userAccount }) : Promise.resolve('0'),
      userAccount ? nearClient.callView<string>(EURE_ID, 'ft_balance_of', { account_id: userAccount }) : Promise.resolve('0'),
    ])

    const orders = (ordersRes.status === 'fulfilled' ? ordersRes.value : []) as Array<{
      id: number
      chunks_count?: number
      pending_in?: string
      pending_out?: string
    }>

    // Dynamically fetch on-chain chunk records (Pending/Confirmed/Failed ledger) from NEAR RPC
    const chunkEntries = await Promise.allSettled(
      orders.slice(-15).map(async (o) => {
        const list = await nearClient.callView<unknown[]>(FX_BUDGET_ID, 'list_order_chunks', {
          order_id: o.id,
        })
        return [o.id, list] as const
      }),
    )
    const chunksByOrder: Record<number, unknown[]> = {}
    for (const entry of chunkEntries) {
      if (entry.status === 'fulfilled') {
        const [orderId, list] = entry.value
        chunksByOrder[orderId] = list
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
    const proposals = proposalsRes.status === 'fulfilled' ? proposalsRes.value : []
    const vaultEure = vaultEureRes.status === 'fulfilled' ? (Number(vaultEureRes.value || '0') / 1e6) : 0
    const userUsdc = userUsdcRes.status === 'fulfilled' ? (Number(userUsdcRes.value || '0') / 1e6) : 0
    const userEure = userEureRes.status === 'fulfilled' ? (Number(userEureRes.value || '0') / 1e6) : 0

    // Read agent fills and decisions (normalize SQLite 0/1 integer to boolean)
    let fills: Record<string, unknown>[] = []
    let decisions: Record<string, unknown>[] = []
    const db = getAgentDb()
    if (db) {
      try {
        const rawFills = db.prepare('SELECT * FROM agent_fills ORDER BY id DESC LIMIT 20').all() as Record<string, unknown>[]
        fills = rawFills.map((f) => ({
          ...f,
          is_simulated: Boolean(f.is_simulated),
        }))
        decisions = db.prepare('SELECT * FROM agent_decisions ORDER BY id DESC LIMIT 20').all() as Record<string, unknown>[]
        db.close()
      } catch (e) {
        console.warn('[API/Near] Error querying agent db:', e)
      }
    }

    return NextResponse.json({
      success: true,
      networkId: 'testnet',
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
      tokens: {
        usdcId: USDC_ID,
        eureId: EURE_ID,
        userUsdc,
        userEure,
        vaultEure,
      },
      contract: {
        id: FX_BUDGET_ID,
        settlementToken,
        isPaused,
        limits,
        orders,
        chunksByOrder,
      },
      dao: {
        id: DAO_ID,
        proposals,
      },
      agent: {
        fills,
        decisions,
      },
    })
  } catch (err) {
    console.error('[/api/near error]', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to fetch NEAR state' },
      { status: 500 },
    )
  }
}
