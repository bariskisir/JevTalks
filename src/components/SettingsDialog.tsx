import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Eye, EyeOff, FileText, Info, KeyRound, Moon, Palette, Sun, X } from 'lucide-react'
import PromptProfilesSettings from './PromptProfilesSettings'
import type { PromptMode, PromptProfile } from '../lib/promptProfiles'
import { version } from '../../package.json'
import styles from './SettingsDialog.module.scss'

type SettingsSection = 'api' | 'prompts' | 'theme' | 'about'

interface SettingsDialogProps {
  required: boolean
  personalKey: string
  serverKeyAvailable: boolean
  storageError: string
  theme: 'dark' | 'light'
  customProfiles: PromptProfile[]
  profileSelections: Partial<Record<PromptMode, string>>
  onProfilesChange: (profiles: PromptProfile[], selections: Partial<Record<PromptMode, string>>) => void
  onThemeChange: (theme: 'dark' | 'light') => void
  onSave: (key: string) => void
  onClear: () => void
  onClose: () => void
}

export default function SettingsDialog({
  required,
  personalKey,
  serverKeyAvailable,
  storageError,
  theme,
  customProfiles,
  profileSelections,
  onProfilesChange,
  onThemeChange,
  onSave,
  onClear,
  onClose,
}: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>('api')
  const [key, setKey] = useState(personalKey)
  const [showKey, setShowKey] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (section === 'api') inputRef.current?.focus()
  }, [section])

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave(key)
  }

  return (
    <div className={styles.overlay} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !required) onClose()
    }}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={(event) => { if (event.key === 'Escape' && !required) onClose() }}
      >
        <div className={styles.heading}>
          <h2 id="settings-title">{required ? 'Connect to Jev' : 'Settings'}</h2>
          {!required && <button type="button" aria-label="Close settings" onClick={onClose}><X size={18} /></button>}
        </div>
        <div className={styles.layout}>
          <nav className={styles.navigation} aria-label="Settings sections">
            <button type="button" className={section === 'api' ? styles.active : ''} aria-current={section === 'api' ? 'page' : undefined} onClick={() => setSection('api')}><KeyRound size={17} />API key</button>
            <button type="button" className={section === 'prompts' ? styles.active : ''} aria-current={section === 'prompts' ? 'page' : undefined} onClick={() => setSection('prompts')}><FileText size={17} />Prompts</button>
            <button type="button" className={section === 'theme' ? styles.active : ''} aria-current={section === 'theme' ? 'page' : undefined} onClick={() => setSection('theme')}><Palette size={17} />Theme</button>
            <button type="button" className={section === 'about' ? styles.active : ''} aria-current={section === 'about' ? 'page' : undefined} onClick={() => setSection('about')}><Info size={17} />About</button>
          </nav>
          <div className={styles.panel}>
            {section === 'api' && (
              <section aria-labelledby="api-section-title">
                <h3 id="api-section-title">TypeSafe API key</h3>
                <p>{required ? 'Enter a TypeSafe API key to start chatting. It stays in this browser.' : 'Your personal key takes priority over the shared server key and stays in this browser.'}</p>
                <form onSubmit={handleSave}>
                  <label htmlFor="typesafe-key">TypeSafe API key</label>
                  <div className={styles.keyInput}>
                    <input
                      id="typesafe-key"
                      ref={inputRef}
                      type={showKey ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={key}
                      onChange={(event) => setKey(event.target.value)}
                      placeholder="Paste your API key"
                      required
                    />
                    <button type="button" aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey((visible) => !visible)}>
                      {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {storageError && <div className={styles.error} role="alert">{storageError}</div>}
                  <div className={styles.keyActions}>
                    {personalKey && <button className={styles.removeButton} type="button" onClick={() => { setKey(''); onClear() }}>{serverKeyAvailable ? 'Use server key' : 'Remove saved key'}</button>}
                    <button className={styles.saveButton} type="submit" disabled={!key.trim() || key.trim() === personalKey}>Save key</button>
                  </div>
                </form>
              </section>
            )}
            {section === 'theme' && (
              <section aria-labelledby="theme-section-title">
                <h3 id="theme-section-title">Theme</h3>
                <p>Choose how Jev Talks looks on this device.</p>
                <div className={styles.themeOptions}>
                  <button type="button" aria-pressed={theme === 'dark'} onClick={() => onThemeChange('dark')}><Moon size={19} />Dark</button>
                  <button type="button" aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}><Sun size={19} />Light</button>
                </div>
              </section>
            )}
            {section === 'prompts' && <PromptProfilesSettings profiles={customProfiles} selections={profileSelections} onChange={onProfilesChange} />}
            {section === 'about' && (
              <section aria-labelledby="about-section-title">
                <div className={styles.aboutHero}>
                  <img className={styles.aboutIcon} src="/logo.svg" alt="" />
                  <h3 id="about-section-title">Jev Talks</h3>
                  <p>Every character starts with a decision.</p>
                  <span className={styles.version}>v{version}</span>
                </div>
                <div className={styles.aboutDetails}>
                  <p>Jev Talks turns a decision model into a character-by-character chat. Jev chooses each next character until it selects STOP.</p>
                  <div className={styles.aboutLinkRow}>
                    <div><strong>Website</strong><span>bariskisir.com</span></div>
                    <a href="https://www.bariskisir.com/" target="_blank" rel="noopener noreferrer" aria-label="Open website"><ExternalLink size={17} /></a>
                  </div>
                  <div className={styles.aboutLinkRow}>
                    <div><strong>Source code</strong><span>bariskisir/JevTalks</span></div>
                    <a href="https://github.com/bariskisir/JevTalks" target="_blank" rel="noopener noreferrer" aria-label="Open source code"><ExternalLink size={17} /></a>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
