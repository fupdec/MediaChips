import path from 'path'
import os from 'os'
import {createTokenStore} from './tokenStore'
import {FIXED_PORT} from '../../../app/server/ports'
import {createNasCredentialStore} from '../nas/credentials'
import {DriveConfigurationSchema, normalizeDriveClientSecret} from '../../../shared/cloudDrive'
import type {DriveConfig} from './types'
import {validateOAuthClient} from './oauth'
import {callbackReachesApi} from '../cloudOAuthCallback'
import {DriveOAuthError} from './oauthErrors'

/** Managing previously imported originals requires full Drive access. Existing
 * read-only tokens continue to read until the user explicitly reconnects. */
export const DRIVE_SPIKE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
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
  const redirectUri = (saved.redirectUri || envDriveRedirect() || automaticDriveRedirect()).trim()
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

function currentApiPort() { return (process.server_config as {port?: number} | undefined)?.port || FIXED_PORT }
function automaticDriveRedirect() { return `http://127.0.0.1:${currentApiPort()}/api/drive/oauth/callback` }
/** GOOGLE_OAUTH_REDIRECT_URI from .env, ignored when it is a loopback address
 * on another port (e.g. a stale dev-server port): Desktop OAuth clients accept
 * any loopback port, so the current API callback always works for them. */
function envDriveRedirect(): string | undefined {
  const value = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()
  if (!value) return undefined
  return callbackReachesApi(value, currentApiPort()) ? value : undefined
}
function savedDriveRedirect(): string | undefined {
  const vault = driveConfigVault()
  if (!vault.has(CONFIG_ID)) return undefined
  try { return JSON.parse(vault.get(CONFIG_ID).password || '{}').redirectUri || undefined } catch { return undefined }
}

const CONFIG_ID = '57ee4e46-5d80-4b93-81d0-d0e5ee7c2e90'
function driveDataDirectory() {
  return path.join(process.env.MEDIA_CHIPS_DATA_DIR || process.app_folder || path.join(os.homedir(), '.mediachips'), 'google-drive')
}
function driveConfigVault() { return createNasCredentialStore(path.join(driveDataDirectory(), 'configuration')) }
async function saveDriveConfiguration(raw: unknown, apiPort?: number) {
  const input = DriveConfigurationSchema.parse(raw)
  if (apiPort !== undefined && input.redirectUri && !callbackReachesApi(input.redirectUri, apiPort)) throw new DriveOAuthError('redirect_uri_mismatch')
  const previous = getDriveConfig()
  const clientSecret = input.clientSecret || (input.clientId === previous.clientId ? previous.clientSecret : '')
  if (!clientSecret) throw Object.assign(new Error('Enter the Google OAuth client secret.'), {status: 400})
  await validateOAuthClient({...previous, ...input, clientSecret})
  const {redirectUri, ...rest} = input
  driveConfigVault().set(CONFIG_ID, {password: JSON.stringify(redirectUri ? {...rest, redirectUri, clientSecret} : {...rest, clientSecret})})
  // Credentials changed: the previous account authorization cannot be reused.
  createTokenStore(previous.tokenStorePath).clear()
}
export function hasSavedDriveConfiguration() { return driveConfigVault().has(CONFIG_ID) }
/** True when no explicit callback is saved: the API port decides it each launch. */
export function usesAutomaticDriveRedirect() { return !savedDriveRedirect() && !envDriveRedirect() }
export function removeDriveConfiguration() { driveConfigVault().delete(CONFIG_ID) }

export {getDriveConfig, resolveTokenStorePath, saveDriveConfiguration}
