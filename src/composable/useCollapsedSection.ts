import {ref, watch} from 'vue'
import type {Ref} from 'vue'

const STORAGE_PREFIX = 'mediachips.filterSection.'

/**
 * Collapsed/expanded state of a panel section, remembered between sessions
 * in localStorage (light per-user convenience; falls back to expanded).
 */
export function useCollapsedSection(key: string): Ref<boolean> {
  const storageKey = `${STORAGE_PREFIX}${key}`
  let initial = false
  try {
    initial = localStorage.getItem(storageKey) === '1'
  } catch {
    /* storage unavailable */
  }
  const collapsed = ref(initial)
  watch(collapsed, (value) => {
    try {
      localStorage.setItem(storageKey, value ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  })
  return collapsed
}
