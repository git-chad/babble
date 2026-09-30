import {
  diphthongs,
  type Phone,
  stopPhones,
  type Vowel,
  vowelFormants,
} from "./phonetics.js"
import { pitchRatio } from "./prosody.js"
import type { BabbleWord, ResolvedBabbleOptions } from "./score.js"

export const VOICE_SAMPLE_RATE = 24000
type Shape = {
  formants: readonly number[]
  voice: number
  noise: number
  noiseHz: number
  stop: boolean
  nasal: boolean
}
// Formant targets and noise bands are design values, not sampled speech data.
const consonants: Partial<
  Record<Phone, readonly [number, number, number, number, number, number]>
> = {
  M: [250, 1000, 2100, 0.6, 0.01, 1500],
  N: [280, 1700, 2600, 0.55, 0.01, 1900],
  NG: [250, 2000, 2700, 0.55, 0.01, 2200],
  L: [400, 1200, 2600, 0.7, 0.01, 1500],
  R: [320, 1300, 1690, 0.7, 0.01, 1800],
  W: [300, 700, 2240, 0.8, 0.01, 1500],
  Y: [250, 2400, 3100, 0.8, 0.01, 2000],
  S: [400, 1900, 2800, 0, 0.34, 6500],
  Z: [400, 1900, 2800, 0.35, 0.25, 5500],
  SH: [400, 1600, 2400, 0, 0.32, 3100],
  ZH: [400, 1600, 2400, 0.35, 0.22, 3100],
  F: [400, 1500, 2500, 0, 0.18, 4500],
  V: [400, 1500, 2500, 0.45, 0.13, 4000],
  TH: [450, 1600, 2500, 0, 0.16, 4700],
  DH: [450, 1600, 2500, 0.45, 0.1, 4000],
  H: [500, 1500, 2500, 0, 0.12, 1700],
  P: [400, 1000, 2400, 0, 0.32, 1400],
  B: [400, 1000, 2400, 0.2, 0.2, 1400],
  T: [450, 1900, 2800, 0, 0.42, 5000],
  D: [450, 1900, 2800, 0.2, 0.27, 4000],
  K: [400, 2300, 2800, 0, 0.37, 2800],
  G: [400, 2300, 2800, 0.2, 0.25, 2500],
  CH: [400, 1600, 2400, 0, 0.35, 3400],
  JH: [400, 1600, 2400, 0.3, 0.24, 3100],
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => {
  const value = Math.max(0, Math.min(1, t))
  return value * value * (3 - 2 * value)
}
function shape(phone: Phone, progress: number): Shape {
  const glide = diphthongs[phone as keyof typeof diphthongs]
  const start = vowelFormants[(glide?.[0] ?? phone) as Vowel]
  if (start) {
    const end = glide ? vowelFormants[glide[1]] : start
    const t = smooth((progress - 0.2) / 0.7)
    return {
      formants: start.map((value, i) => lerp(value, end[i]!, t)),
      voice: 1,
      noise: 0.005,
      noiseHz: 1800,
      stop: false,
      nasal: false,
    }
  }
  const spec = consonants[phone]!
  return {
    formants: spec.slice(0, 3),
    voice: spec[3],
    noise: spec[4],
    noiseHz: spec[5],
    stop: stopPhones.has(phone) || phone === "CH" || phone === "JH",
    nasal: ["M", "N", "NG"].includes(phone),
  }
}
/** Stable band-pass resonator. Coefficients update only every 16 samples. */
class Resonator {
  private a = 0
  private b = 0
  private gain = 0
  private y1 = 0
  private y2 = 0
  private x1 = 0
  private x2 = 0
  tune(frequency: number, bandwidth: number) {
    const radius = Math.exp((-Math.PI * bandwidth) / VOICE_SAMPLE_RATE)
    this.a =
      2 * radius * Math.cos((2 * Math.PI * frequency) / VOICE_SAMPLE_RATE)
    this.b = radius * radius
    this.gain = (1 - this.b) * 0.5
  }
  sample(input: number) {
    const output =
      this.gain * (input - this.x2) + this.a * this.y1 - this.b * this.y2
    this.x2 = this.x1
    this.x1 = input
    this.y2 = this.y1
    this.y1 = output
    return output
  }
}
/** One continuous source/filter per word: transitions do not stack spoken sounds. */
export function synthesizeWord(
  word: BabbleWord,
  options: ResolvedBabbleOptions,
) {
  const data = new Float32Array(
    Math.max(1, Math.ceil(word.duration * VOICE_SAMPLE_RATE)),
  )
  const filters = [new Resonator(), new Resonator(), new Resonator()]
  const fricative = new Resonator()
  const boundaries: number[] = []
  let boundary = 0
  for (const segment of word.segments) {
    boundary += segment.duration
    boundaries.push(boundary)
  }
  let segmentIndex = 0
  let segmentStart = 0
  let phase = 0
  let seed = 2166136261
  for (const letter of word.word)
    seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0
  let voice = 0
  let noise = 0
  let nasal = 0
  let stress = 1
  for (let i = 0; i < data.length; i++) {
    const time = i / VOICE_SAMPLE_RATE
    while (
      segmentIndex < word.segments.length - 1 &&
      time >= boundaries[segmentIndex]!
    ) {
      segmentStart = boundaries[segmentIndex++]!
    }
    const segment = word.segments[segmentIndex]!
    const progress = Math.min(1, (time - segmentStart) / segment.duration)
    if (i % 16 === 0) {
      const current = shape(segment.phone, progress)
      const nextSegment = word.segments[segmentIndex + 1]
      const next = nextSegment ? shape(nextSegment.phone, 0) : current
      if (segment.release)
        current.formants = current.formants.map((value, band) =>
          lerp(value, vowelFormants.UW[band]!, progress * 0.35),
        )
      const transitionWindow = Math.min(0.018, segment.duration * 0.28)
      const transition = nextSegment
        ? smooth(
            (time - (boundaries[segmentIndex]! - transitionWindow)) /
              transitionWindow,
          )
        : 0
      // Stop closure then a small release burst; fricatives sustain shaped air.
      let burst = 1
      if (current.stop) {
        const release =
          segment.phone === "CH" || segment.phone === "JH" ? 0.35 : 0.62
        burst =
          smooth((progress - release) / 0.12) *
          Math.exp(-Math.max(0, progress - release - 0.12) * 7)
      }
      voice = lerp(
        current.voice * (current.stop ? 0.25 : 1),
        next.voice,
        transition,
      )
      noise =
        lerp(current.noise * burst, next.noise, transition) *
        (1 - options.softness * 0.65)
      nasal = lerp(current.nasal ? 1 : 0, next.nasal ? 1 : 0, transition)
      stress = lerp(
        segment.stress,
        nextSegment?.stress ?? segment.stress,
        transition,
      )
      for (let band = 0; band < 3; band++) {
        const target = current.formants[band]!
        const from = segment.phone === "H" ? next.formants[band]! : target
        filters[band]!.tune(
          // Move the whole tract, including glides, sonorants and quiet releases.
          // Keep resonances below Nyquist; the glottal pitch is independent.
          Math.max(
            80,
            Math.min(
              VOICE_SAMPLE_RATE * 0.45,
              lerp(from, next.formants[band]!, transition) * options.formant,
            ),
          ),
          [90, 130, 200][band]! * options.formant,
        )
      }
      fricative.tune(
        lerp(current.noiseHz, next.noiseHz, transition),
        current.stop ? 2300 : 1700,
      )
    }
    const position = time / word.duration
    const f0 =
      155 *
      options.pitch *
      pitchRatio(word.prosody, position, options.intonation)
    const step = f0 / VOICE_SAMPLE_RATE
    phase = (phase + step) % 1
    // A band-limited glottal excitation with a little fundamental warmth.
    let correction = 0
    if (phase < step) {
      const x = phase / step
      correction = x + x - x * x - 1
    } else if (phase > 1 - step) {
      const x = (phase - 1) / step
      correction = x * x + x + x + 1
    }
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const air = (seed / 0xffffffff) * 2 - 1
    const excitation =
      ((2 * phase - 1 - correction) * 0.6 +
        Math.sin(phase * 2 * Math.PI) * 0.15) *
        voice +
      air * 0.015 * voice
    const resonated =
      filters[0]!.sample(excitation) +
      filters[1]!.sample(excitation) * (0.7 - nasal * 0.35) +
      filters[2]!.sample(excitation) * (0.4 - nasal * 0.2)
    const consonant = fricative.sample(air) * noise
    const onset = smooth(time / (0.003 + options.softness * 0.005))
    const release = smooth((word.duration - time) / 0.012)
    data[i] =
      Math.tanh((resonated * 4 + consonant * 1.6) * stress) *
      0.6 *
      onset *
      release
  }
  data[0] = 0
  data[data.length - 1] = 0
  return data
}
