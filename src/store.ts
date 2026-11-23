import { useSyncExternalStore } from 'react'
import type { Session } from './engine/types'

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

function load(): Omit<Data, 'undo' | 'saved'> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (Array.isArray(d.sessions)) {
        return { sessions: d.sessions, activeId: d.activeId ?? null, roster: Array.isArray(d.roster) ? d.roster : [] }
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
export function updateActive(fn: (s: Session) => Session) {
  const cur = data.sessions.find((s) => s.id === data.activeId)
  if (!cur) return
  const next = fn(cur)
  if (next === cur) return
  if (undoStore.sessionId !== cur.id) resetUndo(cur.id)
  undoStore.stack.push(JSON.stringify(cur))
  if (undoStore.stack.length > UNDO_LIMIT) undoStore.stack.shift()
  commit({ sessions: data.sessions.map((s) => (s.id === cur.id ? next : s)) })
}

export function undo() {
  const prev = undoStore.stack.pop()
  if (!prev) return
  const restored = JSON.parse(prev) as Session
  commit({ sessions: data.sessions.map((s) => (s.id === restored.id ? restored : s)) })
}
