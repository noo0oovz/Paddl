import { describe, expect, it } from 'vitest'
import { cell, resultsCsv } from './csv'
import { createSession, finishMatch } from '../engine/session'

describe('csv cell', () => {
  it('leaves plain text alone', () => {
    expect(cell('Ana')).toBe('Ana')
    expect(cell(12)).toBe('12')
    expect(cell(0)).toBe('0')
  })
  it('blank for missing values', () => {
    expect(cell(null)).toBe('')
    expect(cell(undefined)).toBe('')
  })
  it('wraps and escapes commas, quotes and line breaks', () => {
    expect(cell('Smith, J')).toBe('"Smith, J"')
    expect(cell('say "hi"')).toBe('"say ""hi"""')
    expect(cell('two\nlines')).toBe('"two\nlines"')
  })
  it('defuses spreadsheet formulas', () => {
    for (const bad of ['=1+1', '+SUM(A1)', '-2', '@cmd', '=HYPERLINK("http://x","click")']) {
      expect(cell(bad).replace(/^"/, '').startsWith("'"), bad).toBe(true)
    }
  })
  it('does not touch real numbers that are negative', () => {
    expect(cell(-4)).toBe('-4') // a numeric difference, not text
  })
  it('keeps non-latin and accented names intact', () => {
    expect(cell('José Ñandú')).toBe('José Ñandú')
    expect(cell('李小龍')).toBe('李小龍')
  })
})

describe('results csv', () => {
  const names = Array.from({ length: 8 }, (_, i) => ({ name: `P${i + 1}` }))
  it('has a standings block and a games block with the right counts', () => {
    let s = createSession('Friday, "Social"', { courts: 1 }, names)
    for (let i = 0; i < 3; i++) s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 5 })
    const text = resultsCsv(s)
    const lines = text.replace(/^﻿/, '').trim().split('\r\n')
    expect(text.startsWith('﻿')).toBe(true)
    expect(lines[0]).toBe('"Friday, ""Social"""')
    const standingsAt = lines.indexOf('Standings')
    const gamesAt = lines.indexOf('Games')
    expect(standingsAt).toBeGreaterThan(0)
    expect(gamesAt).toBeGreaterThan(standingsAt)
    expect(lines.slice(standingsAt + 2, gamesAt - 1)).toHaveLength(8) // one row per player
    expect(lines.slice(gamesAt + 2)).toHaveLength(3) // one row per game
  })
  it('names teams in Fixed teams mode', () => {
    let s = createSession('t', { format: 'teams', courts: 1 }, [], [[{ name: 'Josh' }, { name: 'Daria' }], [{ name: 'Stee' }, { name: 'Kp' }]])
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 2 })
    const text = resultsCsv(s)
    expect(text).toContain('Team,Wins')
    expect(text).toMatch(/Josh & Daria|Stee & Kp/)
  })
  it('a hostile player name cannot become a formula', () => {
    let s = createSession('t', { courts: 1 }, [{ name: '=cmd|calc' }, ...names.slice(0, 7)])
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 2 })
    const lines = resultsCsv(s).split('\r\n')
    expect(lines.some((l) => /(^|,)=cmd/.test(l))).toBe(false)
    expect(resultsCsv(s)).toContain("'=cmd|calc")
  })
})
