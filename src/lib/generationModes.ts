export type GenerationMode = 'letter' | 'words250'

export const GENERATION_MODES: ReadonlyArray<{ value: GenerationMode; label: string }> = [
  { value: 'letter', label: 'Letter by letter' },
  { value: 'words250', label: 'With 250 Words' },
]

export function isWordMode(value: unknown): value is 'words250' {
  return value === 'words250'
}

export function isGenerationMode(value: unknown): value is GenerationMode {
  return value === 'letter' || isWordMode(value)
}
