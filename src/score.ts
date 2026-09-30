import {
  diphthongs,
  isVowel,
  type Phone,
  phonemizeWord,
  stopPhones,
} from "./phonetics.js"
import { type PhraseEnding, shapePhrase, type WordProsody } from "./prosody.js"
import { normalizeSource, type SourceWord, sourceCues } from "./source.js"

export interface BabbleOptions {
  pitch?: number
  /** Vocal-resonance multiplier; 1 preserves the original timbre. */
  formant?: number
  /** Phrase pitch expression: 0 is flat, 1 modest, 3 theatrical. */
  intonation?: number
  speed?: number
  volume?: number
  /** Seconds removed from the word gap; above that gap, words audibly overlap. */
  overlap?: number
  /** 0 is crisp, 1 is soft; consonants remain present at either extreme. */
  softness?: number
}
export const defaultBabbleOptions = {
  pitch: 1.35,
  formant: 1,
  intonation: 1,
  speed: 1.5,
  volume: 0.55,
  overlap: 0,
  softness: 0.7,
}
export type ResolvedBabbleOptions = Required<BabbleOptions>
export type Segment = {
  phone: Phone
  duration: number
  stress: number
  release?: boolean
}
export type BabbleWord = {
  word: string
  at: number
  duration: number
  segments: Segment[]
  prosody: WordProsody
}
const bound = (
  value: number | undefined,
  fallback: number,
  low: number,
  high: number,
) => (Number.isFinite(value) ? Math.max(low, Math.min(high, value!)) : fallback)

export function resolveOptions(
  options: BabbleOptions = {},
): ResolvedBabbleOptions {
  return {
    pitch: bound(options.pitch, defaultBabbleOptions.pitch, 0.25, 4.5),
    formant: bound(options.formant, defaultBabbleOptions.formant, 0.25, 3.5),
    intonation: bound(
      options.intonation,
      defaultBabbleOptions.intonation,
      0,
      3,
    ),
    speed: bound(options.speed, defaultBabbleOptions.speed, 0.45, 2.8),
    volume: bound(options.volume, defaultBabbleOptions.volume, 0, 1),
    overlap: bound(options.overlap, 0, 0, 0.12),
    softness: bound(options.softness, defaultBabbleOptions.softness, 0, 1),
  }
}
function phoneDuration(phone: Phone) {
  if (phone in diphthongs) return 0.19
  if (isVowel(phone)) return phone === "AX" ? 0.095 : 0.145
  if (stopPhones.has(phone)) return 0.055
  if (["S", "Z", "SH", "ZH", "F", "TH", "CH", "JH"].includes(phone)) return 0.09
  return 0.075
}
const digits = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
]

/** One timed event per word. Pitch changes sound, never duration or word spacing. */
export function scoreBabble(
  text: string,
  input: BabbleOptions = {},
): BabbleWord[] {
  return scoreUtterance(text, input).words
}

export function scoreUtterance(text: string, input: BabbleOptions = {}) {
  const options = resolveOptions(input)
  const source = normalizeSource(text)
  const tokens = [
    ...source.normalized.matchAll(/[a-z]+(?:['’][a-z]+)?|\d|[.,!?;:…]+/g),
  ]
  const result: BabbleWord[] = []
  const spans: SourceWord[] = []
  let lastTokenEnd = 0
  let at = 0
  let phraseStart = 0
  for (const match of tokens) {
    if (at >= 30 || result.length >= 64) break
    const token = match[0]
    if (/^[.,!?;:…]+$/.test(token)) {
      // Keep the existing per-mark pauses, including three dots for an ellipsis.
      for (const mark of token)
        at += (/[.!?…]/.test(mark) ? 0.28 : 0.14) / options.speed
      let ending: PhraseEnding = ","
      if (token.includes("?")) ending = "?"
      else if (token.includes("!")) ending = "!"
      else if (token.includes("...") || token.includes("…")) ending = "…"
      else if (token.includes(".")) ending = "."
      shapePhrase(result, phraseStart, ending)
      phraseStart = result.length
      continue
    }
    const word = /^\d$/.test(token)
      ? digits[Number(token)]!
      : token.slice(0, 32)
    const phones = phonemizeWord(word)
    if (!phones.length) continue
    let nucleus = 0
    const segments: Segment[] = phones.map((phone) => {
      const vowel = isVowel(phone)
      const stress = vowel && nucleus++ > 0 ? 0.78 : 1
      return {
        phone,
        stress,
        duration: (phoneDuration(phone) * stress) / options.speed,
      }
    })
    if (stopPhones.has(phones[phones.length - 1]!) && nucleus > 0) {
      // A quiet connected release, not another full syllable: "bag-uh".
      segments.push({
        phone: "AX",
        duration: (0.025 + options.softness * 0.015) / options.speed,
        stress: 0.12 + options.softness * 0.1,
        release: true,
      })
    }
    let duration = segments.reduce((sum, segment) => sum + segment.duration, 0)
    const limit = Math.min(3, 30 - at)
    if (duration > limit) {
      for (const segment of segments) segment.duration *= limit / duration
      duration = limit
    }
    result.push({
      word,
      at,
      duration,
      segments,
      prosody: { start: 0, end: 1, ending: "", nucleusStart: 0, nucleusEnd: 1 },
    })
    lastTokenEnd = match.index + token.length
    spans.push({
      start: source.starts[match.index]!,
      end: source.ends[match.index + Math.min(token.length, 32) - 1]!,
      tokenEnd: source.ends[lastTokenEnd - 1]!,
    })
    at +=
      duration +
      0.06 / options.speed -
      Math.min(options.overlap, duration * 0.25)
  }
  shapePhrase(result, phraseStart, "")
  const nextWord = tokens.find(
    (match) => match.index >= lastTokenEnd && /^[a-z0-9]/.test(match[0]),
  )
  const limit = nextWord ? source.starts[nextWord.index]! : source.limit
  return { words: result, ...sourceCues(source.source, spans, limit) }
}
