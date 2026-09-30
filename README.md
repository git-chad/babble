# babble

A small, original procedural character voice for the browser. Native Web Audio,
zero runtime dependencies, no speech recordings, voice packages or network TTS.
English-like phonemes flow into connected words with tunable pitch, formants and
punctuation-aware expression. It is a stylized voice, not general-purpose TTS.

The repository includes a character-only playground with an editable speech
input and DialKit voice controls. The character is demo artwork, not part of the
library package. Portfolio: [tobis.vision](https://tobis.vision).

## Install

```sh
npm install @gitchad/babble
```

## Local setup

Requires Bun 1.2.14 or newer for development/building. Consumers do not need Bun.

```sh
bun install --frozen-lockfile
bun test
bun run build
bun run typecheck
bun run demo:dev
```

The demo runs at `http://127.0.0.1:4100`; set `PORT` to change it. `demo:dev` builds
once and serves; rerun `bun run demo:build` after changes. `bun run demo:build`
creates the complete static site in `demo/dist`. `bun run demo:preview` serves an
existing build. Set `DEMO_REPO_URL` when building to enable its Repository link.
The portfolio link is already configured. Hosting is configured separately.

To test a local artifact:

```sh
bun run build
npm pack --ignore-scripts
npm install ./gitchad-babble-0.1.0.tgz
```

## API

```ts
import { createBabble } from "@gitchad/babble"

const voice = createBabble() // No AudioContext, synthesis or network request yet.

// Call directly from a deliberate user gesture, such as a button click.
voice.speak("You found the bag?", {
  pitch: 1.35,
  formant: 1,
  intonation: 1,
  speed: 1.5,
  volume: 0.55,
  overlap: 0,
  softness: 0.7,
})

voice.stop()    // Release active sound and cancel queued/pending speech.
voice.dispose() // Release nodes/buffers/listeners and close its owned context.
```

`createBabble({ context?: AudioContext, onProgress?: (event: BabbleProgress) => void })`
can share an existing caller-owned context; it never closes a supplied context.
The public types `Babble`, `BabbleOptions`, `BabbleProgress` and `BabbleTextCue`,
plus `defaultBabbleOptions`, are exported. ESM and TypeScript declarations are
included. Importing the package does not require a browser or create audio.

## Tuning

| Option | Default | Range | Effect |
| --- | ---: | --- | --- |
| `pitch` | 1.35 | 0.25–4.5 | Fundamental frequency; does not change timing/formants |
| `formant` | 1 | 0.25–3.5 | Vocal resonances; does not change fundamental/timing |
| `intonation` | 1 | 0–3 | Flat at 0, modest at 1, theatrical at 2–3 |
| `speed` | 1.5 | 0.45–2.8 | Articulation duration and pauses, independently of pitch |
| `volume` | 0.55 | 0–1 | Output gain |
| `overlap` | 0 | 0–0.12 seconds | Removes the word gap before overlapping adjacent words |
| `softness` | 0.7 | 0–1 | Softer consonant air, attacks and final-stop release |

Options apply to the next `speak`. Finite out-of-range inputs clamp; missing and
non-finite values use defaults. New speech replaces the current utterance.
Punctuation selects smooth endings: questions rise, statements settle,
exclamations emphasize, commas continue and ellipses trail off. Endings shape
the final full vowel, including before trailing consonants and the quiet
"bag-uh" release. Intonation 0 removes all pitch variation. No random per-letter
notes, playback-rate pitch shifting, or borrowed speech implementation is used.

## Timed text

```ts
const voice = createBabble({
  onProgress(event) {
    switch (event.type) {
      case "start":
        // event.text preserves original case/accents/punctuation.
        // event.cues contains complete source-word display chunks.
        break
      case "word":
        // Reveal cue event.index; event.audioTime is its audible attack time.
        break
      case "end":
        // Keep completed text visible, if desired.
        break
      case "stop":
        // Clear text on Stop, replacement, interruption or disposal.
        break
    }
  },
})
```

Callbacks follow actual scheduled source onsets, not synthesis lookahead. A
16 ms poll checks the output AudioContext timestamp, with reported latency as a
fallback. Initial unvoiced stop closures, pauses, speed, explicit overlap and
delayed scheduling are accounted for. Main-thread load can delay delivery;
device latency estimates still need real browser listening. The core never
touches the DOM. With no callback, no progress timer is created.

Source text retains spelling, case, accents, whitespace and punctuation.
Numbers reveal as complete source words at their first spoken digit. Display
and speech share truncation limits; unsaid long-word suffixes are excluded.
The demo uses 14px Times New Roman with white inline highlights and reserves
future word layout invisibly. Completed text holds; Stop/tab hiding clears it.
Only one polite complete-phrase announcement is exposed to screen readers.

## Lifecycle and limits

Use a modern browser with Web Audio. Speech must start from a user gesture;
autoplay restrictions are handled by calling `resume` immediately inside Speak.
Use `stop` on document hiding/navigation and `dispose` on teardown. Pending
resume, old timers and sources cannot revive replaced/stopped utterances.
The demo does this automatically and uses one lazy AudioContext.

Input is bounded to 240 normalized characters, 64 scored words, 30 seconds, and
32 letters/three seconds per word. A bounded LRU holds at most 12 word buffers
and six seconds of mono 24 kHz PCM. Pitch resonances remain below Nyquist,
waveforms stay bounded, and zero overlap never stacks word audio. English
spelling and stress are approximate; names/irregular words may be inaccurate,
and unsupported scripts are silent. This package is not an accessibility TTS
replacement or a universal language model.

The library has no React, Three.js, DialKit, renderer, font or asset dependencies.
The current core is 12,140 bytes minified / 5,537 bytes gzip (level 9).
Those are development-only demo dependencies. `files` explicitly allows only
`dist`, this README and the code license into the npm tarball.

## License

Library and demo code: MIT, copyright Tobias Moccagatta. The cat artwork/model
and textures remain separately owned; see `demo/public/character/LICENSE`.
Character assets are not included in the npm package.
