import { isVowel } from "./phonetics.js"
import type { BabbleWord } from "./score.js"

export type PhraseEnding = "" | "." | "?" | "!" | "," | "…"
export type WordProsody = {
  /** This word's interval in the phrase's normalized articulation time. */
  start: number
  end: number
  ending: PhraseEnding
  /** Last full vowel in normalized word time; quiet stop releases are excluded. */
  nucleusStart: number
  nucleusEnd: number
}

/** Phrase metadata stays small, deterministic and independent of absolute onset. */
export function shapePhrase(
  words: BabbleWord[],
  from: number,
  ending: PhraseEnding,
) {
  let duration = 0
  for (let i = from; i < words.length; i++) duration += words[i]!.duration
  let elapsed = 0
  let finalVoicedWord: BabbleWord | undefined
  for (let i = from; i < words.length; i++) {
    const word = words[i]!
    word.prosody.start = elapsed / duration
    elapsed += word.duration
    word.prosody.end = elapsed / duration
    let time = 0
    for (const segment of word.segments) {
      if (isVowel(segment.phone) && !segment.release) {
        word.prosody.nucleusStart = time / word.duration
        word.prosody.nucleusEnd = (time + segment.duration) / word.duration
        finalVoicedWord = word
      }
      time += segment.duration
    }
  }
  if (finalVoicedWord) finalVoicedWord.prosody.ending = ending
}

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** Original stylized English contours in semitones around the chosen base pitch. */
export function pitchRatio(
  prosody: WordProsody,
  position: number,
  amount: number,
) {
  if (amount === 0) return 1
  const phrase = prosody.start + (prosody.end - prosody.start) * position
  const arc = 0.6 * Math.sin(2 * Math.PI * phrase)
  const vowel =
    (position - prosody.nucleusStart) /
    Math.max(0.0001, prosody.nucleusEnd - prosody.nucleusStart)
  const rise = smooth((vowel - 0.15) / 0.75)
  let ending = 0
  switch (prosody.ending) {
    case "?":
      ending = 2.8 * rise
      break
    case ".":
      ending = -1.35 * rise
      break
    case ",":
      ending = 0.7 * rise
      break
    case "…":
      ending = -2.1 * smooth(vowel)
      break
    case "!":
      ending = 2.4 * smooth(vowel / 0.4) - 3 * smooth((vowel - 0.4) / 0.6)
      break
  }
  return 2 ** (((arc + ending) * amount) / 12)
}
