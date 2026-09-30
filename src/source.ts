/** UTF-16 source offsets survive normalization, including decomposed accents. */
export function normalizeSource(input: string) {
  const source = input.slice(0, 1024)
  let normalized = ""
  let offset = 0
  const starts: number[] = []
  const ends: number[] = []
  for (const character of source) {
    const folded = character
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
    // Regex offsets count UTF-16 units, not Unicode code points.
    for (let i = 0; i < folded.length; i++) {
      starts.push(offset)
      ends.push(offset + character.length)
    }
    if (!folded && ends.length)
      ends[ends.length - 1] = offset + character.length
    normalized += folded
    offset += character.length
  }
  normalized = normalized.slice(0, 240)
  return {
    source,
    normalized,
    starts,
    ends,
    limit: ends[normalized.length - 1] ?? 0,
  }
}

export type SourceWord = { start: number; end: number; tokenEnd: number }
export type BabbleTextCue = {
  /** Complete source word plus its adjacent spacing/punctuation. */
  text: string
  /** First scored word in this source word (a number can contain several). */
  wordIndex: number
}

export function sourceCues(source: string, words: SourceWord[], limit: number) {
  let text = ""
  let cursor = 0
  const positions: { start: number; end: number }[] = []
  for (const word of words) {
    positions.push({
      start: text.length + word.start - cursor,
      end: text.length + word.end - cursor,
    })
    text += source.slice(cursor, word.end)
    // A 32-letter synthesis limit must not reveal an unspoken word suffix.
    cursor = word.tokenEnd
  }
  if (!words.length) return { text: "", cues: [] as BabbleTextCue[] }
  text += source.slice(cursor, limit)
  const groups: { start: number; wordIndex: number }[] = []
  for (const [wordIndex, position] of positions.entries()) {
    const previousEnd = positions[wordIndex - 1]?.end ?? 0
    const gap = text.slice(previousEnd, position.start)
    // Adjacent digits belong to one displayed number; sentence punctuation
    // must never expose the next clause, even when no space follows it.
    if (wordIndex > 0 && /^[\p{L}\p{M}]*$/u.test(gap)) continue
    let start = position.start
    while (start > previousEnd && /["'“‘([{¡¿]/.test(text[start - 1]!)) start--
    groups.push({ start, wordIndex })
  }
  return {
    text,
    cues: groups.map((group, index) => ({
      text: text.slice(index === 0 ? 0 : group.start, groups[index + 1]?.start),
      wordIndex: group.wordIndex,
    })),
  }
}
