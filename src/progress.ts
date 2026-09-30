import type { BabbleWord, scoreUtterance } from "./score.js"
import type { BabbleTextCue } from "./source.js"

export type BabbleProgress =
  | { type: "start"; text: string; cues: readonly BabbleTextCue[] }
  | { type: "word"; index: number; audioTime: number }
  | { type: "end" }
  | { type: "stop" }

/** The first syllable's attack, including an initial unvoiced stop's closure. */
export function wordAttack(word: BabbleWord) {
  const first = word.segments[0]!
  if (first.phone === "CH") return first.duration * 0.35
  if (["P", "T", "K"].includes(first.phone)) return first.duration * 0.62
  return 0
}

/** Follow output time when available, not the ahead-of-playback render clock. */
function audibleTime(audio: AudioContext) {
  const timestamp = audio.getOutputTimestamp?.()
  if (
    typeof timestamp?.contextTime === "number" &&
    Number.isFinite(timestamp.contextTime)
  )
    return timestamp.contextTime
  return Math.max(
    0,
    audio.currentTime - (audio.outputLatency || audio.baseLatency || 0),
  )
}

export function createSpeechProgress(
  audio: AudioContext,
  utterance: ReturnType<typeof scoreUtterance>,
  emit: (event: BabbleProgress) => void,
) {
  const queue: { index: number; time: number }[] = []
  let cursor = 0
  let nextCue = 0
  let end: number | undefined
  let started = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = () => {
    timer = undefined
    if (disposed) return
    if (audio.state === "running") {
      const now = audibleTime(audio)
      while (cursor < queue.length && queue[cursor]!.time <= now) {
        if (!started) {
          started = true
          emit({ type: "start", text: utterance.text, cues: utterance.cues })
          if (disposed) return
        }
        const cue = queue[cursor++]!
        emit({ type: "word", index: cue.index, audioTime: cue.time })
        if (disposed) return
      }
      if (end !== undefined && now >= end && cursor === queue.length) {
        disposed = true
        emit({ type: "end" })
        return
      }
    }
    timer = setTimeout(tick, 16)
  }
  return {
    scheduled(wordIndex: number, onset: number) {
      const cue = utterance.cues[nextCue]
      if (cue?.wordIndex === wordIndex) {
        queue.push({
          index: nextCue++,
          time: onset + wordAttack(utterance.words[wordIndex]!),
        })
      }
      if (timer === undefined && !disposed) timer = setTimeout(tick, 16)
    },
    finish(time: number) {
      end = time
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
    },
  }
}
