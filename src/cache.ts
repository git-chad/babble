import { VOICE_SAMPLE_RATE } from "./voice.js"

/** Bounded LRU: at most 12 words / six seconds (562.5 KiB) of mono PCM. */
export class WordBufferCache {
  private entries = new Map<string, AudioBuffer>()
  sampleCount = 0
  get size() {
    return this.entries.size
  }
  get(key: string) {
    const value = this.entries.get(key)
    if (value) {
      this.entries.delete(key)
      this.entries.set(key, value)
    }
    return value
  }
  set(key: string, value: AudioBuffer) {
    const previous = this.entries.get(key)
    if (previous) {
      this.sampleCount -= previous.length
      this.entries.delete(key)
    }
    if (value.length > VOICE_SAMPLE_RATE * 6) return
    this.entries.set(key, value)
    this.sampleCount += value.length
    while (this.entries.size > 12 || this.sampleCount > VOICE_SAMPLE_RATE * 6) {
      const oldest = this.entries.keys().next().value!
      this.sampleCount -= this.entries.get(oldest)!.length
      this.entries.delete(oldest)
    }
  }
  clear() {
    this.entries.clear()
    this.sampleCount = 0
  }
}
