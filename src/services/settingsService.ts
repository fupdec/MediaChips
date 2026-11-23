import { useSettingsStore } from '@/stores/settings'
import { typedApi } from '@/services/typedApi'
import { isGlobalAppConfigKey, persistGlobalAppConfig } from '@/services/globalAppConfig'
import type { SettingsState } from '@/types/settings'

const PERSIST_DEBOUNCE_MS = 10

type PersistTask = {
  value: SettingsState[keyof SettingsState]
  timer: ReturnType<typeof setTimeout> | undefined
  resolvers: Array<() => void>
  rejecters: Array<(error: unknown) => void>
}

const pendingByOption = new Map<string, PersistTask>()
const activeByOption = new Map<string, PersistTask>()

export async function getOption(option: keyof SettingsState | string) {
  return typedApi.getSetting(String(option))
}

async function persistOption(
  value: SettingsState[keyof SettingsState],
  option: keyof SettingsState,
): Promise<void> {
  if (isGlobalAppConfigKey(String(option))) {
    await persistGlobalAppConfig({ [option]: String(value) })
    return
  }

  await typedApi.putSetting(String(option), String(value))
}

function flushOption(option: keyof SettingsState, task: PersistTask): void {
  const key = String(option)
  task.timer = undefined
  if (activeByOption.has(key)) return
  pendingByOption.delete(key)
  activeByOption.set(key, task)

  const complete = () => {
    if (activeByOption.get(key) !== task) return
    activeByOption.delete(key)
    const next = pendingByOption.get(key)
    // A pending timer still owns its debounce window; otherwise it is ready.
    if (next && next.timer === undefined) flushOption(option, next)
  }

  void persistOption(task.value, option).then(
    () => {
      for (const resolve of task.resolvers) resolve()
      complete()
    },
    (error: unknown) => {
      for (const reject of task.rejecters) reject(error)
      complete()
    },
  )
}

/**
 * Update a setting in the Pinia store immediately and persist it.
 * Persistence is debounced per option key so rapid writes to different
 * settings (e.g. adjacent Adult scraper switches) cannot cancel each other.
 * Writes for one key run sequentially, coalescing edits while a request is active.
 */
export function setOption(
  value: SettingsState[keyof SettingsState],
  option: keyof SettingsState,
): Promise<void> {
  const settings = useSettingsStore()
  settings[option] = value

  const key = String(option)
  const existing = pendingByOption.get(key)
  if (existing) {
    clearTimeout(existing.timer)
    existing.value = value
    return new Promise<void>((resolve, reject) => {
      existing.resolvers.push(resolve)
      existing.rejecters.push(reject)
      existing.timer = setTimeout(() => {
        flushOption(option, existing)
      }, PERSIST_DEBOUNCE_MS)
    })
  }

  return new Promise<void>((resolve, reject) => {
    const task: PersistTask = {
      value,
      resolvers: [resolve],
      rejecters: [reject],
      timer: setTimeout(() => {
        flushOption(option, task)
      }, PERSIST_DEBOUNCE_MS),
    }
    pendingByOption.set(key, task)
  })
}

/** Test helper — clear pending debounced writes. */
export function resetSettingsServiceForTests(): void {
  for (const task of pendingByOption.values()) {
    clearTimeout(task.timer)
  }
  pendingByOption.clear()
  activeByOption.clear()
}
