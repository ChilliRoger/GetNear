/**
 * Invoice display status regression tests.
 * Run with: tsx src/invoice-status.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveInvoiceDisplay, formatEure } from './invoice-status.js'

test('formatEure renders 6-decimal atomic units as euro cents', () => {
  assert.equal(formatEure(16_300_000n), '€16.30')
  assert.equal(formatEure(0n), '€0.00')
  assert.equal(formatEure(1_000_000_000n), '€1000.00')
  assert.equal(formatEure(417_239_907n), '€417.24')
})

test('Paid only when the amount due reaches zero', () => {
  const d = deriveInvoiceDisplay({ status: 'Completed', target_out: '8000000', settled_out: '8000000' })
  assert.equal(d.kind, 'paid')
  assert.equal(d.label, 'Paid')
  assert.equal(d.dueAtomic, 0n)
})

test('budget exhausted first: Completed with EURe still due is NOT Paid', () => {
  const d = deriveInvoiceDisplay({ status: 'Completed', target_out: '25000000', settled_out: '8700000' })
  assert.equal(d.kind, 'budget_exhausted')
  assert.equal(d.label, 'Budget exhausted · €16.30 still due')
  assert.equal(d.showDue, true)
  assert.equal(d.dueAtomic, 16_300_000n)
})

test('Expired / Cancelled unpaid invoices keep the amount due visible', () => {
  const exp = deriveInvoiceDisplay({ status: 'Expired', target_out: '25000000', settled_out: '8700000' })
  assert.equal(exp.label, 'Expired · €16.30 still due')
  assert.equal(exp.showDue, true)
  const can = deriveInvoiceDisplay({ status: 'Cancelled', target_out: '100000000', settled_out: '0' })
  assert.equal(can.label, 'Cancelled · €100.00 still due')
})

test('open and pending invoices show what is due', () => {
  assert.equal(
    deriveInvoiceDisplay({ status: 'Active', target_out: '1000000000', settled_out: '582760093' }).label,
    'Active · €417.24 due',
  )
  assert.equal(
    deriveInvoiceDisplay({ status: 'Pending', target_out: '1000000000', settled_out: '0' }).kind,
    'pending_approval',
  )
})

test('legacy orders without an invoice target keep the raw status and never read as Paid', () => {
  const d = deriveInvoiceDisplay({ status: 'Completed', target_out: '0', settled_out: '0' })
  assert.equal(d.kind, 'no_invoice')
  assert.equal(d.label, 'Completed')
})
