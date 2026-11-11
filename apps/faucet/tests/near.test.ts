import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  OPERATOR_ID,
  USDC_CONTRACT_ID,
  EURE_CONTRACT_ID,
  NETWORK_ID,
  TARGET_MIN_NATIVE_YOCTO,
  OPERATOR_NEAR_RESERVE_FLOOR_YOCTO,
  getFaucetStatus,
  getTokenBalance,
  getAccountState,
  getLiveGasPrice,
  computeTargetMinNativeYocto,
  computeNativeNearTopUpDelta,
  yoctoToNearNumber,
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

  test('validates on-chain account existence and native balance (Sybil defense)', async () => {
    const { verifyAccountExists } = await import('../src/lib/near.js')
    const realExists = await verifyAccountExists(OPERATOR_ID)
    assert.equal(realExists, true, 'Operator account should exist on NEAR testnet')

    const opState = await getAccountState(OPERATOR_ID)
    assert.equal(opState.exists, true)
    assert.ok(opState.nativeBalanceYocto > 0n)
    assert.ok(opState.nativeBalanceNear > 0)

    const fakeState = await getAccountState('nonexistent-random-xyz-987654.testnet')
    assert.equal(fakeState.exists, false, 'Non-existent account must return exists=false')
    assert.equal(fakeState.nativeBalanceYocto, 0n)
  })

  test('computes dynamic NEP-642 target NEAR balance from live RPC gas price', async () => {
    const liveGasPrice = await getLiveGasPrice()
    assert.ok(liveGasPrice > 0n, 'Live gas price should be positive')

    // Standard testnet gas_price (10^8) uses NEP-642 10^9 floor -> 0.45 NEAR
    const standardTarget = computeTargetMinNativeYocto({
      liveGasPriceYocto: 100_000_000n,
      refStorageAlreadyPaid: false,
    })
    assert.equal(yoctoToNearNumber(standardTarget), 0.45)

    // When Ref storage (0.10 NEAR) is already registered, only 320 Tgas buffer -> 0.32 NEAR
    const regOnlyTarget = computeTargetMinNativeYocto({
      liveGasPriceYocto: 100_000_000n,
      refStorageAlreadyPaid: true,
    })
    assert.equal(yoctoToNearNumber(regOnlyTarget), 0.32)

    // Higher congestion gas_price (2 * 10^9) scales dynamically -> 0.10 + 0.70 = 0.80 NEAR
    const congestedTarget = computeTargetMinNativeYocto({
      liveGasPriceYocto: 2_000_000_000n,
      refStorageAlreadyPaid: false,
    })
    assert.equal(yoctoToNearNumber(congestedTarget), 0.8)
  })

  test('computes conditional native NEAR stipend deltas with anti-drain guardrails', () => {
    const healthyOp = 5n * 10n ** 24n // 5 NEAR

    // Zero-balance first-time wallet gets full 0.45 NEAR
    const zeroBal = computeNativeNearTopUpDelta({
      recipientBalanceYocto: 0n,
      operatorBalanceYocto: healthyOp,
      isFirstTimeWallet: true,
      ipDripAllowed: true,
    })
    assert.equal(zeroBal.deltaYocto, TARGET_MIN_NATIVE_YOCTO)
    assert.equal(yoctoToNearNumber(zeroBal.deltaYocto), 0.45)
    assert.equal(zeroBal.skippedReason, undefined)

    // Partially funded wallet (0.05 NEAR) gets exact 0.40 NEAR shortfall
    const partialBal = computeNativeNearTopUpDelta({
      recipientBalanceYocto: 5n * 10n ** 22n,
      operatorBalanceYocto: healthyOp,
      isFirstTimeWallet: true,
      ipDripAllowed: true,
    })
    assert.equal(partialBal.deltaYocto, 40n * 10n ** 22n)
    assert.equal(yoctoToNearNumber(partialBal.deltaYocto), 0.4)

    // Wallet already at >= 0.45 NEAR gets 0 NEAR
    const funded = computeNativeNearTopUpDelta({
      recipientBalanceYocto: 5n * 10n ** 23n,
      operatorBalanceYocto: healthyOp,
      isFirstTimeWallet: true,
      ipDripAllowed: true,
    })
    assert.equal(funded.deltaYocto, 0n)
    assert.equal(funded.skippedReason, 'already_funded')

    // Repeat wallet gets 0 NEAR even if balance dipped below 0.45 NEAR
    const repeat = computeNativeNearTopUpDelta({
      recipientBalanceYocto: 5n * 10n ** 22n,
      operatorBalanceYocto: healthyOp,
      isFirstTimeWallet: false,
      ipDripAllowed: true,
    })
    assert.equal(repeat.deltaYocto, 0n)
    assert.equal(repeat.skippedReason, 'repeat_wallet')

    // IP drip cap reached blocks native NEAR drip
    const ipCapped = computeNativeNearTopUpDelta({
      recipientBalanceYocto: 0n,
      operatorBalanceYocto: healthyOp,
      isFirstTimeWallet: true,
      ipDripAllowed: false,
    })
    assert.equal(ipCapped.deltaYocto, 0n)
    assert.equal(ipCapped.skippedReason, 'ip_drip_cap')

    // Low operator reserve protects minting gas by skipping NEAR drip
    const lowOp = computeNativeNearTopUpDelta({
      recipientBalanceYocto: 0n,
      operatorBalanceYocto: OPERATOR_NEAR_RESERVE_FLOOR_YOCTO + 10n ** 22n,
      isFirstTimeWallet: true,
      ipDripAllowed: true,
    })
    assert.equal(lowOp.deltaYocto, 0n)
    assert.equal(lowOp.skippedReason, 'operator_low_reserve')
  })
})
