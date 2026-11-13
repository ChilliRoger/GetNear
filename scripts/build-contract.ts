/**
 * Build the FxBudget release WASM with machine-independent path prefixes and record provenance.
 *
 *   pnpm build:contract                    # build + print sha256
 *   pnpm build:contract --write-artifact   # also copy to res/fx_budget.next.wasm and update res/artifacts.json
 *
 * Why remap paths: rustc embeds absolute source paths (cargo registry, project dir) in panic locations, so
 * the same sources built on two machines would hash differently. This script remaps those prefixes. Hashes can
 * still differ across rustc versions / host OS: the artifact that is DEPLOYED is the committed file, and its hash
 * is what `pnpm verify:readonly` compares against the chain.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT_DIR = path.join(ROOT, 'contracts', 'fx-budget')
const RES_DIR = path.join(CONTRACT_DIR, 'res')
const TARGET_DIR = process.env.CARGO_TARGET_DIR ? path.resolve(process.env.CARGO_TARGET_DIR) : path.join(CONTRACT_DIR, 'target')
const BUILT = path.join(TARGET_DIR, 'wasm32-unknown-unknown', 'release', 'fx_budget.wasm')
const writeArtifact = process.argv.includes('--write-artifact')

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; inherit?: boolean } = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    encoding: 'utf-8',
    stdio: opts.inherit ? 'inherit' : 'pipe',
    shell: false,
  })
}

const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo')
const registrySrc = path.join(cargoHome, 'registry', 'src')
const remaps: string[] = [`--remap-path-prefix=${CONTRACT_DIR}=/src/fx-budget`]
if (fs.existsSync(registrySrc)) {
  for (const entry of fs.readdirSync(registrySrc)) {
    remaps.push(`--remap-path-prefix=${path.join(registrySrc, entry)}=/cargo-registry`)
  }
}

// CARGO_ENCODED_RUSTFLAGS is 0x1f-separated, so paths containing spaces are safe.
const env = { ...process.env, CARGO_ENCODED_RUSTFLAGS: remaps.join('\x1f') }

console.log(`Building ${path.relative(ROOT, CONTRACT_DIR)} (cargo build --locked --target wasm32-unknown-unknown --release)`)
const build = run('cargo', ['build', '--locked', '--target', 'wasm32-unknown-unknown', '--release'], {
  cwd: CONTRACT_DIR,
  env,
  inherit: true,
})
if (build.status !== 0) {
  console.error(`cargo build failed (exit ${build.status}${build.error ? `, ${build.error.message}` : ''})`)
  process.exit(build.status ?? 1)
}

const bytes = fs.readFileSync(BUILT)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const rustc = (run('rustc', ['-V']).stdout || '').trim()
const host = (/host: (\S+)/.exec(run('rustc', ['-vV']).stdout || '') || [])[1] ?? 'unknown'
const commit = (run('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).stdout || '').trim()
const dirty = (run('git', ['status', '--porcelain', '--', 'contracts/fx-budget'], { cwd: ROOT }).stdout || '').trim().length > 0

console.log(`\nartifact : ${path.relative(ROOT, BUILT)}`)
console.log(`bytes    : ${bytes.length}`)
console.log(`sha256   : ${sha256}`)
console.log(`rustc    : ${rustc} (${host})`)
console.log(`commit   : ${commit}${dirty ? ' (contracts/fx-budget has UNCOMMITTED changes)' : ''}`)

if (writeArtifact) {
  if (dirty) {
    console.error('\nRefusing --write-artifact: commit contracts/fx-budget first so the artifact is traceable to a commit.')
    process.exit(2)
  }
  fs.mkdirSync(RES_DIR, { recursive: true })
  fs.copyFileSync(BUILT, path.join(RES_DIR, 'fx_budget.next.wasm'))
  const manifestPath = path.join(RES_DIR, 'artifacts.json')
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : { artifacts: [] }
  manifest.artifacts = (manifest.artifacts as Array<{ file: string }>).filter((a) => a.file !== 'fx_budget.next.wasm')
  manifest.artifacts.push({
    file: 'fx_budget.next.wasm',
    role: 'upgrade target (payout bounds + adjusted final chunk); NOT deployed until the upgrade is executed',
    sha256,
    bytes: bytes.length,
    builtFromCommit: commit,
    rustc,
    host,
    command: 'pnpm build:contract --write-artifact',
  })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nwrote res/fx_budget.next.wasm and updated res/artifacts.json`)
}
