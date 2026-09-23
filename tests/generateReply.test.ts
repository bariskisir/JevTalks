import { describe, expect, it, vi } from 'vitest'
import { generateReply } from '../src/lib/generateReply'
import type { NextCharacterRequest, NextCharacterResponse } from '../src/types'

const history = [
  { role: 'user' as const, content: 'Hello' },
  { role: 'assistant' as const, content: 'Hi.' },
  { role: 'user' as const, content: 'How are you?' },
]

describe('letter-by-letter generation', () => {
  it('renders every chosen character and sends the accumulated prefix each time', async () => {
    const results: NextCharacterResponse[] = [
      { type: 'character', value: 'I' },
      { type: 'character', value: ' ' },
      { type: 'character', value: 'a' },
      { type: 'stop' },
    ]
    const decide = vi.fn(async (_request: NextCharacterRequest, _signal: AbortSignal) => results.shift()!)
    const onProgress = vi.fn()

    const reply = await generateReply({
      history,
      prefix: '',
      apiKey: 'personal-key',
      signal: new AbortController().signal,
      decide,
      onProgress,
    })

    expect(reply).toBe('I a')
    expect(onProgress.mock.calls.map(([value]) => value)).toEqual(['I', 'I ', 'I a'])
    expect(decide.mock.calls.map(([request]) => request.partialResponse)).toEqual([
      '',
      'I',
      'I ',
      'I a',
    ])
    expect(decide.mock.calls.every(([request]) => request.history === history)).toBe(true)
    expect(decide.mock.calls.every(([request]) => request.apiKey === 'personal-key')).toBe(true)
  })

  it('stops before making another request when cancelled', async () => {
    const controller = new AbortController()
    const decide = vi.fn(async (_request: NextCharacterRequest, _signal: AbortSignal) => ({ type: 'character' as const, value: 'a' }))

    await expect(
      generateReply({
        history,
        prefix: '',
        signal: controller.signal,
        decide,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(decide).toHaveBeenCalledTimes(1)
  })

  it('can resume from a partial response after a failed decision', async () => {
    const decide = vi
      .fn()
      .mockResolvedValueOnce({ type: 'character', value: 'a' })
      .mockRejectedValueOnce(new Error('Network failed'))
    const onProgress = vi.fn()

    await expect(
      generateReply({
        history,
        prefix: '',
        signal: new AbortController().signal,
        decide,
        onProgress,
      }),
    ).rejects.toThrow('Network failed')
    expect(onProgress).toHaveBeenCalledWith('a')

    const resumed = vi.fn(async (_request: NextCharacterRequest, _signal: AbortSignal) => ({ type: 'stop' as const }))
    expect(
      await generateReply({
        history,
        prefix: 'a',
        signal: new AbortController().signal,
        decide: resumed,
        onProgress,
      }),
    ).toBe('a')
    expect(resumed.mock.calls[0]?.[0].partialResponse).toBe('a')
  })

  it('stops after the third completed matching word without treating a partial word as complete', async () => {
    const characters = [...'go go good ']
    const decide = vi.fn(async () => {
      const value = characters.shift()
      return value === undefined ? { type: 'stop' as const } : { type: 'character' as const, value }
    })
    const reply = await generateReply({
      history, prefix: '', signal: new AbortController().signal, decide, onProgress: () => undefined,
    })
    expect(reply).toBe('go go good ')
    expect(decide).toHaveBeenCalledTimes('go go good '.length + 1)
  })

  it('stops on three consecutive spaces and leaves one space at the end', async () => {
    const characters = [...'hi   there']
    const decide = vi.fn(async () => ({ type: 'character' as const, value: characters.shift()! }))
    const reply = await generateReply({
      history, prefix: '', signal: new AbortController().signal, decide, onProgress: () => undefined,
    })
    expect(reply).toBe('hi ')
    expect(decide).toHaveBeenCalledTimes(5)
  })

  it('counts each backend request as it starts', async () => {
    const backendRequests = vi.fn()
    const decide = vi.fn(async (_request: NextCharacterRequest, _signal: AbortSignal) => ({ type: 'stop' as const }))
    await generateReply({ history, prefix: '', signal: new AbortController().signal, decide, onProgress: () => undefined, onRequest: backendRequests })
    expect(backendRequests).toHaveBeenCalledOnce()
  })
})
