/**
 * NEAR JSON-RPC Response Types
 * Reference: https://docs.near.org/api/rpc/introduction
 */

export interface NearRpcStatus {
  version: {
    version: string
    build: string
  }
  chain_id: string
  rpc_addr?: string
  sync_info: {
    latest_block_hash: string
    latest_block_height: number
    latest_block_time: string
    latest_state_root: string
    syncing: boolean
  }
}

export interface NearAccountView {
  amount: string
  locked: string
  code_hash: string
  storage_usage: number
  storage_paid_at: number
  block_height: number
  block_hash: string
}

export type AccessKeyPermission =
  | 'FullAccess'
  | {
      FunctionCall: {
        allowance: string | null
        receiver_id: string
        method_names: string[]
      }
    }

export interface AccessKeyView {
  nonce: number
  permission: AccessKeyPermission
}

export interface AccessKeyListItem {
  public_key: string
  access_key: AccessKeyView
}

export interface AccessKeyListResponse {
  keys: AccessKeyListItem[]
  block_height: number
  block_hash: string
}

export interface FunctionCallResponse {
  result: number[]
  logs: string[]
  block_height: number
  block_hash: string
}

export interface BlockHeader {
  height: number
  epoch_id: string
  next_epoch_id: string
  hash: string
  prev_hash: string
  timestamp: number // in nanoseconds
  gas_price: string
}

export interface BlockResponse {
  author: string
  header: BlockHeader
}

export interface GasPriceResponse {
  gas_price: string
}

export interface TxStatusResponse {
  status: {
    SuccessValue?: string
    Failure?: unknown
  }
  transaction: {
    signer_id: string
    public_key: string
    nonce: number
    receiver_id: string
    actions: unknown[]
  }
  transaction_outcome: {
    id: string
    outcome: {
      logs: string[]
      receipt_ids: string[]
      gas_burnt: number
      tokens_burnt: string
      status: unknown
    }
  }
  receipts_outcome: Array<{
    id: string
    outcome: {
      logs: string[]
      receipt_ids: string[]
      gas_burnt: number
      tokens_burnt: string
      status: unknown
    }
  }>
}

export interface NearClientConfig {
  networkId?: string
  rpcUrls?: string[]
  timeoutMs?: number
  maxRetries?: number
}
