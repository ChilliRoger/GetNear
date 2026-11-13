/**
 * Minimal READ-ONLY NEAR JSON-RPC helpers shared by the verification scripts.
 * Only `status`, `query` (view_code, view_access_key_list, call_function) and `EXPERIMENTAL_tx_status` are used.
 * Nothing here signs or broadcasts, and no credentials are read.
 */

import { createHash } from 'node:crypto'

export type RpcOk<T> = { ok: true; value: T }
export type RpcErr = { ok: false; error: string; methodMissing: boolean }

export const DEFAULT_RPCS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']
export const DEFAULT_ARCHIVAL_RPCS = ['https://archival-rpc.testnet.fastnear.com', 'https://archival-rpc.testnet.near.org']

export function resolveRpcs(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): string[] {
  const i = argv.indexOf('--rpc')
  const list = i >= 0 ? [argv[i + 1]] : (env.NEAR_RPC_URLS || DEFAULT_RPCS.join(',')).split(',')
  return list.map((s) => s?.trim()).filter(Boolean) as string[]
}

export async function rpc<T>(method: string, params: unknown, urls: string[]): Promise<RpcOk<T> | RpcErr> {
  const errors: string[] = []
  for (const url of urls) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 20_000)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'verify', method, params }),
        signal: ctl.signal,
      }).finally(() => clearTimeout(timer))
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`)
        continue
      }
      const json = (await res.json()) as { result?: T; error?: { message?: string; data?: unknown; cause?: { name?: string } } }
      if (json.error) {
        const msg = `${json.error.cause?.name ?? json.error.message ?? 'RPC error'} ${typeof json.error.data === 'string' ? json.error.data : ''}`.trim()
        // A contract-level answer (method missing etc.) is a real answer, not a transport failure.
        if (/MethodNotFound|CompilationError|method .* not found|MethodResolveError/i.test(JSON.stringify(json.error))) {
          return { ok: false, error: msg, methodMissing: true }
        }
        errors.push(`${url}: ${msg}`)
        continue
      }
      return { ok: true, value: json.result as T }
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { ok: false, error: errors.join(' | '), methodMissing: false }
}

export async function view<T>(urls: string[], contract: string, method: string, viewArgs: Record<string, unknown> = {}): Promise<RpcOk<T> | RpcErr> {
  const r = await rpc<{ result?: number[]; error?: string }>(
    'query',
    {
      request_type: 'call_function',
      finality: 'final',
      account_id: contract,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(viewArgs)).toString('base64'),
    },
    urls,
  )
  if (!r.ok) return r
  // Nodes may report a failed view (missing method, contract panic) inside the query result.
  if (!Array.isArray(r.value.result)) {
    const msg = String(r.value.error ?? 'view returned no result')
    return { ok: false, error: msg.slice(0, 200), methodMissing: /MethodNotFound|MethodResolveError/i.test(msg) }
  }
  const text = Buffer.from(r.value.result).toString('utf8')
  try {
    return { ok: true, value: JSON.parse(text) as T }
  } catch {
    return { ok: true, value: text as unknown as T }
  }
}

/** sha256 (hex) of the contract code deployed on an account, plus its size. */
export async function codeSha256(urls: string[], account: string): Promise<RpcOk<{ sha256: string; bytes: number }> | RpcErr> {
  const r = await rpc<{ code_base64: string }>('query', { request_type: 'view_code', finality: 'final', account_id: account }, urls)
  if (!r.ok) return r
  const bytes = Buffer.from(r.value.code_base64, 'base64')
  return { ok: true, value: { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length } }
}

export const sha256Hex = (data: Buffer | Uint8Array): string => createHash('sha256').update(data).digest('hex')
