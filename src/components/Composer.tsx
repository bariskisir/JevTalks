import { useEffect, useRef, type KeyboardEvent } from 'react'
import styles from './Composer.module.scss'

interface ComposerProps {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  isGenerating: boolean
  disabled: boolean
}

export default function Composer({
  draft,
  onDraftChange,
  onSend,
  onStop,
  isGenerating,
  disabled,
}: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.max(47, Math.min(input.scrollHeight, 160))}px`
  }, [draft])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (!isGenerating) onSend()
    }
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        if (!isGenerating) onSend()
      }}
    >
      <label className={styles.visuallyHidden} htmlFor="message-input">Message Jev</label>
      <textarea
        id="message-input"
        ref={inputRef}
        rows={1}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
      />
      <div className={styles.bottomRow}>
        <span />
        {isGenerating ? (
          <button className={styles.stopButton} type="button" onClick={onStop} aria-label="Stop generating">
            <span className={styles.stopIcon} aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button className={styles.sendButton} type="submit" disabled={disabled || !draft.trim()}>
            Send
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="m5 12 14-7-4 14-3-6-7-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="m12 13 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </form>
  )
}
