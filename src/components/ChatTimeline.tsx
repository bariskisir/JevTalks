import { useEffect, useRef } from 'react'
import { Bot, User } from 'lucide-react'
import type { ChatMessage } from '../types'
import styles from './ChatTimeline.module.scss'

interface ChatTimelineProps {
  messages: ChatMessage[]
  onRetry: (messageId: string) => void
  expanded: boolean
}

export default function ChatTimeline({ messages, onRetry, expanded }: ChatTimelineProps) {
  const scrollRef = useRef<HTMLElement>(null)
  const stayAtBottom = useRef(true)

  useEffect(() => {
    const element = scrollRef.current
    if (element && stayAtBottom.current) element.scrollTop = element.scrollHeight
  }, [messages])

  function handleScroll() {
    const element = scrollRef.current
    if (!element) return
    stayAtBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90
  }

  return (
    <main className={styles.timeline} ref={scrollRef} onScroll={handleScroll} aria-label="Conversation">
      {messages.length > 0 && (
        <div className={`${styles.messages} ${expanded ? styles.expanded : ''}`}>
          {messages.map((message) => (
            <article
              className={`${styles.message} ${message.role === 'user' ? styles.user : styles.assistant}`}
              key={message.id}
            >
              <div className={styles.avatar} aria-hidden="true">
                {message.role === 'assistant' ? <Bot size={17} /> : <User size={17} />}
              </div>
              <div className={styles.messageBody}>
                <div className={styles.messageName}>{message.role === 'assistant' ? 'Jev' : 'You'}</div>
                <div className={styles.content}>
                  {message.content ||
                    (message.status === 'complete' ? 'Jev finished without a reply.' : null)}
                {(message.status === 'generating' || message.status === 'rechecking') && message.content && (
                    <span className={styles.cursor} aria-hidden="true" />
                  )}
                </div>
                {message.status === 'generating' && (
                  <div className={styles.generating} role="status">Generating · {message.requestCount ?? 0} requests<span aria-hidden="true">…</span></div>
                )}
                {message.status === 'rechecking' && (
                  <div className={styles.generating} role="status">Rechecking last answer · {message.requestCount ?? 0} requests<span aria-hidden="true">…</span></div>
                )}
                {message.status === 'complete' && message.requestCount !== undefined && (
                  <div className={styles.mutedStatus}>{message.requestCount} requests</div>
                )}
                {message.status === 'stopped' && (
                  <div className={styles.mutedStatus}>{message.requestCount ?? 0} requests</div>
                )}
                {message.status === 'error' && (
                  <div className={styles.error} role="alert">
                    <span>{message.error}</span>
                    <button type="button" onClick={() => onRetry(message.id)}>Retry</button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
