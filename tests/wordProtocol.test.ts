import { describe, expect, it } from 'vitest'
import { createWordEvaluationRequest, decodeWordChoice, getWords } from '../src/lib/wordProtocol'
import { generateWordReply } from '../src/lib/generateWordReply'
import { DEFAULT_PROMPTS } from '../src/lib/promptProfiles'

describe('250 common word decisions', () => {
  it('offers exactly 250 unique lowercase words plus STOP', () => {
    const words = getWords()
    expect(words).toHaveLength(250)
    expect(new Set(words).size).toBe(250)
    expect(words.every((word) => /^[a-z]+$/.test(word))).toBe(true)
    expect(words).toContain('computer')
    expect(decodeWordChoice('about')).toBe('about')
    expect(decodeWordChoice('STOP')).toBeNull()
  })

  it('provides the complete context and list in a single choice question', () => {
    const history = [{ role: 'user' as const, content: 'Hello' }, { role: 'assistant' as const, content: 'hello' }, { role: 'user' as const, content: 'Continue' }]
    const request = createWordEvaluationRequest(history, 'another word')
    expect(request.state.conversation).toEqual(history)
    expect(request.state.response_so_far).toBe('another word')
    expect(request.state.task).toContain('complete 250 common word list')
    expect(request.state.task).toContain(getWords().join(', '))
    expect(Object.keys(request.questions.next_word.criteria)).toHaveLength(251)
    expect(request.questions.next_word.criteria.STOP).toBeDefined()
  })

  it('appends one selected word per request and stops on STOP', async () => {
    const prefixes: string[] = []
    const decisions = [{ type: 'word' as const, value: 'hello' }, { type: 'word' as const, value: 'world' }, { type: 'stop' as const }]
    const progress: string[] = []
    const result = await generateWordReply({
      history: [{ role: 'user', content: 'Say hello' }], prefix: '', prompts: DEFAULT_PROMPTS.words250,
      signal: new AbortController().signal, onProgress: (reply) => progress.push(reply),
      decide: async (request) => { prefixes.push(request.partialResponse); return decisions.shift()! },
    })
    expect(result).toBe('hello world')
    expect(prefixes).toEqual(['', 'hello', 'hello world'])
    expect(progress).toEqual(['hello', 'hello world'])
  })

  it('stops immediately after three identical selected words', async () => {
    const decide = async () => ({ type: 'word' as const, value: 'hello' })
    const result = await generateWordReply({
      history: [{ role: 'user', content: 'Say hello' }], prefix: '', prompts: DEFAULT_PROMPTS.words250,
      signal: new AbortController().signal, onProgress: () => undefined, decide,
    })
    expect(result).toBe('hello hello hello')
  })
})
