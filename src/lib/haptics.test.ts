import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A tiny in-memory localStorage and a spy for navigator.vibrate, so the module can be exercised without a browser. */
function setup(opts: { vibrate: boolean; saved?: string | null }) {
  const store = new Map<string, string>()
  if (opts.saved != null) store.set('paddl:haptics', opts.saved)
  const vibrate = vi.fn(() => true)
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
  vi.stubGlobal('navigator', opts.vibrate ? { vibrate } : {})
  return { vibrate, store }
}
const load = async () => { vi.resetModules(); return import('./haptics') }

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('haptics', () => {
  it('is on by default where the device can vibrate, and a win gives one short pulse', async () => {
    const { vibrate } = setup({ vibrate: true })
    const h = await load()
    expect(h.hapticsSupported()).toBe(true)
    expect(h.hapticsOn()).toBe(true)
    h.buzz('win')
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith([22])
  })

  it('undo feels different from a win (a double tap), so the host can tell them apart without looking', async () => {
    const { vibrate } = setup({ vibrate: true })
    const h = await load()
    h.buzz('undo')
    expect(vibrate).toHaveBeenCalledWith([14, 70, 14])
    expect(h.PULSE.undo).not.toEqual(h.PULSE.win)
  })

  it('does nothing when switched off, and remembers the choice across a reload', async () => {
    const { vibrate, store } = setup({ vibrate: true })
    let h = await load()
    h.setHaptics(false)
    vibrate.mockClear()
    h.buzz('win')
    expect(vibrate).not.toHaveBeenCalled()
    expect(store.get('paddl:haptics')).toBe('off')
    h = await load() // a reload
    expect(h.hapticsOn()).toBe(false)
    h.buzz('win')
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('switching it on gives a sample buzz so the host feels what it is', async () => {
    const { vibrate } = setup({ vibrate: true, saved: 'off' })
    const h = await load()
    expect(h.hapticsOn()).toBe(false)
    h.setHaptics(true)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('does nothing, and never throws, on a device with no vibration (an iPhone)', async () => {
    setup({ vibrate: false })
    const h = await load()
    expect(h.hapticsSupported()).toBe(false)
    expect(() => h.buzz('win')).not.toThrow()
    expect(() => h.setHaptics(true)).not.toThrow()
  })

  it('never throws when the browser refuses to vibrate or storage is blocked', async () => {
    const vibrate = vi.fn(() => { throw new Error('blocked until the page is tapped') })
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    const h = await load()
    expect(h.hapticsOn()).toBe(true) // falls back to the default
    expect(() => h.buzz('win')).not.toThrow()
    expect(() => h.setHaptics(false)).not.toThrow()
  })

  it('sends a copy of the pattern, so nothing can change the shared one', async () => {
    const { vibrate } = setup({ vibrate: true })
    const h = await load()
    h.buzz('undo')
    const sent = (vibrate.mock.calls[0] as unknown as [number[]])[0]
    sent.push(999)
    expect([...h.PULSE.undo]).toEqual([14, 70, 14])
  })
})
