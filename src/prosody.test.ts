import { expect, test } from "bun:test"
import { pitchRatio } from "./prosody.js"
import { resolveOptions, scoreBabble } from "./score.js"
import { synthesizeWord, VOICE_SAMPLE_RATE } from "./voice.js"

const finalWord = (ending: string, speed = 1) =>
  scoreBabble(`You found the bag${ending}`, { speed }).at(-1)!
const vowelPosition = (word: ReturnType<typeof finalWord>, progress: number) =>
  word.prosody.nucleusStart +
  (word.prosody.nucleusEnd - word.prosody.nucleusStart) * progress

test("intonation defaults to modest, clamps its own range and leaves other controls alone", () => {
  expect(resolveOptions().intonation).toBe(1)
  expect(resolveOptions({ intonation: Number.NaN }).intonation).toBe(1)
  expect(
    resolveOptions({ intonation: Number.POSITIVE_INFINITY }).intonation,
  ).toBe(1)
  expect(resolveOptions({ intonation: -1 }).intonation).toBe(0)
  expect(resolveOptions({ intonation: 4 }).intonation).toBe(3)
  const baseline = resolveOptions({
    pitch: 3.5,
    formant: 0.4,
    speed: 2,
    volume: 0.2,
  })
  const expressive = resolveOptions({ ...baseline, intonation: 3 })
  expect({ ...expressive, intonation: 1 }).toEqual(baseline)
  expect(scoreBabble("You found the bag?", expressive)).toEqual(
    scoreBabble("You found the bag?", { ...expressive, intonation: 0 }),
  )
})

test("zero is completely flat, while expression scales deviations in semitones", () => {
  for (const ending of ["", ".", "?", "!", ",", "…"]) {
    const word = finalWord(ending)
    for (let i = 0; i <= 100; i++) {
      const position = i / 100
      expect(pitchRatio(word.prosody, position, 0)).toBe(1)
      const modest = pitchRatio(word.prosody, position, 1)
      const theatrical = pitchRatio(word.prosody, position, 3)
      expect(Math.log2(theatrical)).toBeCloseTo(Math.log2(modest) * 3, 12)
      expect(theatrical).toBeGreaterThan(0.6)
      expect(theatrical).toBeLessThan(2)
      // No note jumps at the vowel/ending transition or after the vowel.
      expect(
        Math.abs(pitchRatio(word.prosody, position + 0.00001, 3) - theatrical),
      ).toBeLessThan(0.001)
    }
    const options = resolveOptions({ intonation: 0 })
    expect(synthesizeWord(word, options)).toEqual(
      synthesizeWord(finalWord("."), options),
    )
  }
})

test("punctuation acts on the final full vowel, with distinct question, statement and energetic endings", () => {
  const ratio = (ending: string, progress: number) => {
    const word = finalWord(ending)
    return pitchRatio(word.prosody, vowelPosition(word, progress), 1)
  }
  expect(ratio("?", 0.85)).toBeGreaterThan(ratio("?", 0.2) * 1.1)
  expect(ratio(".", 0.85)).toBeLessThan(ratio(".", 0.2) * 0.97)
  expect(ratio("!", 0.4)).toBeGreaterThan(ratio("?", 0.4))
  expect(ratio("!", 0.4)).toBeGreaterThan(ratio("!", 1))
  expect(ratio(",", 0.85)).toBeGreaterThan(ratio("", 0.85))
  expect(ratio("…", 0.85)).toBeLessThan(ratio(".", 0.85))
  const bag = finalWord("?")
  const releaseDuration = bag.segments.at(-1)!.duration
  expect(bag.prosody.nucleusEnd * bag.duration).toBeLessThan(
    bag.duration - releaseDuration,
  )
  const cheese = scoreBabble("cheese?")[0]!
  expect(cheese.segments.at(-1)!.phone).toBe("S")
  expect(cheese.prosody.nucleusEnd).toBeLessThan(1)
})

test("phrase arcs continue across words, and a final question does not raise earlier words", () => {
  const statement = scoreBabble("You found the bag.")
  const question = scoreBabble("You found the bag?")
  const options = resolveOptions()
  expect(statement.slice(0, -1)).toEqual(question.slice(0, -1))
  expect(synthesizeWord(statement[0]!, options)).toEqual(
    synthesizeWord(question[0]!, options),
  )
  for (let i = 1; i < question.length; i++) {
    expect(question[i]!.prosody.start).toBeCloseTo(question[i - 1]!.prosody.end)
    expect(pitchRatio(question[i - 1]!.prosody, 1, 1)).toBeCloseTo(
      pitchRatio(question[i]!.prosody, 0, 1),
      10,
    )
  }
  expect(pitchRatio(question[0]!.prosody, 0.8, 1)).not.toBe(1)
})

test("clause boundaries reset the arc, ellipses retain their pause, and speed does not change the contour", () => {
  const phrase = "Hello, you found the bag… Nice! You found it?"
  const words = scoreBabble(phrase, { speed: 1 })
  expect(
    words
      .filter((word) => word.prosody.ending)
      .map((word) => word.prosody.ending),
  ).toEqual([",", "…", "!", "?"])
  for (let i = 1; i < words.length; i++) {
    if (words[i - 1]!.prosody.ending) expect(words[i]!.prosody.start).toBe(0)
  }
  expect(scoreBabble("bag… nice")).toEqual(scoreBabble("bag... nice"))
  const ellipsis = scoreBabble("bag… nice", { speed: 1 })
  expect(ellipsis[1]!.at - ellipsis[0]!.duration).toBeCloseTo(0.06 + 0.84)
  const slow = scoreBabble(phrase, { speed: 0.45 })
  const fast = scoreBabble(phrase, { speed: 2.8 })
  for (let i = 0; i < slow.length; i++) {
    expect(slow[i]!.segments.map((segment) => segment.phone)).toEqual(
      fast[i]!.segments.map((segment) => segment.phone),
    )
    for (const position of [0, 0.3, 0.7, 1])
      expect(pitchRatio(slow[i]!.prosody, position, 3)).toBeCloseTo(
        pitchRatio(fast[i]!.prosody, position, 3),
        10,
      )
  }
  // Repeated punctuation cannot leak a previous phrase's ending into the next.
  expect(
    scoreBabble("?! Hello?! Bag").map((word) => word.prosody.ending),
  ).toEqual(["?", ""])
})

test("rendered PCM rises for questions and falls for statements inside the final voiced span", () => {
  const measuredPitch = (ending: string, progress: number) => {
    const options = resolveOptions({ speed: 0.45, pitch: 1, intonation: 1 })
    const word = finalWord(ending, options.speed)
    const samples = synthesizeWord(word, options)
    const center =
      vowelPosition(word, progress) * word.duration * VOICE_SAMPLE_RATE
    const start = Math.floor(center - 0.025 * VOICE_SAMPLE_RATE)
    const end = Math.floor(center + 0.025 * VOICE_SAMPLE_RATE)
    let best = -1
    let bestLag = 1
    for (let lag = 110; lag <= 190; lag++) {
      let cross = 0
      let left = 0
      let right = 0
      for (let i = start; i < end; i++) {
        cross += samples[i]! * samples[i + lag]!
        left += samples[i]! ** 2
        right += samples[i + lag]! ** 2
      }
      const similarity = cross / Math.sqrt(left * right)
      if (similarity > best) {
        best = similarity
        bestLag = lag
      }
    }
    return VOICE_SAMPLE_RATE / bestLag
  }
  expect(measuredPitch("?", 0.8) - measuredPitch("?", 0.25)).toBeGreaterThan(8)
  expect(measuredPitch(".", 0.8) - measuredPitch(".", 0.25)).toBeLessThan(-5)
})
