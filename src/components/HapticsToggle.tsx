import { hapticsSupported, setHaptics, useHaptics } from '../lib/haptics'
import { Toggle } from './ui'

/** "Vibrate when a result is recorded". Only shown on devices that can vibrate, so nobody gets a switch that does nothing. */
export default function HapticsToggle() {
  const on = useHaptics()
  if (!hapticsSupported()) return null
  return <Toggle checked={on} onChange={setHaptics} label="Vibrate on result" hint="A short buzz when a game is recorded" />
}
