import { useEffect, useState } from 'react'
import { DEFAULT_PROFILES, PROMPT_MODES, profileForMode, resolveProfile, type PromptFields, type PromptMode, type PromptProfile } from '../lib/promptProfiles'
import styles from './SettingsDialog.module.scss'

interface Props {
  profiles: PromptProfile[]
  selections: Partial<Record<PromptMode, string>>
  onChange: (profiles: PromptProfile[], selections: Partial<Record<PromptMode, string>>) => void
}

export default function PromptProfilesSettings({ profiles, selections, onChange }: Props) {
  const [mode, setMode] = useState<PromptMode>('letter')
  const selectedId = selections[mode] ?? profileForMode(mode).id
  const selected = resolveProfile(selectedId, profiles)
  const [draft, setDraft] = useState<PromptProfile>(selected)
  const isDefault = selected.id.startsWith('default:')

  useEffect(() => { setDraft(selected) }, [selected.id, profiles])

  function changeField(field: keyof PromptFields, value: string) {
    setDraft((current) => ({ ...current, prompts: { ...current.prompts, [field]: value } }))
  }

  function createProfile() {
    const profile: PromptProfile = {
      id: crypto.randomUUID(),
      name: `${PROMPT_MODES.find((item) => item.value === mode)?.label} custom`,
      mode,
      prompts: { ...draft.prompts },
    }
    onChange([...profiles, profile], { ...selections, [mode]: profile.id })
    setDraft(profile)
  }

  function saveProfile() {
    if (isDefault || !draft.name.trim() || !draft.prompts.system.trim() || !draft.prompts.decision.trim()) return
    onChange(profiles.map((profile) => profile.id === draft.id ? { ...draft, name: draft.name.trim() } : profile), selections)
  }

  function deleteProfile() {
    if (isDefault) return
    onChange(profiles.filter((profile) => profile.id !== selected.id), { ...selections, [mode]: profileForMode(mode).id })
  }

  return (
    <section className={styles.promptsSection} aria-labelledby="prompts-section-title">
      <h3 id="prompts-section-title">Prompt profiles</h3>
      <p>Default instructions are read-only. Create a profile for your own system prompt and decision instructions. The selected profile is used for new replies.</p>
      <label htmlFor="prompt-method">Method</label>
      <select id="prompt-method" value={mode} onChange={(event) => setMode(event.target.value as PromptMode)}>
        {PROMPT_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <label htmlFor="prompt-profile">Profile</label>
      <select id="prompt-profile" value={selectedId} onChange={(event) => onChange(profiles, { ...selections, [mode]: event.target.value })}>
        {DEFAULT_PROFILES.filter((profile) => profile.mode === mode).concat(profiles.filter((profile) => profile.mode === mode)).map((profile) =>
          <option key={profile.id} value={profile.id}>{profile.name}</option>)}
      </select>
      <div className={styles.promptActions}>
        <button type="button" onClick={createProfile}>New profile</button>
        {!isDefault && <button type="button" onClick={deleteProfile}>Delete profile</button>}
      </div>
      <label htmlFor="prompt-name">Profile name</label>
      <input id="prompt-name" value={draft.name} maxLength={80} readOnly={isDefault} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      <label htmlFor="prompt-system">System prompt / state task</label>
      <textarea id="prompt-system" value={draft.prompts.system} maxLength={8000} readOnly={isDefault} onChange={(event) => changeField('system', event.target.value)} />
      <label htmlFor="prompt-decision">Next choice instructions</label>
      <textarea id="prompt-decision" value={draft.prompts.decision} maxLength={8000} readOnly={isDefault} onChange={(event) => changeField('decision', event.target.value)} />
      <>
        <label htmlFor="prompt-review">{mode === 'letter' ? 'Character' : 'Word'} review instructions</label>
        <textarea id="prompt-review" value={draft.prompts.review ?? ''} maxLength={8000} readOnly={isDefault} onChange={(event) => changeField('review', event.target.value)} />
        <label htmlFor="prompt-replacement">{mode === 'letter' ? 'Character' : 'Word'} replacement instructions</label>
        <textarea id="prompt-replacement" value={draft.prompts.replacement ?? ''} maxLength={8000} readOnly={isDefault} onChange={(event) => changeField('replacement', event.target.value)} />
      </>
      {!isDefault && <button className={styles.saveButton} type="button" onClick={saveProfile} disabled={!draft.name.trim() || !draft.prompts.system.trim() || !draft.prompts.decision.trim()}>Save profile</button>}
    </section>
  )
}
