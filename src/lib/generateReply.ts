import type { ChatTurn, NextCharacterRequest, NextCharacterResponse } from '../types'
import { requestNextCharacter } from './api'
import type { PromptFields } from './promptProfiles'
import { hasThreeConsecutiveSpaces, hasThreeRepeatedTailWords } from './repeatedWords'

interface GenerateReplyOptions {
  history: ChatTurn[]
  prefix: string
  apiKey?: string
  prompts?: PromptFields
  signal: AbortSignal
  onProgress: (reply: string) => void
  onRequest?: () => void
  decide?: (request: NextCharacterRequest, signal: AbortSignal) => Promise<NextCharacterResponse>
}

export async function generateReply({
  history,
  prefix,
  apiKey,
  prompts,
  signal,
  onProgress,
  onRequest,
  decide = requestNextCharacter,
}: GenerateReplyOptions): Promise<string> {
  let reply = prefix

  while (true) {
    signal.throwIfAborted()
    onRequest?.()
    const result = await decide({ history, partialResponse: reply, apiKey, prompts }, signal)
    signal.throwIfAborted()

    if (result.type === 'stop') return reply

    reply += result.value
    onProgress(reply)
    if (hasThreeConsecutiveSpaces(reply)) return reply.replace(/ {3,}/g, ' ')
    if (hasThreeRepeatedTailWords(reply)) return reply.trimEnd()
  }
}
