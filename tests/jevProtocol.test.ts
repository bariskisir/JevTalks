import { describe, expect, it } from 'vitest'
import {
  CHARACTERS,
  CHOICES,
  MODEL,
  createEvaluationRequest,
  decodeChoice,
} from '../src/lib/jevProtocol'

describe('Jev choices', () => {
  it('contains lowercase English and Turkish letters once, digits, limited punctuation, space and stop', () => {
    const englishLowercase = 'abcdefghijklmnopqrstuvwxyz'
    const turkishLowercase = 'abcçdefgğhıijklmnoöprsştuüvyz'

    for (const character of [
      ...englishLowercase,
      ...turkishLowercase,
      ...'0123456789.,?!',
    ]) {
      expect(CHARACTERS).toContain(character)
    }

    expect(CHARACTERS).toHaveLength(46)
    expect(new Set(CHARACTERS).size).toBe(46)
    expect(Object.keys(CHOICES)).toHaveLength(48)
    expect(CHARACTERS).toEqual(expect.arrayContaining(['ı', 'i', 'ş', 'ü']))
    expect(CHARACTERS).not.toContain('A')
    expect(CHARACTERS).not.toContain(';')
  })

  it('maps only offered choices to characters or stop', () => {
    expect(decodeChoice('SPACE')).toEqual({ type: 'character', value: ' ' })
    expect(decodeChoice('STOP')).toEqual({ type: 'stop' })
    expect(decodeChoice('ş')).toEqual({ type: 'character', value: 'ş' })
    expect(decodeChoice('unsupported')).toBeNull()
  })

  it('sends the entire ordered conversation and current response prefix', () => {
    const history = [
      { role: 'user' as const, content: 'Merhaba' },
      { role: 'assistant' as const, content: 'Selam!' },
      { role: 'user' as const, content: 'Nasılsın?' },
    ]
    const request = createEvaluationRequest(history, 'İyi')

    expect(request.model).toBe(MODEL)
    expect(request.state.conversation).toEqual(history)
    expect(request.state.response_so_far).toBe('İyi')
    expect(request.questions.next_character.type).toBe('choice')
    expect(request.questions.next_character.criteria).toBe(CHOICES)
    expect(request.questions.next_character.instructions).toContain('appends your character')
    expect(request.questions.next_character.instructions).toContain('updated answer')
    expect(request.questions.next_character.instructions).toContain('STOP appends nothing')
    expect(request.questions.next_character.instructions).toContain('Use SPACE only when')
  })
})
