import type { ChatTurn, WordRecheckRequest, WordRecheckResponse } from '../types'
import type { PromptFields } from './promptProfiles'
import { requestWordRecheck } from './api'

interface Options {
  history: ChatTurn[]
  answer: string
  prompts: PromptFields
  apiKey?: string
  signal: AbortSignal
  onProgress: (answer: string) => void
  onRequest?: () => void
  decide?: (request: WordRecheckRequest, signal: AbortSignal) => Promise<WordRecheckResponse>
}

export async function recheckWordReply({ history, answer, prompts, apiKey, signal, onProgress, onRequest, decide = requestWordRecheck }: Options): Promise<string> {
  const words = answer.split(' ')
  for (let index = 0; index < words.length; index += 1) {
    signal.throwIfAborted()
    onRequest?.()
    const review = await decide({ mode: 'word-review', history, answer: words.join(' '), index, prompts, apiKey }, signal)
    signal.throwIfAborted()
    if (review.type === 'keep') continue
    if (review.type !== 'change') throw new Error('Invalid word review decision.')

    onRequest?.()
    const replacement = await decide({ mode: 'word-replace', history, answer: words.join(' '), index, prompts, apiKey }, signal)
    signal.throwIfAborted()
    if (replacement.type !== 'replacement') throw new Error('Invalid word replacement decision.')
    words[index] = replacement.value
    onProgress(words.join(' '))
  }
  return words.join(' ')
}
