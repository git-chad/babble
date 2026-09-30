"use client"

import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { BabbleProgress, BabbleTextCue } from "../src/index"
import { isSpeechPlacement, type SpeechPlacement } from "./lib/speech-layout"
import "./speech.css"

export type SpeechProgressRef = RefObject<
  ((event: BabbleProgress) => void) | null
>
type Speech = {
  text: string
  cues: readonly BabbleTextCue[]
  revealed: number
  complete: boolean
}

/** Only this small DOM layer updates on a spoken word; the scene stays untouched. */
export function BuddySpeech({
  progressRef,
  placement,
}: {
  progressRef: SpeechProgressRef
  placement: SpeechPlacement | null
}) {
  const [speech, setSpeech] = useState<Speech | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    progressRef.current = (event) => {
      if (event.type === "stop") setSpeech(null)
      if (event.type === "start")
        setSpeech({
          text: event.text,
          cues: event.cues,
          revealed: 0,
          complete: false,
        })
      if (event.type === "word")
        setSpeech((current) =>
          current ? { ...current, revealed: event.index + 1 } : current,
        )
      if (event.type === "end")
        setSpeech((current) =>
          current ? { ...current, complete: true } : current,
        )
    }
    return () => {
      progressRef.current = null
    }
  }, [progressRef])

  const revealed = speech?.revealed ?? 0
  const safePlacement = isSpeechPlacement(placement) ? placement : null
  useLayoutEffect(() => {
    if (!safePlacement) return
    const viewport = viewportRef.current
    const word = viewport?.querySelector<HTMLElement>(
      `[data-speech-word="${revealed - 1}"]`,
    )
    if (!(viewport && word)) return
    // Long passages advance only when necessary; layout/wrapping never depends
    // on reveal progress. No scroll animation, including with reduced motion.
    const overflow =
      word.getBoundingClientRect().bottom -
      viewport.getBoundingClientRect().bottom
    if (overflow > 0) viewport.scrollTop += overflow + 2
  }, [revealed, safePlacement])

  return (
    <>
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {speech?.complete ? speech.text : ""}
      </output>
      {speech && safePlacement ? (
        <div
          ref={viewportRef}
          className={"speech-text"}
          data-buddy-speech
          aria-hidden="true"
          style={{
            left: safePlacement.left,
            top: safePlacement.top,
            width: safePlacement.width,
            maxHeight: safePlacement.maxHeight,
            transform: safePlacement.above ? "translateY(-100%)" : undefined,
          }}
        >
          {speech.cues.map((cue, index) => (
            <span
              key={cue.wordIndex}
              data-speech-word={index}
              className={"speech-word"}
              style={{
                visibility: index < speech.revealed ? "visible" : "hidden",
              }}
            >
              {cue.text}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
