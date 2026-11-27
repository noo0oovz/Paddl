import { useEffect, useState } from 'react'
import { Play, Square, Volume2 } from 'lucide-react'
import {
  availableVoices, chosenVoiceName, courtCall, getRate, initVoices, setRate, setVoiceName, speak, speechSupported, stopSpeaking, useVoiceSettings,
} from '../lib/announce'
import { Sheet } from './ui'

const SAMPLE = courtCall('Court 1', ['Ana', 'Ben'], ['Cara', 'Dan'])

/** Pick how the announcer sounds, and try it. Natural-sounding voices are listed first. */
export default function VoiceSheet({ onClose }: { onClose: () => void }) {
  useVoiceSettings() // re-render when voices finish loading or the choice changes
  const [, force] = useState(0)
  useEffect(() => { initVoices() }, [])
  useEffect(() => () => stopSpeaking(), [])

  if (!speechSupported()) {
    return (
      <Sheet title="Announcer voice" onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">This browser cannot speak out loud. Try Chrome, Safari or Edge on your phone or tablet.</p>
      </Sheet>
    )
  }

  const voices = availableVoices()
  const current = chosenVoiceName()
  const best = voices[0]?.name
  const rate = getRate()

  return (
    <Sheet title="Announcer voice" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Paddl uses the voices on your device. The most natural-sounding one is chosen for you, and you can pick another and listen to it here.
        </p>

        <button className="btn-primary w-full !min-h-12" onClick={() => speak(SAMPLE)}><Play size={18} /> Hear a sample announcement</button>

        <div>
          <div className="label">Voice</div>
          {voices.length === 0 ? (
            <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              This device has not loaded any voices yet. Wait a moment and reopen this, or check your device&apos;s text-to-speech settings.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1" role="radiogroup" aria-label="Voice">
              <li>
                <button
                  role="radio"
                  aria-checked={!current}
                  onClick={() => { setVoiceName(null); force((n) => n + 1); speak(SAMPLE) }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition ${!current ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-white/10'}`}
                >
                  <span><span className="font-bold">Automatic</span><span className="block text-xs text-slate-500 dark:text-slate-400">Best available: {best}</span></span>
                  {!current && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-black text-accent-ink">In use</span>}
                </button>
              </li>
              {voices.map((v, i) => (
                <li key={v.voiceURI || v.name}>
                  <button
                    role="radio"
                    aria-checked={current === v.name}
                    onClick={() => { setVoiceName(v.name); force((n) => n + 1); speak(SAMPLE) }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition ${current === v.name ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-white/10'}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{v.name}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{v.lang}{i === 0 ? ' · sounds most natural' : ''}</span>
                    </span>
                    {current === v.name && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-black text-accent-ink">In use</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="label">Speed: {rate < 0.85 ? 'slow' : rate > 1.05 ? 'quick' : 'normal'}</div>
          <input
            type="range"
            min={0.7}
            max={1.2}
            step={0.05}
            value={rate}
            aria-label="Speaking speed"
            className="h-11 w-full accent-[#b6ff3b]"
            onChange={(e) => setRate(Number(e.target.value))}
            onPointerUp={() => speak(SAMPLE)}
            onKeyUp={() => speak(SAMPLE)}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A touch slower than normal sounds clearer in a busy gym.</p>
        </div>

        <button className="btn-soft w-full" onClick={stopSpeaking}><Square size={16} /> Stop speaking</button>
        <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Volume2 size={14} className="mt-0.5 shrink-0" />
          <span>Turn your device volume up. The most human voices (labelled Natural, Neural, Enhanced or Premium) may need to be downloaded in your device&apos;s settings.</span>
        </p>
      </div>
    </Sheet>
  )
}
