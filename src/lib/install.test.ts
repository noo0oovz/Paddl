import { describe, expect, it } from 'vitest'
import { detect } from './install'

// Real-world user-agent strings.
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/123.0.2420.65 Version/17.0 Mobile/15E148 Safari/604.1',
  iphoneFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108]',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.12.108',
  ipadClassic: 'Mozilla/5.0 (iPad; CPU OS 12_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  ipadAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  ipadChromeAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.99 Mobile Safari/537.36',
  androidTabletChrome: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0',
  androidEdge: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36 EdgA/123.0.2420.65',
  androidWebview: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.0.0 Mobile Safari/537.36',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
}

describe('device and browser detection', () => {
  it('iPhone Safari can add to the home screen', () => {
    expect(detect({ ua: UA.iphoneSafari })).toMatchObject({ platform: 'ios', browser: 'safari', needsSafari: false, installed: false })
  })

  it.each([
    ['Chrome', UA.iphoneChrome, 'chrome'],
    ['Firefox', UA.iphoneFirefox, 'firefox'],
    ['Edge', UA.iphoneEdge, 'edge'],
    ['Facebook in-app browser', UA.iphoneFacebook, 'other'],
    ['Instagram in-app browser', UA.iphoneInstagram, 'other'],
  ])('iPhone %s must be told to open it in Safari', (_n, ua, browser) => {
    expect(detect({ ua })).toMatchObject({ platform: 'ios', browser, needsSafari: true })
  })

  it('an older iPad is an iPad', () => {
    expect(detect({ ua: UA.ipadClassic })).toMatchObject({ platform: 'ipad', browser: 'safari', needsSafari: false })
  })

  it('a modern iPad pretends to be a Mac, so a touch screen gives it away', () => {
    expect(detect({ ua: UA.ipadAsMac, maxTouchPoints: 5 })).toMatchObject({ platform: 'ipad', browser: 'safari' })
    expect(detect({ ua: UA.ipadChromeAsMac, maxTouchPoints: 5 })).toMatchObject({ platform: 'ipad', browser: 'chrome', needsSafari: true })
  })

  it('a real Mac (no touch screen) is desktop, not an iPad', () => {
    expect(detect({ ua: UA.macSafari, maxTouchPoints: 0 }).platform).toBe('desktop')
    expect(detect({ ua: UA.macSafari }).platform).toBe('desktop')
  })

  it('Android phones and tablets', () => {
    expect(detect({ ua: UA.androidChrome })).toMatchObject({ platform: 'android', browser: 'chrome', needsSafari: false })
    expect(detect({ ua: UA.androidTabletChrome })).toMatchObject({ platform: 'android', browser: 'chrome' })
    expect(detect({ ua: UA.androidSamsung })).toMatchObject({ platform: 'android', browser: 'samsung' })
    expect(detect({ ua: UA.androidFirefox })).toMatchObject({ platform: 'android', browser: 'firefox' })
    expect(detect({ ua: UA.androidEdge })).toMatchObject({ platform: 'android', browser: 'edge' })
  })

  it('an Android web view is still Android and is never mistaken for Safari', () => {
    const env = detect({ ua: UA.androidWebview })
    expect(env.platform).toBe('android')
    expect(env.browser).not.toBe('safari')
    expect(env.needsSafari).toBe(false)
  })

  it('desktop browsers', () => {
    expect(detect({ ua: UA.desktopChrome })).toMatchObject({ platform: 'desktop', browser: 'chrome', needsSafari: false })
  })

  it('knows when it is already opened from the home screen', () => {
    expect(detect({ ua: UA.iphoneSafari, standalone: true }).installed).toBe(true)
    expect(detect({ ua: UA.androidChrome, displayStandalone: true }).installed).toBe(true)
    expect(detect({ ua: UA.androidChrome, displayStandalone: false, standalone: false }).installed).toBe(false)
  })

  it('never throws on empty or odd input', () => {
    expect(() => detect({ ua: '' })).not.toThrow()
    expect(detect({ ua: '' }).platform).toBe('desktop')
    expect(() => detect({ ua: 'curl/8.0' })).not.toThrow()
  })
})
