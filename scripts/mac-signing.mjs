/**
 * Optional macOS Developer ID + notarize overrides for electron-builder.
 * Community default remains ad-hoc (`identity: "-"` in package.json).
 * See build/mac-signing.env.example.
 */

/** @param {NodeJS.ProcessEnv} [env] */
export function wantsMacDeveloperIdSign(env = process.env) {
  if (String(env.MEDIA_CHIPS_MAC_SIGN || '').trim() === '1') return true
  if (String(env.CSC_LINK || '').trim()) return true
  if (String(env.CSC_NAME || '').trim()) return true
  return false
}

/** @param {NodeJS.ProcessEnv} [env] */
export function hasAppleNotarizeCredentials(env = process.env) {
  if (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) return true
  if (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) return true
  if (env.APPLE_KEYCHAIN_PROFILE) return true
  return false
}

/**
 * Drop ad-hoc identity and enable hardened runtime + entitlements.
 * @param {Record<string, unknown>} config electron-builder config (`package.json` → `build`)
 * @param {NodeJS.ProcessEnv} [env]
 */
export function applyMacDeveloperIdSigning(config, env = process.env) {
  const {identity: _adhocIdentity, ...macRest} = /** @type {Record<string, unknown>} */ (config.mac || {})
  const mac = {
    ...macRest,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
  }
  const cscName = String(env.CSC_NAME || '').trim()
  if (cscName) {
    mac.identity = cscName
  }
  // Omit identity → electron-builder picks "Developer ID Application: …" from Keychain / CSC_LINK.
  return {...config, mac}
}
