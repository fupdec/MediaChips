import {ref} from 'vue'

export type FoldersBrowserFocus =
  | {kind: 'folder'; path: string}
  | {kind: 'media'; id: number}
  | null

const focused = ref<FoldersBrowserFocus>(null)

export function useFoldersBrowserFocus() {
  function setFocus(next: FoldersBrowserFocus) {
    focused.value = next
  }

  function clearFocus() {
    focused.value = null
  }

  return {
    focused,
    setFocus,
    clearFocus,
  }
}
