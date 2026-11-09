import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import { dispenseTokens, getTokenBalance, USDC_CONTRACT_ID, EURE_CONTRACT_ID } from '../src/lib/near.js'

describe('Faucet E2E Dispense Verification', () => {
  test('dispenses testnet stablecoins and returns verified on-chain receipts', async () => {
    const testReceiver = 'chilliroger-council2.testnet'
    const initialUsdc = await getTokenBalance(USDC_CONTRACT_ID, testReceiver)

    console.log(`Initial USDC for ${testReceiver}: ${initialUsdc} USDC`)

    const result = await dispenseTokens({
      receiverId: testReceiver,
      token: 'USDC',
      amount: 100,
    })

    assert.equal(result.receiverId, testReceiver)
    assert.equal(result.tokens.length, 1)
    assert.equal(result.tokens[0].symbol, 'USDC')
    assert.ok(result.tokens[0].txHash)
    assert.ok(result.tokens[0].explorerUrl.includes('testnet.nearblocks.io'))

    console.log(`Dispense Tx Hash: ${result.tokens[0].txHash}`)
    console.log(`Explorer Link: ${result.tokens[0].explorerUrl}`)

    const finalUsdc = await getTokenBalance(USDC_CONTRACT_ID, testReceiver)
    console.log(`Final USDC for ${testReceiver}: ${finalUsdc} USDC`)

    assert.ok(finalUsdc >= initialUsdc + 100, 'Balance should increase by 100 USDC')
  })
})
