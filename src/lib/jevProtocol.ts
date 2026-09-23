import type { ChatTurn, NextCharacterResponse } from '../types.ts'
import type { PromptFields } from './promptProfiles.ts'
import { DEFAULT_PROMPTS } from './promptProfiles.ts'

export const TYPE_SAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
export const MODEL = 'jev-latest'

const ENGLISH_LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const TURKISH_LOWERCASE = 'abcçdefgğhıijklmnoöprsştuüvyz'
const DIGITS = '0123456789'
const PUNCTUATION = '.,?!'

function uniqueCharacters(...alphabets: string[]): string[] {
  return [...new Set(alphabets.join(''))]
}

export const CHARACTERS = [
  ...uniqueCharacters(ENGLISH_LOWERCASE, TURKISH_LOWERCASE),
  ...DIGITS,
  ...PUNCTUATION,
]
export const SPACE_CHOICE = 'SPACE'
export const STOP_CHOICE = 'STOP'

const criteria: Record<string, string | null> = Object.fromEntries(
  CHARACTERS.map((character) => [character, null]),
)
criteria[SPACE_CHOICE] = 'One word separator. Choose only after a fully spelled word when another necessary word follows. Never use inside a word or as a pause.'
criteria[STOP_CHOICE] = 'The written answer already satisfies the user. End it now without appending anything.'

export const CHOICES: Readonly<Record<string, string | null>> = Object.freeze(criteria)

export function createEvaluationRequest(history: ChatTurn[], partialResponse: string, prompts: PromptFields = DEFAULT_PROMPTS.letter) {
  return {
    model: MODEL,
    state: {
      task: prompts.system,
      conversation: history,
      response_so_far: partialResponse,
    },
    questions: {
      next_character: {
        type: 'choice',
        instructions: prompts.decision,
        criteria: CHOICES,
      },
    },
  } as const
}

export function decodeChoice(value: unknown): NextCharacterResponse | null {
  if (typeof value !== 'string' || !Object.hasOwn(CHOICES, value)) return null
  if (value === STOP_CHOICE) return { type: 'stop' }
  return { type: 'character', value: value === SPACE_CHOICE ? ' ' : value }
}

const REVIEW_CHOICES = Object.freeze({
  KEEP: 'This exact character is correct in the final answer.',
  CHANGE: 'This exact character should be replaced with one other offered character.',
})

const REPLACEMENT_CHOICES = Object.freeze(
  Object.fromEntries([
    ...CHARACTERS.map((character) => [character, null] as const),
    [SPACE_CHOICE, 'Replace with exactly one space only if it belongs here.'] as const,
  ]),
)

function recheckState(history: ChatTurn[], answer: string, index: number, prompts: PromptFields) {
  const characters = [...answer]
  return {
    task: prompts.system,
    conversation: history,
    answer,
    character_index: index,
    character_number: index + 1,
    character_count: characters.length,
    character_at_index: characters[index],
    text_before_character: characters.slice(0, index).join(''),
    text_after_character: characters.slice(index + 1).join(''),
  }
}

export function createReviewRequest(history: ChatTurn[], answer: string, index: number, prompts: PromptFields = DEFAULT_PROMPTS.letter) {
  return {
    model: MODEL,
    state: recheckState(history, answer, index, prompts),
    questions: {
      review_character: {
        type: 'choice',
        instructions: prompts.review ?? DEFAULT_PROMPTS.letter.review!,
        criteria: REVIEW_CHOICES,
      },
    },
  } as const
}

export function createReplacementRequest(history: ChatTurn[], answer: string, index: number, prompts: PromptFields = DEFAULT_PROMPTS.letter) {
  return {
    model: MODEL,
    state: recheckState(history, answer, index, prompts),
    questions: {
      replacement_character: {
        type: 'choice',
        instructions: prompts.replacement ?? DEFAULT_PROMPTS.letter.replacement!,
        criteria: REPLACEMENT_CHOICES,
      },
    },
  } as const
}

export function decodeReviewChoice(value: unknown): 'keep' | 'change' | null {
  if (value === 'KEEP') return 'keep'
  if (value === 'CHANGE') return 'change'
  return null
}

export function decodeReplacementChoice(value: unknown): string | null {
  if (typeof value !== 'string' || !Object.hasOwn(REPLACEMENT_CHOICES, value)) return null
  return value === SPACE_CHOICE ? ' ' : value
}
