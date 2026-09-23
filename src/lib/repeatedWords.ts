export function hasThreeRepeatedTailWords(text: string, includeUnterminatedLastWord = false): boolean {
  const hasWordBoundary = /[\s.,?!]$/.test(text)
  if (!includeUnterminatedLastWord && !hasWordBoundary) return false

  const words = text.trimEnd().toLowerCase().replace(/\u0130/g, 'i').split(/\s+/).filter(Boolean)
    .map((word) => word.replace(/[.,?!]+$/g, ''))
    .filter(Boolean)
  if (words.length < 3) return false
  const tail = words.slice(-3)
  return tail[0] === tail[1] && tail[1] === tail[2]
}

export function hasThreeConsecutiveSpaces(text: string): boolean {
  return / {3}/.test(text)
}
