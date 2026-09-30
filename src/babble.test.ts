import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { WordBufferCache } from "./cache.js"
import { type Babble, createBabble } from "./index.js"
import { isVowel, phonemizeWord } from "./phonetics.js"
import { resolveOptions, scoreBabble } from "./score.js"
import { synthesizeWord, VOICE_SAMPLE_RATE } from "./voice.js"

test("flat intonation preserves articulation from the pre-prosody voice with a constant source pitch", () => {
  // Captured before adding prosody, with only the old pitch contour held flat.
  const baseline = {
    testing: "41568ad7eca13dcf8888e50ce8249d31e4d8fdf1c20a9fe9c0efb3a4587c83e7",
    nice: "c8e8eed5297a41e0136056b56fbb4bda8d95038bf151f731f6b689a922c8c551",
    summer: "6e5f8720e1072e221f4b4ee29952bc67a2d9295ecf33b56bf5594cc0cf0cd8cf",
    bag: "987cf64bf55a42cd80d0c05aec8174a0ba3590e628aacbf0f4b01adeee5b860d",
  }
  for (const [word, hash] of Object.entries(baseline)) {
    const options = resolveOptions({ formant: 1, intonation: 0 })
    const samples = synthesizeWord(scoreBabble(word, options)[0]!, options)
    const pcm = Buffer.alloc(samples.length * 2)
    samples.forEach((value, index) => {
      pcm.writeInt16LE(Math.round(value * 32767), index * 2)
    })
    expect(createHash("sha256").update(pcm).digest("hex")).toBe(hash)
    expect(resolveOptions().formant).toBe(1)
  }
})

test("expanded pitch and formant ranges preserve valid values and default invalid inputs", () => {
  for (const pitch of [0.25, 0.5, 1.35, 3, 4.5])
    expect(resolveOptions({ pitch }).pitch).toBe(pitch)
  for (const formant of [0.25, 0.5, 1, 2, 3.5])
    expect(resolveOptions({ formant }).formant).toBe(formant)
  expect(resolveOptions({ pitch: Number.NaN }).pitch).toBe(1.35)
  expect(resolveOptions({ pitch: Number.POSITIVE_INFINITY }).pitch).toBe(1.35)
  expect(resolveOptions({ pitch: -10 }).pitch).toBe(0.25)
  expect(resolveOptions({ pitch: 10 }).pitch).toBe(4.5)
  expect(resolveOptions({ formant: Number.NaN }).formant).toBe(1)
  expect(resolveOptions({ formant: Number.POSITIVE_INFINITY }).formant).toBe(1)
  expect(resolveOptions({ formant: -10 }).formant).toBe(0.25)
  expect(resolveOptions({ formant: 10 }).formant).toBe(3.5)
})

test("expanded pitch and formant extremes keep timing and PCM bounded", () => {
  for (const formant of [0.25, 3.5])
    for (const pitch of [0.25, 4.5]) {
      for (const speed of [0.45, 2.8]) {
        for (const softness of [0, 1]) {
          for (const intonation of [0, 1, 3]) {
            const options = resolveOptions({
              formant,
              pitch,
              speed,
              softness,
              intonation,
            })
            const phrase =
              "Testing! What a nice summer day… Bag. Cheese, hello?"
            const score = scoreBabble(phrase, options)
            expect(score).toEqual(
              scoreBabble(phrase, {
                ...options,
                pitch: 1.35,
                formant: 1,
                intonation: 0,
              }),
            )
            for (const word of score) {
              const data = synthesizeWord(word, options)
              expect(data.length).toBe(
                Math.ceil(word.duration * VOICE_SAMPLE_RATE),
              )
              expect(
                data.every(
                  (sample) =>
                    Number.isFinite(sample) && Math.abs(sample) <= 0.6,
                ),
              ).toBe(true)
              expect(data.some((sample) => Math.abs(sample) > 0.001)).toBe(true)
              expect(data[0]).toBe(0)
              expect(data[data.length - 1]).toBe(0)
            }
          }
        }
      }
    }
})

test("formant shifts the measured vowel spectrum without changing sample length", () => {
  const centroid = (formant: number) => {
    const options = resolveOptions({ pitch: 1, speed: 0.7, formant })
    const word = scoreBabble("ass", options)[0]!
    const data = synthesizeWord(word, options).slice(
      Math.floor(0.03 * VOICE_SAMPLE_RATE),
      Math.floor(word.segments[0]!.duration * 0.8 * VOICE_SAMPLE_RATE),
    )
    let energy = 0
    let weighted = 0
    for (let hz = 100; hz <= 5500; hz += 25) {
      let previous = 0
      let before = 0
      const coefficient = 2 * Math.cos((2 * Math.PI * hz) / VOICE_SAMPLE_RATE)
      for (let i = 0; i < data.length; i++) {
        const window =
          0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (data.length - 1))
        const value = data[i]! * window + coefficient * previous - before
        before = previous
        previous = value
      }
      const power =
        previous ** 2 + before ** 2 - coefficient * previous * before
      energy += power
      weighted += hz * power
    }
    return weighted / energy
  }
  const low = centroid(0.65)
  const neutral = centroid(1)
  const high = centroid(1.6)
  expect(low).toBeLessThan(neutral)
  expect(high).toBeGreaterThan(neutral)
  expect(high / low).toBeGreaterThan(1.5)
})

test("phonetic grouping follows words rather than one vowel pip per letter", () => {
  expect(phonemizeWord("Testing")).toEqual(["T", "EH", "S", "T", "IH", "NG"])
  expect(phonemizeWord("ass")).toEqual(["AE", "S"])
  expect(phonemizeWord("bag")).toEqual(["B", "AE", "G"])
  expect(phonemizeWord("nice")).toEqual(["N", "AY", "S"])
  expect(phonemizeWord("summer")).toEqual(["S", "AH", "M", "ER"])
  expect(phonemizeWord("day")).toEqual(["D", "EY"])
  expect(phonemizeWord("cheese")).toEqual(["CH", "IY", "S"])
  expect(phonemizeWord("caf\u00e9")).toEqual(phonemizeWord("cafe"))
  expect(phonemizeWord("ass").filter(isVowel)).toHaveLength(1)
  expect(phonemizeWord("testing").filter(isVowel)).toHaveLength(2)
  expect(() => phonemizeWord("constructor")).not.toThrow()
})

test("scores preserve identity and stay bounded for long or unsupported input", () => {
  expect(scoreBabble("Testing. What a nice summer day. Bag.")).toEqual(
    scoreBabble("Testing. What a nice summer day. Bag."),
  )
  expect(scoreBabble("¡Hola, cómo estás?")).toEqual(
    scoreBabble("Hola, como estas?"),
  )
  expect(scoreBabble(" 🌿✨ 漢字 ")).toEqual([])
  const long = scoreBabble("testing ".repeat(2000), { speed: 0.45 })
  expect(long.length).toBeLessThanOrEqual(64)
  expect(long.at(-1)!.at + long.at(-1)!.duration).toBeLessThanOrEqual(30.00001)
  expect(scoreBabble("a".repeat(10000))[0]!.duration).toBeLessThanOrEqual(3)
  expect(
    scoreBabble("hello", {
      pitch: Number.NaN,
      speed: Number.POSITIVE_INFINITY,
    }),
  ).toEqual(scoreBabble("hello"))
})

test("final stops have a short quiet release inside the word, never an equal extra syllable", () => {
  const bag = scoreBabble("bag", { speed: 1 })[0]!
  const nucleus = bag.segments.find((segment) => isVowel(segment.phone))!
  const release = bag.segments.at(-1)!
  expect(release.release).toBe(true)
  expect(release.phone).toBe("AX")
  expect(release.duration).toBeLessThan(nucleus.duration * 0.3)
  expect(release.stress).toBeLessThan(nucleus.stress * 0.25)
  expect(
    scoreBabble("ass")[0]!.segments.some((segment) => segment.release),
  ).toBe(false)
  expect(
    scoreBabble("testing")[0]!.segments.some((segment) => segment.release),
  ).toBe(false)
})

test("zero overlap is non-overlapping; punctuation and explicit overlap change only word spacing", () => {
  const plain = scoreBabble("testing bag", { speed: 1 })
  const comma = scoreBabble("testing, bag", { speed: 1 })
  const sentence = scoreBabble("testing. bag", { speed: 1 })
  expect(plain[1]!.at - plain[0]!.duration).toBeCloseTo(0.06)
  expect(comma[1]!.at - plain[1]!.at).toBeCloseTo(0.14)
  expect(sentence[1]!.at - plain[1]!.at).toBeCloseTo(0.28)
  const overlap = scoreBabble("testing bag", { speed: 1, overlap: 0.12 })
  expect(overlap[1]!.at).toBeLessThan(overlap[0]!.duration)
  expect(overlap[0]!.segments).toEqual(plain[0]!.segments)
  expect(scoreBabble("bag?")[0]!.prosody.ending).toBe("?")
  expect(scoreBabble("bag.")[0]!.prosody.ending).toBe(".")
})

test("pitch cannot change duration, speed cannot change phoneme identity, and PCM stays deterministic", () => {
  const low = resolveOptions({ pitch: 0.8, speed: 1 })
  const high = resolveOptions({ pitch: 1.8, speed: 1 })
  const score = scoreBabble("testing", low)[0]!
  expect(scoreBabble("testing", high)).toEqual(scoreBabble("testing", low))
  const slower = scoreBabble("testing", { speed: 0.5 })[0]!
  expect(slower.duration).toBeCloseTo(score.duration * 2)
  expect(slower.segments.map((segment) => segment.phone)).toEqual(
    score.segments.map((segment) => segment.phone),
  )
  const first = synthesizeWord(score, low)
  expect(first).toEqual(synthesizeWord(score, low))
  const second = synthesizeWord(score, high)
  expect(first.length).toBe(second.length)
  expect(first).not.toEqual(second)
})

test("word synthesis has bounded levels, smooth endpoints and nonzero consonant energy", () => {
  for (const word of [
    "testing",
    "ass",
    "bag",
    "nice",
    "summer",
    "day",
    "she",
    "three",
    "voice",
  ]) {
    const options = resolveOptions({ pitch: 1, speed: 0.8 })
    const event = scoreBabble(word, options)[0]!
    const samples = synthesizeWord(event, options)
    expect(samples.length).toBe(Math.ceil(event.duration * VOICE_SAMPLE_RATE))
    expect(samples[0]).toBe(0)
    expect(samples[samples.length - 1]).toBe(0)
    let peak = 0
    let energy = 0
    for (const value of samples) {
      expect(Number.isFinite(value)).toBe(true)
      peak = Math.max(peak, Math.abs(value))
      energy += value * value
    }
    expect(peak).toBeLessThanOrEqual(0.6)
    expect(Math.sqrt(energy / samples.length)).toBeGreaterThan(0.025)
  }
  const options = resolveOptions({ speed: 1, softness: 1 })
  const score = scoreBabble("ass", options)[0]!
  const sound = synthesizeWord(score, options)
  const start = Math.ceil(score.segments[0]!.duration * VOICE_SAMPLE_RATE)
  let energy = 0
  for (let i = start; i < sound.length; i++) energy += sound[i]! ** 2
  expect(Math.sqrt(energy / (sound.length - start))).toBeGreaterThan(0.01)
})

test("measured vowel fundamental follows pitch and stays stable across speeds and formants", () => {
  const estimate = (pitch: number, speed: number, formant = 1) => {
    const options = resolveOptions({ pitch, speed, formant, intonation: 0 })
    const word = scoreBabble("ass", options)[0]!
    const data = synthesizeWord(word, options).slice(
      0,
      Math.floor(word.segments[0]!.duration * VOICE_SAMPLE_RATE),
    )
    let best = -1
    let bestLag = 1
    for (
      let lag = Math.floor(VOICE_SAMPLE_RATE / (155 * pitch * 1.12));
      lag < VOICE_SAMPLE_RATE / (155 * pitch * 0.88);
      lag++
    ) {
      let product = 0
      let left = 0
      let right = 0
      for (
        let i = Math.floor(data.length * 0.2);
        i < data.length * 0.8 - lag;
        i++
      ) {
        product += data[i]! * data[i + lag]!
        left += data[i]! ** 2
        right += data[i + lag]! ** 2
      }
      const similarity = product / Math.sqrt(left * right)
      if (similarity > best) {
        best = similarity
        bestLag = lag
      }
    }
    return VOICE_SAMPLE_RATE / bestLag
  }
  expect(Math.abs(estimate(1, 0.7) - estimate(1, 2))).toBeLessThan(3)
  expect(Math.abs(estimate(1, 0.7, 0.65) - estimate(1, 0.7, 1.6))).toBeLessThan(
    3,
  )
  expect(estimate(1.6, 0.7) / estimate(0.85, 0.7)).toBeCloseTo(1.6 / 0.85, 1)
})

test("the LRU bounds both word count and PCM bytes and refreshes recently-used words", () => {
  const cache = new WordBufferCache()
  for (let i = 0; i < 40; i++) {
    cache.set(String(i), { length: VOICE_SAMPLE_RATE } as AudioBuffer)
    expect(cache.size).toBeLessThanOrEqual(12)
    expect(cache.sampleCount).toBeLessThanOrEqual(VOICE_SAMPLE_RATE * 6)
  }
  expect(cache.get("0")).toBeUndefined()
  expect(cache.get("34")).toBeDefined()
  cache.set("40", { length: VOICE_SAMPLE_RATE } as AudioBuffer)
  expect(cache.get("34")).toBeDefined()
  expect(cache.get("35")).toBeUndefined()
  cache.clear()
  expect(cache.size).toBe(0)
  expect(cache.sampleCount).toBe(0)
})

class FakeParam {
  value = 0
  ramps: number[] = []
  setValueAtTime(value: number) {
    this.value = value
  }
  cancelScheduledValues() {
    return this
  }
  linearRampToValueAtTime(value: number) {
    this.ramps.push(value)
    return this
  }
}
class FakeNode {
  gain = new FakeParam()
  playbackRate = { value: 1 }
  buffer = null
  onended: (() => void) | null = null
  started: number[] = []
  stops: number[] = []
  disconnected = false
  connect() {
    return this
  }
  disconnect() {
    this.disconnected = true
  }
  start(time: number) {
    this.started.push(time)
  }
  stop(time: number) {
    this.stops.push(time)
  }
}
class FakeContext extends EventTarget {
  static created = 0
  state = "running"
  currentTime = 0
  destination = {}
  sources: FakeNode[] = []
  gains: FakeNode[] = []
  buffers = 0
  resumes = 0
  closes = 0
  pending: (() => void) | undefined
  constructor() {
    super()
    FakeContext.created++
  }
  createBuffer(_channels: number, length: number) {
    this.buffers++
    return { length, copyToChannel: () => undefined }
  }
  createBufferSource() {
    const node = new FakeNode()
    this.sources.push(node)
    return node
  }
  createGain() {
    const node = new FakeNode()
    this.gains.push(node)
    return node
  }
  resume() {
    this.resumes++
    return new Promise<void>((resolve) => {
      this.pending = resolve
    })
  }
  async close() {
    this.closes++
  }
}
const originalContext = globalThis.AudioContext
let babble: Babble | undefined
afterEach(() => {
  babble?.dispose()
  babble = undefined
  globalThis.AudioContext = originalContext
})

test("initialization is lazy and repeated Speak replaces sources using one bounded bank", () => {
  FakeContext.created = 0
  globalThis.AudioContext = FakeContext as unknown as typeof AudioContext
  babble = createBabble()
  expect(FakeContext.created).toBe(0)
  babble.speak("✨")
  expect(FakeContext.created).toBe(0)
  babble.speak("hello")
  babble.speak("hello")
  expect(FakeContext.created).toBe(1)
  babble.dispose()
  babble.speak("hello")
  expect(FakeContext.created).toBe(1)
})

test("Speak schedules a short audio-clock horizon; Stop and dispose release scheduled voices", () => {
  const context = new FakeContext()
  babble = createBabble({ context: context as unknown as AudioContext })
  babble.speak("hello testing bag nice summer day ".repeat(8))
  expect(context.sources.length).toBeGreaterThan(0)
  expect(context.sources.length).toBeLessThan(4)
  expect(context.buffers).toBeLessThanOrEqual(2)
  const previous = [...context.sources]
  const bankCount = context.buffers
  babble.speak("hello testing bag nice summer day ".repeat(8))
  expect(context.buffers).toBe(bankCount)
  expect(
    previous.every((source) => source.stops[source.stops.length - 1] === 0.01),
  ).toBe(true)
  babble.stop()
  expect(
    context.sources.every(
      (source) => source.stops[source.stops.length - 1] === 0.01,
    ),
  ).toBe(true)
  babble.dispose()
  expect(context.sources.every((source) => source.disconnected)).toBe(true)
  expect(context.gains.every((gain) => gain.disconnected)).toBe(true)
  expect(context.closes).toBe(0) // Supplied context belongs to the ambient controller.
})

test("changing formant invalidates cached speech without resampling or creating a context", () => {
  const context = new FakeContext()
  babble = createBabble({ context: context as unknown as AudioContext })
  babble.speak("nice")
  expect(context.buffers).toBe(1)
  babble.speak("nice", { formant: 1 })
  expect(context.buffers).toBe(1)
  babble.speak("nice", { formant: 1.2 })
  expect(context.buffers).toBe(2)
  babble.speak("nice", { formant: 1.2 })
  expect(context.buffers).toBe(2)
  babble.speak("nice", { formant: 1 })
  expect(context.buffers).toBe(2)
  expect(
    context.sources.every((source) => source.playbackRate.value === 1),
  ).toBe(true)
  expect(context.resumes).toBe(0)
})

test("Stop cancels an utterance waiting for audio unlock; a late resume cannot resurrect it", async () => {
  const context = new FakeContext()
  context.state = "suspended"
  babble = createBabble({ context: context as unknown as AudioContext })
  babble.speak("hi")
  expect(context.resumes).toBe(1) // Called before speak() returns, in the gesture.
  expect(context.sources).toHaveLength(0)
  babble.stop()
  context.pending?.()
  await Promise.resolve()
  expect(context.sources).toHaveLength(0)
})

test("speech cache includes intonation, phrase position and punctuation, while flat speech reuses buffers", () => {
  const context = new FakeContext()
  babble = createBabble({ context: context as unknown as AudioContext })
  for (const [text, intonation, buffers] of [
    ["bag.", 1, 1],
    ["bag.", 1, 1],
    ["bag?", 1, 2],
    ["bag?", 3, 3],
    ["bag?", 0, 4],
    ["bag.", 0, 4],
    ["bag bag", 0, 4],
    ["bag bag", 1, 5],
    ["bag.", 1, 5],
  ] as const) {
    babble.speak(text, { intonation })
    expect(context.buffers).toBe(buffers)
  }
  expect(
    context.sources.every((source) => source.playbackRate.value === 1),
  ).toBe(true)
  expect(context.gains.every((gain) => gain.gain.value === 0.55)).toBe(true)
  expect(context.resumes).toBe(0)
  babble.dispose()
  expect(context.sources.every((source) => source.disconnected)).toBe(true)
  expect(context.closes).toBe(0)
})
