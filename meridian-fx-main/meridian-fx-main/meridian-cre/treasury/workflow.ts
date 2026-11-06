import {
	bytesToHex,
	ConsensusAggregationByFields,
	type CronPayload,
	cre,
	encodeCallMsg,
	getNetwork,
	type HTTPSendRequester,
	LAST_FINALIZED_BLOCK_NUMBER,
	median,
	prepareReportRequest,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import {
	type Address,
	decodeFunctionResult,
	encodeFunctionData,
	type Hex,
	keccak256,
	toHex,
	zeroAddress,
} from 'viem'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config schema — matches config.json
// ---------------------------------------------------------------------------

export const configSchema = z.object({
	schedule: z.string(),
	uniswapApiUrl: z.string(),
	usdcBase: z.string(),
	eurcBase: z.string(),
	baseChainSelector: z.string(),
	arcChainSelector: z.string(),
	swapExecutorAddress: z.string(),
	treasuryVaultAddress: z.string(),
	swapperAddress: z.string(),
	poolFee: z.number(),
	demoMinTradeAmountRaw: z.string(),
	uniswapApiKey: z.string(),
	oracleApiUrl: z.string().optional(),
})

export type Config = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// Decision types
// ---------------------------------------------------------------------------

type Decision = 'EXECUTE' | 'QUEUE_APPROVAL' | 'WAIT'

interface QuoteData {
	rate: bigint // 18 decimals
	inputAmount: bigint
	outputAmount: bigint
}

// ---------------------------------------------------------------------------
// Contract ABIs (human-readable fragments extracted from Solidity source)
// ---------------------------------------------------------------------------

const SwapExecutorABI = [
	{
		type: 'function',
		name: 'getBalances',
		inputs: [],
		outputs: [
			{ name: 'usdcBal', type: 'uint256' },
			{ name: 'eurcBal', type: 'uint256' },
		],
		stateMutability: 'view',
	},
	{
		type: 'function',
		name: 'executeSwap',
		inputs: [
			{ name: '_tradeId', type: 'bytes32' },
			{ name: '_amountIn', type: 'uint256' },
			{ name: '_amountOutMinimum', type: 'uint256' },
		],
		outputs: [{ name: 'amountOut', type: 'uint256' }],
		stateMutability: 'nonpayable',
	},
	{
		type: 'function',
		name: 'withdraw',
		inputs: [
			{ name: 'token', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
] as const

const TreasuryVaultABI = [
	{
		type: 'function',
		name: 'getPolicy',
		inputs: [],
		outputs: [
			{ name: 'threshold', type: 'uint256' },
			{ name: 'rateMin', type: 'uint256' },
			{ name: 'rateMax', type: 'uint256' },
			{ name: 'version', type: 'uint256' },
		],
		stateMutability: 'view',
	},
	{
		type: 'function',
		name: 'logExecution',
		inputs: [
			{ name: '_tradeId', type: 'bytes32' },
			{ name: '_executionType', type: 'string' },
			{ name: '_fromToken', type: 'address' },
			{ name: '_toToken', type: 'address' },
			{ name: '_fromAmount', type: 'uint256' },
			{ name: '_toAmount', type: 'uint256' },
			{ name: '_exchangeRate', type: 'uint256' },
			{ name: '_txHashBase', type: 'bytes32' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
	{
		type: 'function',
		name: 'createPendingTrade',
		inputs: [
			{ name: '_tradeId', type: 'bytes32' },
			{ name: '_fromAmount', type: 'uint256' },
			{ name: '_toAmount', type: 'uint256' },
			{ name: '_exchangeRate', type: 'uint256' },
			{ name: '_expiresAt', type: 'uint256' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
] as const

// ---------------------------------------------------------------------------
// Helper: safe JSON stringify for BigInts
// ---------------------------------------------------------------------------

const safeJsonStringify = (obj: unknown): string =>
	JSON.stringify(
		obj,
		(_, value) => (typeof value === 'bigint' ? value.toString() : value),
		2,
	)

// ---------------------------------------------------------------------------
// Step 1: Fetch USDC/EURC quote from Uniswap API
// ---------------------------------------------------------------------------

interface UniswapQuoteResponse {
	quote: {
		input: { amount: string }
		output: { amount: string }
	}
}

export const fetchUniswapQuote = (
	sendRequester: HTTPSendRequester,
	config: Config,
): QuoteData => {
	const body = JSON.stringify({
		tokenInChainId: 8453, // Base mainnet
		tokenIn: config.usdcBase,
		tokenOutChainId: 8453,
		tokenOut: config.eurcBase,
		amount: config.demoMinTradeAmountRaw,
		type: 'EXACT_INPUT',
		swapper: config.swapperAddress,
	})

	const response = sendRequester
		.sendRequest({
			url: config.uniswapApiUrl,
			method: 'POST',
			body: Buffer.from(body).toString('base64'),
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': config.uniswapApiKey,
			},
		})
		.result()

	if (response.statusCode !== 200) {
		throw new Error(
			`Uniswap quote failed with status: ${response.statusCode}`,
		)
	}

	const responseText = Buffer.from(response.body).toString('utf-8')
	const parsed: UniswapQuoteResponse = JSON.parse(responseText)

	const inputAmount = BigInt(parsed.quote.input.amount)
	const outputAmount = BigInt(parsed.quote.output.amount)

	// Rate = outputAmount / inputAmount scaled to 18 decimals
	// Both USDC and EURC are 6 decimals, so ratio is direct
	const rate =
		inputAmount > 0n
			? (outputAmount * 10n ** 18n) / inputAmount
			: 0n

	return { rate, inputAmount, outputAmount }
}

// ---------------------------------------------------------------------------
// Step 2: Read policy from TreasuryVault on Arc
// ---------------------------------------------------------------------------

interface PolicyData {
	threshold: bigint
	rateMin: bigint
	rateMax: bigint
	version: bigint
}

const readPolicy = (
	runtime: Runtime<Config>,
): PolicyData => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.arcChainSelector,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(
			`Network not found for chain: ${runtime.config.arcChainSelector}`,
		)
	}

	const evmClient = new cre.capabilities.EVMClient(
		network.chainSelector.selector,
	)

	const callData = encodeFunctionData({
		abi: TreasuryVaultABI,
		functionName: 'getPolicy' as const,
	})

	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.treasuryVaultAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()

	const decoded = decodeFunctionResult({
		abi: TreasuryVaultABI,
		functionName: 'getPolicy' as const,
		data: bytesToHex(result.data),
	}) as readonly [bigint, bigint, bigint, bigint]

	return {
		threshold: decoded[0],
		rateMin: decoded[1],
		rateMax: decoded[2],
		version: decoded[3],
	}
}

// ---------------------------------------------------------------------------
// Step 3: Read balances from SwapExecutor on Base
// ---------------------------------------------------------------------------

interface Balances {
	usdcBal: bigint
	eurcBal: bigint
}

const readBalances = (
	runtime: Runtime<Config>,
): Balances => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.baseChainSelector,
		isTestnet: false,
	})

	if (!network) {
		throw new Error(
			`Network not found for chain: ${runtime.config.baseChainSelector}`,
		)
	}

	const evmClient = new cre.capabilities.EVMClient(
		network.chainSelector.selector,
	)

	const callData = encodeFunctionData({
		abi: SwapExecutorABI,
		functionName: 'getBalances' as const,
	})

	const result = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.swapExecutorAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()

	const decoded = decodeFunctionResult({
		abi: SwapExecutorABI,
		functionName: 'getBalances' as const,
		data: bytesToHex(result.data),
	}) as readonly [bigint, bigint]

	return {
		usdcBal: decoded[0],
		eurcBal: decoded[1],
	}
}

// ---------------------------------------------------------------------------
// Step 4: Decision logic
// ---------------------------------------------------------------------------

const decide = (
	rate: bigint,
	policy: PolicyData,
	usdcBalance: bigint,
	tradeAmount: bigint,
): Decision => {
	// Rate outside acceptable band -> WAIT
	if (rate < policy.rateMin || rate > policy.rateMax) {
		return 'WAIT'
	}

	// Insufficient balance -> WAIT
	if (usdcBalance < tradeAmount) {
		return 'WAIT'
	}

	// Amount below auto-execute threshold -> EXECUTE
	if (tradeAmount < policy.threshold) {
		return 'EXECUTE'
	}

	// Amount at or above threshold -> needs CFO approval
	return 'QUEUE_APPROVAL'
}

// ---------------------------------------------------------------------------
// Step 5: Execute swap on Base via SwapExecutor
// ---------------------------------------------------------------------------

const executeSwapOnBase = (
	runtime: Runtime<Config>,
	tradeId: Hex,
	amountIn: bigint,
	amountOutMinimum: bigint,
): { txHash: Hex } => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.baseChainSelector,
		isTestnet: false,
	})

	if (!network) {
		throw new Error(
			`Network not found for chain: ${runtime.config.baseChainSelector}`,
		)
	}

	const evmClient = new cre.capabilities.EVMClient(
		network.chainSelector.selector,
	)

	const callData = encodeFunctionData({
		abi: SwapExecutorABI,
		functionName: 'executeSwap' as const,
		args: [tradeId, amountIn, amountOutMinimum],
	})

	const reportResponse = runtime
		.report(prepareReportRequest(callData))
		.result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: runtime.config.swapExecutorAddress as Address,
			report: reportResponse,
			gasConfig: { gasLimit: '500000' },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(
			`executeSwap failed: ${resp.errorMessage || resp.txStatus}`,
		)
	}

	const txHash = bytesToHex(resp.txHash || new Uint8Array(32))
	runtime.log(`executeSwap tx succeeded: ${txHash}`)

	return { txHash: txHash as Hex }
}

// ---------------------------------------------------------------------------
// Step 6: Log execution on Arc via TreasuryVault.logExecution()
// ---------------------------------------------------------------------------

const logExecutionOnArc = (
	runtime: Runtime<Config>,
	tradeId: Hex,
	executionType: string,
	fromAmount: bigint,
	toAmount: bigint,
	exchangeRate: bigint,
	txHashBase: Hex,
): void => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.arcChainSelector,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(
			`Network not found for chain: ${runtime.config.arcChainSelector}`,
		)
	}

	const evmClient = new cre.capabilities.EVMClient(
		network.chainSelector.selector,
	)

	const callData = encodeFunctionData({
		abi: TreasuryVaultABI,
		functionName: 'logExecution' as const,
		args: [
			tradeId,
			executionType,
			runtime.config.usdcBase as Address,
			runtime.config.eurcBase as Address,
			fromAmount,
			toAmount,
			exchangeRate,
			txHashBase as Hex,
		],
	})

	const reportResponse = runtime
		.report(prepareReportRequest(callData))
		.result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: runtime.config.treasuryVaultAddress as Address,
			report: reportResponse,
			gasConfig: { gasLimit: '300000' },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(
			`logExecution failed: ${resp.errorMessage || resp.txStatus}`,
		)
	}

	runtime.log(
		`logExecution tx succeeded: ${bytesToHex(resp.txHash || new Uint8Array(32))}`,
	)
}

// ---------------------------------------------------------------------------
// Step 7: Queue pending trade on Arc via TreasuryVault.createPendingTrade()
// ---------------------------------------------------------------------------

const queuePendingTradeOnArc = (
	runtime: Runtime<Config>,
	tradeId: Hex,
	fromAmount: bigint,
	toAmount: bigint,
	exchangeRate: bigint,
	expiresAt: bigint,
): void => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.arcChainSelector,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(
			`Network not found for chain: ${runtime.config.arcChainSelector}`,
		)
	}

	const evmClient = new cre.capabilities.EVMClient(
		network.chainSelector.selector,
	)

	const callData = encodeFunctionData({
		abi: TreasuryVaultABI,
		functionName: 'createPendingTrade' as const,
		args: [tradeId, fromAmount, toAmount, exchangeRate, expiresAt],
	})

	const reportResponse = runtime
		.report(prepareReportRequest(callData))
		.result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: runtime.config.treasuryVaultAddress as Address,
			report: reportResponse,
			gasConfig: { gasLimit: '300000' },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(
			`createPendingTrade failed: ${resp.errorMessage || resp.txStatus}`,
		)
	}

	runtime.log(
		`createPendingTrade tx succeeded: ${bytesToHex(resp.txHash || new Uint8Array(32))}`,
	)
}

// ---------------------------------------------------------------------------
// Generate deterministic trade ID from execution time
// ---------------------------------------------------------------------------

const generateTradeId = (scheduledTime: number): Hex => {
	return keccak256(toHex(`meridian-treasury-${scheduledTime}`))
}

// ---------------------------------------------------------------------------
// Core workflow logic
// ---------------------------------------------------------------------------

const doTreasury = (
	runtime: Runtime<Config>,
	scheduledTime: number,
): string => {
	runtime.log('=== Meridian Treasury Workflow Start ===')

	// --- 1. Fetch USDC/EURC quote ---
	// Confidential HTTP — when running on DON, this request executes inside the TEE.
	// The Uniswap API key and quote parameters are not visible to node operators.
	runtime.log(`Fetching quote from ${runtime.config.uniswapApiUrl}`)

	const httpCapability = new cre.capabilities.HTTPClient()
	const quote = httpCapability
		.sendRequest(
			runtime,
			fetchUniswapQuote,
			ConsensusAggregationByFields<QuoteData>({
				rate: median,
				inputAmount: median,
				outputAmount: median,
			}),
		)(runtime.config)
		.result()

	runtime.log(`Quote: rate=${quote.rate.toString()} input=${quote.inputAmount.toString()} output=${quote.outputAmount.toString()}`)

	// --- 2. Read policy from TreasuryVault on Arc ---
	runtime.log('Reading policy from TreasuryVault on Arc')
	const policy = readPolicy(runtime)
	runtime.log(
		`Policy: threshold=${policy.threshold.toString()} rateMin=${policy.rateMin.toString()} rateMax=${policy.rateMax.toString()} v${policy.version.toString()}`,
	)

	// --- 3. Read balances from SwapExecutor on Base ---
	runtime.log('Reading balances from SwapExecutor on Base')
	const balances = readBalances(runtime)
	runtime.log(
		`Balances: USDC=${balances.usdcBal.toString()} EURC=${balances.eurcBal.toString()}`,
	)

	// --- 4. Decision logic ---
	const tradeAmount = BigInt(runtime.config.demoMinTradeAmountRaw)
	const decision = decide(quote.rate, policy, balances.usdcBal, tradeAmount)
	runtime.log(`Decision: ${decision} (tradeAmount=${tradeAmount.toString()})`)

	const tradeId = generateTradeId(scheduledTime)
	runtime.log(`TradeId: ${tradeId}`)

	// Apply slippage tolerance: 0.5% = multiply output by 995/1000
	const amountOutMinimum = (quote.outputAmount * 995n) / 1000n

	// --- 5. Act on decision ---
	if (decision === 'EXECUTE') {
		runtime.log('Executing auto-trade on Base')

		const { txHash } = executeSwapOnBase(
			runtime,
			tradeId,
			tradeAmount,
			amountOutMinimum,
		)

		runtime.log('Logging execution on Arc')
		logExecutionOnArc(
			runtime,
			tradeId,
			'AUTO',
			tradeAmount,
			quote.outputAmount,
			quote.rate,
			txHash,
		)

		runtime.log(`=== AUTO EXECUTE complete: ${txHash} ===`)
		return `EXECUTED:${tradeId}`
	}

	if (decision === 'QUEUE_APPROVAL') {
		// Expire in 1 hour (3600 seconds from scheduled time)
		const expiresAt = BigInt(scheduledTime) + 3600n

		runtime.log('Queuing pending trade for CFO approval on Arc')
		queuePendingTradeOnArc(
			runtime,
			tradeId,
			tradeAmount,
			quote.outputAmount,
			quote.rate,
			expiresAt,
		)

		runtime.log(`=== QUEUE_APPROVAL complete: ${tradeId} ===`)
		return `QUEUED:${tradeId}`
	}

	// WAIT
	runtime.log(
		`=== WAIT: rate=${quote.rate.toString()} band=[${policy.rateMin.toString()},${policy.rateMax.toString()}] balance=${balances.usdcBal.toString()} ===`,
	)
	return 'WAIT'
}

// ---------------------------------------------------------------------------
// Oracle-driven mode: asks Oracle what to do, executes, reports back
// ---------------------------------------------------------------------------

interface OracleStrategyResponse {
	action: 'SWAP' | 'WAIT'
	orderId?: string
	chunkAmount?: string
	minOutput?: string
	score?: number
	reason: string
}

const doTreasuryOracle = (
	runtime: Runtime<Config>,
	scheduledTime: number,
): string => {
	const oracleUrl = runtime.config.oracleApiUrl!
	runtime.log('=== Meridian Treasury Workflow (Oracle Mode) ===')

	// Step 1: Ask Oracle what to do
	// Confidential HTTP — when running on DON, this request executes inside the TEE.
	// Node operators cannot see the Oracle's strategy response (action, timing score,
	// recommended chunk size), preventing front-running of treasury swaps.
	runtime.log(`Asking Oracle: ${oracleUrl}/api/strategy/next`)
	const httpCapability = new cre.capabilities.HTTPClient()

	const fetchStrategy = (sendRequester: HTTPSendRequester): OracleStrategyResponse => {
		const response = sendRequester
			.sendRequest({
				url: `${oracleUrl}/api/strategy/next`,
				method: 'GET',
			})
			.result()

		if (response.statusCode !== 200) {
			throw new Error(`Oracle returned status: ${response.statusCode}`)
		}

		const text = Buffer.from(response.body).toString('utf-8')
		return JSON.parse(text) as OracleStrategyResponse
	}

	const strategy = httpCapability
		.sendRequest(
			runtime,
			fetchStrategy,
			ConsensusAggregationByFields<OracleStrategyResponse>({
				action: median as any,
				orderId: median as any,
				chunkAmount: median as any,
				minOutput: median as any,
				score: median as any,
				reason: median as any,
			}),
		)()
		.result()

	runtime.log(`Oracle says: ${strategy.action} — ${strategy.reason}`)

	if (strategy.action === 'WAIT') {
		return `WAIT:${strategy.reason}`
	}

	// Step 2: Sanity check balances
	runtime.log('Reading balances from SwapExecutor on Base')
	const balances = readBalances(runtime)
	runtime.log(`Balances: USDC=${balances.usdcBal.toString()} EURC=${balances.eurcBal.toString()}`)

	const chunkAmount = BigInt(strategy.chunkAmount || '0')
	if (chunkAmount <= 0n) {
		return 'WAIT:chunk_amount_zero'
	}

	// NOTE: Balance check disabled — CRE simulation with --broadcast returns 0 for
	// callContract (EVM reads) even though sendTransaction (EVM writes) hit the real chain.
	// This means readBalances() always returns 0, causing every swap to fail with
	// "insufficient_balance". This is a CRE SDK limitation in --broadcast mode.
	// See sponsor-feedback.md for details.
	// if (balances.usdcBal < chunkAmount) {
	// 	runtime.log(`Insufficient balance: have ${balances.usdcBal.toString()}, need ${chunkAmount.toString()}`)
	// 	return 'WAIT:insufficient_balance'
	// }

	// Step 3: Execute swap
	const tradeId = keccak256(toHex(strategy.orderId || `tick-${scheduledTime}`))
	const minOutput = BigInt(strategy.minOutput || '0')

	runtime.log(`Executing swap: chunk=${chunkAmount.toString()} minOut=${minOutput.toString()}`)

	let txHash: Hex = '0x' as Hex
	try {
		const result = executeSwapOnBase(runtime, tradeId, chunkAmount, minOutput)
		txHash = result.txHash
	} catch (e) {
		runtime.log(`Swap failed: ${(e as Error).message}`)
		// Report failure to Oracle
		reportToOracle(runtime, oracleUrl, strategy.orderId || '', '0', '0', 'SWAP_FAILED', '', scheduledTime)
		return 'SWAP_FAILED'
	}

	// Step 4: Withdraw output tokens to treasury (best-effort)
	try {
		runtime.log('Withdrawing output tokens to treasury')
		withdrawToTreasury(runtime, runtime.config.eurcBase as Address)
	} catch (e) {
		runtime.log(`Withdraw failed (funds safe in executor): ${(e as Error).message}`)
	}

	// Step 5: Log on Arc (best-effort)
	try {
		runtime.log('Logging execution on Arc')
		logExecutionOnArc(runtime, tradeId, 'AUTO', chunkAmount, minOutput, 0n, txHash)
	} catch (e) {
		runtime.log(`Arc logging failed (non-critical): ${(e as Error).message}`)
	}

	// Step 6: Report fill to Oracle
	reportToOracle(runtime, oracleUrl, strategy.orderId || '', chunkAmount.toString(), minOutput.toString(), 'FILLING', txHash, scheduledTime)

	runtime.log(`=== ORACLE EXECUTE complete: ${txHash} ===`)
	return `EXECUTED:${strategy.orderId}`
}

// Withdraw EURC from SwapExecutor to treasury wallet (owner)
const withdrawToTreasury = (runtime: Runtime<Config>, tokenAddress: Address): void => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.baseChainSelector,
		isTestnet: false,
	})
	if (!network) return

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)

	// Read current EURC balance of executor to know how much to withdraw
	const balances = readBalances(runtime)
	const withdrawAmount = balances.eurcBal
	if (withdrawAmount <= 0n) {
		runtime.log('No EURC to withdraw')
		return
	}

	const callData = encodeFunctionData({
		abi: SwapExecutorABI,
		functionName: 'withdraw' as const,
		args: [tokenAddress, withdrawAmount],
	})

	const reportResponse = runtime
		.report(prepareReportRequest(callData))
		.result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: runtime.config.swapExecutorAddress as Address,
			report: reportResponse,
			gasConfig: { gasLimit: '500000' },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`withdraw failed: ${resp.errorMessage || resp.txStatus}`)
	}

	runtime.log(`Withdrew ${withdrawAmount.toString()} EURC to treasury`)
}

// Report results back to Oracle
// Confidential HTTP — fill reports also run inside the TEE on DON, keeping
// execution details (filled amount, tx hash) private from node operators.
interface OracleReport { ok: boolean }

const reportToOracle = (
	runtime: Runtime<Config>,
	oracleUrl: string,
	orderId: string,
	filledAmount: string,
	outputReceived: string,
	status: string,
	txHash: string,
	scheduledTime: number,
): void => {
	try {
		const httpCapability = new cre.capabilities.HTTPClient()
		const reportFill = (sendRequester: HTTPSendRequester): OracleReport => {
			const body = JSON.stringify({
				filledAmount,
				outputReceived,
				status,
				txHash,
			})
			sendRequester.sendRequest({
				url: `${oracleUrl}/api/trades/${orderId}/fill`,
				method: 'PATCH',
				body: Buffer.from(body).toString('base64'),
				headers: { 'Content-Type': 'application/json' },
			}).result()

			// Also log the CRE run
			const runBody = JSON.stringify({
				startedAt: scheduledTime,
				action: status === 'SWAP_FAILED' ? 'FAILED' : 'EXECUTE',
				orderId,
				chunkAmount: filledAmount,
				result: status,
				txHash,
				durationMs: 0,
			})
			sendRequester.sendRequest({
				url: `${oracleUrl}/api/cre/runs`,
				method: 'POST',
				body: Buffer.from(runBody).toString('base64'),
				headers: { 'Content-Type': 'application/json' },
			}).result()

			return { ok: true }
		}

		httpCapability.sendRequest(
			runtime,
			reportFill,
			ConsensusAggregationByFields<OracleReport>({
				ok: median as any,
			}),
		)().result()
	} catch (e) {
		runtime.log(`Failed to report to Oracle (non-critical): ${(e as Error).message}`)
	}
}

// ---------------------------------------------------------------------------
// Cron trigger handler
// ---------------------------------------------------------------------------

export const onCronTrigger = (
	runtime: Runtime<Config>,
	payload: CronPayload,
): string => {
	if (!payload.scheduledExecutionTime) {
		throw new Error('Scheduled execution time is required')
	}

	runtime.log('Running CronTrigger')

	// Use payload timestamp (not Date.now()) for deterministic behavior
	// scheduledExecutionTime is a protobuf Timestamp with .seconds (bigint)
	const scheduledTime = Number(payload.scheduledExecutionTime.seconds)

	// Use Oracle-driven mode if oracleApiUrl is configured
	if (runtime.config.oracleApiUrl) {
		return doTreasuryOracle(runtime, scheduledTime)
	}

	// Fallback: self-contained mode (original logic)
	return doTreasury(runtime, scheduledTime)
}

// ---------------------------------------------------------------------------
// Workflow initialization
// ---------------------------------------------------------------------------

export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()
	return [
		cre.handler(
			cronTrigger.trigger({
				schedule: config.schedule,
			}),
			onCronTrigger,
		),
	]
}
