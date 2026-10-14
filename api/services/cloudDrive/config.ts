import path from 'path'
import os from 'os'
import fs from 'fs'
import {FIXED_PORT} from '../../../app/server/ports'
import {createNasCredentialStore} from '../nas/credentials'
import {DriveConfigurationSchema, normalizeDriveClientSecret} from '../../../shared/cloudDrive'
import type {DriveConfig} from './types'
import {validateOAuthClient} from './oauth'

/** Read-only access supports browsing and streaming without changing Drive files. */
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
  return path.join(driveDataDirectory(), 'tokens.json')
}

/**
 * Read private connection settings, falling back to environment configuration.
 * Mock mode is explicitly opt-in for development and tests.
 */
function getDriveConfig(): DriveConfig {
  let saved: {clientId?: string; clientSecret?: string; redirectUri?: string} = {}
  const vault = driveConfigVault()
  if (vault.has(CONFIG_ID)) { try { saved = JSON.parse(vault.get(CONFIG_ID).password || '{}') } catch { /* Allow configuration recovery. */ } }
  const clientId = (saved.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim()
  const clientSecret = normalizeDriveClientSecret(saved.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '')
  const redirectUri = (
    saved.redirectUri || process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `http://localhost:${FIXED_PORT}/api/drive/oauth/callback`
  ).trim()
  const mockForced = envFlag('MEDIA_CHIPS_DRIVE_MOCK')
  const hasCreds = Boolean(clientId && clientSecret)
  const mock = mockForced

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

const CONFIG_ID = '57ee4e46-5d80-4b93-81d0-d0e5ee7c2e90'
function driveDataDirectory() {
  return path.join(process.env.MEDIA_CHIPS_DATA_DIR || process.app_folder || path.join(os.homedir(), '.mediachips'), 'google-drive')
}
function driveConfigVault() { return createNasCredentialStore(path.join(driveDataDirectory(), 'configuration')) }
async function saveDriveConfiguration(raw: unknown) {
  const input = DriveConfigurationSchema.parse(raw)
  const previous = getDriveConfig()
  const clientSecret = input.clientSecret || (input.clientId === previous.clientId ? previous.clientSecret : '')
  if (!clientSecret) throw Object.assign(new Error('Enter the Google OAuth client secret.'), {status: 400})
  await validateOAuthClient({...previous, ...input, clientSecret})
  driveConfigVault().set(CONFIG_ID, {password: JSON.stringify({...input, clientSecret})})
  // Credentials changed: the previous account authorization cannot be reused.
  fs.rmSync(previous.tokenStorePath, {force: true})
}
export {getDriveConfig, resolveTokenStorePath, saveDriveConfiguration}
