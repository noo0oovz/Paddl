import { describe, expect, it } from 'vitest'
import * as S from './session'
import { awards, awardsByName } from './insights'
import { standings, playerStandings } from './stats'
import type { Config, Session } from './types'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const NAMES = ['Ana', 'Ben', 'Cara', 'Dan', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kai', 'Lia', 'Mo', 'Ned']

function play(cfg: Partial<Config>, seed: number, scored: boolean): Session {
  const r = rng(seed)
  let s: Session
  if (cfg.format === 'teams') {
    const pairs = Array.from({ length: 4 + Math.floor(r() * 3) }, (_, i) => [{ name: `T${i}a` }, { name: `T${i}b` }] as [{ name: string }, { name: string }])
    s = S.createSession('t', { courts: 2, ...cfg }, [], pairs)
  } else s = S.createSession('t', { courts: 2, ...cfg }, NAMES.slice(0, 6 + Math.floor(r() * 8)).map((name) => ({ name })))
  for (let i = 0; i < 40; i++) {
    const live = s.courts.filter((c) => c.match)
    if (!live.length) break
    const c = live[Math.floor(r() * live.length)]
    const w = r() < 0.5 ? 'a' : 'b'
    const close = r() < 0.4
    const hi = 11, lo = close ? 10 : 4 + Math.floor(r() * 5)
    s = S.finishMatch(s, c.id, { winner: w, scoreA: scored ? (w === 'a' ? hi : lo) : null, scoreB: scored ? (w === 'a' ? lo : hi) : null })
  }
  return s
}

describe('results screens stay consistent with the standings', () => {
  const cfgs: Partial<Config>[] = [{ mode: 'fair' }, { mode: 'winners' }, { mode: 'skill' }, { mode: 'robin' }, { format: 'singles' }, { format: 'teams' }]
  cfgs.forEach((cfg, ci) => {
    for (const scored of [false, true]) {
      it(`${cfg.format ?? 'doubles'}/${cfg.mode ?? 'fair'} ${scored ? 'scored' : 'unscored'}: every award badge lands on a real standings row`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const s = play(cfg, seed * 13 + ci, scored)
          const rowNames = new Set(standings(s).map((r) => r.name))
          const pNames = new Set(playerStandings(s).map((r) => r.name))
          const by = awardsByName(s)
          for (const a of awards(s)) {
            if (a.id === 'marathon') continue // a match, not a person
            expect(a.who?.length, `seed ${seed}: ${a.title} has no holders`).toBeGreaterThan(0)
            for (const n of a.who!) {
              expect(rowNames.has(n) || pNames.has(n), `seed ${seed}: ${a.title} names "${n}", who is not in the standings`).toBe(true)
              // the standings table looks badges up by row name, so the badge must be reachable there
              if (cfg.format === 'teams' && !rowNames.has(n)) throw new Error(`seed ${seed}: ${a.title} gives "${n}" but the table rows are teams (${[...rowNames].join(', ')})`)
              expect(by.get(n)?.some((x) => x.id === a.id), `seed ${seed}: ${a.title} missing for ${n}`).toBe(true)
            }
          }
        }
      })
    }
  })
})
