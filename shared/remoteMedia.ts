import {isCloudMediaPath} from './cloudAccounts'
import {isDriveMediaPath} from './cloudDrive'
import {isWebVideoPath} from './webVideo'

/** Stable library identity. Never contains host names or credentials. */
export function nasMediaPath(connectionId: string, relativePath: string, revision?: string): string {
  return `nas://${connectionId}/${relativePath.split('/').map(encodeURIComponent).join('/')}${revision ? `?v=${revision}` : ''}`
}

export function parseNasMediaPath(value: unknown): {connectionId: string; relativePath: string} | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^nas:\/\/([0-9a-f-]{36})\/([^?#]+)(?:\?v=[0-9a-f]{64})?$/i)
  if (!match) return null
  try {
    const relativePath = match[2].split('/').map(decodeURIComponent).join('/')
    if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').some(p => !p || p === '.' || p === '..')
      || /[\\\x00-\x1f\x7f]/.test(relativePath)) return null
    return {connectionId: match[1], relativePath}
  } catch { return null }
}

export function isNasMediaPath(value: unknown): boolean {
  return parseNasMediaPath(value) !== null
}

/** Remote media must not enter local filesystem/FFmpeg workflows. */
export function isRemoteMediaPath(value: unknown): boolean {
  return isCloudMediaPath(value) || isWebVideoPath(value) || isNasMediaPath(value) || isDriveMediaPath(value)
}
