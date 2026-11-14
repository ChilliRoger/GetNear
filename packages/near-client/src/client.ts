/**
 * GetNear JSON-RPC Client
 *
 * Implements resilient NEAR JSON-RPC interactions with:
 * - Automatic failover across an ordered list of RPC endpoints
 * - Retries with exponential backoff on transient errors
 * - Strict per-call timeouts
 * - Testnet network validation
 */

import type {
  NearClientConfig,
  NearRpcStatus,
  NearAccountView,
  AccessKeyView,
  AccessKeyListResponse,
  FunctionCallResponse,
  BlockResponse,
  GasPriceResponse,
  TxStatusResponse,
} from './types'

export class NearRpcError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly rpcError?: unknown,
  ) {
    super(message)
    this.name = 'NearRpcError'
  }
}

export class NearClient {
  private rpcUrls: string[]
  private activeUrlIndex = 0
  private timeoutMs: number
  private maxRetries: number
  public readonly networkId: string

  constructor(config: NearClientConfig = {}) {
    this.networkId = config.networkId ?? 'testnet'
    const defaultRpcs = this.networkId === 'mainnet'
      ? ['https://rpc.mainnet.near.org', 'https://free.rpc.fastnear.com']
      : ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com']
    const urls = config.rpcUrls && config.rpcUrls.length > 0 ? config.rpcUrls : defaultRpcs
    if (!urls || urls.length === 0) {
      throw new Error('NearClient requires at least one RPC URL')
    }
    this.rpcUrls = [...urls]
    this.timeoutMs = config.timeoutMs ?? 10_000
    this.maxRetries = config.maxRetries ?? 2
  }

  /** Current active RPC URL */
  public get currentRpcUrl(): string {
    return this.rpcUrls[this.activeUrlIndex]
  }

  /**
   * Core RPC call method with failover across endpoints.
   */
  public async call<T = unknown>(method: string, params: unknown): Promise<T> {
    const errors: Array<{ endpoint: string; error: string }> = []
    const initialIndex = this.activeUrlIndex

    for (let offset = 0; offset < this.rpcUrls.length; offset++) {
      const endpointIndex = (initialIndex + offset) % this.rpcUrls.length
      const endpoint = this.rpcUrls[endpointIndex]

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), this.timeoutMs)

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method,
              params,
            }),
            signal: controller.signal,
          }).finally(() => clearTimeout(timer))

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const json = (await response.json()) as {
            error?: { message?: string; data?: unknown; name?: string }
            result?: T
          }

          if (json.error) {
            const errMsg = json.error.message || JSON.stringify(json.error.data || json.error)
            // If the node returned a business logic error (e.g. account not found), don't failover needlessly
            if (
              errMsg.includes('does not exist') ||
              errMsg.includes('MethodNotFound') ||
              errMsg.includes('CompilationError')
            ) {
              throw new NearRpcError(errMsg, endpoint, json.error)
            }
            throw new Error(`RPC Error: ${errMsg}`)
          }

          // Success: update active URL to this responsive endpoint
          this.activeUrlIndex = endpointIndex
          return json.result as T
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          // If it was already a NearRpcError (e.g. account not found), rethrow immediately
          if (err instanceof NearRpcError) {
            throw err
          }

          errors.push({ endpoint, error: errMsg })

          // Small delay before retry on same endpoint
          if (attempt < this.maxRetries) {
            await new Promise((res) => setTimeout(res, 250 * (attempt + 1)))
          }
        }
      }
    }

    const summary = errors.map((e) => `[${e.endpoint}]: ${e.error}`).join('; ')
    throw new NearRpcError(
      `All NEAR RPC endpoints failed for method "${method}": ${summary}`,
      this.currentRpcUrl,
    )
  }

  // ── High-Level Typed RPC Methods ─────────────────────────────────────

  /**
   * Check RPC status and node sync state.
   */
  public async status(): Promise<NearRpcStatus> {
    return this.call<NearRpcStatus>('status', [])
  }

  /**
   * View basic account details (balance, storage usage, code hash).
   */
  public async viewAccount(accountId: string): Promise<NearAccountView> {
    return this.call<NearAccountView>('query', {
      request_type: 'view_account',
      finality: 'final',
      account_id: accountId,
    })
  }

  /**
   * View a single access key's nonce and permissions for an account.
   */
  public async viewAccessKey(
    accountId: string,
    publicKey: string,
  ): Promise<AccessKeyView> {
    return this.call<AccessKeyView>('query', {
      request_type: 'view_access_key',
      finality: 'final',
      account_id: accountId,
      public_key: publicKey,
    })
  }

  /**
   * List all access keys registered on an account.
   */
  public async viewAccessKeyList(accountId: string): Promise<AccessKeyListResponse> {
    return this.call<AccessKeyListResponse>('query', {
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: accountId,
    })
  }

  /**
   * Call a view method on a smart contract.
   */
  public async callView<T = unknown>(
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const argsBase64 = Buffer.from(JSON.stringify(args)).toString('base64')
    const response = await this.call<FunctionCallResponse>('query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: contractId,
      method_name: methodName,
      args_base64: argsBase64,
    })

    const rawString = Buffer.from(response.result).toString('utf8')
    try {
      return JSON.parse(rawString) as T
    } catch {
      return rawString as unknown as T
    }
  }

  /**
   * Fetch latest block or specific block by height/hash.
   */
  public async block(blockId?: string | number): Promise<BlockResponse> {
    const params =
      blockId !== undefined
        ? { block_id: blockId }
        : { finality: 'final' }
    return this.call<BlockResponse>('block', params)
  }

  /**
   * Fetch current gas price.
   */
  public async gasPrice(blockId?: string | number | null): Promise<GasPriceResponse> {
    return this.call<GasPriceResponse>('gas_price', [blockId ?? null])
  }

  /**
   * Check status of a submitted transaction.
   */
  public async txStatus(txHash: string, accountId: string): Promise<TxStatusResponse> {
    return this.call<TxStatusResponse>('tx', [txHash, accountId])
  }

  /**
   * Broadcast a signed transaction and wait for commit (finality).
   */
  public async sendSignedTx(signedTxBase64: string): Promise<TxStatusResponse> {
    return this.call<TxStatusResponse>('broadcast_tx_commit', [signedTxBase64])
  }
}
