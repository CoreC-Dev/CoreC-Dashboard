/**
 * Alert audio — module-level AudioContext manager for the alert beep.
 *
 * 模块级 AudioContext 跨导航存活；用户手势经 primeAlertAudio() 解锁
 * （由 alertStore.toggleSound 调用），后续 WebSocket 驱动的 beep 复用同一
 * context。AudioContext 不可用或被阻止时静默失败（jsdom、受限浏览器）。
 */

let ctx: AudioContext | null = null

type AudioContextCtor = typeof AudioContext

function getAudioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    return ctx
  } catch {
    // AudioContext blocked or unavailable — fail silently
    return null
  }
}

/**
 * Unlock/create the AudioContext from a user gesture (the sound toggle
 * click). Also plays the preview beep so enabling has audible feedback.
 */
export function primeAlertAudio(): void {
  const audio = getAudioContext()
  if (!audio) return
  playAlertBeep()
}

/** Play the short 800 Hz alert beep (no-op without an AudioContext). */
export function playAlertBeep(): void {
  playTone(800, 0, 0.2)
}

/**
 * Warning-level alert: three short beeps (~0.8 s total) at a lower
 * pitch than the error beep so operators can tell severity by ear
 *. No-op without an AudioContext.
 */
export function playWarningBeep(): void {
  playTone(620, 0, 0.15)
  playTone(620, 0.25, 0.15)
  playTone(620, 0.5, 0.15)
}

/** One sine tone: frequency (Hz), start offset and length (seconds). */
function playTone(freq: number, offset: number, length: number): void {
  try {
    const audio = getAudioContext()
    if (!audio) return
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.value = 0.2
    osc.connect(gain)
    gain.connect(audio.destination)
    const now = audio.currentTime + offset
    osc.start(now)
    osc.stop(now + length)
  } catch {
    // AudioContext blocked or unavailable — fail silently
  }
}
