import fs from 'fs'
import path from 'path'
import type {Express} from 'express'
import type {ApiDb} from '../types/db'
import {ensurePluginsRoot, listInstalledUserPlugins} from './pluginInstall'

type PluginMainRegistrar = (app: Express, db: ApiDb) => void

let boundApp: Express | null = null
let boundDb: ApiDb | null = null
const mountedPluginIds = new Set<string>()

function resolveMainPath(pluginDir: string, mainEntry: string | null | undefined): string | null {
  if (!mainEntry) return null
  const normalized = mainEntry.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    return null
  }
  const full = path.join(pluginDir, normalized)
  const root = path.resolve(pluginDir)
  const resolved = path.resolve(full)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null
  }
  return fs.existsSync(resolved) ? resolved : null
}

function loadRegistrar(mainPath: string): PluginMainRegistrar {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(mainPath) as PluginMainRegistrar | {default?: PluginMainRegistrar}
  if (typeof mod === 'function') return mod
  if (mod && typeof mod.default === 'function') return mod.default
  throw new Error(`Plugin mainEntry did not export a register(app, db) function: ${mainPath}`)
}

export function bindPluginMainRuntime(app: Express, db: ApiDb): void {
  boundApp = app
  boundDb = db
  mountInstalledPluginMains()
}

export function mountInstalledPluginMains(): void {
  if (!boundApp || !boundDb) return

  const root = ensurePluginsRoot()
  const entries = listInstalledUserPlugins([])
  for (const entry of entries) {
    if (mountedPluginIds.has(entry.manifest.id)) continue
    const mainPath = resolveMainPath(
      path.join(root, entry.manifest.id),
      entry.mainEntry,
    )
    if (!mainPath) continue
    try {
      const register = loadRegistrar(mainPath)
      register(boundApp, boundDb)
      mountedPluginIds.add(entry.manifest.id)
      console.log(`[plugins] mounted mainEntry for ${entry.manifest.id}`)
    } catch (error) {
      console.error(
        `[plugins] failed to mount mainEntry for ${entry.manifest.id}:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}

/** Call after install so scraper routes become available without restart. */
export function remountPluginMainsAfterInstall(): void {
  mountInstalledPluginMains()
}

/** Test helper */
export function resetPluginMainRuntimeForTests(): void {
  boundApp = null
  boundDb = null
  mountedPluginIds.clear()
}

export function getMountedPluginMainIdsForTests(): string[] {
  return [...mountedPluginIds]
}
