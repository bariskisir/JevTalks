import type { GenerationMode } from './generationModes'

export type PromptMode = GenerationMode
export const PROMPT_MODES: ReadonlyArray<{ value: PromptMode; label: string }> = [
  { value: 'letter', label: 'Letter by letter' },
  { value: 'words250', label: 'With 250 Words' },
]

export interface PromptFields {
  system: string
  decision: string
  review?: string
  replacement?: string
}

export interface PromptProfile {
  id: string
  name: string
  mode: PromptMode
  prompts: PromptFields
}

const STORAGE_KEY = 'jev-talks:prompt-profiles:v1'

const letterSystem = [
  'You are Jev, the assistant in this conversation. Read the conversation in order and answer the latest user message using earlier turns where relevant. Give the shortest useful answer in the user\'s language. Keep the same topic and meaning throughout the answer. Use natural, correctly spelled words and complete sentences when needed.',
  'The application builds your answer through repeated single-character choices. Every request contains the full conversation and response_so_far, which is the answer already written. A chosen character is appended to it. SPACE appends one space. STOP ends the answer without adding text. The next request contains the updated response_so_far. You have no hidden memory between requests, so decide from the supplied conversation and written answer each time.',
  'Only lowercase English and Turkish letters, digits, period, comma, question mark, exclamation mark, SPACE, and STOP are offered. Write in lowercase and use only those characters. Do not mention this process to the user.',
].join('\n\n')
const letterDecision = [
  'Choose exactly one offered option by following this order:',
  '1. Read the latest user message, relevant earlier conversation, and response_so_far. Treat response_so_far as the answer you are already writing, not as a new message. Continue its meaning and grammar. Never restart or repeat it.',
  '2. If response_so_far already answers the user completely, choose STOP. STOP appends nothing. Do not add filler or another sentence after a complete answer.',
  '3. Otherwise decide what the next complete word or punctuation mark must be, then choose only its very next character. If a word has begun, finish that same word with correct spelling before starting another. Do not choose a letter merely because it is related to the topic.',
  '4. Use SPACE only when the current word is finished and a specific next word is necessary for the answer. SPACE is a word separator, never a pause or a substitute for an unknown letter. Do not put SPACE inside a word, before punctuation, at the beginning or end, or after another space.',
  'The application appends your character and asks again with the updated answer. Return only one offered option; do not write the answer or explain the decision.',
].join('\n\n')
const wordsSystem = 'You are Jev. Answer the latest user message helpfully and concisely in English, considering every earlier user and assistant turn. The application constructs your reply one whole word at a time. The complete list of 250 common English words is included in this system task and all 250 words are offered as choices on every generation request. The full conversation and response_so_far are supplied each time. Choose only a listed word that advances the answer, or STOP only after the complete reply is written.'
const wordsDecision = 'Choose exactly one next word that makes the complete reply coherent and relevant, or choose STOP when the complete answer is already present in response_so_far. The application appends your chosen word, adds one space between words, and asks again with the same complete conversation and longer response_so_far. Never repeat or restart response_so_far. Choose only one of the offered 250 words or STOP. No punctuation choices are available.'

export const DEFAULT_PROMPTS: Readonly<Record<PromptMode, PromptFields>> = Object.freeze({
  letter: {
    system: letterSystem,
    decision: letterDecision,
    review: 'The answer has reached STOP. Inspect character_at_index in the full answer and conversation. Choose KEEP if it belongs there. Choose CHANGE only when replacing that one character improves spelling, grammar, spacing, punctuation, or meaning. Every character is reviewed in order; do not rewrite other positions.',
    replacement: 'You selected CHANGE. Choose exactly one offered replacement character for character_at_index. Every other character remains unchanged. SPACE is valid only if one space belongs here. Choose the character that best fits the whole answer and conversation. Do not continue generating.',
  },
  words250: {
    system: wordsSystem,
    decision: wordsDecision,
    review: 'Review word_at_index in the complete answer and conversation. Choose KEEP if this word fits. Choose CHANGE only if a replacement would improve the answer. Preserve every other word. You may keep the word unchanged whenever it is already the best choice.',
    replacement: 'Choose exactly one offered word for word_at_index. Keep every other word in place. The current word is an allowed choice; select it again if it remains the best word in context.',
  },
})

export const DEFAULT_PROFILES: ReadonlyArray<PromptProfile> = PROMPT_MODES.map(({ value, label }) => ({
  id: `default:${value}`, name: `${label} (default)`, mode: value, prompts: DEFAULT_PROMPTS[value],
}))

export function promptModeForGeneration(mode: GenerationMode): PromptMode {
  return mode
}

export function profileForMode(mode: GenerationMode | PromptMode): PromptProfile {
  return DEFAULT_PROFILES.find((profile) => profile.mode === mode)!
}

export function isPromptFields(value: unknown): value is PromptFields {
  if (typeof value !== 'object' || value === null) return false
  const fields = value as Record<string, unknown>
  return typeof fields.system === 'string' && fields.system.trim().length > 0 && fields.system.length <= 8000
    && typeof fields.decision === 'string' && fields.decision.trim().length > 0 && fields.decision.length <= 8000
    && (fields.review === undefined || typeof fields.review === 'string' && fields.review.length <= 8000)
    && (fields.replacement === undefined || typeof fields.replacement === 'string' && fields.replacement.length <= 8000)
}

export function loadCustomProfiles(): PromptProfile[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.flatMap((item): PromptProfile[] => {
      if (typeof item !== 'object' || item === null) return []
      const record = item as Record<string, unknown>
      const mode = record.mode === 'wordlist' ? 'words250' : record.mode
      if (typeof record.id !== 'string' || record.id.length > 100 || record.id.startsWith('default:')
        || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 80
        || (mode !== 'letter' && mode !== 'words250') || !isPromptFields(record.prompts)) return []
      return [{ id: record.id, name: record.name, mode, prompts: record.prompts }]
    }).slice(0, 100)
  } catch { return [] }
}

export function saveCustomProfiles(profiles: PromptProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

export function resolveProfile(id: string, profiles: PromptProfile[]): PromptProfile {
  return DEFAULT_PROFILES.find((profile) => profile.id === id)
    ?? profiles.find((profile) => profile.id === id)
    ?? DEFAULT_PROFILES[0]
}
