import { NextResponse } from 'next/server'
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

// SQLite connection for agent fills and decisions
function getAgentDb() {
  try {
    const dbPath = path.resolve(process.cwd(), '..', 'agent', 'data', 'agent.db')
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true })
      return db
    }
  } catch (err) {
    console.warn('[API/Near] Could not open agent database:', err)
  }
  return null
}

export async function GET() {
  try {
    const [ordersRes, limitsRes, isPausedRes, proposalsRes] = await Promise.allSettled([
      nearClient.callView(FX_BUDGET_ID, 'list_orders', { from_index: 0, limit: 50 }),
      nearClient.callView(FX_BUDGET_ID, 'get_limits', {}),
      nearClient.callView(FX_BUDGET_ID, 'is_paused', {}),
      nearClient.callView(DAO_ID, 'get_proposals', { from_index: 0, limit: 50 }),
    ])

    const orders = ordersRes.status === 'fulfilled' ? ordersRes.value : []
    const limits = limitsRes.status === 'fulfilled' ? limitsRes.value : {
      auto_cap_in: '100000000',
      max_chunk_in: '20000000',
      min_interval_ns: 60000000000,
      max_horizon_ns: 604800000000000,
    }
    const isPaused = isPausedRes.status === 'fulfilled' ? isPausedRes.value : false
    const proposals = proposalsRes.status === 'fulfilled' ? proposalsRes.value : []

    // Read agent fills and decisions
    let fills: Record<string, unknown>[] = []
    let decisions: Record<string, unknown>[] = []
    const db = getAgentDb()
    if (db) {
      try {
        fills = db.prepare('SELECT * FROM agent_fills ORDER BY id DESC LIMIT 20').all() as Record<string, unknown>[]
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
      contract: {
        id: FX_BUDGET_ID,
        isPaused,
        limits,
        orders,
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
