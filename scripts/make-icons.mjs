// Builds the favicon and PWA icons from the same paddle-and-ball artwork used in the app.
// Needs Chrome/Edge installed (used only to rasterise the SVG). Usage: node scripts/make-icons.mjs
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p))
if (!CHROME) throw new Error('Chrome or Edge not found')

/** The mark, in a 64x64 box. `pad` shrinks it so maskable icons keep the art inside the safe zone. */
const mark = (pad = 0) => `
  <g transform="translate(${pad - 2.5} ${pad - 3}) scale(${(64 - pad * 2) / 64})">
    <g transform="translate(6 3) rotate(32 26 30) scale(0.92)">
      <rect x="14" y="3" width="24" height="31" rx="10" fill="url(#f)"/>
      <rect x="14" y="3" width="24" height="31" rx="10" fill="none" stroke="#0a2e3a" stroke-opacity=".55" stroke-width="2.2"/>
      <rect x="17.5" y="6.5" width="17" height="24" rx="7" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1"/>
      <path d="M22 9 q4 -2 8 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="23" y="33" width="6" height="6" fill="#0a2e3a"/>
      <rect x="22" y="38" width="8" height="17" rx="3" fill="#13202e"/>
      <rect x="22" y="38" width="8" height="17" rx="3" fill="none" stroke="#b6ff3b" stroke-opacity=".55" stroke-width="1"/>
      <g stroke="#b6ff3b" stroke-opacity=".5" stroke-width="1"><line x1="22.5" y1="43" x2="29.5" y2="43"/><line x1="22.5" y1="47" x2="29.5" y2="47"/><line x1="22.5" y1="51" x2="29.5" y2="51"/></g>
      <rect x="21" y="54" width="10" height="3.5" rx="1.6" fill="#b6ff3b"/>
    </g>
    <circle cx="48" cy="46" r="11.5" fill="url(#b)"/>
    <circle cx="48" cy="46" r="11.5" fill="none" stroke="#0b1400" stroke-opacity=".35"/>
    <g fill="#0b1400" fill-opacity=".72"><circle cx="43.8" cy="41.5" r="1.6"/><circle cx="50.2" cy="41" r="1.6"/><circle cx="47" cy="46" r="1.6"/><circle cx="42" cy="47.5" r="1.6"/><circle cx="53.2" cy="47" r="1.6"/><circle cx="47.5" cy="52" r="1.6"/><circle cx="53.5" cy="42.8" r="1.3"/><circle cx="43" cy="52.5" r="1.3"/></g>
  </g>`

const defs = `<defs>
  <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#0b7a96"/></linearGradient>
  <radialGradient id="b" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#f3ffc8"/><stop offset=".5" stop-color="#b6ff3b"/><stop offset="1" stop-color="#6fb800"/></radialGradient>
  <radialGradient id="g" cx="50%" cy="46%" r="60%"><stop offset="0" stop-color="#b6ff3b" stop-opacity=".22"/><stop offset="1" stop-color="#b6ff3b" stop-opacity="0"/></radialGradient>
</defs>`

/** A tile with the dark neon background. rounded=false is for the PWA (the OS applies its own mask). */
const tile = (rounded, pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}
  <rect width="64" height="64" ${rounded ? 'rx="14"' : ''} fill="#070b16"/>
  <rect width="64" height="64" ${rounded ? 'rx="14"' : ''} fill="url(#g)"/>
  ${mark(pad)}
</svg>`

fs.writeFileSync('public/favicon.svg', tile(true, 3))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
for (const size of [192, 512]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  // pad 9 keeps the art inside the maskable safe zone (the middle 80%)
  await page.setContent(`<body style="margin:0">${tile(false, 9).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`)
  await page.screenshot({ path: path.join('public', `icon-${size}.png`), omitBackground: false })
}
await browser.close()
console.log('favicon and icons written')
