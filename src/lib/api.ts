import type { ApiErrorResponse, NextCharacterRequest, NextCharacterResponse, NextWordRequest, NextWordResponse, RecheckRequest, RecheckResponse, WordRecheckRequest, WordRecheckResponse } from '../types'

export class JevApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'JevApiError'
  }
}

export async function getServerKeyAvailability(): Promise<boolean> {
  let response: Response
  try {
    response = await fetch('/api/jev', { cache: 'no-store' })
  } catch {
    throw new JevApiError('Could not connect to Jev Talks. Please retry.', 'NETWORK_ERROR', 0)
  }

  if (!response.ok) {
    throw new JevApiError('Could not check the server configuration.', 'CONFIG_ERROR', response.status)
  }

  const data: unknown = await response.json()
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as { serverKeyAvailable?: unknown }).serverKeyAvailable !== 'boolean'
  ) {
    throw new JevApiError('The server returned an invalid configuration.', 'CONFIG_ERROR', 0)
  }

  return (data as { serverKeyAvailable: boolean }).serverKeyAvailable
}

async function postDecision(payload: NextCharacterRequest | NextWordRequest | RecheckRequest | WordRecheckRequest, signal: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch('/api/jev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new JevApiError('Connection lost. Please retry.', 'NETWORK_ERROR', 0)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new JevApiError('The server returned an invalid response.', 'INVALID_RESPONSE', response.status)
  }

  if (!response.ok) {
    const apiError = (data as Partial<ApiErrorResponse>)?.error
    const message = typeof apiError?.message === 'string' ? apiError.message : 'Request failed.'
    const code = typeof apiError?.code === 'string' ? apiError.code : 'REQUEST_FAILED'
    throw new JevApiError(message, code, response.status)
  }

  return data
}

export async function requestNextCharacter(
  payload: NextCharacterRequest,
  signal: AbortSignal,
): Promise<NextCharacterResponse> {
  const data = await postDecision(payload, signal)
  const decision = data as { type?: unknown; value?: unknown } | null
  if (
    !decision ||
    (decision.type !== 'stop' &&
      (decision.type !== 'character' ||
        typeof decision.value !== 'string' ||
        decision.value.length !== 1))
  ) {
    throw new JevApiError('The server returned an invalid decision.', 'INVALID_RESPONSE', 0)
  }

  return data as NextCharacterResponse
}

export async function requestRecheck(
  payload: RecheckRequest,
  signal: AbortSignal,
): Promise<RecheckResponse> {
  const data = await postDecision(payload, signal)
  const decision = data as { type?: unknown; value?: unknown } | null
  if (
    !decision ||
    (payload.mode === 'review'
      ? decision.type !== 'keep' && decision.type !== 'change'
      : decision.type !== 'replacement' || typeof decision.value !== 'string' || [...decision.value].length !== 1)
  ) {
    throw new JevApiError('The server returned an invalid recheck decision.', 'INVALID_RESPONSE', 0)
  }
  return data as RecheckResponse
}

export async function requestNextWord(payload: NextWordRequest, signal: AbortSignal): Promise<NextWordResponse> {
  const data = await postDecision(payload, signal)
  const decision = data as { type?: unknown; value?: unknown } | null
  if (!decision || (decision.type !== 'stop'
    && (decision.type !== 'word' || typeof decision.value !== 'string' || !/^[a-z]+$/.test(decision.value)))) {
    throw new JevApiError('The server returned an invalid word decision.', 'INVALID_RESPONSE', 0)
  }
  return data as NextWordResponse
}

export async function requestWordRecheck(payload: WordRecheckRequest, signal: AbortSignal): Promise<WordRecheckResponse> {
  const data = await postDecision(payload, signal)
  const decision = data as { type?: unknown; value?: unknown } | null
  if (!decision || (payload.mode === 'word-review'
    ? decision.type !== 'keep' && decision.type !== 'change'
    : decision.type !== 'replacement' || typeof decision.value !== 'string' || !/^[a-z]+$/.test(decision.value))) {
    throw new JevApiError('The server returned an invalid word recheck decision.', 'INVALID_RESPONSE', 0)
  }
  return data as WordRecheckResponse
}
