/**
 * Local checks for the order-creation scripts (no network, no signing):
 *  - transaction arguments are built in atomic units and always carry an invoice target
 *  - every active script that creates an order passes `target_out`
 *  - scripts only ever target testnet and the documented accounts / tokens / contract ids
 *
 * Run: pnpm test:scripts   (also part of `pnpm test`)
 */

import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildApproveOrderProposalArgs,
  buildCreateOrderArgs,
  buildEscrowMsg,
  buildEscrowTransferCallArgs,
  findOrderByInvoiceRef,
  formatAtomic6,
  parseAtomic6,
  type InvoiceOrderParams,
} from './order-args.js'
import { buildDemoOrderParams } from './demo-approval-flow.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const NOW_MS = 1_794_500_000_000
const base: InvoiceOrderParams = {
  totalInAtomic: 15_000_000n,
  maxChunkInAtomic: 10_000_000n,
  targetOutAtomic: 8_000_000n,
  recipient: 'supplier-eu.chilliroger-operator.testnet',
  invoiceRef: 'INV-TEST-8',
  deadlineNs: (BigInt(Date.now()) + 3_600_000n) * 1_000_000n,
  maxDevBps: 250,
}

describe('atomic unit helpers', () => {
  test('parseAtomic6 is exact (no floats) and strict', () => {
    assert.equal(parseAtomic6('250'), 250_000_000n)
    assert.equal(parseAtomic6('8.924090'), 8_924_090n)
    assert.equal(parseAtomic6('0.000001'), 1n)
    assert.equal(parseAtomic6('0.1') + parseAtomic6('0.2'), parseAtomic6('0.3'))
    for (const bad of ['', '-1', '1.1234567', '1e6', 'abc', '1,5']) assert.throws(() => parseAtomic6(bad), undefined, bad)
    assert.equal(formatAtomic6(8_924_090n), '8.924090')
  })
})

describe('create_order arguments', () => {
  test('carry target_out and the budget in atomic-unit STRINGS', () => {
    const a = buildCreateOrderArgs(base)
    assert.equal(a.target_out, '8000000')
    assert.equal(a.total_in, '15000000')
    assert.equal(a.max_chunk_in, '10000000')
    assert.equal(a.recipient, 'supplier-eu.chilliroger-operator.testnet')
    assert.equal(a.invoice_ref, 'INV-TEST-8')
    assert.equal(a.pair_label, 'USDC/EURe')
    assert.equal(typeof a.deadline_ns, 'number')
    assert.equal(typeof a.max_dev_bps, 'number')
  })

  test('are rejected locally without a positive invoice target (the contract would reject them)', () => {
    assert.throws(() => buildCreateOrderArgs({ ...base, targetOutAtomic: 0n }), /target_out is required/)
    assert.throws(() => buildEscrowMsg({ ...base, targetOutAtomic: 0n }), /target_out is required/)
  })

  test('reject other invalid inputs', () => {
    assert.throws(() => buildCreateOrderArgs({ ...base, maxChunkInAtomic: 20_000_000n }), /max_chunk_in/)
    assert.throws(() => buildCreateOrderArgs({ ...base, recipient: 'Bad Account' }), /recipient/)
    assert.throws(() => buildCreateOrderArgs({ ...base, invoiceRef: 'x'.repeat(65) }), /invoice_ref/)
    assert.throws(() => buildCreateOrderArgs({ ...base, deadlineNs: 1n }), /deadline/)
    assert.throws(() => buildCreateOrderArgs({ ...base, maxDevBps: 9000 }), /max_dev_bps/)
  })
})

describe('escrow funding (Circle USDC ft_transfer_call) arguments', () => {
  test('msg parses to the fields FxBudget::ft_on_transfer expects, including target_out', () => {
    const args = buildEscrowTransferCallArgs('fx-budget.chilliroger-operator.testnet', base)
    assert.equal(args.receiver_id, 'fx-budget.chilliroger-operator.testnet')
    assert.equal(args.amount, '15000000')
    const msg = JSON.parse(String(args.msg))
    assert.deepEqual(Object.keys(msg).sort(), ['action', 'deadline_ns', 'invoice_ref', 'max_chunk_in', 'max_dev_bps', 'pair_label', 'recipient', 'target_out'])
    assert.equal(msg.action, 'create_escrowed_order')
    assert.equal(msg.target_out, '8000000')
    assert.equal(msg.max_chunk_in, '10000000')
  })
})

describe('demo-approval-flow', () => {
  test('creates an above-cap Pending invoice: budget 250 USDC, target EUR 200, atomic units', () => {
    const p = buildDemoOrderParams(NOW_MS)
    const a = buildCreateOrderArgs({ ...p, deadlineNs: BigInt(Date.now() + 86_400_000) * 1_000_000n })
    assert.equal(a.total_in, '250000000')
    assert.ok(BigInt(a.total_in as string) > 100_000_000n, 'above the 100 USDC auto-cap so the DAO flow is exercised')
    assert.equal(a.target_out, '200000000')
    assert.equal(a.max_chunk_in, '20000000')
    assert.match(String(a.invoice_ref), /^INV-DEMO-APPROVAL-\d+$/)
    assert.match(String(a.recipient), /^supplier-eu\..+\.testnet$/)
  })

  test('the DAO proposal calls approve_order({ id }) on FxBudget with 30 Tgas and no deposit', () => {
    const args = buildApproveOrderProposalArgs('fx-budget.x.testnet', 13, 'Approve #13') as any
    const action = args.proposal.kind.FunctionCall.actions[0]
    assert.equal(args.proposal.kind.FunctionCall.receiver_id, 'fx-budget.x.testnet')
    assert.equal(action.method_name, 'approve_order')
    assert.deepEqual(JSON.parse(Buffer.from(action.args, 'base64').toString()), { id: 13 })
    assert.equal(action.deposit, '0')
    assert.equal(action.gas, '30000000000000')
  })
})

describe('findOrderByInvoiceRef', () => {
  test('pages past the 100-order view cap and finds the newest match', async () => {
    const all = Array.from({ length: 230 }, (_, i) => ({ id: i + 1, invoice_ref: i + 1 === 205 ? 'INV-X' : `ORDER-${i + 1}` }))
    const calls: Array<[number, number]> = []
    const found = await findOrderByInvoiceRef(async (from, limit) => {
      calls.push([from, limit])
      return all.slice(from, from + limit)
    }, 'INV-X')
    assert.equal(found?.id, 205)
    assert.deepEqual(calls, [[0, 100], [100, 100], [200, 100]])
  })
})

describe('static scan of the scripts', () => {
  const scriptFiles = fs
    .readdirSync(HERE)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(HERE, f), 'utf-8') }))

  test('every script that creates an order passes target_out', () => {
    const creators = scriptFiles.filter((f) => /methodName:\s*'create_order'|create_escrowed_order|buildEscrowTransferCallArgs|buildCreateOrderArgs/.test(f.text))
    assert.ok(creators.length >= 4, `expected the known order-creating scripts, found ${creators.map((c) => c.name).join(', ')}`)
    for (const f of creators) {
      if (f.name === 'order-args.ts') continue
      const usesBuilder = /buildCreateOrderArgs|buildEscrowTransferCallArgs|buildEscrowMsg/.test(f.text)
      const inlineOk = /target_out/.test(f.text)
      assert.ok(usesBuilder || inlineOk, `${f.name} creates an order without target_out`)
      // inline create_order literals must carry target_out within the same argument object
      for (const m of f.text.matchAll(/methodName:\s*'create_order',\s*args:\s*\{([\s\S]*?)\n\s{4,6}\},/g)) {
        assert.match(m[1], /target_out/, `${f.name}: inline create_order args are missing target_out`)
      }
    }
  })

  test('scripts only ever sign on testnet', () => {
    for (const f of scriptFiles) {
      assert.doesNotMatch(f.text, /network-config['"]?,?\s*['"]mainnet/i, `${f.name} references the mainnet network config`)
      assert.doesNotMatch(f.text, /rpc\.mainnet|mainnet\.near\.org/i, `${f.name} references a mainnet RPC`)
    }
    const runner = scriptFiles.find((f) => f.name === 'near-runner.ts')!
    assert.ok((runner.text.match(/'testnet'/g) ?? []).length >= 5, 'near-runner pins every call to the testnet network config')
    assert.doesNotMatch(runner.text, /'mainnet'/)
  })

  test('accounts, tokens and contract ids the scripts use (documented defaults)', () => {
    const defaults = new Map<string, Set<string>>()
    for (const f of scriptFiles) {
      for (const m of f.text.matchAll(/process\.env\.([A-Z0-9_]+)\s*\|\|\s*'([^']+)'/g)) {
        if (!defaults.has(m[1])) defaults.set(m[1], new Set())
        defaults.get(m[1])!.add(m[2])
      }
    }
    const expected: Record<string, string> = {
      OPERATOR_ACCOUNT_ID: 'chilliroger-operator.testnet',
      AGENT_ACCOUNT_ID: 'chilliroger-agent.testnet',
      SPUTNIK_DAO_ACCOUNT_ID: 'chilliroger-dao.sputnik-v2.testnet',
      COUNCIL1_ACCOUNT_ID: 'chilliroger-council1.testnet',
      COUNCIL2_ACCOUNT_ID: 'chilliroger-council2.testnet',
    }
    for (const [env, value] of Object.entries(expected)) {
      const seen = defaults.get(env)
      assert.ok(seen, `${env} default not found in any script`)
      assert.deepEqual([...seen!], [value], `${env} must have a single consistent default`)
    }
    // Circle canonical testnet USDC: the only escrow input token any script uses.
    const circle = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
    for (const f of scriptFiles.filter((f) => /USDC_CONTRACT_ID/.test(f.text))) {
      assert.ok(f.text.includes(circle), `${f.name} must default USDC_CONTRACT_ID to the canonical Circle testnet USDC`)
    }
  })
})
