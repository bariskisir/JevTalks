import type { ChatMessage, ChatStoreState, Conversation, MessageStatus } from '../types'
import { isGenerationMode } from './generationModes'

const STORAGE_KEY = 'jev-talks:chats:v1'
const MESSAGE_STATUSES: MessageStatus[] = ['complete', 'generating', 'rechecking', 'stopped', 'error']

export function createConversation(): Conversation {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function titleFromMessage(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  const characters = [...normalized]
  return characters.length > 48 ? `${characters.slice(0, 48).join('')}…` : normalized
}

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Partial<ChatMessage>
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    MESSAGE_STATUSES.includes(message.status as MessageStatus) &&
    (message.error === undefined || typeof message.error === 'string') &&
    (message.errorPhase === undefined || message.errorPhase === 'generation' || message.errorPhase === 'recheck') &&
    (message.generationMode === undefined || typeof message.generationMode === 'string') &&
    (message.promptProfileId === undefined || typeof message.promptProfileId === 'string') &&
    (message.recheckEnabled === undefined || typeof message.recheckEnabled === 'boolean') &&
    (message.requestCount === undefined || Number.isInteger(message.requestCount) && message.requestCount >= 0)
  )
}

function parseConversation(value: unknown): Conversation | null {
  if (typeof value !== 'object' || value === null) return null
  const conversation = value as Partial<Conversation>
  if (
    typeof conversation.id !== 'string' ||
    typeof conversation.title !== 'string' ||
    typeof conversation.createdAt !== 'string' ||
    typeof conversation.updatedAt !== 'string' ||
    !Array.isArray(conversation.messages) ||
    !conversation.messages.every(isMessage)
  ) {
    return null
  }

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((message) => {
      const mode = message.generationMode
      const promptProfileId = message.promptProfileId?.startsWith('default:')
        && message.promptProfileId !== 'default:letter' && message.promptProfileId !== 'default:words250'
        ? 'default:words250'
        : message.promptProfileId
      return {
        ...message,
        ...(mode !== undefined ? { generationMode: isGenerationMode(mode) ? mode : 'words250' } : {}),
        promptProfileId,
        ...(message.status === 'generating' || message.status === 'rechecking' ? { status: 'stopped' as const } : {}),
      }
    }),
  }
}

export function loadChatState(): ChatStoreState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as { conversations?: unknown; activeId?: unknown }
        if (Array.isArray(record.conversations)) {
          const conversations = record.conversations
            .map(parseConversation)
            .filter((conversation): conversation is Conversation => conversation !== null)
          if (conversations.length > 0) {
            const activeId = conversations.some((conversation) => conversation.id === record.activeId)
              ? (record.activeId as string)
              : conversations[0].id
            return { conversations, activeId }
          }
        }
      }
    }
  } catch {
    // An unavailable or malformed browser store starts a fresh local chat.
  }

  const conversation = createConversation()
  return { conversations: [conversation], activeId: conversation.id }
}

export function saveChatState(state: ChatStoreState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
