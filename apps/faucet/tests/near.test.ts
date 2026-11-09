import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  OPERATOR_ID,
  USDC_CONTRACT_ID,
  EURE_CONTRACT_ID,
  NETWORK_ID,
  getFaucetStatus,
  getTokenBalance,
} from '../src/lib/near.js'

describe('Serverless NEAR Engine', () => {
  test('exports valid default contract IDs and network configuration', () => {
    assert.equal(NETWORK_ID, 'testnet')
    assert.ok(OPERATOR_ID.includes('.testnet'))
    assert.ok(USDC_CONTRACT_ID.includes('.testnet'))
    assert.ok(EURE_CONTRACT_ID.includes('.testnet'))
  })

  test('fetches live testnet faucet status and token supplies', async () => {
    const status = await getFaucetStatus()
    assert.equal(status.networkId, 'testnet')
    assert.ok(status.operatorNearBalance > 0, 'Operator should have NEAR balance for gas')
    assert.ok(status.usdcTotalSupply >= 1_000_000, 'USDC total supply should be at least 1M')
    assert.ok(status.eureTotalSupply >= 1_000_000, 'EURe total supply should be at least 1M')
  })

  test('queries on-chain token balances via RPC', async () => {
    const bal = await getTokenBalance(USDC_CONTRACT_ID, OPERATOR_ID)
    assert.ok(typeof bal === 'number')
    assert.ok(bal >= 0)
  })
})
