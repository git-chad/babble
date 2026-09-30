import { afterEach, beforeEach, expect, test } from "bun:test"
import { type Babble, type BabbleProgress, createBabble } from "./index.js"
import { wordAttack } from "./progress.js"
import { scoreUtterance } from "./score.js"

const noop = () => undefined

class AudioClock extends EventTarget {
  state = "running"
  currentTime = 0
  outputTime = 0
  destination = {}
  starts: number[] = []
  pending: (() => void) | undefined
  getOutputTimestamp() {
    return { contextTime: this.outputTime, performanceTime: 0 }
  }
  createBuffer(_channels: number, length: number) {
    return { length, copyToChannel: noop }
  }
  createBufferSource() {
    return {
      playbackRate: { value: 1 },
      connect: noop,
      disconnect: noop,
      stop: noop,
      start: (time: number) => {
        this.starts.push(time)
      },
    }
  }
  createGain() {
    return {
      connect: noop,
      disconnect: noop,
      gain: {
        value: 0,
        setValueAtTime: noop,
        cancelScheduledValues: noop,
        linearRampToValueAtTime: noop,
      },
    }
  }
  resume() {
    return new Promise<void>((resolve) => {
      this.pending = () => {
        this.state = "running"
        resolve()
      }
    })
  }
}

const realTimeout = globalThis.setTimeout
const realClear = globalThis.clearTimeout
let wall = 0
let serial = 0
const timers = new Map<number, { time: number; callback: () => void }>()
let voice: Babble | undefined
beforeEach(() => {
  wall = 0
  globalThis.setTimeout = ((callback: () => void, delay: number) => {
    const id = ++serial
    timers.set(id, { time: wall + delay, callback })
    return id
  }) as unknown as typeof setTimeout
  globalThis.clearTimeout = ((id: number) => {
    timers.delete(id)
  }) as unknown as typeof clearTimeout
})
afterEach(() => {
  voice?.dispose()
  voice = undefined
  timers.clear()
  globalThis.setTimeout = realTimeout
  globalThis.clearTimeout = realClear
})
function advance(milliseconds: number) {
  const until = wall + milliseconds
  for (;;) {
    const next = [...timers.entries()].sort((a, b) => a[1].time - b[1].time)[0]
    if (!next || next[1].time > until) break
    timers.delete(next[0])
    wall = next[1].time
    next[1].callback()
  }
  wall = until
}
function setup() {
  const audio = new AudioClock()
  const events: BabbleProgress[] = []
  voice = createBabble({
    context: audio as unknown as AudioContext,
    onProgress: (event) => {
      if (event.type === "word")
        expect(audio.outputTime).toBeGreaterThanOrEqual(event.audioTime)
      events.push(event)
    },
  })
  return { audio, events }
}

test("queued speech stays hidden until its real output-time attack, including plosive closure", () => {
  const { audio, events } = setup()
  const plan = scoreUtterance("Testing, café!", { speed: 1 })
  voice!.speak("Testing, café!", { speed: 1 })
  expect(audio.starts).toHaveLength(1)
  const attack = audio.starts[0]! + wordAttack(plan.words[0]!)
  expect(attack).toBeGreaterThan(audio.starts[0]!)
  audio.currentTime = 0.3 // Rendering ahead is not audible progress.
  audio.outputTime = attack - 0.001
  advance(32)
  expect(events.map((event) => event.type)).toEqual(["stop"])
  audio.outputTime = attack
  advance(16)
  expect(events.map((event) => event.type)).toEqual(["stop", "start", "word"])
  expect(events[1]).toEqual({
    type: "start",
    text: "Testing, café!",
    cues: plan.cues,
  })
})

test("reveals follow actual delayed scheduling after a stall, not the original score timestamps", () => {
  const { audio, events } = setup()
  const plan = scoreUtterance("You, café!")
  voice!.speak("You, café!")
  audio.currentTime = 10
  audio.outputTime = 9.9
  advance(32)
  expect(audio.starts).toHaveLength(2)
  const attack = audio.starts[1]! + wordAttack(plan.words[1]!)
  expect(attack).toBeGreaterThan(10)
  expect(events.filter((event) => event.type === "word")).toHaveLength(1)
  audio.outputTime = attack - 0.001
  advance(16)
  expect(events.filter((event) => event.type === "word")).toHaveLength(1)
  audio.outputTime = attack
  advance(16)
  expect(events.at(-1)).toEqual({ type: "word", index: 1, audioTime: attack })
})

test("without output timestamps, the progress fallback accounts for output latency", () => {
  const { audio, events } = setup()
  Object.defineProperty(audio, "getOutputTimestamp", { value: undefined })
  Object.defineProperty(audio, "outputLatency", { value: 0.1 })
  voice!.speak("You.")
  audio.currentTime = 0.119
  audio.outputTime = 0.019
  advance(32)
  expect(events.some((event) => event.type === "word")).toBe(false)
  audio.currentTime = 0.121
  audio.outputTime = 0.021
  advance(16)
  expect(events.at(-1)?.type).toBe("word")
})

test("speed, pauses and overlap share the audio timeline; completion waits for the final word", () => {
  for (const speed of [0.5, 2.8])
    for (const overlap of [0, 0.12]) {
      const { audio, events } = setup()
      const phrase = "You, café. You?"
      const plan = scoreUtterance(phrase, { speed, overlap })
      voice!.speak(phrase, { speed, overlap })
      for (let time = 0; time < 8; time += 0.01) {
        audio.currentTime = time
        audio.outputTime = Math.max(0, time - 0.03)
        advance(10)
      }
      const words = events.filter((event) => event.type === "word")
      expect(words.map((event) => event.index)).toEqual([0, 1, 2])
      for (let i = 0; i < words.length; i++)
        expect(words[i]!.audioTime).toBeCloseTo(
          audio.starts[i]! + wordAttack(plan.words[i]!),
          10,
        )
      expect(events.at(-1)?.type).toBe("end")
      expect(timers.size).toBe(0)
      voice!.dispose()
    }
})

test("new Speak, Stop, interruption and disposal cancel stale reveals", () => {
  const { audio, events } = setup()
  voice!.speak("Old phrase.")
  voice!.speak("New phrase.")
  audio.currentTime = 0.05
  audio.outputTime = 0.05
  advance(32)
  expect(
    events.filter((event) => event.type === "start").map((event) => event.text),
  ).toEqual(["New phrase."])
  voice!.stop()
  const stopped = events.length
  audio.currentTime = audio.outputTime = 10
  advance(1000)
  expect(events).toHaveLength(stopped)
  voice!.speak("Interrupted.")
  audio.state = "suspended"
  audio.dispatchEvent(new Event("statechange"))
  const interrupted = events.length
  audio.state = "running"
  audio.dispatchEvent(new Event("statechange"))
  audio.currentTime = audio.outputTime = 20
  advance(1000)
  expect(events).toHaveLength(interrupted)
  expect(timers.size).toBe(0)
  voice!.speak("Disposed.")
  voice!.dispose()
  const disposed = events.length
  advance(1000)
  expect(events).toHaveLength(disposed)
  expect(timers.size).toBe(0)
})

test("pending resume never reveals text, and late resume cannot revive a stopped utterance", async () => {
  const { audio, events } = setup()
  audio.state = "suspended"
  voice!.speak("Waiting.")
  advance(1000)
  expect(events.map((event) => event.type)).toEqual(["stop"])
  expect(audio.starts).toHaveLength(0)
  voice!.stop()
  audio.pending?.()
  await Promise.resolve()
  advance(1000)
  expect(audio.starts).toHaveLength(0)
  expect(events.some((event) => event.type === "start")).toBe(false)
})
