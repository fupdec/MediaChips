import type {FullConfig} from '@playwright/test'

/**
 * A new database starts in the simple interface mode. The specs cover the full
 * interface (all settings sections, tag categories, condition filters), so the
 * isolated E2E profile switches "Advanced features" on before any test runs.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) throw new Error('E2E baseURL is not configured')
  const response = await fetch(new URL('/api/Setting/advancedUi', baseURL), {
    method: 'PUT',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({value: '1'}),
  })
  if (!response.ok) throw new Error(`Could not enable advanced features for E2E: ${response.status}`)
}
