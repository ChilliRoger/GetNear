/**
 * GetNear — Export Decisions and Fills (P12)
 * Reads local SQLite agent database and exports decisions and fills to CSV and JSON,
 * clearly labeled as SIMULATED accounting executions.
 *
 * Usage:
 *   pnpm export:simulations
 */

try {
  process.loadEnvFile()
} catch {}

import * as fs from 'node:fs'
import * as path from 'node:path'
import { db } from '../apps/agent/src/db.js'

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs', 'evidence')
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
}

function toCsv(rows: Array<Record<string, any>>): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] === null || r[h] === undefined ? '' : String(r[h])
          return `"${val.replace(/"/g, '""')}"`
        })
        .join(','),
    ),
  ]
  return lines.join('\n')
}

async function main() {
  console.log('═'.repeat(64))
  console.log('      GetNear — Simulation & Decision Export (P12)')
  console.log('═'.repeat(64))

  // 1. Export Decisions
  const decisions = db.prepare('SELECT * FROM agent_decisions ORDER BY timestamp ASC').all() as Array<Record<string, any>>
  const decisionsWithNotice = decisions.map((d) => ({
    ...d,
    execution_type: 'SIMULATED_ACCOUNTING',
    date: new Date(d.timestamp).toISOString(),
  }))

  const decisionsJsonPath = path.join(EVIDENCE_DIR, 'decisions.json')
  const decisionsCsvPath = path.join(EVIDENCE_DIR, 'decisions.csv')

  fs.writeFileSync(
    decisionsJsonPath,
    JSON.stringify(
      {
        notice: 'SIMULATED EXECUTION. 1Click dry-quotes are read-only indicative rates. No mainnet FX swap occurred.',
        count: decisionsWithNotice.length,
        exportedAt: new Date().toISOString(),
        decisions: decisionsWithNotice,
      },
      null,
      2,
    ) + '\n',
  )
  fs.writeFileSync(decisionsCsvPath, toCsv(decisionsWithNotice) + '\n')
  console.log(`✓ Exported ${decisionsWithNotice.length} decisions:`)
  console.log(`    - ${decisionsJsonPath}`)
  console.log(`    - ${decisionsCsvPath}`)

  // 2. Export Fills
  const fills = db.prepare('SELECT * FROM agent_fills ORDER BY timestamp ASC').all() as Array<Record<string, any>>
  const fillsWithNotice = fills.map((f) => ({
    ...f,
    execution_type: f.is_simulated ? 'SIMULATED' : 'TESTNET_NEP141_CALLBACK',
    date: new Date(f.timestamp).toISOString(),
  }))

  const fillsJsonPath = path.join(EVIDENCE_DIR, 'fills.json')
  const fillsCsvPath = path.join(EVIDENCE_DIR, 'fills.csv')

  fs.writeFileSync(
    fillsJsonPath,
    JSON.stringify(
      {
        notice: 'SIMULATED EXECUTION. FX conversion is modeled accounting. Demo EURe transfers are testnet NEP-141 tokens.',
        count: fillsWithNotice.length,
        exportedAt: new Date().toISOString(),
        fills: fillsWithNotice,
      },
      null,
      2,
    ) + '\n',
  )
  fs.writeFileSync(fillsCsvPath, toCsv(fillsWithNotice) + '\n')
  console.log(`✓ Exported ${fillsWithNotice.length} fills:`)
  console.log(`    - ${fillsJsonPath}`)
  console.log(`    - ${fillsCsvPath}`)

  console.log('\nExport completed successfully.')
}

main().catch((err) => {
  console.error('Export failed:', err)
  process.exit(1)
})
