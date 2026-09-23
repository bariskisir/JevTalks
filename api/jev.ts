import { appendFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import {
  TYPE_SAFE_ENDPOINT,
  createEvaluationRequest,
  createReplacementRequest,
  createReviewRequest,
  decodeChoice,
  decodeReplacementChoice,
  decodeReviewChoice,
} from '../src/lib/jevProtocol.ts'
import { createWordEvaluationRequest, createWordReplacementRequest, createWordReviewRequest, decodeWordChoice } from '../src/lib/wordProtocol.ts'
import { isPromptFields } from '../src/lib/promptProfiles.ts'
import type { ApiErrorResponse, ChatTurn, NextCharacterRequest, NextCharacterResponse, NextWordRequest, NextWordResponse, RecheckRequest, RecheckResponse, WordRecheckRequest } from '../src/types.ts'

type ApiResponse = NextCharacterResponse | NextWordResponse | RecheckResponse | ApiErrorResponse | { serverKeyAvailable: boolean }

type Evaluation = { model: string; state: unknown; questions: Record<string, unknown> }
type ProviderResult = { answer?: unknown; failure?: Response }
const LOG_PATH = '/tmp/jev-talks.log'

async function logEvent(requestId: string, event: string, details: Record<string, unknown>): Promise<void> {
  const entry = { timestamp: new Date().toISOString(), requestId, event, ...details }
  try { await appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8') }
  catch { /* Logging must not break chat requests when the runtime has no writable /tmp. */ }
}

async function logResponse(requestId: string, response: Response): Promise<Response> {
  await logEvent(requestId, 'client_response', {
    status: response.status,
    body: await response.clone().text(),
  })
  return response
}

async function callTypeSafe(apiKey: string, evaluation: Evaluation, requestId: string): Promise<ProviderResult> {
  await logEvent(requestId, 'typesafe_request', { method: 'POST', endpoint: TYPE_SAFE_ENDPOINT, body: evaluation })
  const startedAt = Date.now()
  let upstream: Response
  try {
    upstream = await fetch(TYPE_SAFE_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(evaluation),
      signal: AbortSignal.timeout(25_000),
    })
  } catch {
    await logEvent(requestId, 'typesafe_transport_error', { durationMs: Date.now() - startedAt })
    return { failure: error(502, 'PROVIDER_UNAVAILABLE', 'TypeSafe could not be reached. Please retry.') }
  }
  const rawResponse = await upstream.text()
  await logEvent(requestId, 'typesafe_response', { status: upstream.status, durationMs: Date.now() - startedAt, body: rawResponse })
  if (upstream.status === 401 || upstream.status === 403) return { failure: error(401, 'AUTHENTICATION_FAILED', 'The TypeSafe API key was rejected.') }
  if (upstream.status === 429) return { failure: error(429, 'RATE_LIMITED', 'TypeSafe is rate limiting requests. Please retry later.') }
  if (!upstream.ok) return { failure: error(502, 'PROVIDER_ERROR', 'TypeSafe could not complete this decision.') }
  try { return { answer: JSON.parse(rawResponse) as unknown } }
  catch { return { failure: error(502, 'INVALID_PROVIDER_RESPONSE', 'TypeSafe returned an invalid decision.') } }
}

function providerChoice(payload: unknown, name: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const answer = (payload as { answers?: Record<string, { type?: unknown; choice?: unknown }> }).answers?.[name]
  return answer?.type === 'choice' && typeof answer.choice === 'string' ? answer.choice : null
}

function json(data: ApiResponse, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status)
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string' &&
    (item.role === 'assistant' || item.content.length > 0)
  )
}

function isNextCharacterRequest(value: unknown): value is NextCharacterRequest {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    item.mode === undefined &&
    Array.isArray(item.history) &&
    item.history.length > 0 &&
    item.history.every(isChatTurn) &&
    item.history.at(-1)?.role === 'user' &&
    typeof item.partialResponse === 'string' &&
    (item.prompts === undefined || isPromptFields(item.prompts)) &&
    (item.apiKey === undefined || typeof item.apiKey === 'string')
  )
}

function isNextWordRequest(value: unknown): value is NextWordRequest {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return item.mode === 'word'
    && Array.isArray(item.history) && item.history.length > 0 && item.history.every(isChatTurn)
    && item.history.at(-1)?.role === 'user' && typeof item.partialResponse === 'string'
    && (item.prompts === undefined || isPromptFields(item.prompts))
    && (item.apiKey === undefined || typeof item.apiKey === 'string')
}

function isRecheckRequest(value: unknown): value is RecheckRequest {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    (item.mode === 'review' || item.mode === 'replace') &&
    Array.isArray(item.history) &&
    item.history.length > 0 &&
    item.history.every(isChatTurn) &&
    item.history.at(-1)?.role === 'user' &&
    typeof item.answer === 'string' &&
    item.answer.length > 0 &&
    Number.isInteger(item.index) &&
    (item.index as number) >= 0 &&
    (item.index as number) < [...item.answer].length &&
    (item.apiKey === undefined || typeof item.apiKey === 'string')
    && (item.prompts === undefined || isPromptFields(item.prompts))
  )
}

function isWordRecheckRequest(value: unknown): value is WordRecheckRequest {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (item.mode === 'word-review' || item.mode === 'word-replace')
    && Array.isArray(item.history) && item.history.length > 0 && item.history.every(isChatTurn)
    && item.history.at(-1)?.role === 'user' && typeof item.answer === 'string' && /^[a-z]+(?: [a-z]+)*$/.test(item.answer)
    && Number.isInteger(item.index) && (item.index as number) >= 0 && (item.index as number) < item.answer.split(' ').length
    && (item.apiKey === undefined || typeof item.apiKey === 'string')
    && (item.prompts === undefined || isPromptFields(item.prompts))
}

async function readRequestBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 262_144) {
    throw new RangeError('Request body is too large.')
  }

  const text = await request.text()
  if (text.length > 262_144) throw new RangeError('Request body is too large.')
  return JSON.parse(text) as unknown
}

export default {
  async fetch(request: Request): Promise<Response> {
    const requestId = randomUUID()
    const finish = (response: Response) => logResponse(requestId, response)
    if (request.method === 'GET') {
      return finish(json({ serverKeyAvailable: Boolean(process.env.TYPESAFE_AI_KEY?.trim()) }))
    }

    if (request.method !== 'POST') {
      return finish(error(405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are supported.'))
    }

    let body: unknown
    try {
      body = await readRequestBody(request)
    } catch (cause) {
      if (cause instanceof RangeError) {
        await logEvent(requestId, 'client_request_rejected', { reason: 'REQUEST_TOO_LARGE' })
        return finish(error(413, 'REQUEST_TOO_LARGE', 'The conversation is too large to send.'))
      }
      await logEvent(requestId, 'client_request_rejected', { reason: 'INVALID_JSON' })
      return finish(error(400, 'INVALID_REQUEST', 'The request body must be valid JSON.'))
    }

    const incoming = body as Record<string, unknown>
    await logEvent(requestId, 'client_request', {
      method: request.method,
      url: request.url,
      contentType: request.headers.get('content-type'),
      body: { ...incoming, ...(typeof incoming.apiKey === 'string' ? { apiKey: '[REDACTED]' } : {}) },
    })

    if (!isNextCharacterRequest(body) && !isNextWordRequest(body) && !isRecheckRequest(body) && !isWordRecheckRequest(body)) {
      return finish(error(400, 'INVALID_REQUEST', 'The conversation or decision request is invalid.'))
    }

    const apiKey = body.apiKey?.trim() || process.env.TYPESAFE_AI_KEY?.trim()
    if (!apiKey) {
      return finish(error(401, 'API_KEY_REQUIRED', 'Enter a TypeSafe API key to continue.'))
    }

    let evaluation: ReturnType<typeof createEvaluationRequest> | ReturnType<typeof createReviewRequest> | ReturnType<typeof createReplacementRequest> | ReturnType<typeof createWordEvaluationRequest> | ReturnType<typeof createWordReviewRequest> | ReturnType<typeof createWordReplacementRequest>
    let questionName: 'next_character' | 'next_word' | 'review_character' | 'replacement_character' | 'review_word' | 'replacement_word'
    if (isNextWordRequest(body)) {
      evaluation = createWordEvaluationRequest(body.history, body.partialResponse, body.prompts)
      questionName = 'next_word'
    } else if (isWordRecheckRequest(body)) {
      evaluation = body.mode === 'word-review'
        ? createWordReviewRequest(body.history, body.answer, body.index, body.prompts)
        : createWordReplacementRequest(body.history, body.answer, body.index, body.prompts)
      questionName = body.mode === 'word-review' ? 'review_word' : 'replacement_word'
    } else if (isRecheckRequest(body)) {
      evaluation = body.mode === 'review'
        ? createReviewRequest(body.history, body.answer, body.index, body.prompts)
        : createReplacementRequest(body.history, body.answer, body.index, body.prompts)
      questionName = body.mode === 'review' ? 'review_character' : 'replacement_character'
    } else {
      evaluation = createEvaluationRequest(body.history, body.partialResponse, body.prompts)
      questionName = 'next_character'
    }

    const providerResult = await callTypeSafe(apiKey, evaluation as Evaluation, requestId)
    if (providerResult.failure) return finish(providerResult.failure)
    try {
      const choice = providerChoice(providerResult.answer, questionName)
      if (!choice) throw new Error('Unexpected answer type.')
      const decoded = questionName === 'review_character' || questionName === 'review_word'
        ? (() => {
            const review = decodeReviewChoice(choice)
            return review ? { type: review } as const : null
          })()
        : questionName === 'replacement_word'
          ? (() => {
              const value = decodeWordChoice(choice)
              return value !== null ? { type: 'replacement' as const, value } : null
            })()
        : questionName === 'replacement_character'
          ? (() => {
              const value = decodeReplacementChoice(choice)
              return value !== null ? { type: 'replacement' as const, value } : null
            })()
            : questionName === 'next_word'
              ? choice === 'STOP'
                ? { type: 'stop' as const }
                : (() => {
                    const value = decodeWordChoice(choice)
                    return value ? { type: 'word' as const, value } : null
                  })()
              : decodeChoice(choice)
      if (!decoded) throw new Error('Unknown choice.')
      return finish(json(decoded))
    } catch {
      return finish(error(502, 'INVALID_PROVIDER_RESPONSE', 'TypeSafe returned an invalid decision.'))
    }
  },
}
