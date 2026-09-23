import { describe, expect, it } from 'vitest'
import { DEFAULT_PROMPTS } from '../src/lib/promptProfiles'
import { recheckWordReply } from '../src/lib/recheckWordReply'

describe('word recheck', () => {
  it('reviews each word and replaces only the selected position', async () => {
    const calls: Array<{ mode: string; answer: string; index: number }> = []
    const decisions = [
      { type: 'keep' as const },
      { type: 'change' as const },
      { type: 'replacement' as const, value: 'friend' },
    ]
    const progress: string[] = []
    const result = await recheckWordReply({
      history: [{ role: 'user', content: 'Say hi' }], answer: 'hello world',
      prompts: DEFAULT_PROMPTS.words250, signal: new AbortController().signal,
      onProgress: (answer) => progress.push(answer),
      decide: async (request) => { calls.push(request); return decisions.shift()! },
    })
    expect(result).toBe('hello friend')
    expect(progress).toEqual(['hello friend'])
    expect(calls.map((call) => [call.mode, call.index, call.answer])).toEqual([
      ['word-review', 0, 'hello world'],
      ['word-review', 1, 'hello world'],
      ['word-replace', 1, 'hello world'],
    ])
  })
})
