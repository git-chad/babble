import { DialRoot, DialStore, useDialKit } from "dialkit"
import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import "dialkit/styles.css"
import { type Babble, type BabbleProgress, createBabble } from "../src/index"
import { Character } from "./character"
import "./style.css"

const PANEL = "babble-voice-v1"
const range = (
  value: number,
  min: number,
  max: number,
  step: number,
): [number, number, number, number] => [value, min, max, step]
const config = {
  pitch: range(2.4, 0.25, 4.5, 0.05),
  formant: range(2.15, 0.25, 3.5, 0.01),
  intonation: range(1.35, 0, 3, 0.05),
  speed: range(2.25, 0.45, 2.8, 0.05),
  volume: range(0.5, 0, 1, 0.01),
  overlap: range(0.085, 0, 0.12, 0.005),
  softness: range(0.5, 0, 1, 0.05),
}
function VoiceDials() {
  useDialKit("Voice", config, { id: PANEL })
  return <DialRoot mode="inline" defaultOpen theme="light" productionEnabled />
}
function GitHubIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.69-1.08-2.69-1.08-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.22.82 1.22.82.71 1.21 1.87.86 2.33.66.07-.52.28-.86.51-1.06-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.73c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.32c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}
function App() {
  const [text, setText] = useState(
    "Hey, neighbor! Want to help me bury something? Chill. It's just my hopes and dreams. Not my pet rabbit or anything...",
  )
  const voiceRef = useRef<Babble | null>(null)
  const progressRef = useRef<((event: BabbleProgress) => void) | null>(null)
  useEffect(() => {
    const voice = createBabble({
      onProgress: (event) => progressRef.current?.(event),
    })
    voiceRef.current = voice
    const hidden = () => {
      if (document.hidden) voice.stop()
    }
    const stop = () => voice.stop()
    document.addEventListener("visibilitychange", hidden)
    window.addEventListener("pagehide", stop)
    return () => {
      document.removeEventListener("visibilitychange", hidden)
      window.removeEventListener("pagehide", stop)
      voice.dispose()
      voiceRef.current = null
    }
  }, [])
  const speak = () => {
    const values = DialStore.getValues(PANEL)
    voiceRef.current?.speak(text, {
      pitch: Number(values.pitch),
      formant: Number(values.formant),
      intonation: Number(values.intonation),
      speed: Number(values.speed),
      volume: Number(values.volume),
      overlap: Number(values.overlap),
      softness: Number(values.softness),
    })
  }
  return (
    <>
      <header className="masthead">
        <a className="wordmark" href="/">
          <img src="/babble-logo.svg" alt="Babble" width={276} height={74} />
        </a>
      </header>
      <main className="playground">
        <Character progressRef={progressRef} />
        <aside className="controls" aria-label="Speech playground">
          <form
            className="dialkit-root"
            data-theme="light"
            onSubmit={(event) => {
              event.preventDefault()
              speak()
            }}
          >
            <textarea
              id="speech"
              className="dialkit-text-input"
              aria-label="Something to say"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              maxLength={1024}
              spellCheck={false}
            />
            <div className="actions">
              <button type="submit" className="dialkit-button speak">
                Speak
              </button>
              <button
                type="button"
                className="dialkit-toolbar-add stop"
                aria-label="Stop"
                onClick={() => voiceRef.current?.stop()}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                </svg>
              </button>
            </div>
          </form>
          <div className="voice-dials">
            <VoiceDials />
          </div>
        </aside>
      </main>
      <footer>
        <nav aria-label="Project links">
          {__REPO_URL__ ? (
            <a href={__REPO_URL__} target="_blank" rel="noreferrer">
              <GitHubIcon />
              Repository
            </a>
          ) : (
            <span className="pending-link">
              <GitHubIcon />
              Repository
            </span>
          )}
          <a href="https://tobis.vision" target="_blank" rel="noreferrer">
            tobis.vision
          </a>
        </nav>
      </footer>
    </>
  )
}
createRoot(document.getElementById("root")!).render(<App />)
