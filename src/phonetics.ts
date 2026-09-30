/** Deliberately small English spelling rules, not a general pronunciation model. */
export const vowelFormants = {
  AA: [730, 1090, 2440],
  AE: [660, 1720, 2410],
  AH: [640, 1190, 2390],
  EH: [530, 1840, 2480],
  IH: [390, 1990, 2550],
  IY: [270, 2290, 3010],
  AO: [570, 840, 2410],
  UH: [440, 1020, 2240],
  UW: [300, 870, 2240],
  AX: [500, 1500, 2500],
  ER: [490, 1350, 1690],
} as const
export const diphthongs = {
  AY: ["AA", "IY"],
  EY: ["EH", "IY"],
  OW: ["AO", "UW"],
  AW: ["AA", "UW"],
  OY: ["AO", "IY"],
} as const
export type Vowel = keyof typeof vowelFormants
export type Phone =
  | Vowel
  | keyof typeof diphthongs
  | "M"
  | "N"
  | "NG"
  | "L"
  | "R"
  | "W"
  | "Y"
  | "S"
  | "Z"
  | "SH"
  | "ZH"
  | "F"
  | "V"
  | "TH"
  | "DH"
  | "H"
  | "P"
  | "B"
  | "T"
  | "D"
  | "K"
  | "G"
  | "CH"
  | "JH"

export const isVowel = (phone: Phone) =>
  phone in vowelFormants || phone in diphthongs
export const stopPhones = new Set<Phone>(["P", "B", "T", "D", "K", "G"])
const words: Record<string, readonly Phone[]> = {
  a: ["AX"],
  an: ["AE", "N"],
  the: ["DH", "AX"],
  what: ["W", "AH", "T"],
  was: ["W", "AH", "Z"],
  this: ["DH", "IH", "S"],
  that: ["DH", "AE", "T"],
  i: ["AY"],
  im: ["AY", "M"],
  you: ["Y", "UW"],
  your: ["Y", "ER"],
  are: ["AA", "R"],
  is: ["IH", "Z"],
  of: ["AH", "V"],
  to: ["T", "UW"],
  do: ["D", "UW"],
  have: ["H", "AE", "V"],
  some: ["S", "AH", "M"],
  come: ["K", "AH", "M"],
  one: ["W", "AH", "N"],
  two: ["T", "UW"],
  said: ["S", "EH", "D"],
  hello: ["H", "AX", "L", "OW"],
  hey: ["H", "EY"],
  my: ["M", "AY"],
  by: ["B", "AY"],
  why: ["W", "AY"],
  how: ["H", "AW"],
  now: ["N", "AW"],
  get: ["G", "EH", "T"],
  give: ["G", "IH", "V"],
  love: ["L", "AH", "V"],
}
const groups: [string, Phone[]][] = [
  ["tion", ["SH", "AX", "N"]],
  ["sion", ["ZH", "AX", "N"]],
  ["eigh", ["EY"]],
  ["tch", ["CH"]],
  ["dge", ["JH"]],
  ["igh", ["AY"]],
  ["sh", ["SH"]],
  ["ch", ["CH"]],
  ["th", ["TH"]],
  ["ph", ["F"]],
  ["wh", ["W"]],
  ["ng", ["NG"]],
  ["qu", ["K", "W"]],
  ["ck", ["K"]],
  ["ee", ["IY"]],
  ["ea", ["IY"]],
  ["oo", ["UW"]],
  ["ai", ["EY"]],
  ["ay", ["EY"]],
  ["ei", ["EY"]],
  ["ey", ["EY"]],
  ["oa", ["OW"]],
  ["ow", ["OW"]],
  ["ou", ["AW"]],
  ["oi", ["OY"]],
  ["oy", ["OY"]],
  ["au", ["AO"]],
  ["aw", ["AO"]],
  ["er", ["ER"]],
  ["ir", ["ER"]],
  ["ur", ["ER"]],
  ["ar", ["AA", "R"]],
  ["or", ["AO", "R"]],
]
const letters: Record<string, Phone> = {
  a: "AE",
  e: "EH",
  i: "IH",
  o: "AA",
  u: "AH",
  b: "B",
  d: "D",
  f: "F",
  g: "G",
  h: "H",
  j: "JH",
  k: "K",
  l: "L",
  m: "M",
  n: "N",
  p: "P",
  r: "R",
  s: "S",
  t: "T",
  v: "V",
  w: "W",
  y: "Y",
  z: "Z",
}
const longVowels: Record<string, Phone> = {
  a: "EY",
  e: "IY",
  i: "AY",
  o: "OW",
  u: "UW",
}

export function phonemizeWord(input: string): Phone[] {
  const word = input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 32)
  if (Object.hasOwn(words, word)) return [...words[word]!]
  const result: Phone[] = []
  for (let i = 0; i < word.length; ) {
    const group = groups.find(([spelling]) => word.startsWith(spelling, i))
    if (group) {
      result.push(...group[1])
      i += group[0].length
      continue
    }
    const letter = word[i]!
    const next = word[i + 1] ?? ""
    if (letter === "e" && i === word.length - 1 && word.length > 2) {
      i++
      continue
    }
    let phone = letters[letter]
    if (
      longVowels[letter] &&
      i === word.length - 3 &&
      /[bcdfgklmnprstvz]e$/.test(word)
    )
      phone = longVowels[letter]
    else if (letter === "c") phone = /[eiy]/.test(next) ? "S" : "K"
    else if (letter === "g" && /[eiy]/.test(next)) phone = "JH"
    else if (letter === "y" && i === word.length - 1) phone = "IY"
    else if (letter === "x") {
      result.push("K")
      phone = "S"
    }
    if (phone) result.push(phone)
    // Doubled consonants describe one articulation, not two extra vowel pips.
    i += next === letter && !/[aeiou]/.test(letter) ? 2 : 1
  }
  return result
}
