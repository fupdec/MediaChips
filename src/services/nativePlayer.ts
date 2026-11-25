import {createMpvMediaElement, isMpvMediaElement, type MpvBridge} from '@/services/mpvMediaElement'

/**
 * Glue between the renderer and native mpv. The Electron main process only exposes `window.mpvAPI`
 * when the feature is built in; everything here degrades to "not available" and the regular
 * <video> player keeps working.
 */

let availability: Promise<boolean> | null = null
let element: HTMLVideoElement | null = null
let initializing: Promise<HTMLVideoElement | null> | null = null

export function isNativePlayerAvailable(): Promise<boolean> {
  const api = window.mpvAPI
  if (!api) return Promise.resolve(false)
  availability ??= api.availability().then(result => Boolean(result?.available)).catch(() => false)
  return availability
}

/** One mpv view per window; the element is reused across files. */
export function acquireNativeElement(): Promise<HTMLVideoElement | null> {
  const api = window.mpvAPI
  if (!api) return Promise.resolve(null)
  if (element) return Promise.resolve(element)
  initializing ??= (async () => {
    const result = await api.init().catch(() => ({ok: false}))
    if (!result.ok) return null
    const bridge: MpvBridge = {
      command: command => api.command(command),
      setProperty: (name, value) => api.setProperty(name, value),
      onEvent: callback => api.onEvent(callback),
    }
    element = createMpvMediaElement(bridge)
    return element
  })().finally(() => { initializing = null })
  return initializing
}

export function releaseNativeElement(): void {
  if (isMpvMediaElement(element)) element.dispose()
  element = null
  void window.mpvAPI?.destroy()
}

/** Stop mpv without tearing the view down (used when a file needs the regular element). */
export function stopNativePlayback(): void {
  if (isMpvMediaElement(element)) element.src = ''
}

/** Make the next `src` open at this position (no-op for a regular <video> element). */
export function startNativeAt(video: HTMLVideoElement, seconds: number): void {
  if (isMpvMediaElement(video)) video.startAt(seconds)
}

export function isNativeElement(value: unknown): boolean {
  return isMpvMediaElement(value)
}

export type NativeTrack = {
  id: number
  type: 'video' | 'audio' | 'sub'
  lang: string
  title: string
  codec: string
  selected: boolean
  default: boolean
  forced: boolean
  external: boolean
}

export async function fetchNativeTracks(): Promise<NativeTrack[]> {
  return (await window.mpvAPI?.tracks().catch(() => null)) ?? []
}

/** Pick an audio (`aid`) or subtitle (`sid`) track; `'no'` switches subtitles off. */
export function selectNativeTrack(kind: 'aid' | 'sid', id: number | 'no'): void {
  void window.mpvAPI?.setProperty(kind, id)
}

/** Set an mpv property (colour controls, filters, zoom...). Fire and forget. */
export function setNativeProperty(name: string, value: string | number | boolean): void {
  void window.mpvAPI?.setProperty(name, value)
}

/** Move the native view; a zero-size rect hides it. */
export function setNativeVideoRect(rect: {x: number; y: number; w: number; h: number; cx: number; cy: number; cw: number; ch: number; r?: number}): void {
  window.mpvAPI?.setRect(rect)
}
