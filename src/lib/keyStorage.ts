const STORAGE_KEY = 'jev-talks:typesafe-key'

export function readPersonalKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function savePersonalKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim())
}

export function clearPersonalKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}
