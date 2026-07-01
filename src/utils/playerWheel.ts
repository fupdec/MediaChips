type WheelDevice = 'win-mouse' | 'win-fine' | 'mac-trackpad' | 'mac-mouse'

interface WheelProfile {
  seekPerNotch?: number
  volumePerNotch?: number
  volumeSliderMul?: number
  markPerNotch?: number
  markShiftPerNotch?: number
  seekPerPixel?: number
  volumePerPixel?: number
  markPerPixel?: number
  markShiftPerPixel?: number
  seekAccum?: number
  markAccum?: number
  seekPerLine?: number
  volumePerLine?: number
  markPerLine?: number
}

const WHEEL_PROFILES: Record<WheelDevice, WheelProfile> = {
  'win-mouse': {
    seekPerNotch: 2.5,
    volumePerNotch: 70,
    volumeSliderMul: 2.5,
    markPerNotch: 1,
    markShiftPerNotch: 5,
  },
  'win-fine': {
    seekPerPixel: 0.045,
    volumePerPixel: 0.9,
    volumeSliderMul: 2,
    markPerPixel: 0.06,
    markShiftPerPixel: 0.25,
  },
  'mac-trackpad': {
    seekPerPixel: 0.1,
    volumePerPixel: 2,
    volumeSliderMul: 3,
    markPerPixel: 0.05,
    markShiftPerPixel: 0.2,
    seekAccum: 0.12,
    markAccum: 0.35,
  },
  'mac-mouse': {
    seekPerLine: 0.85,
    volumePerLine: 20,
    seekPerNotch: 2.5,
    volumePerNotch: 55,
    volumeSliderMul: 2.5,
    markPerLine: 1,
    markPerNotch: 1,
    markShiftPerNotch: 5,
  },
}

const LINE_HEIGHT_PX = 16
const ACCUM_IDLE_MS = 140

const accumulators = {
  seek: 0,
  mark: 0,
  lastAt: 0,
}

export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false

  return /mac/i.test(navigator.platform || '')
    || /mac/i.test(navigator.userAgent || '')
}

export function isWindows(): boolean {
  if (typeof navigator === 'undefined') return false

  return /win/i.test(navigator.platform || '')
    || /windows/i.test(navigator.userAgent || '')
}

export function detectWheelDevice(event: WheelEvent): WheelDevice {
  const magnitude = Math.max(Math.abs(event.deltaY), Math.abs(event.deltaX))

  if (event.deltaMode === 1) {
    return isMacOS() ? 'mac-mouse' : 'win-mouse'
  }

  if (event.deltaMode === 2) {
    return 'win-mouse'
  }

  if (isMacOS()) {
    return magnitude >= 48 ? 'mac-mouse' : 'mac-trackpad'
  }

  if (isWindows()) {
    return magnitude >= 40 ? 'win-mouse' : 'win-fine'
  }

  return magnitude >= 40 ? 'win-mouse' : 'win-fine'
}

export function normalizeWheelDelta(event: WheelEvent): { deltaX: number; deltaY: number } {
  const scale = event.deltaMode === 1
    ? LINE_HEIGHT_PX
    : event.deltaMode === 2
      ? (typeof window !== 'undefined' ? window.innerHeight : 800)
      : 1

  return {
    deltaX: event.deltaX * scale,
    deltaY: event.deltaY * scale,
  }
}

export function getPrimaryWheelDelta(event: WheelEvent): number {
  const { deltaX, deltaY } = normalizeWheelDelta(event)
  return Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX
}

function getMouseNotchCount(magnitude: number): number {
  if (magnitude >= 90) return magnitude / 100
  if (magnitude >= 45) return magnitude / 53
  return Math.max(magnitude / 100, 0.25)
}

function resetAccumulatorsIfIdle(): void {
  const now = Date.now()
  if (now - accumulators.lastAt > ACCUM_IDLE_MS) {
    accumulators.seek = 0
    accumulators.mark = 0
  }
  accumulators.lastAt = now
}

function takeAccumulated(key: 'seek' | 'mark', delta: number, threshold?: number): number {
  if (!threshold || threshold <= 0) return delta

  resetAccumulatorsIfIdle()
  accumulators[key] += delta

  if (Math.abs(accumulators[key]) < threshold) return 0

  const taken = accumulators[key]
  accumulators[key] = 0
  return taken
}

function applyWheelModifiers(value: number, event: WheelEvent): number {
  if (event.shiftKey) return value * 4
  if (event.ctrlKey || event.metaKey) return value / 2
  return value
}

interface WheelMagnitudeResult {
  seekSeconds: number
  volumeDelta: number
  markDelta: number
  profile: WheelProfile
  device: WheelDevice
}

function resolveWheelMagnitude(event: WheelEvent, device: WheelDevice): WheelMagnitudeResult {
  const primary = getPrimaryWheelDelta(event)
  const magnitude = Math.abs(primary)
  const profile = WHEEL_PROFILES[device]

  let seekSeconds = 0
  let volumeDelta = 0
  let markDelta = 0

  if (device === 'win-mouse') {
    const notches = getMouseNotchCount(magnitude)
    const direction = Math.sign(primary) || 1

    seekSeconds = -direction * notches * profile.seekPerNotch!
    volumeDelta = (Math.sign(event.deltaY) || direction) * notches * profile.volumePerNotch!
    markDelta = -direction * notches * profile.markPerNotch!
  } else if (device === 'win-fine') {
    seekSeconds = -primary * profile.seekPerPixel!
    volumeDelta = normalizeWheelDelta(event).deltaY * profile.volumePerPixel!
    markDelta = -primary * profile.markPerPixel!
  } else if (device === 'mac-trackpad') {
    seekSeconds = -primary * profile.seekPerPixel!
    volumeDelta = normalizeWheelDelta(event).deltaY * profile.volumePerPixel!
    markDelta = -primary * profile.markPerPixel!
  } else if (device === 'mac-mouse') {
    if (event.deltaMode === 1) {
      const lines = magnitude / LINE_HEIGHT_PX
      const direction = Math.sign(primary) || 1

      seekSeconds = -direction * lines * profile.seekPerLine!
      volumeDelta = (Math.sign(event.deltaY) || direction) * lines * profile.volumePerLine!
      markDelta = -direction * lines * profile.markPerLine!
    } else {
      const notches = getMouseNotchCount(magnitude)
      const direction = Math.sign(primary) || 1

      seekSeconds = -direction * notches * profile.seekPerNotch!
      volumeDelta = (Math.sign(event.deltaY) || direction) * notches * profile.volumePerNotch!
      markDelta = -direction * notches * profile.markPerNotch!
    }
  }

  return {
    seekSeconds,
    volumeDelta,
    markDelta,
    profile,
    device,
  }
}

function finalizeWheelValues(
  values: WheelMagnitudeResult,
  event: WheelEvent,
  { slider = false } = {},
): Pick<WheelMagnitudeResult, 'seekSeconds' | 'volumeDelta' | 'markDelta' | 'device'> {
  let { seekSeconds, volumeDelta, markDelta } = values
  const { profile, device } = values

  seekSeconds = applyWheelModifiers(seekSeconds, event)
  volumeDelta = applyWheelModifiers(volumeDelta, event)
  markDelta = applyWheelModifiers(markDelta, event)

  if (device === 'mac-trackpad' && !event.shiftKey && !event.altKey) {
    seekSeconds = takeAccumulated('seek', seekSeconds, profile.seekAccum)
    markDelta = takeAccumulated('mark', markDelta, profile.markAccum)
  }

  if (slider) {
    volumeDelta *= profile.volumeSliderMul!
  }

  return { seekSeconds, volumeDelta, markDelta, device }
}

export function getSeekSecondsFromWheel(event: WheelEvent): number {
  const device = detectWheelDevice(event)
  const values = finalizeWheelValues(resolveWheelMagnitude(event, device), event)
  return values.seekSeconds
}

export function getVolumeDeltaFromWheel(event: WheelEvent, { slider = false } = {}): number {
  const device = detectWheelDevice(event)
  const values = finalizeWheelValues(resolveWheelMagnitude(event, device), event, { slider })
  return values.volumeDelta
}

export function getMarkRangeDeltaFromWheel(event: WheelEvent): number {
  const device = detectWheelDevice(event)
  const profile = WHEEL_PROFILES[device]
  const primary = getPrimaryWheelDelta(event)
  const direction = primary > 0 ? -1 : 1

  if (event.ctrlKey || event.metaKey) {
    return direction * 0.5
  }

  if (event.shiftKey) {
    if (device === 'mac-trackpad') {
      const delta = direction * Math.abs(primary) * profile.markShiftPerPixel!
      return takeAccumulated('mark', delta, profile.markAccum! * 1.5)
    }

    if (device === 'win-fine') {
      return direction * Math.max(2, Math.abs(primary) * profile.markShiftPerPixel!)
    }

    const notches = getMouseNotchCount(Math.abs(primary))
    return direction * notches * profile.markShiftPerNotch!
  }

  const values = finalizeWheelValues(resolveWheelMagnitude(event, device), event)
  return values.markDelta
}

export function shouldUseWheelSeek(event: WheelEvent): boolean {
  return Boolean(event.altKey || event.shiftKey || event.ctrlKey || event.metaKey)
}

export function preventWheelDefault(event: WheelEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

// Backward-compatible exports for tuning docs/tests.
export const WHEEL_SEEK_SHIFT_MULTIPLIER = 4
export const WHEEL_SEEK_FINE_DIVISOR = 2
export const WHEEL_VOLUME_SHIFT_MULTIPLIER = 4
export const WHEEL_VOLUME_FINE_DIVISOR = 2
export const WHEEL_VOLUME_SLIDER_SENSITIVITY = 2.5
