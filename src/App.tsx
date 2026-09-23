import { useEffect, useRef, useState } from 'react'
import SettingsDialog from './components/SettingsDialog'
import ChatTimeline from './components/ChatTimeline'
import Composer from './components/Composer'
import Sidebar from './components/Sidebar'
import { getServerKeyAvailability, JevApiError } from './lib/api'
import { createConversation, loadChatState, saveChatState, titleFromMessage } from './lib/chatStorage'
import { generateReply } from './lib/generateReply'
import { generateWordReply } from './lib/generateWordReply'
import { isGenerationMode, isWordMode, type GenerationMode } from './lib/generationModes'
import { loadCustomProfiles, profileForMode, promptModeForGeneration, resolveProfile, saveCustomProfiles, type PromptMode, type PromptProfile } from './lib/promptProfiles'
import { clearPersonalKey, readPersonalKey, savePersonalKey } from './lib/keyStorage'
import { recheckReply } from './lib/recheckReply'
import { recheckWordReply } from './lib/recheckWordReply'
import { GENERATION_MODES } from './lib/generationModes'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { ChatMessage, ChatStoreState, ChatTurn } from './types'
import styles from './App.module.scss'

interface ActiveGeneration {
  controller: AbortController
  conversationId: string
  messageId: string
}

function updateMessage(
  state: ChatStoreState,
  conversationId: string,
  messageId: string,
  transform: (message: ChatMessage) => ChatMessage,
): ChatStoreState {
  return {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            updatedAt: new Date().toISOString(),
            messages: conversation.messages.map((message) =>
              message.id === messageId ? transform(message) : message,
            ),
          }
        : conversation,
    ),
  }
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, status: 'complete' }
}

export default function App() {
  const appRef = useRef<HTMLDivElement>(null)
  const [serverKeyAvailable, setServerKeyAvailable] = useState<boolean | null>(null)
  const [configurationError, setConfigurationError] = useState('')
  const [configurationAttempt, setConfigurationAttempt] = useState(0)
  const [personalKey, setPersonalKey] = useState(readPersonalKey)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [keyStorageError, setKeyStorageError] = useState('')
  const [chatState, setChatState] = useState(loadChatState)
  const [chatStorageError, setChatStorageError] = useState('')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 760)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('jev-talks:theme') === 'light' ? 'light' : 'dark' }
    catch { return 'dark' }
  })
  const [draft, setDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationMode, setGenerationMode] = useState<GenerationMode>(() => {
    try {
      const saved = localStorage.getItem('jev-talks:generation-mode')
      if (isGenerationMode(saved)) return saved
      if (saved) return 'words250'
      return 'words250'
    } catch { return 'words250' }
  })
  const [recheckEnabled, setRecheckEnabled] = useState(() => {
    try { return localStorage.getItem('jev-talks:recheck-enabled') === 'true' }
    catch { return false }
  })
  const [customProfiles, setCustomProfiles] = useState(loadCustomProfiles)
  const [profileSelections, setProfileSelections] = useState<Partial<Record<PromptMode, string>>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('jev-talks:profile-selections:v1') ?? '{}') as Record<string, unknown>
      const legacyWordProfile = Object.entries(saved).find(([key, value]) => key !== 'letter' && typeof value === 'string')?.[1]
      return {
        ...(typeof saved.letter === 'string' ? { letter: saved.letter } : {}),
        ...(typeof saved.words250 === 'string' ? { words250: saved.words250 } : typeof legacyWordProfile === 'string' ? { words250: legacyWordProfile } : {}),
      }
    }
    catch { return {} }
  })
  const activeGeneration = useRef<ActiveGeneration | null>(null)

  const activeConversation =
    chatState.conversations.find((conversation) => conversation.id === chatState.activeId) ??
    chatState.conversations[0]
  const messages = activeConversation.messages

  useEffect(() => {
    const updateHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight
      appRef.current?.style.setProperty('--app-viewport-height', `${height}px`)
      setIsMobile(window.innerWidth <= 760)
    }
    updateHeight()
    window.visualViewport?.addEventListener('resize', updateHeight)
    window.addEventListener('resize', updateHeight)
    return () => {
      window.visualViewport?.removeEventListener('resize', updateHeight)
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('jev-talks:theme', theme) }
    catch { /* The selected theme still works for this tab. */ }
  }, [theme])

  useEffect(() => {
    try {
      saveChatState(chatState)
      setChatStorageError('')
    } catch {
      setChatStorageError('Chats could not be saved in this browser. Check your storage settings.')
    }
  }, [chatState])

  useEffect(() => {
    try { localStorage.setItem('jev-talks:generation-mode', generationMode) }
    catch { /* The option still works for this tab. */ }
  }, [generationMode])

  useEffect(() => {
    try { localStorage.setItem('jev-talks:recheck-enabled', String(recheckEnabled)) }
    catch { /* The option still works for this tab. */ }
  }, [recheckEnabled])

  function handleProfilesChange(profiles: PromptProfile[], selections: Partial<Record<PromptMode, string>>) {
    try {
      saveCustomProfiles(profiles)
      localStorage.setItem('jev-talks:profile-selections:v1', JSON.stringify(selections))
      setCustomProfiles(profiles)
      setProfileSelections(selections)
    } catch {
      setChatStorageError('Prompt profiles could not be saved in this browser.')
    }
  }

  useEffect(() => {
    let cancelled = false
    getServerKeyAvailability()
      .then((available) => {
        if (!cancelled) {
          setServerKeyAvailable(available)
          setConfigurationError('')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setConfigurationError(
            error instanceof Error ? error.message : 'Could not check the server configuration.',
          )
        }
      })
    return () => { cancelled = true }
  }, [configurationAttempt])

  useEffect(() => () => activeGeneration.current?.controller.abort(), [])

  const keyRequired = serverKeyAvailable === false && !personalKey
  const showKeyDialog = keyRequired || keyDialogOpen
  const ready = serverKeyAvailable !== null && Boolean(personalKey || serverKeyAvailable)

  function handleSaveKey(value: string) {
    const key = value.trim()
    if (!key) return
    try {
      savePersonalKey(key)
      setKeyStorageError('')
      setPersonalKey(key)
      setKeyDialogOpen(false)
    } catch {
      setKeyStorageError('The browser could not save this key. Check your storage settings.')
    }
  }

  function handleClearKey() {
    try {
      clearPersonalKey()
      setPersonalKey('')
      setKeyStorageError('')
      setKeyDialogOpen(false)
    } catch {
      setKeyStorageError('The browser could not remove this key. Check your storage settings.')
    }
  }

  function handleStop() {
    const current = activeGeneration.current
    if (!current) return
    current.controller.abort()
    activeGeneration.current = null
    setIsGenerating(false)
    setChatState((state) =>
      updateMessage(state, current.conversationId, current.messageId, (message) => ({
        ...message,
        status: 'stopped',
      })),
    )
  }

  async function startGeneration(
    conversationId: string,
    messageId: string,
    history: ChatTurn[],
    prefix: string,
    mode: GenerationMode = generationMode,
    recheckAfterStop = recheckEnabled,
    recheckOnly = false,
    profileId?: string,
  ) {
    if (activeGeneration.current) return
    const controller = new AbortController()
    const promptMode = promptModeForGeneration(mode)
    const profile = resolveProfile(profileId ?? profileSelections[promptMode] ?? profileForMode(promptMode).id, customProfiles)
    const prompts = profile.mode === promptMode ? profile.prompts : profileForMode(promptMode).prompts
    const current = { controller, conversationId, messageId }
    activeGeneration.current = current
    setIsGenerating(true)
    let phase: 'generation' | 'recheck' = recheckOnly ? 'recheck' : 'generation'
    setChatState((state) =>
      updateMessage(state, conversationId, messageId, (message) => ({
        ...message,
        status: recheckOnly ? 'rechecking' : 'generating',
        requestCount: 0,
        error: undefined,
        errorPhase: undefined,
      })),
    )

    try {
      const onProgress = (content: string) => {
        if (activeGeneration.current === current) {
          setChatState((state) =>
            updateMessage(state, conversationId, messageId, (message) => ({ ...message, content })),
          )
        }
      }
      let requestCount = 0
      const onRequest = () => {
        requestCount += 1
        if (activeGeneration.current === current) {
          setChatState((state) => updateMessage(state, conversationId, messageId, (message) => ({ ...message, requestCount })))
        }
      }
      let reply = prefix
      if (!recheckOnly) {
        reply = isWordMode(mode)
          ? await generateWordReply({ history, prefix, prompts, apiKey: personalKey || undefined, signal: controller.signal, onProgress, onRequest })
          : await generateReply({ history, prefix, prompts, apiKey: personalKey || undefined, signal: controller.signal, onProgress, onRequest })
      }
      controller.signal.throwIfAborted()
      if ((recheckAfterStop || recheckOnly) && reply) {
        phase = 'recheck'
        setChatState((state) =>
          updateMessage(state, conversationId, messageId, (message) => ({
            ...message,
            content: reply,
            status: 'rechecking',
          })),
        )
        reply = isWordMode(mode)
          ? await recheckWordReply({ history, answer: reply, prompts, apiKey: personalKey || undefined, signal: controller.signal, onProgress, onRequest })
          : await recheckReply({ history, answer: reply, prompts, apiKey: personalKey || undefined, signal: controller.signal, onProgress, onRequest })
      }
      controller.signal.throwIfAborted()
      if (activeGeneration.current === current) {
        setChatState((state) =>
          updateMessage(state, conversationId, messageId, (message) => ({
            ...message,
            content: reply,
            status: 'complete',
            errorPhase: undefined,
          })),
        )
      }
    } catch (error) {
      if (!controller.signal.aborted && activeGeneration.current === current) {
        const message = error instanceof Error ? error.message : 'Jev could not continue. Please retry.'
        setChatState((state) =>
          updateMessage(state, conversationId, messageId, (item) => ({
            ...item,
            status: 'error',
            error: message,
            errorPhase: phase,
          })),
        )
        if (
          error instanceof JevApiError &&
          (error.code === 'AUTHENTICATION_FAILED' || error.code === 'API_KEY_REQUIRED') &&
          personalKey
        ) setKeyDialogOpen(true)
      }
    } finally {
      if (activeGeneration.current === current) {
        activeGeneration.current = null
        setIsGenerating(false)
      }
    }
  }

  function handleSend() {
    const content = draft.trim()
    if (!content || !ready || activeGeneration.current) return
    const userMessage = createMessage('user', content)
    const promptMode = promptModeForGeneration(generationMode)
    const selectedProfileId = profileSelections[promptMode] ?? profileForMode(promptMode).id
    const assistantMessage = { ...createMessage('assistant', ''), status: 'generating' as const, generationMode, promptProfileId: selectedProfileId, recheckEnabled }
    const history: ChatTurn[] = [
      ...messages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
      { role: 'user', content },
    ]
    setChatState((state) => ({
      ...state,
      conversations: state.conversations.map((conversation) =>
        conversation.id === activeConversation.id
          ? {
              ...conversation,
              title: conversation.messages.length === 0 ? titleFromMessage(content) : conversation.title,
              updatedAt: new Date().toISOString(),
              messages: [...conversation.messages, userMessage, assistantMessage],
            }
          : conversation,
      ),
    }))
    setDraft('')
    void startGeneration(activeConversation.id, assistantMessage.id, history, '', generationMode, recheckEnabled, false, selectedProfileId)
  }

  function handleRetry(messageId: string) {
    if (activeGeneration.current) return
    const index = messages.findIndex((message) => message.id === messageId)
    if (index !== messages.length - 1 || messages[index]?.status !== 'error') return
    const history: ChatTurn[] = messages.slice(0, index).map(({ role, content }) => ({ role, content }))
    const recheckOnly = messages[index].errorPhase === 'recheck'
    void startGeneration(activeConversation.id, messageId, history, messages[index].content, messages[index].generationMode ?? 'letter', messages[index].recheckEnabled ?? false, recheckOnly, messages[index].promptProfileId)
  }

  function handleNewChat() {
    handleStop()
    setMobileSidebarOpen(false)
    setDraft('')
    if (activeConversation.messages.length === 0) return
    const conversation = createConversation()
    setChatState((state) => ({
      conversations: [conversation, ...state.conversations],
      activeId: conversation.id,
    }))
  }

  function handleSelectChat(id: string) {
    setMobileSidebarOpen(false)
    if (id === activeConversation.id) return
    handleStop()
    setDraft('')
    setChatState((state) => ({ ...state, activeId: id }))
  }

  function handleDeleteChat(id: string) {
    const conversation = chatState.conversations.find((item) => item.id === id)
    if (!conversation) return
    if (activeGeneration.current?.conversationId === id) handleStop()
    setChatState((state) => {
      const remaining = state.conversations.filter((item) => item.id !== id)
      if (remaining.length === 0) {
        const replacement = createConversation()
        return { conversations: [replacement], activeId: replacement.id }
      }
      const nextActiveId = state.activeId === id
        ? [...remaining].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0].id
        : state.activeId
      return { conversations: remaining, activeId: nextActiveId }
    })
    if (id === activeConversation.id) setDraft('')
  }

  function handleDeleteAllChats() {
    handleStop()
    const conversation = createConversation()
    setChatState({ conversations: [conversation], activeId: conversation.id })
    setDraft('')
  }

  function openSettings() {
    setMobileSidebarOpen(false)
    setKeyDialogOpen(true)
  }

  const sidebarVisible = isMobile ? mobileSidebarOpen : desktopSidebarOpen

  return (
    <div className={styles.app} ref={appRef}>
      <Sidebar
        conversations={chatState.conversations}
        activeId={activeConversation.id}
        open={mobileSidebarOpen}
        desktopOpen={desktopSidebarOpen}
        theme={theme}
        storageError={chatStorageError}
        onClose={() => setMobileSidebarOpen(false)}
        onNew={handleNewChat}
        onSelect={handleSelectChat}
        onDelete={handleDeleteChat}
        onDeleteAll={handleDeleteAllChats}
        onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        onSettings={openSettings}
      />
      <div className={styles.workspace}>
        <header className={styles.header}>
          <div className={`${styles.headerInner} ${chatExpanded ? styles.headerExpanded : ''}`}>
            <div className={styles.headerIdentity}>
              <button
                className={styles.menuButton}
                type="button"
                aria-label={sidebarVisible ? 'Close chats sidebar' : 'Open chats sidebar'}
                aria-controls="chat-sidebar"
                aria-expanded={sidebarVisible}
                onClick={() => {
                  if (isMobile) setMobileSidebarOpen((open) => !open)
                  else setDesktopSidebarOpen((open) => !open)
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <div className={styles.brand} aria-label="Jev Talks">
                <span>Jev Talks</span>
              </div>
              <select aria-label="Jev method" value={generationMode} disabled={isGenerating} onChange={(event) => {
                if (isGenerationMode(event.target.value)) setGenerationMode(event.target.value)
              }}>
                {GENERATION_MODES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label className={styles.recheckToggle}>
                <input type="checkbox" checked={recheckEnabled} disabled={isGenerating} onChange={(event) => setRecheckEnabled(event.target.checked)} />
                <span>Recheck answer</span>
              </label>
            </div>
            <div className={styles.headerControls}>
              <button className={styles.expandButton} type="button" aria-label={chatExpanded ? 'Collapse chat' : 'Expand chat'} title={chatExpanded ? 'Collapse chat' : 'Expand chat'} onClick={() => setChatExpanded((value) => !value)}>
                {chatExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            </div>
          </div>
        </header>
        {configurationError ? (
          <main className={styles.centeredState}>
            <div className={styles.stateCard}>
              <h1>Connection unavailable</h1>
              <p>{configurationError}</p>
              <button type="button" onClick={() => setConfigurationAttempt((attempt) => attempt + 1)}>
                Retry
              </button>
            </div>
          </main>
        ) : serverKeyAvailable === null ? (
          <main className={styles.centeredState}>
            <p role="status">Connecting to Jev Talks…</p>
          </main>
        ) : (
          <>
            <ChatTimeline key={activeConversation.id} messages={messages} onRetry={handleRetry} expanded={chatExpanded} />
            <div className={`${styles.composerArea} ${chatExpanded ? styles.composerExpanded : ''}`}>
              <Composer
                draft={draft}
                onDraftChange={setDraft}
                onSend={handleSend}
                onStop={handleStop}
                isGenerating={isGenerating}
                disabled={!ready}
              />
            </div>
          </>
        )}
      </div>
      {showKeyDialog && serverKeyAvailable !== null && (
        <SettingsDialog
          required={keyRequired}
          serverKeyAvailable={serverKeyAvailable}
          storageError={keyStorageError}
          personalKey={personalKey}
          theme={theme}
          onThemeChange={setTheme}
          customProfiles={customProfiles}
          profileSelections={profileSelections}
          onProfilesChange={handleProfilesChange}
          onSave={handleSaveKey}
          onClear={handleClearKey}
          onClose={() => {
            setKeyDialogOpen(false)
            setKeyStorageError('')
          }}
        />
      )}
    </div>
  )
}
