import { describe, expect, it } from 'vitest'
import { fitSize } from './fitText'

describe('fitSize: the biggest font that still fits', () => {
  it('a name that is as wide as the box at the probe size gets the probe size', () => {
    expect(fitSize(200, 100, 200, 10, 200)).toBe(100)
  })
  it('a name twice as wide as its box gets half the size', () => {
    expect(fitSize(400, 100, 200, 10, 200)).toBe(50)
  })
  it('a short name is capped at the maximum, not blown up to fill the box', () => {
    expect(fitSize(50, 100, 600, 10, 64)).toBe(64)
  })
  it('a very long name never goes below the minimum (it is then cut with an ellipsis instead)', () => {
    expect(fitSize(5000, 100, 100, 14, 64)).toBe(14)
  })
  it('the result rounds DOWN, so the text can never be a hair too wide', () => {
    const s = fitSize(333, 100, 200, 10, 200) // 60.06...
    expect(s).toBeLessThanOrEqual((200 / 333) * 100)
  })
  it('never returns a size that overflows: width at that size is within the box', () => {
    for (const natural of [80, 120, 333, 640, 1500]) for (const box of [60, 100, 240, 480]) {
      const s = fitSize(natural, 100, box, 1, 400)
      expect((natural / 100) * s).toBeLessThanOrEqual(box + 1e-9)
    }
  })
  it('bad measurements fall back to the minimum instead of NaN', () => {
    expect(fitSize(0, 100, 200, 12, 64)).toBe(12)
    expect(fitSize(100, 100, 0, 12, 64)).toBe(12)
    expect(fitSize(NaN, 100, 200, 12, 64)).toBe(12)
    expect(fitSize(100, 100, -5, 12, 64)).toBe(12)
  })
})
