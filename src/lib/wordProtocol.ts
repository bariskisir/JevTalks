import words from '../../api/data/common-words.json' with { type: 'json' }
import type { ChatTurn } from '../types.ts'
import { DEFAULT_PROMPTS, type PromptFields } from './promptProfiles.ts'
import { MODEL } from './jevProtocol.ts'

const COMMON_WORDS = words as string[]

export function getWords(): string[] {
  return COMMON_WORDS
}

function wordCriteria(includeStop: boolean) {
  return Object.freeze({
    ...Object.fromEntries(COMMON_WORDS.map((word) => [word, null])),
    ...(includeStop ? { STOP: 'The complete answer is already present in response_so_far. End generation without adding another word.' } : {}),
  })
}

function systemTask(prompts: PromptFields): string {
  return `${prompts.system}\n\nThe complete 250 common word list (select only these exact words): ${COMMON_WORDS.join(', ')}`
}

export function createWordEvaluationRequest(history: ChatTurn[], partialResponse: string, prompts: PromptFields = DEFAULT_PROMPTS.words250) {
  return {
    model: MODEL,
    state: {
      task: systemTask(prompts),
      conversation: history,
      response_so_far: partialResponse,
      word_count_available: COMMON_WORDS.length,
    },
    questions: {
      next_word: { type: 'choice', instructions: prompts.decision, criteria: wordCriteria(true) },
    },
  } as const
}

const REVIEW_CHOICES = Object.freeze({
  KEEP: 'This exact word is correct in the final answer.',
  CHANGE: 'This exact word should be replaced with one offered word.',
})

function wordReviewState(history: ChatTurn[], answer: string, index: number, prompts: PromptFields) {
  const answerWords = answer.split(' ')
  return {
    task: systemTask(prompts),
    conversation: history,
    answer,
    word_at_index: answerWords[index],
    word_index: index,
    word_number: index + 1,
    word_count: answerWords.length,
    words_before: answerWords.slice(0, index).join(' '),
    words_after: answerWords.slice(index + 1).join(' '),
  }
}

export function createWordReviewRequest(history: ChatTurn[], answer: string, index: number, prompts: PromptFields = DEFAULT_PROMPTS.words250) {
  return {
    model: MODEL,
    state: wordReviewState(history, answer, index, prompts),
    questions: {
      review_word: { type: 'choice', instructions: prompts.review ?? DEFAULT_PROMPTS.words250.review!, criteria: REVIEW_CHOICES },
    },
  } as const
}

export function createWordReplacementRequest(history: ChatTurn[], answer: string, index: number, prompts: PromptFields = DEFAULT_PROMPTS.words250) {
  return {
    model: MODEL,
    state: wordReviewState(history, answer, index, prompts),
    questions: {
      replacement_word: { type: 'choice', instructions: prompts.replacement ?? DEFAULT_PROMPTS.words250.replacement!, criteria: wordCriteria(false) },
    },
  } as const
}

export function decodeWordChoice(value: unknown): string | null {
  return typeof value === 'string' && COMMON_WORDS.includes(value) ? value : null
}
