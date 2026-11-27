import { describe, expect, it } from 'vitest'
import { backupFileName, makeBackup, mergeBackup, parseBackup, sessionProblem } from './backup'
import { createSession, endSession, finishMatch, setStatus, toggleCourtTag, removeCourt } from '../engine/session'
import type { Session } from '../engine/types'

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, level: 3 }))

/** A realistic session that has been through many of the app's features. */
function busy(over: Partial<Parameters<typeof createSession>[1]> = {}): Session {
  let s = createSession('Friday', { courts: 3, ...over }, names(14))
  for (let i = 0; i < 8; i++) s = finishMatch(s, s.courts.find((c) => c.match)!.id, { winner: i % 2 ? 'a' : 'b', scoreA: 11, scoreB: 7 })
  s = toggleCourtTag(s, s.courts[0].id, 'fast')
  s = setStatus(s, s.players[0].id, 'resting')
  s = removeCourt(s, s.courts[2].id)
  return s
}

describe('backup round trip', () => {
  it('accepts every kind of session the app can produce', () => {
    const sessions: Session[] = [
      busy(),
      busy({ mode: 'winners' }),
      busy({ mode: 'skill' }),
      busy({ mode: 'robin' }),
      busy({ mode: 'mystery' }),
      busy({ format: 'singles' }),
      endSession(busy()),
      createSession('Teams', { format: 'teams', courts: 1 }, [], [[{ name: 'A' }, { name: 'B' }], [{ name: 'C' }, { name: 'D' }]]),
    ]
    for (const s of sessions) expect(sessionProblem(s)).toBeNull()
  })

  it('survives JSON and comes back identical', () => {
    const sessions = [busy(), endSession(busy({ mode: 'winners' }))]
    const text = JSON.stringify(makeBackup(sessions, [{ name: 'P1', level: 3.5 }]))
    const r = parseBackup(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.warnings).toEqual([])
    expect(r.backup.sessions).toEqual(JSON.parse(JSON.stringify(sessions)))
    expect(r.backup.roster).toEqual([{ name: 'P1', level: 3.5 }])
  })

  it('names the file by date', () => {
    expect(backupFileName(new Date(2026, 10, 5))).toBe('paddl-backup-2026-11-05.json')
  })
})

describe('bad files are rejected safely', () => {
  it.each([
    ['not json', 'hello world'],
    ['empty text', ''],
    ['json but not ours', JSON.stringify({ sessions: [] })],
    ['an array', JSON.stringify([1, 2, 3])],
    ['null', 'null'],
    ['wrong app', JSON.stringify({ app: 'other', version: 1, sessions: [] })],
  ])('%s', (_label, text) => {
    const r = parseBackup(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5)
  })

  it('a newer file version asks the user to update the app', () => {
    const r = parseBackup(JSON.stringify({ app: 'paddl', version: 2, sessions: [] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/newer version/)
  })

  it('an empty backup is rejected rather than wiping data', () => {
    expect(parseBackup(JSON.stringify(makeBackup([], []))).ok).toBe(false)
  })

  it('skips only the damaged sessions and keeps the good ones', () => {
    const good = busy()
    const broken = JSON.parse(JSON.stringify(busy()))
    broken.id = 'broken-1'
    broken.matches[0].a = ['nobody-with-this-id']
    const noName = { ...JSON.parse(JSON.stringify(busy())), id: 'broken-2' }
    delete noName.name
    const r = parseBackup(JSON.stringify(makeBackup([good, broken, noName], [])))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.backup.sessions).toHaveLength(1)
    expect(r.warnings).toHaveLength(2)
    expect(r.warnings.join(' ')).toMatch(/unknown player|missing name/)
  })

  it('catches the structural problems that would crash a screen', () => {
    const base = () => JSON.parse(JSON.stringify(busy())) as Record<string, any>
    const cases: [string, (s: Record<string, any>) => void][] = [
      ['unknown mode', (s) => { s.config.mode = 'chaos' }],
      ['unknown format', (s) => { s.config.format = 'triples' }],
      ['players not a list', (s) => { s.players = 'x' }],
      ['bad player status', (s) => { s.players[0].status = 'asleep' }],
      ['court without a name', (s) => { delete s.courts[0].name }],
      ['live game with unknown player', (s) => { const c = s.courts.find((x: any) => x.match); c.match.a = ['zzz'] }],
      ['bad winner', (s) => { s.matches[0].winner = 'c' }],
      ['team with one player', (s) => { s.teams = [{ id: 't1', name: 'x', playerIds: ['p1'] }] }],
      ['missing counters', (s) => { delete s.nextId }],
    ]
    for (const [label, mutate] of cases) {
      const s = base()
      mutate(s)
      expect(sessionProblem(s), label).not.toBeNull()
    }
  })

  it('ignores a session listed twice and junk roster entries', () => {
    const s = busy()
    const r = parseBackup(JSON.stringify({ app: 'paddl', version: 1, exportedAt: 1, sessions: [s, s], roster: [{ name: 'Ok', level: 3 }, { name: '', level: 3 }, { name: 'x' }, 7, null] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.backup.sessions).toHaveLength(1)
    expect(r.backup.roster).toEqual([{ name: 'Ok', level: 3 }])
    expect(r.warnings.some((w) => /duplicate/.test(w))).toBe(true)
  })

  it('does not execute or trust anything inside the file', () => {
    const s = JSON.parse(JSON.stringify(busy()))
    s.name = '<img src=x onerror=alert(1)>'
    const r = parseBackup(JSON.stringify(makeBackup([s], [])))
    expect(r.ok).toBe(true) // text is kept as text; React escapes it on screen
    if (r.ok) expect(r.backup.sessions[0].name).toBe('<img src=x onerror=alert(1)>')
    expect(parseBackup('{"app":"paddl","version":1,"sessions":[],"__proto__":{"polluted":true}}').ok).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('merging a backup into what is on the device', () => {
  it('adds sessions that are new', () => {
    const a = busy()
    const b = busy()
    const m = mergeBackup({ sessions: [a], roster: [] }, makeBackup([b], []))
    expect(m.sessions).toHaveLength(2)
    expect(m.added).toBe(1)
  })

  it('keeps the version of a shared session that has more games', () => {
    const base = busy()
    const further = JSON.parse(JSON.stringify(base)) as Session
    further.matches.push({ ...further.matches[0], id: 'extra', seq: 99 })
    const keepsMore = mergeBackup({ sessions: [base], roster: [] }, makeBackup([further], []))
    expect(keepsMore.updated).toBe(1)
    expect(keepsMore.sessions[0].matches).toHaveLength(base.matches.length + 1)

    const keepsDevice = mergeBackup({ sessions: [further], roster: [] }, makeBackup([base], []))
    expect(keepsDevice.kept).toBe(1)
    expect(keepsDevice.sessions[0].matches).toHaveLength(base.matches.length + 1)
  })

  it('prefers the ended copy of a session when game counts are equal', () => {
    const live = busy()
    const ended = endSession(JSON.parse(JSON.stringify(live)))
    const m = mergeBackup({ sessions: [live], roster: [] }, makeBackup([ended], []))
    expect(m.sessions[0].endedAt).not.toBeNull()
  })

  it('merges rosters by name without duplicates, keeping the device level', () => {
    const m = mergeBackup({ sessions: [], roster: [{ name: 'Ana', level: 4 }] }, makeBackup([busy()], [{ name: 'ana', level: 2 }, { name: 'Ben', level: 3 }]))
    expect(m.roster).toEqual([{ name: 'Ana', level: 4 }, { name: 'Ben', level: 3 }])
  })

  it('lists newest sessions first', () => {
    const old = { ...busy(), id: 'old', createdAt: 1000 }
    const fresh = { ...busy(), id: 'fresh', createdAt: 9000 }
    expect(mergeBackup({ sessions: [old], roster: [] }, makeBackup([fresh], [])).sessions.map((s) => s.id)).toEqual(['fresh', 'old'])
  })
})

describe('sessions saved by older versions of the app still load', () => {
  /** What a session looked like before the newer optional fields existed. */
  function oldStyle(): Record<string, any> {
    const s = JSON.parse(JSON.stringify(createSession('Old', { courts: 2 }, names(8)))) as Record<string, any>
    for (const c of s.courts) { delete c.tags; if (c.match) delete c.match.gid }
    for (const p of s.players) { delete p.prio; delete p.prioAt; delete p.joinedAt }
    delete s.remix; delete s.fresh; delete s.pinned
    delete s.config.challengerCourt
    return s
  }

  it('is accepted without gid, tags, prio, remix, challengerCourt', () => {
    expect(sessionProblem(oldStyle())).toBeNull()
  })

  it('a join time is optional, but a wrong one is flagged (it would show as "NaN min")', () => {
    const base = () => JSON.parse(JSON.stringify(createSession('J', { courts: 1 }, names(6)))) as Record<string, any>
    expect(sessionProblem(base()), 'saved with a join time').toBeNull()
    for (const bad of ['yesterday', null, {}, NaN]) {
      const s = base(); s.players[0].joinedAt = bad
      expect(sessionProblem(s), JSON.stringify(bad)).not.toBeNull()
    }
  })

  it('is accepted when games have no length or streak recorded', () => {
    let s = createSession('Old', { courts: 1 }, names(8))
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: null, scoreB: null })
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, any>
    delete raw.matches[0].ms; delete raw.matches[0].streak
    expect(sessionProblem(raw)).toBeNull()
  })

  it('is accepted with an idle court and no live game', () => {
    const s = createSession('Few', { courts: 2 }, names(4))
    expect(s.courts.some((c) => !c.match)).toBe(true)
    expect(sessionProblem(JSON.parse(JSON.stringify(s)))).toBeNull()
  })

  it('a session with a missing settings block is flagged instead of crashing later', () => {
    const raw = oldStyle()
    delete raw.config
    expect(sessionProblem(raw)).not.toBeNull()
  })
})

describe('damaged courts and players are refused instead of crashing the app', () => {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
  const bad = (edit: (s: any) => void) => { const s = clone(busy()) as any; edit(s); return sessionProblem(s) }

  it('a court hold that is not a hold', () => {
    expect(bad((s) => { s.courts[0].hold = 'x' })).toMatch(/hold/)
    expect(bad((s) => { s.courts[0].hold = { streak: 1 } })).toMatch(/hold/)
    expect(bad((s) => { s.courts[0].hold = { ids: 'zz', streak: 1 } })).toMatch(/hold/)
    expect(bad((s) => { s.courts[0].hold = { ids: ['nobody'], streak: 1 } })).toMatch(/hold/)
    expect(bad((s) => { s.courts[0].hold = { ids: [], streak: 'a' } })).toMatch(/hold/)
  })
  it('court badges that are not a list of known badges', () => {
    expect(bad((s) => { s.courts[0].tags = 'fast' })).toMatch(/badges/)
    expect(bad((s) => { s.courts[0].tags = ['zzz'] })).toMatch(/badges/)
    expect(bad((s) => { s.courts[0].tags = [1] })).toMatch(/badges/)
    expect(bad((s) => { s.courts[0].tags = ['__proto__'] })).toMatch(/badges/)
  })
  it('player time ranges that are not [from, to]', () => {
    expect(bad((s) => { s.players[0].intervals = [[0], null] })).toMatch(/time range/)
    expect(bad((s) => { s.players[0].intervals = [null] })).toMatch(/time range/)
    expect(bad((s) => { s.players[0].intervals = [['a', 1]] })).toMatch(/time range/)
    expect(bad((s) => { s.players[0].intervals = [[1, 2, 3]] })).toMatch(/time range/)
  })
  it('and a good session, including old saves with no hold or no badges, still loads', () => {
    expect(bad(() => {})).toBeNull()
    expect(bad((s) => { for (const c of s.courts) { delete c.hold; delete c.tags } })).toBeNull() // saved by an older version
    expect(bad((s) => { s.courts[0].hold = null; s.courts[0].tags = [] })).toBeNull()
    expect(bad((s) => { s.players[0].intervals = [[0, null], [3, 7]] })).toBeNull()
  })
  it('real sessions in every mode and format validate, so nothing legitimate is quarantined', () => {
    for (const cfg of [{}, { mode: 'winners' as const }, { mode: 'skill' as const }, { mode: 'robin' as const }, { mode: 'mystery' as const }, { format: 'singles' as const }, { challengerCourt: true, courts: 3 }, { mode: 'winners' as const, winnersSplit: true }]) {
      let s = busy(cfg)
      for (let i = 0; i < 12; i++) { const live = s.courts.filter((c) => c.match); if (!live.length) break; s = finishMatch(s, live[i % live.length].id, { winner: i % 2 ? 'a' : 'b', scoreA: null, scoreB: null }) }
      s = toggleCourtTag(s, s.courts[0].id, 'challenger')
      expect(sessionProblem(JSON.parse(JSON.stringify(s))), JSON.stringify(cfg)).toBeNull()
    }
  })
})
