import { expect, test } from "bun:test"
import { scoreBabble, scoreUtterance } from "./score.js"

test("display preserves source case, accents, whitespace, quotes and punctuation", () => {
  const text = "  ¡Hola,  CAFÉ…\n“You found the bag?” Cafe\u0301!  "
  const plan = scoreUtterance(text)
  expect(plan.text).toBe(text)
  expect(plan.cues.map((cue) => cue.text).join("")).toBe(text)
  expect(plan.cues.map((cue) => cue.text)).toEqual([
    "  ¡Hola,  ",
    "CAFÉ…\n",
    "“You ",
    "found ",
    "the ",
    "bag?” ",
    "Cafe\u0301!  ",
  ])
  expect(plan.words).toEqual(
    scoreBabble(text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()),
  )
})

test("digit runs reveal as complete source words, but punctuation never reveals the next clause early", () => {
  const plan = scoreUtterance("2026?!Hi.There,  ﬁne.")
  expect(plan.text).toBe("2026?!Hi.There,  ﬁne.")
  expect(plan.cues).toEqual([
    { text: "2026?!", wordIndex: 0 },
    { text: "Hi.", wordIndex: 4 },
    { text: "There,  ", wordIndex: 5 },
    { text: "ﬁne.", wordIndex: 6 },
  ])
  expect(scoreUtterance("🌿✨ 漢字").text).toBe("")
  expect(
    scoreUtterance("🌿 Hello — there! ✨").cues.map((cue) => cue.text),
  ).toEqual(["🌿 Hello — ", "there! ✨"])
})

test("display stops at spoken limits and removes only unspoken long-word suffixes", () => {
  const longWord = scoreUtterance(`${"a".repeat(80)} next!`)
  expect(longWord.text).toBe(`${"a".repeat(32)} next!`)
  const words = scoreUtterance("A ".repeat(100))
  expect(words.words).toHaveLength(64)
  expect(words.text).toBe("A ".repeat(64))
  const characters = scoreUtterance(`${" ".repeat(236)}Café NEXT`)
  expect(characters.text).toBe(`${" ".repeat(236)}Café`)
  const duration = scoreUtterance("Testing ".repeat(40), { speed: 0.45 })
  expect(
    duration.words.at(-1)!.at + duration.words.at(-1)!.duration,
  ).toBeLessThanOrEqual(30.00001)
  expect(duration.text).toBe("Testing ".repeat(duration.words.length))
  expect(duration.cues.length).toBe(duration.words.length)
})
