import {
	ConsensusAggregationByFields,
	type CronPayload,
	cre,
	type HTTPSendRequester,
	identical,
	ignore,
	median,
	type Runtime,
} from '@chainlink/cre-sdk'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config schema — matches config.json
// ---------------------------------------------------------------------------

export const configSchema = z.object({
	schedule: z.string(),
	privacyServerUrl: z.string(),
	minBalanceForSwap: z.string(),
	inputToken: z.string().default('USDC'),
	outputToken: z.string().default('USDC'),
	swapAmount: z.string().default('1'),
})

export type Config = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// Token decimal scaling — ULNKm and mock stablecoins use 6 decimals
// ---------------------------------------------------------------------------

const TOKEN_DECIMALS = 6
const DECIMAL_SCALE = 10 ** TOKEN_DECIMALS

// ---------------------------------------------------------------------------
// Privacy server response types
// ---------------------------------------------------------------------------

interface PrivacyBalance {
	token: string
	amount: string
}

interface BalancesResponse {
	balances: PrivacyBalance[]
	note?: string
}

interface DemoStartResponse {
	runId: number
	status: string
}

interface PrivacyTransaction {
	id: number
	type: string
	token: string
	amount: string
	tx_hash: string | null
	created_at: number
}

interface TransactionsResponse {
	transactions: PrivacyTransaction[]
	count: number
}

// ---------------------------------------------------------------------------
// Step 1: Check private pool balances
// ---------------------------------------------------------------------------

const fetchPrivateBalances = (
	sendRequester: HTTPSendRequester,
	config: Config,
): BalancesResponse => {
	const response = sendRequester
		.sendRequest({
			url: `${config.privacyServerUrl}/api/privacy/balances`,
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		})
		.result()

	if (response.statusCode !== 200) {
		throw new Error(
			`Privacy balances check failed with status: ${response.statusCode}`,
		)
	}

	const responseText = Buffer.from(response.body).toString('utf-8')
	return JSON.parse(responseText) as BalancesResponse
}

// ---------------------------------------------------------------------------
// Step 2: Trigger private swap via demo endpoint
// ---------------------------------------------------------------------------

const triggerPrivateSwap = (
	sendRequester: HTTPSendRequester,
	config: Config,
): DemoStartResponse => {
	const body = JSON.stringify({
		inputToken: config.inputToken,
		outputToken: config.outputToken,
		amount: config.swapAmount,
	})

	const response = sendRequester
		.sendRequest({
			url: `${config.privacyServerUrl}/api/privacy/demo`,
			method: 'POST',
			body: Buffer.from(body).toString('base64'),
			headers: {
				'Content-Type': 'application/json',
			},
		})
		.result()

	if (response.statusCode !== 200) {
		throw new Error(
			`Privacy demo trigger failed with status: ${response.statusCode}`,
		)
	}

	const responseText = Buffer.from(response.body).toString('utf-8')
	return JSON.parse(responseText) as DemoStartResponse
}

// ---------------------------------------------------------------------------
// Step 3: Check latest transactions
// ---------------------------------------------------------------------------

const fetchRecentTransactions = (
	sendRequester: HTTPSendRequester,
	config: Config,
): TransactionsResponse => {
	const response = sendRequester
		.sendRequest({
			url: `${config.privacyServerUrl}/api/privacy/transactions?limit=5`,
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		})
		.result()

	if (response.statusCode !== 200) {
		throw new Error(
			`Privacy transactions check failed with status: ${response.statusCode}`,
		)
	}

	const responseText = Buffer.from(response.body).toString('utf-8')
	return JSON.parse(responseText) as TransactionsResponse
}

// ---------------------------------------------------------------------------
// Helper: find balance for a given token
// ---------------------------------------------------------------------------

const findTokenBalance = (
	balances: PrivacyBalance[],
	token: string,
): bigint => {
	const entry = balances.find(
		(b) => b.token.toUpperCase() === token.toUpperCase(),
	)
	if (!entry) return 0n
	// Handle both raw integer strings and decimal strings
	try {
		return BigInt(entry.amount)
	} catch {
		// If amount is a decimal string like "1.5", parse as float and scale
		const parsed = parseFloat(entry.amount)
		if (Number.isNaN(parsed)) return 0n
		return BigInt(Math.floor(parsed * DECIMAL_SCALE))
	}
}

// ---------------------------------------------------------------------------
// Core workflow logic
// ---------------------------------------------------------------------------

const doPrivateTreasury = (
	runtime: Runtime<Config>,
	scheduledTime: number,
): string => {
	runtime.log('=== Meridian Private Treasury Workflow Start ===')
	runtime.log(`Privacy server: ${runtime.config.privacyServerUrl}`)

	const httpCapability = new cre.capabilities.HTTPClient()

	// --- Step 1: Check private pool balances ---
	runtime.log('Step 1: Checking private pool balances')

	const balancesResult = httpCapability
		.sendRequest(
			runtime,
			fetchPrivateBalances,
			ConsensusAggregationByFields<BalancesResponse>({
				balances: identical,
				note: ignore,
			}),
		)(runtime.config)
		.result()

	if (!balancesResult.balances || balancesResult.balances.length === 0) {
		runtime.log('No balances found in private pool')
		if (balancesResult.note) {
			runtime.log(`Note: ${balancesResult.note}`)
		}
		return 'WAIT:no_balances'
	}

	const inputBalance = findTokenBalance(
		balancesResult.balances,
		runtime.config.inputToken,
	)
	let minBalance: bigint
	try {
		minBalance = BigInt(runtime.config.minBalanceForSwap)
	} catch {
		runtime.log(`Invalid minBalanceForSwap value: ${runtime.config.minBalanceForSwap}, defaulting to 0`)
		minBalance = 0n
	}

	runtime.log(
		`${runtime.config.inputToken} balance: ${inputBalance.toString()} (min: ${minBalance.toString()})`,
	)

	// --- Decision: check if balance exceeds threshold ---
	if (inputBalance < minBalance) {
		runtime.log(
			`Balance below threshold — waiting (have: ${inputBalance.toString()}, need: ${minBalance.toString()})`,
		)
		return 'WAIT:below_threshold'
	}

	// --- Step 2: Trigger private swap ---
	runtime.log(
		`Step 2: Triggering private swap — ${runtime.config.swapAmount} ${runtime.config.inputToken} -> ${runtime.config.outputToken}`,
	)

	const swapResult = httpCapability
		.sendRequest(
			runtime,
			triggerPrivateSwap,
			ConsensusAggregationByFields<DemoStartResponse>({
				runId: median,
				status: identical,
			}),
		)(runtime.config)
		.result()

	runtime.log(`Private swap initiated: runId=${swapResult.runId} status=${swapResult.status}`)

	// --- Step 3: Check recent transactions for confirmation ---
	runtime.log('Step 3: Checking recent transactions')

	const txResult = httpCapability
		.sendRequest(
			runtime,
			fetchRecentTransactions,
			ConsensusAggregationByFields<TransactionsResponse>({
				transactions: identical,
				count: median,
			}),
		)(runtime.config)
		.result()

	runtime.log(`Recent transactions: ${txResult.count} found`)

	for (const tx of txResult.transactions ?? []) {
		runtime.log(
			`  tx#${tx.id}: ${tx.type} ${tx.amount} ${tx.token} hash=${tx.tx_hash ?? 'pending'}`,
		)
	}

	runtime.log(
		`=== Private Treasury Workflow Complete: EXECUTED runId=${swapResult.runId} at ${scheduledTime} ===`,
	)
	return `EXECUTED:run-${swapResult.runId}`
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

	runtime.log('Running Private Treasury CronTrigger')

	// Use payload timestamp (not Date.now()) for deterministic behavior
	const scheduledTime = Number(payload.scheduledExecutionTime.seconds)

	return doPrivateTreasury(runtime, scheduledTime)
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
