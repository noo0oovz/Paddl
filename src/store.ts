import { useSyncExternalStore } from 'react'
import type { Session } from './engine/types'
import { makeBackup, mergeBackup, sessionProblem, type Backup } from './lib/backup'

export interface RosterEntry {
  name: string
  level: number
}

interface Data {
  sessions: Session[]
  activeId: string | null
  roster: RosterEntry[]
  undo: number // depth of the undo stack
  saved: 'ok' | 'error' // did the last write to the device succeed?
}

const KEY = 'paddl:v1'
const UNDO_KEY = 'paddl:undo:v1'
const UNDO_LIMIT = 30

interface UndoStore {
  sessionId: string | null
  stack: string[]
}

function loadUndo(): UndoStore {
  try {
    const raw = localStorage.getItem(UNDO_KEY)
    if (raw) {
      const u = JSON.parse(raw)
      if (u && Array.isArray(u.stack)) return { sessionId: u.sessionId ?? null, stack: u.stack }
    }
  } catch {
    /* ignore */
  }
  return { sessionId: null, stack: [] }
}

const DAMAGED_KEY = 'paddl:damaged'

/** How many saved sessions were set aside at startup because they were damaged (shown once so the host knows). */
export let damagedAtStartup = 0

function load(): Omit<Data, 'undo' | 'saved'> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (Array.isArray(d.sessions)) {
        // A damaged session must never be able to crash the whole app. Keep the good ones, and set the damaged
        // ones aside (the raw data is kept under another key, never thrown away) so the host can still open Paddl.
        const good: Session[] = []
        const bad: unknown[] = []
        for (const s of d.sessions) (sessionProblem(s) ? bad : good).push(s)
        if (bad.length) {
          damagedAtStartup = bad.length
          try {
            const prev = JSON.parse(localStorage.getItem(DAMAGED_KEY) || '[]')
            localStorage.setItem(DAMAGED_KEY, JSON.stringify([...(Array.isArray(prev) ? prev : []), ...bad].slice(-20)))
          } catch {
            /* storage full: the damaged data is dropped from view but this is the best that can be done */
          }
        }
        const active = typeof d.activeId === 'string' && good.some((s) => s.id === d.activeId) ? d.activeId : null
        return { sessions: good, activeId: active, roster: Array.isArray(d.roster) ? d.roster.filter((r: unknown) => typeof r === 'object' && r !== null && typeof (r as RosterEntry).name === 'string') : [] }
      }
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  return { sessions: [], activeId: null, roster: [] }
}

const initial = load()
// Undo history survives a refresh, but only for the session it belongs to.
let undoStore = loadUndo()
if (undoStore.sessionId !== initial.activeId) undoStore = { sessionId: initial.activeId, stack: [] }

let data: Data = { ...initial, undo: undoStore.stack.length, saved: 'ok' }
const subs = new Set<() => void>()

function persist(): boolean {
  try {
    const { sessions, activeId, roster } = data
    localStorage.setItem(KEY, JSON.stringify({ sessions, activeId, roster }))
    localStorage.setItem(UNDO_KEY, JSON.stringify(undoStore))
    return true
  } catch {
    // Storage full or blocked. The undo history is the biggest part, so shed it and retry once.
    try {
      undoStore = { ...undoStore, stack: undoStore.stack.slice(-5) }
      const { sessions, activeId, roster } = data
      localStorage.setItem(KEY, JSON.stringify({ sessions, activeId, roster }))
      localStorage.removeItem(UNDO_KEY)
      return true
    } catch {
      return false
    }
  }
}

function commit(next: Partial<Omit<Data, 'undo' | 'saved'>>) {
  data = { ...data, ...next }
  const ok = persist()
  data = { ...data, undo: undoStore.stack.length, saved: ok ? 'ok' : 'error' }
  subs.forEach((f) => f())
}

export function useData(): Data {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => data,
  )
}

function resetUndo(sessionId: string | null) {
  undoStore = { sessionId, stack: [] }
}

export function addSession(s: Session) {
  resetUndo(s.id)
  const roster = [...data.roster]
  for (const p of s.players) {
    const i = roster.findIndex((r) => r.name.toLowerCase() === p.name.toLowerCase())
    if (i >= 0) roster.splice(i, 1)
    roster.unshift({ name: p.name, level: p.level })
  }
  commit({ sessions: [s, ...data.sessions], activeId: s.id, roster: roster.slice(0, 80) })
}

export function openSession(id: string | null) {
  resetUndo(id)
  commit({ activeId: id })
}

export function removeSession(id: string) {
  resetUndo(null)
  commit({ sessions: data.sessions.filter((s) => s.id !== id), activeId: data.activeId === id ? null : data.activeId })
}

export function forgetRoster(name: string) {
  commit({ roster: data.roster.filter((r) => r.name !== name) })
}

/** Apply a change to the open session, remembering the previous state for undo. */
/** Returns true when something actually changed (an ignored request leaves the session, Undo and storage alone). */
export function updateActive(fn: (s: Session) => Session): boolean {
  const cur = data.sessions.find((s) => s.id === data.activeId)
  if (!cur) return false
  const next = fn(cur)
  if (next === cur) return false
  if (undoStore.sessionId !== cur.id) resetUndo(cur.id)
  undoStore.stack.push(JSON.stringify(cur))
  if (undoStore.stack.length > UNDO_LIMIT) undoStore.stack.shift()
  commit({ sessions: data.sessions.map((s) => (s.id === cur.id ? next : s)) })
  return true
}

export function undo() {
  const prev = undoStore.stack.pop()
  if (!prev) return
  const restored = JSON.parse(prev) as Session
  commit({ sessions: data.sessions.map((s) => (s.id === restored.id ? restored : s)) })
}

/* ----------------------------------------------------------------------------------------------
 * Backup and restore
 * -------------------------------------------------------------------------------------------- */
const SAFETY_KEY = 'paddl:before-restore'

/** Everything on the device as a backup object (the file the host downloads). */
export function exportAll(): Backup {
  return makeBackup(data.sessions, data.roster)
}

/** Take a copy of the current data just before a restore overwrites it, so a wrong click can be undone. */
function saveSafetyCopy() {
  try {
    localStorage.setItem(SAFETY_KEY, JSON.stringify({ at: Date.now(), ...makeBackup(data.sessions, data.roster) }))
  } catch {
    /* storage full: restoring still works, there is just no safety copy */
  }
}

export function hasSafetyCopy(): number | null {
  try {
    const raw = localStorage.getItem(SAFETY_KEY)
    return raw ? (JSON.parse(raw).at as number) : null
  } catch {
    return null
  }
}

export interface RestoreReport {
  mode: 'merge' | 'replace'
  sessions: number
  added: number
  updated: number
  kept: number
}

/**
 * Put a validated backup onto this device. "merge" keeps everything already here and adds or upgrades sessions from
 * the file; "replace" makes the device match the file. Either way the open session and undo history are reset, so
 * nothing refers to data that just changed, and a safety copy is stored first.
 */
export function restoreBackup(b: Backup, mode: 'merge' | 'replace'): RestoreReport {
  saveSafetyCopy()
  resetUndo(null)
  if (mode === 'replace') {
    commit({ sessions: [...b.sessions].sort((x, y) => y.createdAt - x.createdAt), roster: b.roster.slice(0, 200), activeId: null })
    return { mode, sessions: b.sessions.length, added: b.sessions.length, updated: 0, kept: 0 }
  }
  const m = mergeBackup({ sessions: data.sessions, roster: data.roster }, b)
  commit({ sessions: m.sessions, roster: m.roster, activeId: null })
  return { mode, sessions: m.sessions.length, added: m.added, updated: m.updated, kept: m.kept }
}

/** Undo the last restore using the safety copy. */
export function undoRestore(): boolean {
  try {
    const raw = localStorage.getItem(SAFETY_KEY)
    if (!raw) return false
    const b = JSON.parse(raw) as Backup
    resetUndo(null)
    commit({ sessions: b.sessions, roster: b.roster, activeId: null })
    localStorage.removeItem(SAFETY_KEY)
    return true
  } catch {
    return false
  }
}
