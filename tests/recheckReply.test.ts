import { describe, expect, it, vi } from 'vitest'
import { recheckReply } from '../src/lib/recheckReply'
import type { RecheckRequest, RecheckResponse } from '../src/types'

describe('Recheck last answer', () => {
  it('reviews each character in order and updates only chosen replacements', async () => {
    const decisions: RecheckResponse[] = [
      { type: 'keep' },
      { type: 'change' },
      { type: 'replacement', value: 'c' },
    ]
    const requests: RecheckRequest[] = []
    const decide = vi.fn(async (request: RecheckRequest) => {
      requests.push(request)
      return decisions.shift()!
    })
    const onProgress = vi.fn()
    const history = [{ role: 'user' as const, content: 'Say ac' }]

    const result = await recheckReply({
      history,
      answer: 'ab',
      signal: new AbortController().signal,
      decide,
      onProgress,
    })

    expect(result).toBe('ac')
    expect(requests.map(({ mode, index, answer }) => ({ mode, index, answer }))).toEqual([
      { mode: 'review', index: 0, answer: 'ab' },
      { mode: 'review', index: 1, answer: 'ab' },
      { mode: 'replace', index: 1, answer: 'ab' },
    ])
    expect(requests.every((request) => request.history === history)).toBe(true)
    expect(onProgress).toHaveBeenCalledExactlyOnceWith('ac')
  })
})
