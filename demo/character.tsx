import { useEffect, useRef, useState } from "react"
import type { SpeechPlacement } from "./lib/speech-layout"
import { createViewer } from "./lib/viewer"
import { BuddySpeech, type SpeechProgressRef } from "./speech"

export function Character({ progressRef }: { progressRef: SpeechProgressRef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [placement, setPlacement] = useState<SpeechPlacement | null>(null)
  const [status, setStatus] = useState("loading")
  const [attempt, setAttempt] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry replaces the canvas and renderer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const abort = new AbortController()
    let viewer: Awaited<ReturnType<typeof createViewer>> | undefined
    let visible = true
    const motion = matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () =>
      viewer?.setPlaying(visible && !document.hidden && !motion.matches)
    const resize = new ResizeObserver(() => viewer?.resize())
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      sync()
    })
    resize.observe(canvas)
    intersection.observe(canvas)
    motion.addEventListener("change", sync)
    document.addEventListener("visibilitychange", sync)
    const lost = (event: Event) => {
      event.preventDefault()
      viewer?.setPlaying(false)
      setStatus("error")
    }
    canvas.addEventListener("webglcontextlost", lost)
    void createViewer(canvas, abort.signal, setPlacement)
      .then((next) => {
        if (abort.signal.aborted) {
          next.dispose()
          return
        }
        viewer = next
        sync()
        setStatus("ready")
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          console.error(error)
          setStatus("error")
        }
      })
    return () => {
      abort.abort()
      resize.disconnect()
      intersection.disconnect()
      motion.removeEventListener("change", sync)
      document.removeEventListener("visibilitychange", sync)
      canvas.removeEventListener("webglcontextlost", lost)
      viewer?.dispose()
    }
  }, [attempt])
  return (
    <section className="character-stage" aria-label="Character preview">
      <canvas
        key={attempt}
        ref={canvasRef}
        aria-label="An off-white cat in blue jeans, breathing and blinking"
      />
      <BuddySpeech
        progressRef={progressRef}
        placement={status === "ready" ? placement : null}
      />
      {status === "loading" ? (
        <output className="stage-status">Loading character…</output>
      ) : null}
      {status === "error" ? (
        <div className="stage-status">
          <p>Character couldn’t load.</p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading")
              setAttempt((value) => value + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
    </section>
  )
}
