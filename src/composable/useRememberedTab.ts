import {shallowRef, watch} from 'vue'

/** Remember UI choices only; ignore unavailable tabs and blocked browser storage. */
export function useRememberedTab<T extends string>(key: string, choices: readonly T[], fallback: T) {
  function load(): T {
    try {
      const value = localStorage.getItem(key)
      return value && choices.includes(value as T) ? value as T : fallback
    } catch { return fallback }
  }
  const tab = shallowRef<T>(load())
  watch(tab, value => {
    try { localStorage.setItem(key, value) }
    catch { /* The tab remains usable without persistent storage. */ }
  }, {flush: 'sync'})
  return {tab, restore: () => { tab.value = load() }}
}
