import {DriveFileIdSchema} from '@shared/cloudDrive'
import {driveBrowserRoot} from './driveBrowse'

const STORAGE_KEY = 'mediachips.drive.browser'
type DriveBrowserLocation = {path: string; pathTitles: Record<string, string>}
const rootLocation = (): DriveBrowserLocation => ({path: driveBrowserRoot, pathTitles: {[driveBrowserRoot]: 'Google Drive'}})
const storageKey = (scope: string) => `${STORAGE_KEY}.${encodeURIComponent(scope)}`

function normalizeLocation(value: unknown): DriveBrowserLocation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return rootLocation()
  const {path, pathTitles} = value as Partial<DriveBrowserLocation>
  if (typeof path !== 'string' || path.length > 16_384) return rootLocation()
  if (path === driveBrowserRoot) return rootLocation()
  if (!path.startsWith(`${driveBrowserRoot}/`)) return rootLocation()
  const parts = path.slice(driveBrowserRoot.length + 1).split('/')
  if (parts.some(part => !DriveFileIdSchema.safeParse(part).success)) return rootLocation()
  const titles = rootLocation().pathTitles
  let ancestor = driveBrowserRoot
  for (const part of parts) {
    ancestor += `/${part}`
    const title = pathTitles?.[ancestor]
    if (typeof title === 'string' && title.trim()) titles[ancestor] = title.slice(0, 1024)
  }
  return {path, pathTitles: titles}
}

export function loadDriveBrowserLocation(scope: string): DriveBrowserLocation {
  try { return normalizeLocation(JSON.parse(localStorage.getItem(storageKey(scope)) || 'null')) }
  catch { return rootLocation() }
}

/** Only remember a folder after its listing succeeds, together with its breadcrumb names. */
export function persistDriveBrowserLocation(scope: string, path: string, pathTitles: Record<string, string>): void {
  try { localStorage.setItem(storageKey(scope), JSON.stringify(normalizeLocation({path, pathTitles}))) }
  catch { /* Navigation remains available when storage is blocked or full. */ }
}
