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
  undo: number // depth of the undo stack (not persisted)
}

const KEY = 'paddl:v1'
const UNDO_LIMIT = 30

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (Array.isArray(d.sessions)) {
        return { sessions: d.sessions, activeId: d.activeId ?? null, roster: Array.isArray(d.roster) ? d.roster : [], undo: 0 }
      }
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  return { sessions: [], activeId: null, roster: [], undo: 0 }
}

let data: Data = load()
let undoStack: string[] = []
const subs = new Set<() => void>()

function commit(next: Partial<Data>) {
  data = { ...data, ...next, undo: undoStack.length }
  try {
    const { sessions, activeId, roster } = data
    localStorage.setItem(KEY, JSON.stringify({ sessions, activeId, roster }))
  } catch {
    /* storage full or blocked: keep running in memory */
  }
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

export function addSession(s: Session) {
  undoStack = []
  const roster = [...data.roster]
  for (const p of s.players) {
    const i = roster.findIndex((r) => r.name.toLowerCase() === p.name.toLowerCase())
    if (i >= 0) roster.splice(i, 1)
    roster.unshift({ name: p.name, level: p.level })
  }
  commit({ sessions: [s, ...data.sessions], activeId: s.id, roster: roster.slice(0, 80) })
}

export function openSession(id: string | null) {
  undoStack = []
  commit({ activeId: id })
}

export function removeSession(id: string) {
  undoStack = []
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
  undoStack.push(JSON.stringify(cur))
  if (undoStack.length > UNDO_LIMIT) undoStack.shift()
  commit({ sessions: data.sessions.map((s) => (s.id === cur.id ? next : s)) })
}

export function undo() {
  const prev = undoStack.pop()
  if (!prev) return
  const restored = JSON.parse(prev) as Session
  commit({ sessions: data.sessions.map((s) => (s.id === restored.id ? restored : s)) })
}
