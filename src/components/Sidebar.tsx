import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Moon, Plus, Settings, Sun, Trash2 } from 'lucide-react'
import type { Conversation } from '../types'
import styles from './Sidebar.module.scss'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string
  open: boolean
  desktopOpen: boolean
  theme: 'dark' | 'light'
  storageError: string
  onClose: () => void
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onDeleteAll: () => void
  onThemeToggle: () => void
  onSettings: () => void
}

function previewFor(conversation: Conversation): string {
  const last = conversation.messages.at(-1)
  if (!last) return 'No messages yet'
  if (last.content) return last.content.replace(/\s+/g, ' ')
  return last.status === 'stopped' ? 'Stopped' : 'Generating…'
}

export default function Sidebar({
  conversations,
  activeId,
  open,
  desktopOpen,
  theme,
  storageError,
  onClose,
  onNew,
  onSelect,
  onDelete,
  onDeleteAll,
  onThemeToggle,
  onSettings,
}: SidebarProps) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('jev-talks:sidebar-width'))
      return Number.isFinite(saved) && saved >= 210 && saved <= 440 ? saved : 210
    } catch { return 210 }
  })
  const ordered = [...conversations].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )

  function updateWidth(nextWidth: number) {
    const clamped = Math.max(210, Math.min(440, Math.round(nextWidth)))
    setWidth(clamped)
    try { localStorage.setItem('jev-talks:sidebar-width', String(clamped)) }
    catch { /* Resizing still works for this tab. */ }
  }

  function handleResizeStart(event: PointerEvent<HTMLDivElement>) {
    if (window.matchMedia('(max-width: 760px)').matches) return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function handleResizeMove(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateWidth(event.clientX)
  }

  function handleResizeKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    updateWidth(width + (event.key === 'ArrowRight' ? 16 : -16))
  }

  return (
    <>
      <button
        className={`${styles.backdrop} ${open ? styles.open : ''}`}
        type="button"
        aria-label="Close chats"
        onClick={onClose}
      />
      <aside
        id="chat-sidebar"
        className={`${styles.sidebar} ${open ? styles.open : ''} ${desktopOpen ? '' : styles.collapsed}`}
        aria-label="Chats"
        style={{ '--sidebar-width': `${width}px` } as CSSProperties}
      >
        <div className={styles.heading}>
          <h2>Chats</h2>
          <div className={styles.headingActions}>
            <button className={styles.deleteAllButton} type="button" aria-label="Delete all chats" title="Delete all chats" onClick={onDeleteAll}>
              <Trash2 size={17} />
            </button>
            <button className={styles.newButton} type="button" aria-label="New chat" title="New chat" onClick={onNew}>
              <Plus size={17} />
            </button>
            <button className={styles.closeButton} type="button" aria-label="Close chats" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <nav className={styles.list} aria-label="Saved chats">
          {ordered.map((conversation) => (
            <div
              className={`${styles.row} ${conversation.id === activeId ? styles.selected : ''}`}
              key={conversation.id}
            >
              <button
                className={styles.selectButton}
                type="button"
                aria-current={conversation.id === activeId ? 'page' : undefined}
                onClick={() => onSelect(conversation.id)}
              >
                <span className={styles.title}>{conversation.title}</span>
                <span className={styles.preview}>{previewFor(conversation)}</span>
              </button>
              <button
                className={styles.deleteButton}
                type="button"
                aria-label={`Delete chat ${conversation.title}`}
                title={`Delete ${conversation.title}`}
                onClick={() => onDelete(conversation.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v6m4-6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ))}
        </nav>

        {storageError && <p className={styles.storageError} role="alert">{storageError}</p>}
        <div className={styles.footer}>
          <button type="button" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={onThemeToggle}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" aria-label="Settings" title="Settings" onClick={onSettings}><Settings size={17} /></button>
        </div>
        <div
          className={styles.resizeHandle}
          role="separator"
          tabIndex={0}
          aria-label="Resize chats sidebar"
          aria-orientation="vertical"
          aria-valuemin={210}
          aria-valuemax={440}
          aria-valuenow={width}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onKeyDown={handleResizeKey}
        />
      </aside>
    </>
  )
}
