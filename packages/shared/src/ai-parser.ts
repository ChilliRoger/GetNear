import { z } from 'zod'

export type AiProviderId = 'nearai' | 'gemini' | 'groq'

export interface AiProviderConfig {
  configured: boolean
  provider: AiProviderId
  baseUrl: string
  model: string
  apiKey?: string
  supportsAttestation: boolean
}

export interface AvailableProvidersSummary {
  nearai: boolean
  gemini: boolean
  groq: boolean
}

export const AI_PROVIDER_DEFAULTS: Record<
  AiProviderId,
  { label: string; baseUrl: string; defaultModel: string; supportsAttestation: boolean }
> = {
  nearai: {
    label: 'NEAR AI Cloud',
    baseUrl: 'https://cloud-api.near.ai/v1',
    defaultModel: 'z-ai/glm-5.3-flash',
    supportsAttestation: true,
  },
  gemini: {
    label: 'Google AI Studio (Gemini Free Tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    supportsAttestation: false,
  },
  groq: {
    label: 'GroqCloud (Free Tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsAttestation: false,
  },
}

const NEAR_TESTNET_ACCOUNT_RE = /^[a-z0-9._-]{2,56}\.testnet$/i

export const ParsedOrderDataSchema = z.object({
  pair: z.literal('USDC/EURe'),
  totalUsdc: z.number().finite().positive().max(1_000_000),
  maxChunkUsdc: z.number().finite().positive().max(1_000_000).nullable(),
  deadlineHours: z.number().finite().positive().max(168).nullable(),
  deadlineIso: z.string().min(10).max(64).nullable(),
  maxDevBps: z.number().int().min(10).max(1000).nullable(),
  recipient: z
    .string()
    .trim()
    .regex(NEAR_TESTNET_ACCOUNT_RE, 'Recipient must be a valid NEAR .testnet account')
    .nullable(),
  targetEuRe: z.number().finite().positive().max(1_000_000).nullable(),
  invoiceRef: z.string().trim().min(1).max(64).nullable(),
  fundingMode: z.enum(['circle_escrow', 'accounting']).nullable(),
  notes: z.string().trim().max(240).optional(),
})

export type ParsedOrderData = z.infer<typeof ParsedOrderDataSchema>

export const LlmOrderResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    order: ParsedOrderDataSchema,
  }),
  z.object({
    status: z.literal('ambiguous'),
    ambiguities: z.array(z.string().trim().min(1)).min(1),
  }),
])

export type LlmOrderResponse = z.infer<typeof LlmOrderResponseSchema>

export interface AiAttestationAudit {
  status: 'unverified_metadata_only' | 'not_applicable' | 'unavailable'
  verified: false // Local cryptographic verification of TDX/NRAS is not claimed
  note: string
  chatId?: string
  signingAlgo?: string
  signingAddress?: string
  gatewaySigningAddress?: string
  modelAttestationCount?: number
  signatureReturned?: boolean
}

export interface ParseOrderAudit {
  provider: AiProviderId
  providerLabel: string
  model: string
  baseUrl: string
  latencyMs: number
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  attestation: AiAttestationAudit
}

export type ParseOrderResult =
  | {
      ok: true
      order: ParsedOrderData
      audit: ParseOrderAudit
    }
  | {
      ok: false
      status: 'ambiguous' | 'invalid_output'
      ambiguities: string[]
      audit?: ParseOrderAudit
    }

function inferProviderFromUrl(url: string): AiProviderId | null {
  const lower = url.toLowerCase()
  if (lower.includes('cloud-api.near.ai')) return 'nearai'
  if (lower.includes('generativelanguage.googleapis.com')) return 'gemini'
  if (lower.includes('api.groq.com')) return 'groq'
  return null
}

export function getAvailableProviders(env: Record<string, string | undefined>): AvailableProvidersSummary {
  const genericKey = Boolean((env.NEAR_AI_API_KEY || env.NEARAI_API_KEY || '').trim())
  return {
    nearai: genericKey,
    gemini: Boolean((env.GEMINI_API_KEY || '').trim()) || genericKey,
    groq: Boolean((env.GROQ_API_KEY || '').trim()) || genericKey,
  }
}

export function resolveAiProviderConfig(
  env: Record<string, string | undefined>,
  requestedProvider?: AiProviderId,
): AiProviderConfig {
  const nearAiKey = (env.NEAR_AI_API_KEY || env.NEARAI_API_KEY || '').trim()
  const geminiKey = (env.GEMINI_API_KEY || '').trim()
  const groqKey = (env.GROQ_API_KEY || '').trim()
  const customBaseUrl = (env.NEAR_AI_BASE_URL || '').trim().replace(/\/+$/, '')
  const customModel = (env.NEAR_AI_MODEL || '').trim()
  const envProvider = (env.NEAR_AI_PROVIDER || '').trim().toLowerCase() as AiProviderId | ''

  let provider: AiProviderId = 'nearai'
  if (requestedProvider && requestedProvider in AI_PROVIDER_DEFAULTS) {
    provider = requestedProvider
  } else if (envProvider && envProvider in AI_PROVIDER_DEFAULTS) {
    provider = envProvider
  } else if (customBaseUrl) {
    provider = inferProviderFromUrl(customBaseUrl) ?? 'nearai'
  } else if (nearAiKey) {
    provider = 'nearai'
  } else if (geminiKey) {
    provider = 'gemini'
  } else if (groqKey) {
    provider = 'groq'
  }

  const defaults = AI_PROVIDER_DEFAULTS[provider]
  let apiKey = ''
  if (provider === 'nearai') {
    apiKey = nearAiKey
  } else if (provider === 'gemini') {
    apiKey = geminiKey || nearAiKey
  } else if (provider === 'groq') {
    apiKey = groqKey || nearAiKey
  }

  // Only apply custom NEAR_AI_BASE_URL when using default/selected provider explicitly matching or unspecified
  const baseUrl =
    requestedProvider && requestedProvider !== envProvider
      ? defaults.baseUrl
      : customBaseUrl || defaults.baseUrl

  const model =
    requestedProvider && requestedProvider !== envProvider
      ? defaults.defaultModel
      : customModel || defaults.defaultModel

  return {
    configured: apiKey.length > 0,
    provider,
    baseUrl,
    model,
    apiKey: apiKey || undefined,
    supportsAttestation: defaults.supportsAttestation && baseUrl.includes('cloud-api.near.ai'),
  }
}

export function buildOrderParserSystemPrompt(nowIso: string): string {
  return [
    'You are a strict financial order parser for GetNear on NEAR Testnet.',
    `Current UTC timestamp: ${nowIso}.`,
    'Your ONLY job is to convert the user request into valid JSON matching one of two exact shapes, never executing anything and NEVER inventing numbers not stated by the user.',
    '',
    'Supported trading pair ONLY: "USDC/EURe" (USDC input -> EURe settlement output).',
    'FxBudget contract max deadline horizon: 168 hours (7 days) from now.',
    '',
    'Shape 1 (when totalUsdc is clearly stated and pair is USDC->EURe or an unspecified stablecoin->euro/EURe request):',
    '{',
    '  "status": "ok",',
    '  "order": {',
    '    "pair": "USDC/EURe",',
    '    "totalUsdc": <positive number>,',
    '    "maxChunkUsdc": <positive number <= totalUsdc if stated, else null>,',
    '    "deadlineHours": <positive number <= 168 calculated from current UTC timestamp if deadline stated, else null>,',
    '    "deadlineIso": <ISO-8601 UTC timestamp string in the future if deadline stated, else null>,',
    '    "maxDevBps": <integer 10..1000 if stated, else null — note 1% = 100 bps, 2% = 200 bps>,',
    '    "recipient": <exact .testnet account ID if stated, else null>,',
    '    "targetEuRe": <positive EURe target amount if stated, else null>,',
    '    "invoiceRef": <exact invoice reference string if stated, else null>,',
    '    "fundingMode": <"circle_escrow" if Circle USDC escrow mentioned, "accounting" if accounting-only mentioned, else null>,',
    '    "notes": <brief summary of parsed constraints>',
    '  }',
    '}',
    '',
    'Shape 2 (MUST use whenever ANY ambiguity or unsupported rule occurs):',
    '{',
    '  "status": "ambiguous",',
    '  "ambiguities": ["clear explanation of why input cannot be parsed cleanly"]',
    '}',
    '',
    'STRICT REJECTION RULES — output Shape 2 ("ambiguous") if:',
    '- Input does not specify a clear positive USDC input budget (never guess an amount).',
    '- Two conflicting budgets or chunk caps are mentioned.',
    '- Pair is explicitly another currency/token (e.g. ETH, BTC, SOL, NEAR, JPY, GBP).',
    '- Mentioned deadline is clearly in the past or more than 7 days (168 hours) in the future.',
    '- Account address mentioned does not end with .testnet.',
    '- Chunk size stated is greater than totalUsdc.',
    'NEVER infer or fill in null fields with defaults. Output strictly valid JSON with no markdown fences.',
  ].join('\n')
}

export function extractJsonFromModelText(rawText: string): unknown {
  const trimmed = rawText.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed
  return JSON.parse(candidate)
}

export function validateParsedOrderResponse(
  rawJson: unknown,
  nowMs: number,
): { ok: true; order: ParsedOrderData } | { ok: false; ambiguities: string[] } {
  const parsed = LlmOrderResponseSchema.safeParse(rawJson)
  if (!parsed.success) {
    return {
      ok: false,
      ambiguities: parsed.error.issues.map((i) => `${i.path.join('.') || 'response'}: ${i.message}`),
    }
  }

  if (parsed.data.status === 'ambiguous') {
    return { ok: false, ambiguities: parsed.data.ambiguities }
  }

  const order = parsed.data.order
  const issues: string[] = []

  if (order.maxChunkUsdc !== null && order.maxChunkUsdc > order.totalUsdc) {
    issues.push(
      `Chunk limit (${order.maxChunkUsdc} USDC) cannot exceed total budget (${order.totalUsdc} USDC).`,
    )
  }

  if (order.deadlineIso !== null) {
    const deadlineMs = Date.parse(order.deadlineIso)
    if (!Number.isFinite(deadlineMs)) {
      issues.push(`Invalid deadline timestamp returned: ${order.deadlineIso}`)
    } else if (deadlineMs <= nowMs) {
      issues.push('Parsed deadline is already in the past.')
    } else if (deadlineMs - nowMs > 168 * 3600 * 1000 + 60_000) {
      issues.push('Deadline exceeds FxBudget maximum horizon of 168 hours (7 days).')
    }
  }

  if (order.deadlineHours !== null && order.deadlineHours > 168) {
    issues.push(`Deadline (${order.deadlineHours}h) exceeds FxBudget maximum horizon of 168 hours.`)
  }

  if (issues.length > 0) {
    return { ok: false, ambiguities: issues }
  }

  return { ok: true, order }
}

async function fetchNearAiAttestationMetadata(params: {
  baseUrl: string
  apiKey: string
  model: string
  chatId?: string
  fetchImpl: typeof fetch
}): Promise<AiAttestationAudit> {
  const { baseUrl, apiKey, model, chatId, fetchImpl } = params

  const [sigRes, reportRes] = await Promise.allSettled([
    chatId
      ? fetchImpl(
          `${baseUrl}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(4000),
          },
        ).then((r) => (r.ok ? r.json() : null))
      : Promise.resolve(null),
    fetchImpl(`${baseUrl}/attestation/report?model=${encodeURIComponent(model)}`, {
      signal: AbortSignal.timeout(4000),
    }).then((r) => (r.ok ? r.json() : null)),
  ])

  const sigData = sigRes.status === 'fulfilled' ? (sigRes.value as Record<string, unknown> | null) : null
  const reportData =
    reportRes.status === 'fulfilled' ? (reportRes.value as Record<string, unknown> | null) : null

  const gatewayAttestation = reportData?.gateway_attestation as Record<string, unknown> | undefined
  const modelAttestations = reportData?.model_attestations as unknown[] | undefined

  if (!sigData && !reportData) {
    return {
      status: 'unavailable',
      verified: false,
      chatId,
      note: 'NEAR AI Cloud signature/attestation endpoints did not return metadata; not claiming Private AI.',
    }
  }

  return {
    status: 'unverified_metadata_only',
    verified: false,
    chatId,
    signatureReturned: Boolean(sigData?.signature),
    signingAlgo: typeof sigData?.signing_algo === 'string' ? sigData.signing_algo : undefined,
    signingAddress: typeof sigData?.signing_address === 'string' ? sigData.signing_address : undefined,
    gatewaySigningAddress:
      typeof gatewayAttestation?.signing_address === 'string'
        ? gatewayAttestation.signing_address
        : undefined,
    modelAttestationCount: Array.isArray(modelAttestations) ? modelAttestations.length : undefined,
    note: 'Raw TEE receipt metadata logged from NEAR AI Cloud (cryptographic TDX/NRAS/ECDSA verification not performed — do not treat as verified Private AI).',
  }
}

export async function parseNaturalLanguageOrder(params: {
  prompt: string
  config: AiProviderConfig
  nowMs?: number
  fetchImpl?: typeof fetch
}): Promise<ParseOrderResult> {
  const { prompt, config, nowMs = Date.now(), fetchImpl = fetch } = params
  if (!config.configured || !config.apiKey) {
    throw new Error('No AI provider API key is configured.')
  }

  const cleanPrompt = prompt.trim()
  if (cleanPrompt.length < 4 || cleanPrompt.length > 1000) {
    return {
      ok: false,
      status: 'ambiguous',
      ambiguities: ['Order prompt must be between 4 and 1000 characters.'],
    }
  }

  const nowIso = new Date(nowMs).toISOString()
  const startedAt = Date.now()

  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildOrderParserSystemPrompt(nowIso) },
        { role: 'user', content: cleanPrompt },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  })

  const latencyMs = Date.now() - startedAt

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    const statusMsg =
      response.status === 402 || response.status === 429
        ? `Provider rate-limit or credit exhausted (HTTP ${response.status})`
        : `Provider API error (HTTP ${response.status})`
    throw new Error(`${statusMsg}: ${errText.slice(0, 240) || response.statusText}`)
  }

  const completion = (await response.json()) as {
    id?: string
    model?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    choices?: Array<{ message?: { content?: string } }>
  }

  const actualModel = completion.model || config.model
  const rawContent = completion.choices?.[0]?.message?.content || ''

  const attestation: AiAttestationAudit = config.supportsAttestation
    ? await fetchNearAiAttestationMetadata({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: actualModel,
        chatId: completion.id,
        fetchImpl,
      })
    : {
        status: 'not_applicable',
        verified: false,
        chatId: completion.id,
        note: `Executed via ${AI_PROVIDER_DEFAULTS[config.provider].label} (no NEAR AI TEE attestation).`,
      }

  const audit: ParseOrderAudit = {
    provider: config.provider,
    providerLabel: AI_PROVIDER_DEFAULTS[config.provider].label,
    model: actualModel,
    baseUrl: config.baseUrl,
    latencyMs,
    usage: completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined,
    attestation,
  }

  let parsedJson: unknown
  try {
    parsedJson = extractJsonFromModelText(rawContent)
  } catch {
    return {
      ok: false,
      status: 'invalid_output',
      ambiguities: ['Model did not return valid JSON matching the order schema.'],
      audit,
    }
  }

  const validated = validateParsedOrderResponse(parsedJson, nowMs)
  if (!validated.ok) {
    return {
      ok: false,
      status: 'ambiguous',
      ambiguities: validated.ambiguities,
      audit,
    }
  }

  return {
    ok: true,
    order: validated.order,
    audit,
  }
}

