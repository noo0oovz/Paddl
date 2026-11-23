import { describe, expect, it } from 'vitest'
import { courtCall, pickVoice, pickerVoices, sayNames, sentences, speakable, upNextCall, voiceScore, type VoiceLike } from './announce'

const v = (name: string, lang = 'en-US'): VoiceLike => ({ name, lang })

describe('names are read like a person would', () => {
  it('lists names with commas and "and"', () => {
    expect(sayNames([])).toBe('')
    expect(sayNames(['Ana'])).toBe('Ana')
    expect(sayNames(['Ana', 'Ben'])).toBe('Ana and Ben')
    expect(sayNames(['Ana', 'Ben', 'Cara'])).toBe('Ana, Ben and Cara')
  })
  it('cleans up names the speech engine would stumble on', () => {
    expect(speakable('Josh & Daria')).toBe('Josh and Daria')
    expect(speakable('Ana 😀')).toBe('Ana')
    expect(speakable('  Mary   Jane  ')).toBe('Mary Jane')
    expect(speakable('=HYPERLINK("x")')).not.toMatch(/[=<>]/)
    expect(speakable('<b>Bo</b>')).toBe('b Bo b')
  })
})

describe('what is announced', () => {
  it('a court that has just started', () => {
    expect(courtCall('Court 1', ['Ana', 'Ben'], ['Cara', 'Dan'])).toBe('Court 1. Ana and Ben, versus, Cara and Dan. Please head to the court.')
  })
  it('singles', () => {
    expect(courtCall('Court 2', ['Ana'], ['Ben'])).toBe('Court 2. Ana, versus, Ben. Please head to the court.')
  })
  it('the next match, and a winners-stay challenge', () => {
    expect(upNextCall(['Ana', 'Ben'], ['Cara', 'Dan'])).toBe('Up next. Ana and Ben, versus, Cara and Dan. Please get ready.')
    expect(upNextCall(['Ana', 'Ben'], null)).toBe('Up next. Ana and Ben, you are challenging the winners. Please get ready.')
  })
  it('fixed teams read as whole teams', () => {
    expect(courtCall('Court 1', ['Josh & Daria'], ['Stee & Kp'])).toBe('Court 1. Josh and Daria, versus, Stee and Kp. Please head to the court.')
  })
  it('is split into sentences so each gets its own pause', () => {
    expect(sentences(courtCall('Court 1', ['Ana', 'Ben'], ['Cara', 'Dan']))).toEqual(['Court 1.', 'Ana and Ben, versus, Cara and Dan.', 'Please head to the court.'])
  })
})

describe('choosing the most natural voice', () => {
  it('prefers neural / natural voices over plain ones', () => {
    const list = [v('Microsoft David - English (United States)'), v('Microsoft Aria Online (Natural) - English (United States)'), v('Microsoft Zira - English (United States)')]
    expect(pickVoice(list)!.name).toContain('Natural')
  })
  it('prefers premium and enhanced over compact on Apple devices', () => {
    const list = [v('Samantha (Compact)'), v('Samantha (Enhanced)'), v('Alex')]
    expect(pickVoice(list)!.name).toBe('Samantha (Enhanced)')
    expect(pickVoice([v('Daniel (Premium)'), v('Daniel (Compact)')])!.name).toBe('Daniel (Premium)')
  })
  it('prefers Google network voices on Android', () => {
    expect(pickVoice([v('English United States', 'en-US'), v('Google US English', 'en-US')])!.name).toBe('Google US English')
  })
  it('never picks a joke or robotic voice when a real one exists', () => {
    const list = [v('Zarvox'), v('Bad News'), v('espeak English'), v('Fred'), v('Samantha')]
    expect(pickVoice(list)!.name).toBe('Samantha')
  })
  it('never reads English names in a foreign voice', () => {
    const list = [v('Amelie Premium', 'fr-FR'), v('Google français', 'fr-FR')]
    expect(pickVoice(list)).toBeNull()
    expect(pickVoice([...list, v('Alex', 'en-US')])!.name).toBe('Alex')
  })
  it('accepts any English accent', () => {
    expect(pickVoice([v('Google UK English Female', 'en-GB')])!.name).toBe('Google UK English Female')
    expect(pickVoice([v('Karen', 'en-AU')])!.name).toBe('Karen')
  })
  it('honours the voice the host chose, if it is still available', () => {
    const list = [v('Microsoft Aria Online (Natural)'), v('Samantha')]
    expect(pickVoice(list, 'en', 'Samantha')!.name).toBe('Samantha')
    expect(pickVoice(list, 'en', 'A voice that was removed')!.name).toContain('Natural') // falls back to the best
  })
  it('returns null when the device has no voices at all', () => {
    expect(pickVoice([])).toBeNull()
  })
  it('the same input always gives the same answer', () => {
    const list = [v('Voice B'), v('Voice A'), v('Voice C')]
    expect(pickVoice(list)!.name).toBe(pickVoice([...list].reverse())!.name)
  })
  it('the picker lists good voices first and hides the joke ones', () => {
    const names = pickerVoices([v('Zarvox'), v('Samantha (Compact)'), v('Samantha (Enhanced)'), v('Google US English'), v('Amelie', 'fr-FR')]).map((x) => x.name)
    expect(names.slice(0, 2)).toEqual(['Samantha (Enhanced)', 'Google US English']) // the two good voices come first
    expect(names).not.toContain('Zarvox')
    expect(names).not.toContain('Amelie')
    expect(names).toContain('Samantha (Compact)')
  })
  it('scores are ordered the way the ranking is documented', () => {
    expect(voiceScore(v('X (Natural)'))).toBeGreaterThan(voiceScore(v('X (Premium)')))
    expect(voiceScore(v('X (Premium)'))).toBeGreaterThan(voiceScore(v('X (Enhanced)')))
    expect(voiceScore(v('X (Enhanced)'))).toBeGreaterThan(voiceScore(v('X')))
    expect(voiceScore(v('X'))).toBeGreaterThan(voiceScore(v('X (Compact)')))
  })
})
