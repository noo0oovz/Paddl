import { beforeEach, describe, expect, it, vi } from 'vitest'

/** undo() must say whether it did anything: the buzz on Undo is tied to it, so an empty Undo must not feel like one that worked. */
function fakeStorage() {
  const m = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) })
  vi.stubGlobal('window', { addEventListener: () => {} })
}
const load = async () => { vi.resetModules(); fakeStorage(); return { store: await import('./store'), S: await import('./engine/session') } }
beforeEach(() => vi.unstubAllGlobals())

describe('undo() reports whether it undid anything', () => {
  it('false with nothing to undo, true after a change, false again once used up', async () => {
    const { store, S } = await load()
    expect(store.undo()).toBe(false)
    store.addSession(S.createSession('t', { courts: 1 }, Array.from({ length: 6 }, (_, i) => ({ name: 'P' + i }))))
    expect(store.undo(), 'a new session is not an undoable step').toBe(false)
    expect(store.updateActive((x) => S.addPlayer(x, 'Late'))).toBe(true)
    expect(store.undo()).toBe(true)
    expect(store.undo()).toBe(false)
  })
  it('undoIfUnchanged is false (and does nothing) when something else happened since', async () => {
    const { store, S } = await load()
    store.addSession(S.createSession('t', { courts: 1 }, Array.from({ length: 6 }, (_, i) => ({ name: 'P' + i }))))
    store.updateActive((x) => S.addPlayer(x, 'A'))
    const at = store.changeCount()
    store.updateActive((x) => S.addPlayer(x, 'B'))
    expect(store.undoIfUnchanged(at)).toBe(false)
  })
})
