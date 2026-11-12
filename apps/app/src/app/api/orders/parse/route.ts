import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  AI_PROVIDER_DEFAULTS,
  getAvailableProviders,
  parseOrderWithFailover,
  resolveAiProviderConfig,
  type AiProviderId,
} from '@getnear/shared'

export const dynamic = 'force-dynamic'

function loadRootEnvIfPresent(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ]
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath) && typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(filePath)
      }
    } catch {
      // Non-fatal; continue with process.env
    }
  }
}

export async function GET(req: NextRequest) {
  loadRootEnvIfPresent()
  const { searchParams } = new URL(req.url)
  const providerParam = searchParams.get('provider')?.trim().toLowerCase() as AiProviderId | undefined
  const validProvider = providerParam && providerParam in AI_PROVIDER_DEFAULTS ? providerParam : undefined

  const config = resolveAiProviderConfig(process.env, validProvider)
  const availableProviders = getAvailableProviders(process.env)

  return NextResponse.json({
    configured: config.configured,
    activeProvider: config.provider,
    providerLabel: AI_PROVIDER_DEFAULTS[config.provider].label,
    model: config.model,
    baseUrl: config.baseUrl,
    supportsAttestation: config.supportsAttestation,
    availableProviders,
  })
}

export async function POST(req: NextRequest) {
  loadRootEnvIfPresent()

  let body: { prompt?: unknown; provider?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: 'Please enter a natural-language order instruction.' },
      { status: 400 },
    )
  }

  const requestedProvider =
    typeof body.provider === 'string' && body.provider in AI_PROVIDER_DEFAULTS
      ? (body.provider as AiProviderId)
      : undefined

  const config = resolveAiProviderConfig(process.env, requestedProvider)
  if (!config.configured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error:
          'No AI provider key is configured in .env. Add NEAR_AI_API_KEY (or free GEMINI_API_KEY / GROQ_API_KEY). Plain order intake remains fully functional.',
      },
      { status: 503 },
    )
  }

  try {
    const result = await parseOrderWithFailover({
      prompt,
      env: process.env,
      requestedProvider,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          ambiguities: result.ambiguities,
          audit: result.audit,
        },
        { status: 422 },
      )
    }

    return NextResponse.json({
      ok: true,
      order: result.order,
      audit: result.audit,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse natural-language order.'
    const isQuota = message.includes('HTTP 402') || message.includes('HTTP 429')
    return NextResponse.json(
      {
        ok: false,
        provider: config.provider,
        model: config.model,
        error: message,
      },
      { status: isQuota ? 429 : 502 },
    )
  }
}

