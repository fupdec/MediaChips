import path from 'path'
import {projectPath} from '../../../shared/projectRoot'
import type {DriveConfig} from './types'

/** Drive.readonly is enough for list + Range download in the Phase 1 spike. */
export const DRIVE_SPIKE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
] as const

function envFlag(name: string): boolean {
  const raw = process.env[name]
  if (!raw) return false
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

function resolveTokenStorePath(): string {
  if (process.env.MEDIA_CHIPS_DRIVE_TOKEN_PATH?.trim()) {
    return path.resolve(process.env.MEDIA_CHIPS_DRIVE_TOKEN_PATH.trim())
  }
  if (process.versions.electron && process.app_folder) {
    return path.join(process.app_folder, 'drive-oauth-tokens.json')
  }
  return projectPath('public', 'drive-oauth-tokens.json')
}

/**
 * Reads Google OAuth + Drive spike settings from env.
 * Real credentials are supplied by the user later; mock mode keeps CI/dev usable.
 */
function getDriveConfig(): DriveConfig {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim()
  const redirectUri = (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    'http://localhost:3000/api/drive/oauth/callback'
  ).trim()
  const mockForced = envFlag('MEDIA_CHIPS_DRIVE_MOCK')
  const hasCreds = Boolean(clientId && clientSecret)
  const mock = mockForced || !hasCreds

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: [...DRIVE_SPIKE_SCOPES],
    mock,
    configured: mock || hasCreds,
    tokenStorePath: resolveTokenStorePath(),
  }
}

export {getDriveConfig, resolveTokenStorePath}
