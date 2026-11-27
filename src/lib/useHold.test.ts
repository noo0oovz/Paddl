import { describe, expect, it } from 'vitest'
import { holdStep, type HoldClock, type HoldResult } from './useHold'

/** The press-and-hold timing: this is what stands between a stray touch and a recorded win. */

/** Play a hold the way the hook does: one frame every `frame` ms, each frame remembering when the last one was drawn. */
function play(total: number, upTo: number, frame = 16, start = 1000): { last: HoldResult; at: number } {
  const clock: HoldClock = { start, last: start }
  let result: HoldResult = { status: 'holding', progress: 0 }
  let t = start
  while (t - start < upTo) {
    t += frame
    result = holdStep(clock, t, total)
    clock.last = t
    if (result.status !== 'holding') break
  }
  return { last: result, at: t - start }
}

describe('holdStep', () => {
  it('grows from 0 to 1 over the hold time and only finishes once it is reached', () => {
    const quarter = play(1500, 375)
    expect(quarter.last.status).toBe('holding')
    expect(quarter.last.progress).toBeGreaterThan(0.2)
    expect(quarter.last.progress).toBeLessThan(0.3)
    expect(play(1500, 1400).last.status).toBe('holding')
    const full = play(1500, 2000)
    expect(full.last.status).toBe('done')
    expect(full.last.progress).toBe(1)
    expect(full.at, 'it finishes at about 1.5 s, not earlier').toBeGreaterThanOrEqual(1500)
    expect(full.at).toBeLessThan(1500 + 32)
  })

  it('finishes on the exact millisecond, not one earlier', () => {
    const c: HoldClock = { start: 1000, last: 2498 }
    expect(holdStep(c, 2499, 1500).status).toBe('holding')
    expect(holdStep(c, 2500, 1500)).toEqual({ status: 'done', progress: 1 })
  })

  it('a quick tap, even a slow one, never finishes', () => {
    for (const release of [50, 150, 300, 800, 1200, 1480]) expect(play(1500, release).last.status, `${release} ms`).toBe('holding')
  })

  it('never reports more than 1 or less than 0', () => {
    expect(holdStep({ start: 1000, last: 5000 }, 5000, 1500).progress).toBe(1)
    expect(holdStep({ start: 2000, last: 1000 }, 1000, 1500).progress).toBe(0)
  })

  it('a stall (hidden tab, sleeping device) abandons the hold instead of finishing it', () => {
    // the finger went down at t=1000, the page froze, and the next frame is at t=9000: the release was never seen
    const r = holdStep({ start: 1000, last: 1016 }, 9000, 1500)
    expect(r.status).toBe('stalled')
    expect(r.progress).toBe(0)
  })

  it('a short hiccup in drawing does not cancel a real hold, but a long one does', () => {
    expect(holdStep({ start: 1000, last: 1400 }, 1500, 1500).status).toBe('holding') // a 100 ms gap
    expect(holdStep({ start: 1000, last: 1700 }, 2450, 1500).status).toBe('holding') // 750 ms gap is the limit
    expect(holdStep({ start: 1000, last: 1700 }, 2451, 1500).status).toBe('stalled')
  })

  it('works for the 1 second unlock as well', () => {
    expect(play(1000, 900).last.status).toBe('holding')
    expect(play(1000, 1100).last.status).toBe('done')
  })
})
