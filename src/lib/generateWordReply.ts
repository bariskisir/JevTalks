import type { ChatTurn, NextWordRequest, NextWordResponse } from '../types'
import type { PromptFields } from './promptProfiles'
import { requestNextWord } from './api'
import { hasThreeConsecutiveSpaces, hasThreeRepeatedTailWords } from './repeatedWords'

interface GenerateWordReplyOptions {
  history: ChatTurn[]
  prefix: string
  prompts: PromptFields
  apiKey?: string
  signal: AbortSignal
  onProgress: (reply: string) => void
  onRequest?: () => void
  decide?: (request: NextWordRequest, signal: AbortSignal) => Promise<NextWordResponse>
}

export async function generateWordReply({ history, prefix, prompts, apiKey, signal, onProgress, onRequest, decide = requestNextWord }: GenerateWordReplyOptions): Promise<string> {
  let reply = prefix
  while (true) {
    signal.throwIfAborted()
    onRequest?.()
    const decision = await decide({ mode: 'word', history, partialResponse: reply, prompts, apiKey }, signal)
    signal.throwIfAborted()
    if (decision.type === 'stop') return reply

    reply += `${reply ? ' ' : ''}${decision.value}`
    onProgress(reply)
    if (hasThreeConsecutiveSpaces(reply)) return reply.replace(/ {3,}/g, ' ')
    if (hasThreeRepeatedTailWords(reply, true)) return reply.trimEnd()
  }
}
