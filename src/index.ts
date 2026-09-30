import { WordBufferCache } from "./cache.js"
import { type BabbleProgress, createSpeechProgress } from "./progress.js"
import { type BabbleOptions, resolveOptions, scoreUtterance } from "./score.js"
import { synthesizeWord, VOICE_SAMPLE_RATE } from "./voice.js"

export type { BabbleProgress } from "./progress.js"
export { type BabbleOptions, defaultBabbleOptions } from "./score.js"
export type { BabbleTextCue } from "./source.js"

export interface Babble {
  /** Call directly from a user gesture. Replaces the previous utterance. */
  speak(text: string, options?: BabbleOptions): void
  stop(): void
  dispose(): void
}

/** Native Web Audio only. A supplied context remains owned by the caller. */
export function createBabble({
  context: suppliedContext,
  onProgress,
}: {
  context?: AudioContext
  onProgress?: (event: BabbleProgress) => void
} = {}): Babble {
  let context = suppliedContext
  let disposed = false
  let revision = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let progress: ReturnType<typeof createSpeechProgress> | undefined
  let removeStateListener: (() => void) | undefined
  const bank = new WordBufferCache()
  const voices = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>()

  const stop = () => {
    revision++
    clearTimeout(timer)
    timer = undefined
    progress?.dispose()
    progress = undefined
    removeStateListener?.()
    removeStateListener = undefined
    onProgress?.({ type: "stop" })
    if (!context) return
    const now = context.currentTime
    for (const { source, gain } of voices) {
      if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(now)
      else {
        const level = gain.gain.value
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(level, now)
      }
      gain.gain.linearRampToValueAtTime(0, now + 0.008)
      source.stop(now + 0.01)
    }
  }

  return {
    speak(text, options) {
      if (disposed) return
      stop()
      const settings = resolveOptions(options)
      const plan = scoreUtterance(text, settings)
      const notes = plan.words
      if (!notes.length) return
      context ??= new AudioContext()
      const audio = context
      const utterance = revision
      // resume() is invoked synchronously in the caller's user gesture.
      const ready = audio.state === "running" ? null : audio.resume()
      const start = () => {
        if (disposed || utterance !== revision) return
        if (onProgress) progress = createSpeechProgress(audio, plan, onProgress)
        const interrupted = () => {
          if (audio.state !== "running" && utterance === revision) stop()
        }
        audio.addEventListener("statechange", interrupted)
        removeStateListener = () =>
          audio.removeEventListener("statechange", interrupted)
        let origin = audio.currentTime + 0.02
        let cursor = 0
        let lastEnd = 0
        let lastDuration = 0
        const schedule = () => {
          if (disposed || utterance !== revision) return
          const horizon = audio.currentTime + 0.12
          while (
            cursor < notes.length &&
            origin + notes[cursor]!.at < horizon
          ) {
            const note = notes[cursor++]!
            const key = JSON.stringify([
              note.word,
              note.segments,
              settings.intonation === 0 ? null : note.prosody,
              settings.pitch,
              settings.formant,
              settings.intonation,
              settings.softness,
            ])
            let buffer = bank.get(key)
            if (!buffer) {
              const samples = synthesizeWord(note, settings)
              buffer = audio.createBuffer(1, samples.length, VOICE_SAMPLE_RATE)
              buffer.copyToChannel(samples, 0)
              bank.set(key, buffer)
            }
            const when = origin + note.at
            // After a main-thread stall, delay the remaining words instead of
            // skipping them or piling them up. Zero overlap stays non-overlapping.
            const allowedOverlap = Math.min(
              settings.overlap,
              lastDuration * 0.25,
            )
            const onset = Math.max(
              when,
              audio.currentTime + 0.004,
              lastEnd - allowedOverlap,
            )
            origin += onset - when
            lastDuration = note.duration
            lastEnd = onset + note.duration
            const source = audio.createBufferSource()
            const gain = audio.createGain()
            source.buffer = buffer
            source.playbackRate.value = 1
            // Word PCM includes continuous articulation and click-free endpoints.
            gain.gain.setValueAtTime(settings.volume, onset)
            source.connect(gain)
            gain.connect(audio.destination)
            const voice = { source, gain }
            voices.add(voice)
            source.onended = () => {
              source.disconnect()
              gain.disconnect()
              voices.delete(voice)
            }
            source.start(onset, 0, note.duration)
            source.stop(onset + note.duration + 0.002)
            progress?.scheduled(cursor - 1, onset)
          }
          if (cursor < notes.length) timer = setTimeout(schedule, 30)
          else progress?.finish(lastEnd)
        }
        schedule()
      }
      if (ready)
        void ready.then(start).catch(() => {
          if (utterance === revision) stop()
        })
      else start()
    },
    stop,
    dispose() {
      if (disposed) return
      stop()
      disposed = true
      for (const { source, gain } of voices) {
        source.onended = null
        source.disconnect()
        gain.disconnect()
      }
      voices.clear()
      bank.clear()
      if (!suppliedContext) void context?.close().catch(() => undefined)
      context = undefined
    },
  }
}
