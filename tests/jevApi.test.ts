import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import jevApi from '../api/jev'

const history = [
  { role: 'user', content: 'Hi' },
  { role: 'assistant', content: 'Hello' },
  { role: 'user', content: 'How are you?' },
]

function post(apiKey?: string): Request {
  return new Request('http://localhost/api/jev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, partialResponse: 'I am', apiKey }),
  })
}

function providerChoice(choice: string, question = 'next_character'): Response {
  return Response.json({ answers: { [question]: { type: 'choice', choice } } })
}

describe('Jev API', () => {
  const originalServerKey = process.env.TYPESAFE_AI_KEY

  beforeEach(() => {
    delete process.env.TYPESAFE_AI_KEY
  })

  afterEach(() => {
    if (originalServerKey === undefined) delete process.env.TYPESAFE_AI_KEY
    else process.env.TYPESAFE_AI_KEY = originalServerKey
    vi.unstubAllGlobals()
  })

  it('reports whether the shared server key is available without exposing it', async () => {
    process.env.TYPESAFE_AI_KEY = 'server-secret'
    const response = await jevApi.fetch(new Request('http://localhost/api/jev'))

    expect(await response.json()).toEqual({ serverKeyAvailable: true })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('uses a personal key before the server key and forwards full context', async () => {
    process.env.TYPESAFE_AI_KEY = 'server-secret'
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => providerChoice('ş'))
    vi.stubGlobal('fetch', fetchMock)

    const response = await jevApi.fetch(post('personal-secret'))
    expect(await response.json()).toEqual({ type: 'character', value: 'ş' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer personal-secret')
    const sent = JSON.parse(init.body as string)
    expect(sent.state.conversation).toEqual(history)
    expect(sent.state.response_so_far).toBe('I am')
    expect(sent.questions.next_character.criteria.STOP).toBeDefined()
  })

  it('uses the server key only when no personal key is supplied', async () => {
    process.env.TYPESAFE_AI_KEY = 'server-secret'
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => providerChoice('STOP'))
    vi.stubGlobal('fetch', fetchMock)

    const response = await jevApi.fetch(post())
    expect(await response.json()).toEqual({ type: 'stop' })
    expect(fetchMock.mock.calls[0]?.[1].headers).toMatchObject({
      Authorization: 'Bearer server-secret',
    })
  })

  it('asks for a key when neither source exists', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await jevApi.fetch(post())
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'API_KEY_REQUIRED' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unknown provider choices without appending them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => providerChoice('not-offered')))

    const response = await jevApi.fetch(post('personal-secret'))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_PROVIDER_RESPONSE' } })
  })

  it('rejects an invalid decision mode before calling TypeSafe', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const request = new Request('http://localhost/api/jev', {
      method: 'POST',
      body: JSON.stringify({ mode: 'unknown', history, partialResponse: 'hi', apiKey: 'personal-secret' }),
    })
    const response = await jevApi.fetch(request)
    expect(response.status).toBe(400)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('reviews and replaces a specific character after STOP', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(providerChoice('CHANGE', 'review_character'))
      .mockResolvedValueOnce(providerChoice('c', 'replacement_character'))
    vi.stubGlobal('fetch', fetchMock)

    const review = new Request('http://localhost/api/jev', {
      method: 'POST',
      body: JSON.stringify({ mode: 'review', history, answer: 'ab', index: 1, apiKey: 'personal-secret' }),
    })
    expect(await (await jevApi.fetch(review)).json()).toEqual({ type: 'change' })
    const reviewPayload = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(reviewPayload.state.character_at_index).toBe('b')
    expect(reviewPayload.questions.review_character.criteria.CHANGE).toBeDefined()

    const replace = new Request('http://localhost/api/jev', {
      method: 'POST',
      body: JSON.stringify({ mode: 'replace', history, answer: 'ab', index: 1, apiKey: 'personal-secret' }),
    })
    expect(await (await jevApi.fetch(replace)).json()).toEqual({ type: 'replacement', value: 'c' })
    const replacementPayload = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(replacementPayload.questions.replacement_character.criteria.STOP).toBeUndefined()
  })

  it('sends all 250 words and the custom prompt as one choice question', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => providerChoice('the', 'next_word'))
    vi.stubGlobal('fetch', fetchMock)
    const response = await jevApi.fetch(new Request('http://localhost/api/jev', {
      method: 'POST',
      body: JSON.stringify({ mode: 'word', history, partialResponse: '', apiKey: 'personal-secret', prompts: { system: 'Custom system', decision: 'Custom decision' } }),
    }))
    expect(await response.json()).toEqual({ type: 'word', value: 'the' })
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(payload.state.task).toContain('Custom system')
    expect(payload.state.task).toContain('the, of, and')
    expect(payload.state.conversation).toEqual(history)
    expect(payload.questions.next_word.instructions).toBe('Custom decision')
    expect(payload.questions.next_word.criteria.the).toBeNull()
    expect(Object.keys(payload.questions.next_word.criteria)).toHaveLength(251)
    expect(payload.questions.next_word.criteria.STOP).toBeDefined()
    expect(payload.questions.next_word.criteria.SPACE).toBeUndefined()
  })

  it('reviews a word and restricts replacement to the common word list without STOP', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(providerChoice('CHANGE', 'review_word'))
      .mockResolvedValueOnce(providerChoice('the', 'replacement_word'))
    vi.stubGlobal('fetch', fetchMock)
    const request = (mode: string) => new Request('http://localhost/api/jev', {
      method: 'POST',
      body: JSON.stringify({ mode, history, answer: 'hello world', index: 1, apiKey: 'personal-secret' }),
    })
    expect(await (await jevApi.fetch(request('word-review'))).json()).toEqual({ type: 'change' })
    expect(await (await jevApi.fetch(request('word-replace'))).json()).toEqual({ type: 'replacement', value: 'the' })
    const review = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const replacement = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(review.state.word_at_index).toBe('world')
    expect(review.state.conversation).toEqual(history)
    expect(replacement.questions.replacement_word.criteria.the).toBeNull()
    expect(replacement.questions.replacement_word.criteria.STOP).toBeUndefined()
    expect(Object.keys(replacement.questions.replacement_word.criteria)).toHaveLength(250)
  })
})
