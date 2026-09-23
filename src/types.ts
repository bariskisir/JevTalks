export type ChatRole = 'user' | 'assistant'

export interface ChatTurn {
  role: ChatRole
  content: string
}

export type MessageStatus = 'complete' | 'generating' | 'rechecking' | 'stopped' | 'error'

export interface ChatMessage extends ChatTurn {
  id: string
  status: MessageStatus
  error?: string
  errorPhase?: 'generation' | 'recheck'
  generationMode?: GenerationMode
  promptProfileId?: string
  recheckEnabled?: boolean
  requestCount?: number
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface ChatStoreState {
  conversations: Conversation[]
  activeId: string
}

export interface NextCharacterRequest {
  history: ChatTurn[]
  partialResponse: string
  apiKey?: string
  prompts?: PromptFields
}

export interface NextWordRequest {
  mode: 'word'
  history: ChatTurn[]
  partialResponse: string
  apiKey?: string
  prompts?: PromptFields
}

export type NextWordResponse = { type: 'word'; value: string } | { type: 'stop' }
export type WordRecheckResponse = RecheckResponse

export interface RecheckRequest {
  mode: 'review' | 'replace'
  history: ChatTurn[]
  answer: string
  index: number
  apiKey?: string
  prompts?: PromptFields
}

export interface WordRecheckRequest {
  mode: 'word-review' | 'word-replace'
  history: ChatTurn[]
  answer: string
  index: number
  apiKey?: string
  prompts?: PromptFields
}

export type RecheckResponse =
  | { type: 'keep' }
  | { type: 'change' }
  | { type: 'replacement'; value: string }

export type NextCharacterResponse =
  | { type: 'character'; value: string }
  | { type: 'stop' }

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
}
import type { GenerationMode } from './lib/generationModes'
import type { PromptFields } from './lib/promptProfiles'
