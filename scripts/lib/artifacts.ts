/**
 * Bundled contract artifacts (contracts/fx-budget/res). The manifest names each file and its role; hashes are always
 * RECOMPUTED from the bytes, never trusted from the manifest.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256Hex } from './rpc.js'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const RES_DIR = path.join(ROOT, 'contracts', 'fx-budget', 'res')

export interface ArtifactInfo {
  file: string
  path: string
  role: string
  exists: boolean
  bytes: number
  /** Hash recomputed from the file bytes. */
  sha256: string
  /** Hash claimed by the manifest (may be absent). */
  manifestSha256?: string
  manifestMatches: boolean
  builtFromCommit?: string
  rustc?: string
}

export function loadArtifacts(): ArtifactInfo[] {
  const manifestPath = path.join(RES_DIR, 'artifacts.json')
  const manifest = fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { artifacts: Array<Record<string, any>> })
    : { artifacts: [{ file: 'fx_budget.wasm', role: 'bundled artifact' }] }

  return manifest.artifacts.map((a) => {
    const p = path.join(RES_DIR, a.file)
    const exists = fs.existsSync(p)
    const data = exists ? fs.readFileSync(p) : Buffer.alloc(0)
    const sha256 = exists ? sha256Hex(data) : ''
    return {
      file: a.file,
      path: p,
      role: a.role ?? '',
      exists,
      bytes: data.length,
      sha256,
      manifestSha256: a.sha256,
      manifestMatches: !a.sha256 || a.sha256 === sha256,
      builtFromCommit: a.builtFromCommit,
      rustc: a.rustc,
    }
  })
}
