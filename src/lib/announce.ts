import { useSyncExternalStore } from 'react'

/* ---------------------------------------------------------------------------------------------
 * Phrases: what is said. Written the way a person at the front desk would say it, with commas and full stops
 * so the speech engine pauses in the right places. A flat "A B C D" run-on is what makes it sound like a robot.
 * ------------------------------------------------------------------------------------------- */

/** "Ana", "Ana and Ben", "Ana, Ben and Cara". */
export function sayNames(names: string[]): string {
  const n = names.map((x) => x.trim()).filter(Boolean)
  if (n.length <= 1) return n[0] ?? ''
  if (n.length === 2) return `${n[0]} and ${n[1]}`
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

/** Make a name easy to pronounce: drop emoji and symbols, collapse spacing, spell out "&". */
export function speakable(name: string): string {
  return name
    .replace(/&/g, ' and ')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/[_*#@<>[\]{}|\\/^~`=+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The court that has just started: "Court 1. Ana and Ben, versus, Cara and Dan. Please come to the court." */
export function courtCall(court: string, a: string[], b: string[]): string {
  const left = sayNames(a.map(speakable))
  const right = sayNames(b.map(speakable))
  return `${speakable(court)}. ${left}, versus, ${right}. Please head to the court.`
}

/** The next match: "Up next. Ana and Ben, versus, Cara and Dan. Please get ready." */
export function upNextCall(a: string[], b: string[] | null): string {
  const left = sayNames(a.map(speakable))
  if (!b) return `Up next. ${left}, you are challenging the winners. Please get ready.`
  const right = sayNames(b.map(speakable))
  return `Up next. ${left}, versus, ${right}. Please get ready.`
}

/* ---------------------------------------------------------------------------------------------
 * Voices: choosing the most natural one the device has.
 * ------------------------------------------------------------------------------------------- */

export interface VoiceLike {
  name: string
  lang: string
  localService?: boolean
  default?: boolean
  voiceURI?: string
}

/**
 * How human a voice is likely to sound. The names are the vendors' own labels: "Natural", "Neural" and "Online" are
 * Microsoft's neural voices, "Premium" and "Enhanced" are Apple's higher quality downloads, and Google's network voices
 * are far less robotic than the on-device ones. Higher is better.
 */
export function voiceScore(v: VoiceLike, lang = 'en'): number {
  const n = v.name.toLowerCase()
  let score = 0
  if (/natural|neural/.test(n)) score += 100 // Microsoft neural voices: by far the most human
  if (/premium/.test(n)) score += 90
  if (/enhanced/.test(n)) score += 80
  if (/google/.test(n)) score += 60 // Google's network voices
  if (/online/.test(n)) score += 40
  if (/siri/.test(n)) score += 70
  if (/samantha|ava|allison|serena|karen|daniel|moira|tessa|aaron|nicky|susan|zira|aria|jenny|guy|davis|sonia|libby/.test(n)) score += 12 // well-liked English voices
  if (/compact/.test(n)) score -= 40 // Apple's lowest-quality tier
  if (/espeak|festival|pico|robot|novelty|whisper|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|trinoids|zarvox|albert|fred|junior|kathy|ralph/.test(n)) score -= 200 // joke and robotic voices
  if (v.lang.toLowerCase().startsWith(lang.toLowerCase())) score += 30
  else score -= 100 // never announce English names in a French voice by accident
  if (/en[-_]?(us|gb|au|ca|ph|in|ie|nz|za)/i.test(v.lang)) score += 5
  return score
}

/** The best available voice for the language, or null when the device has none. */
export function pickVoice<T extends VoiceLike>(voices: T[], lang = 'en', preferredName?: string | null): T | null {
  const usable = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()))
  if (!usable.length) return null
  if (preferredName) {
    const chosen = usable.find((v) => v.name === preferredName)
    if (chosen) return chosen
  }
  return [...usable].sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang) || a.name.localeCompare(b.name))[0]
}

/** Voices worth showing in the picker, best first. Joke and robotic voices are left out. */
export function pickerVoices<T extends VoiceLike>(voices: T[], lang = 'en'): T[] {
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()) && voiceScore(v, lang) > -100)
    .sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang) || a.name.localeCompare(b.name))
}

/* ---------------------------------------------------------------------------------------------
 * Speaking
 * ------------------------------------------------------------------------------------------- */

const KEY_VOICE = 'paddl:voice'
const KEY_RATE = 'paddl:voice-rate'
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const put = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

let voices: SpeechSynthesisVoice[] = []
let loaded = false

/** Browsers load their voice list lazily, and sometimes only after the first call. */
function loadVoices() {
  if (typeof speechSynthesis === 'undefined') return
  const list = speechSynthesis.getVoices()
  if (list.length) {
    voices = list
    loaded = true
    emit()
  }
}

export function initVoices() {
  if (typeof speechSynthesis === 'undefined') return
  loadVoices()
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
}

export function speechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function chosenVoiceName(): string | null {
  return get(KEY_VOICE)
}

export function setVoiceName(name: string | null) {
  if (name) put(KEY_VOICE, name)
  else
    try {
      localStorage.removeItem(KEY_VOICE)
    } catch {
      /* ignore */
    }
  emit()
}

export function getRate(): number {
  const r = Number(get(KEY_RATE))
  return Number.isFinite(r) && r >= 0.6 && r <= 1.3 ? r : 0.95
}

export function setRate(r: number) {
  put(KEY_RATE, String(r))
  emit()
}

export function activeVoice(): SpeechSynthesisVoice | null {
  if (!loaded) loadVoices()
  return pickVoice(voices, 'en', chosenVoiceName())
}

export function availableVoices(): SpeechSynthesisVoice[] {
  if (!loaded) loadVoices()
  return pickerVoices(voices, 'en')
}

/** Re-render when the voice list, the chosen voice or the speed changes. */
export function useVoiceSettings(): { voice: string | null; rate: number; count: number } {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => snapshot(),
  )
}

let snap = { voice: null as string | null, rate: 0.95, count: 0 }
function snapshot() {
  const next = { voice: chosenVoiceName(), rate: getRate(), count: voices.length }
  if (next.voice !== snap.voice || next.rate !== snap.rate || next.count !== snap.count) snap = next
  return snap
}

/** Split a call into sentences so each is spoken with its own natural pause and intonation. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
}

let speaking = 0

/**
 * Say it aloud. Each sentence is its own utterance with a slightly different pitch and a short gap between them,
 * which sounds like a person reading an announcement and not like one flat stream of words.
 * Returns false when this device cannot speak.
 */
export function speak(text: string): boolean {
  if (!speechSupported()) return false
  const parts = sentences(text)
  if (!parts.length) return false
  stopSpeaking()
  const voice = activeVoice()
  const rate = getRate()
  const ticket = ++speaking
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part)
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    } else u.lang = 'en-US'
    u.rate = rate
    // A caller's voice rises a little on the court number and settles at the end; vary it so it is never monotone.
    u.pitch = i === 0 ? 1.08 : i === parts.length - 1 ? 0.97 : 1.02
    u.volume = 1
    u.onend = () => { if (ticket === speaking && i === parts.length - 1) speaking = 0 }
    speechSynthesis.speak(u)
  })
  return true
}

export function stopSpeaking() {
  if (!speechSupported()) return
  speaking++
  speechSynthesis.cancel()
}
