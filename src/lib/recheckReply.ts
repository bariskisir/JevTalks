import type { ChatTurn, RecheckRequest, RecheckResponse } from '../types'
import { requestRecheck } from './api'
import type { PromptFields } from './promptProfiles'

interface RecheckReplyOptions {
  history: ChatTurn[]
  answer: string
  apiKey?: string
  prompts?: PromptFields
  signal: AbortSignal
  onProgress: (answer: string) => void
  onRequest?: () => void
  decide?: (request: RecheckRequest, signal: AbortSignal) => Promise<RecheckResponse>
}

export async function recheckReply({
  history,
  answer,
  apiKey,
  prompts,
  signal,
  onProgress,
  onRequest,
  decide = requestRecheck,
}: RecheckReplyOptions): Promise<string> {
  const characters = [...answer]

  for (let index = 0; index < characters.length; index += 1) {
    signal.throwIfAborted()
    onRequest?.()
    const review = await decide({
      mode: 'review', history, answer: characters.join(''), index, apiKey, prompts,
    }, signal)
    signal.throwIfAborted()
    if (review.type === 'keep') continue
    if (review.type !== 'change') throw new Error('Invalid recheck decision.')

    onRequest?.()
    const replacement = await decide({
      mode: 'replace', history, answer: characters.join(''), index, apiKey, prompts,
    }, signal)
    signal.throwIfAborted()
    if (replacement.type !== 'replacement') throw new Error('Invalid replacement decision.')
    characters[index] = replacement.value
    onProgress(characters.join(''))
  }

  return characters.join('')
}
