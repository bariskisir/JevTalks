// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { NextCharacterRequest, NextCharacterResponse } from '../src/types'

function mockResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response
}

describe('chat interface', () => {
  beforeEach(() => {
    localStorage.clear()
    let nextId = 0
    vi.stubGlobal('crypto', { randomUUID: () => `message-${++nextId}` })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('starts with answer recheck disabled by default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ serverKeyAvailable: true })))

    render(<App />)

    const recheck = await screen.findByLabelText('Recheck answer') as HTMLInputElement
    expect(recheck.checked).toBe(false)
  })

  it('saves a personal key and shows each decision in the chat', async () => {
    const requests: NextCharacterRequest[] = []
    const decisions: NextCharacterResponse[] = [
      { type: 'character', value: 'O' },
      { type: 'character', value: 'k' },
    ]
    let finishReply = () => {}
    const stopDecision = new Promise<NextCharacterResponse>((resolve) => {
      finishReply = () => resolve({ type: 'stop' })
    })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return mockResponse({ serverKeyAvailable: false })
      requests.push(JSON.parse(init.body as string) as NextCharacterRequest)
      return mockResponse(decisions.shift() ?? stopDecision)
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('dialog')
    await user.type(screen.getByPlaceholderText('Paste your API key'), 'personal-key')
    await user.click(screen.getByRole('button', { name: 'Save key' }))
    expect(localStorage.getItem('jev-talks:typesafe-key')).toBe('personal-key')

    await user.type(screen.getByLabelText('Message Jev'), 'Hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(requests).toHaveLength(3))
    expect(within(screen.getByRole('main', { name: 'Conversation' })).getByText('Ok')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Generating')
    expect(requests.map((request) => request.partialResponse)).toEqual(['', 'O', 'Ok'])
    expect(requests.every((request) => request.apiKey === 'personal-key')).toBe(true)
    expect(requests[0].history).toEqual([{ role: 'user', content: 'Hello' }])

    finishReply()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('allows a saved personal key to be removed when a server key exists', async () => {
    localStorage.setItem('jev-talks:typesafe-key', 'old-personal-key')
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ serverKeyAvailable: true })))

    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'Settings' })
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect((screen.getByPlaceholderText('Paste your API key') as HTMLInputElement).value).toBe('old-personal-key')
    await user.click(screen.getByRole('button', { name: 'Show key' }))
    expect((screen.getByPlaceholderText('Paste your API key') as HTMLInputElement).type).toBe('text')
    await user.click(screen.getByRole('button', { name: 'Use server key' }))

    expect(localStorage.getItem('jev-talks:typesafe-key')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps separate saved chats and lets a visitor select and delete them', async () => {
    const requests: NextCharacterRequest[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return mockResponse({ serverKeyAvailable: true })
      requests.push(JSON.parse(init.body as string) as NextCharacterRequest)
      return mockResponse({ type: 'stop' })
    }))
    vi.stubGlobal('confirm', vi.fn(() => true))

    const user = userEvent.setup()
    const firstRender = render(<App />)
    await screen.findByRole('button', { name: 'Send' })

    await user.type(screen.getByLabelText('Message Jev'), 'First question')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'New chat' }))
    await user.type(screen.getByLabelText('Message Jev'), 'Second question')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(requests[1].history).toEqual([{ role: 'user', content: 'Second question' }])

    const savedChats = screen.getByRole('navigation', { name: 'Saved chats' })
    await user.click(within(savedChats).getByText('First question'))
    expect(within(screen.getByRole('main', { name: 'Conversation' })).getByText('First question')).toBeTruthy()
    expect(localStorage.getItem('jev-talks:chats:v1')).toContain('First question')

    firstRender.unmount()
    render(<App />)
    await screen.findByRole('button', { name: 'Send' })
    expect(within(screen.getByRole('main', { name: 'Conversation' })).getByText('First question')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Close chats sidebar' }))
    expect(screen.getByRole('button', { name: 'Open chats sidebar' }).getAttribute('aria-expanded')).toBe('false')
    await user.click(screen.getByRole('button', { name: 'Open chats sidebar' }))
    await user.click(screen.getByRole('button', { name: 'Delete chat First question' }))
    expect(within(screen.getByRole('main', { name: 'Conversation' })).getByText('Second question')).toBeTruthy()
    expect(localStorage.getItem('jev-talks:chats:v1')).not.toContain('First question')
    expect(vi.mocked(confirm)).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete all chats' }))
    expect(within(screen.getByRole('main', { name: 'Conversation' })).queryAllByRole('article')).toHaveLength(0)
    expect(localStorage.getItem('jev-talks:chats:v1')).not.toContain('Second question')
  })

  it('rechecks a completed answer only when enabled', async () => {
    const requests: Array<NextCharacterRequest | { mode: string; answer: string; index: number }> = []
    const choices = [
      { type: 'character', value: 'a' },
      { type: 'character', value: 'b' },
      { type: 'stop' },
      { type: 'keep' },
      { type: 'change' },
      { type: 'replacement', value: 'c' },
    ]
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return mockResponse({ serverKeyAvailable: true })
      requests.push(JSON.parse(init.body as string))
      return mockResponse(choices.shift())
    }))

    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'Send' })
    await user.click(screen.getByLabelText('Recheck answer'))
    await user.type(screen.getByLabelText('Message Jev'), 'Say ac')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(requests).toHaveLength(6))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(within(screen.getByRole('main', { name: 'Conversation' })).getByText('ac')).toBeTruthy()
    expect(requests.slice(3).map((request) => 'mode' in request ? request.mode : 'generate')).toEqual(['review', 'review', 'replace'])
    expect(localStorage.getItem('jev-talks:chats:v1')).toContain('ac')
  })

  it('keeps the dark theme by default and exposes theme and about in settings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ serverKeyAvailable: true })))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'Settings' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: 'Theme' }))
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: 'About' }))
    expect(within(screen.getByRole('dialog')).getByText('Every character starts with a decision.')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Open website' }).getAttribute('href')).toBe('https://www.bariskisir.com/')
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Open source code' }).getAttribute('href')).toBe('https://github.com/bariskisir/JevTalks')
  })

  it('uses a custom prompt profile while preserving the default prompt', async () => {
    const requests: NextCharacterRequest[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return mockResponse({ serverKeyAvailable: true })
      requests.push(JSON.parse(init.body as string) as NextCharacterRequest)
      return mockResponse({ type: 'stop' })
    }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'Settings' })
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: 'Prompts' }))
    const defaultSystem = screen.getByLabelText('System prompt / state task') as HTMLTextAreaElement
    expect(defaultSystem.readOnly).toBe(true)
    const original = defaultSystem.value
    await user.click(screen.getByRole('button', { name: 'New profile' }))
    const customSystem = screen.getByLabelText('System prompt / state task') as HTMLTextAreaElement
    expect(customSystem.readOnly).toBe(false)
    await user.clear(customSystem)
    await user.type(customSystem, 'Answer briefly in English.')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(localStorage.getItem('jev-talks:prompt-profiles:v1')).toContain('Answer briefly in English.')
    await user.selectOptions(screen.getByLabelText('Profile'), 'default:letter')
    expect((screen.getByLabelText('System prompt / state task') as HTMLTextAreaElement).value).toBe(original)
    await user.selectOptions(screen.getByLabelText('Profile'), screen.getByRole('option', { name: 'Letter by letter custom' }) as HTMLOptionElement)
    await user.click(screen.getByRole('button', { name: 'Close settings' }))
    await user.type(screen.getByLabelText('Message Jev'), 'Hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].prompts?.system).toBe('Answer briefly in English.')
  })

  it('places method and recheck beside the title and expands the whole chat header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ serverKeyAvailable: true })))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Jev method')
    expect(screen.getByLabelText('Recheck answer')).toBeTruthy()
    expect(screen.queryByText('Talk to Jev')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Expand chat' }))
    expect(screen.getByRole('button', { name: 'Collapse chat' })).toBeTruthy()
  })
})
