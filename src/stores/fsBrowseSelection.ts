import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import type {FolderBrowseTileModel} from '@/components/folders/FolderBrowseTile.vue'
import type {FsBrowseEntry} from '@/components/folders/FsBrowseEntry'

export type SelectedFsEntry =
  | {kind: 'folder'; path: string; name: string}
  | {kind: 'fs-file'; path: string; name: string}

export const useFsBrowseSelection = defineStore('fsBrowseSelection', () => {
  const isSelectMode = ref(false)
  const selectedMap = ref(new Map<string, SelectedFsEntry>())

  function toggleSelectMode(force?: boolean) {
    isSelectMode.value = force ?? !isSelectMode.value
    if (!isSelectMode.value) {
      clearSelection()
    }
  }

  function clearSelection() {
    selectedMap.value = new Map()
  }

  function setSelectedEntries(entries: SelectedFsEntry[]) {
    const next = new Map<string, SelectedFsEntry>()
    for (const entry of entries) {
      next.set(entry.path, entry)
    }
    selectedMap.value = next
  }

  function isSelected(path: string): boolean {
    return selectedMap.value.has(path)
  }

  function toggleSelected(entry: SelectedFsEntry) {
    const next = new Map(selectedMap.value)
    if (next.has(entry.path)) {
      next.delete(entry.path)
    } else {
      next.set(entry.path, entry)
    }
    selectedMap.value = next
  }

  function toggleFolder(folder: FolderBrowseTileModel) {
    toggleSelected({kind: 'folder', path: folder.path, name: folder.name})
  }

  function toggleFsFile(entry: FsBrowseEntry) {
    toggleSelected({kind: 'fs-file', path: entry.path, name: entry.name})
  }

  function selectFolder(folder: FolderBrowseTileModel) {
    const next = new Map(selectedMap.value)
    if (!next.has(folder.path)) {
      next.set(folder.path, {kind: 'folder', path: folder.path, name: folder.name})
    }
    selectedMap.value = next
  }

  function selectFsFile(entry: FsBrowseEntry) {
    const next = new Map(selectedMap.value)
    if (!next.has(entry.path)) {
      next.set(entry.path, {kind: 'fs-file', path: entry.path, name: entry.name})
    }
    selectedMap.value = next
  }

  function selectAllAddable(entries: FsBrowseEntry[]) {
    const next = new Map(selectedMap.value)
    for (const entry of entries) {
      if (!entry.isDirectory && entry.addable && !next.has(entry.path)) {
        next.set(entry.path, {kind: 'fs-file', path: entry.path, name: entry.name})
      }
    }
    selectedMap.value = next
  }

  const selectedEntries = computed<SelectedFsEntry[]>(() =>
    [...selectedMap.value.values()],
  )

  const selectedCount = computed(() => selectedMap.value.size)

  const clipboardNames = computed(() =>
    selectedEntries.value.map((e) => e.name).join('\n'),
  )

  const clipboardPaths = computed(() =>
    selectedEntries.value.map((e) => e.path).join('\n'),
  )

  return {
    isSelectMode,
    selectedMap,
    selectedEntries,
    selectedCount,
    clipboardNames,
    clipboardPaths,
    toggleSelectMode,
    clearSelection,
    setSelectedEntries,
    isSelected,
    toggleSelected,
    toggleFolder,
    toggleFsFile,
    selectFolder,
    selectFsFile,
    selectAllAddable,
  }
})