<template>
  <div
    class="media-folder-browser"
    :class="{'media-folder-browser--fill': fillHeight}"
  >
    <div class="media-folder-browser__panel">
      <div class="media-folder-browser__toolbar">
        <div class="media-folder-browser__nav">
          <div class="media-folder-browser__nav-cluster">
            <button
              type="button"
              class="media-folder-browser__nav-btn"
              :disabled="loading || !canGoBack"
              :aria-label="t('folders_browser.back')"
              @click="goHistoryBack"
            >
              <v-icon size="16" icon="mdi-arrow-left"/>
            </button>
            <button
              type="button"
              class="media-folder-browser__nav-btn"
              :disabled="loading || !canGoForward"
              :aria-label="t('folders_browser.forward')"
              @click="goHistoryForward"
            >
              <v-icon size="16" icon="mdi-arrow-right"/>
            </button>
            <button
              type="button"
              class="media-folder-browser__nav-btn"
              :disabled="loading || !canGoUp"
              :aria-label="t('media.adding.browser_up')"
              @click="goUp"
            >
              <v-icon size="16" icon="mdi-arrow-up"/>
            </button>
            <template v-if="places.length">
              <span
                class="media-folder-browser__nav-divider"
                aria-hidden="true"
              />
              <v-menu
                location="bottom start"
                content-class="media-folder-browser__places-menu"
              >
                <template #activator="{props: menuProps}">
                  <button
                    v-bind="menuProps"
                    type="button"
                    class="media-folder-browser__nav-btn"
                    :class="{'media-folder-browser__nav-btn--on': Boolean(activePlaceId)}"
                    :aria-label="t('media.adding.browser_places')"
                    v-tooltip:top="t('media.adding.browser_places')"
                  >
                    <v-icon size="16" icon="mdi-dots-horizontal"/>
                  </button>
                </template>
                <v-list density="compact">
                  <v-list-item
                    v-for="place in places"
                    :key="place.id"
                    :prepend-icon="place.icon || 'mdi-folder'"
                    :title="placeLabel(place)"
                    :active="activePlaceId === place.id"
                    slim
                    @click="emit('selectPlace', place.path)"
                  />
                </v-list>
              </v-menu>
            </template>
          </div>

          <nav
            class="media-folder-browser__path"
            :aria-label="t('navigation.folders')"
          >
            <template
              v-for="(item, index) in breadcrumbItems"
              :key="item.path"
            >
              <v-icon
                v-if="index > 0"
                icon="mdi-chevron-right"
                size="14"
                class="media-folder-browser__path-sep"
              />
              <button
                type="button"
                class="media-folder-browser__path-seg"
                :class="{'media-folder-browser__path-seg--current': index === breadcrumbItems.length - 1}"
                :disabled="loading"
                :title="item.path"
                @click="navigateTo(item.path)"
              >
                <span class="media-folder-browser__path-seg-label">{{ item.title }}</span>
              </button>
            </template>
          </nav>
        </div>

        <div
          v-if="showSelection || enableFolderTags"
          class="media-folder-browser__actions"
        >
          <FolderTagsMenu
            v-if="enableFolderTags"
            :folder-path="currentPath"
            @saved="reloadFolderTags"
          >
            <template #activator="{props: menuProps}">
              <v-btn
                v-bind="menuProps"
                size="small"
                variant="tonal"
                color="primary"
                rounded="xl"
                icon
                :disabled="loading || !currentPath"
                v-tooltip:top="t('media.adding.folder_tags_edit')"
              >
                <v-icon size="18" icon="mdi-tag-multiple-outline"/>
              </v-btn>
            </template>
          </FolderTagsMenu>
          <v-btn
            v-if="enableFolderTags"
            size="small"
            variant="tonal"
            color="primary"
            rounded="xl"
            icon
            v-tooltip:top="t('media.adding.folder_tags_manager_open')"
            @click="folderTagsManagerOpen = true"
          >
            <v-icon size="18" icon="mdi-folder-multiple-outline"/>
          </v-btn>
          <v-btn
            v-if="showSelection && !isFilePicker"
            size="small"
            variant="flat"
            color="primary"
            rounded="xl"
            icon
            :disabled="loading || !currentPath"
            v-tooltip:top="t('media.adding.browser_select_folder')"
            @click="selectCurrentFolder"
          >
            <v-icon size="18" icon="mdi-folder-check-outline"/>
          </v-btn>
          <v-btn
            v-if="showSelection"
            size="small"
            variant="tonal"
            rounded="xl"
            icon
            :disabled="loading || !selectedPaths.size"
            v-tooltip:top="t('media.adding.browser_clear_selection')"
            @click="clearSelection"
          >
            <v-icon size="18" icon="mdi-select-off"/>
          </v-btn>
        </div>

        <div
          v-if="showSelection && selectedPaths.size"
          class="media-folder-browser__selected-count"
        >
          {{ t('media.adding.browser_selected_count', {count: selectedPaths.size}) }}
        </div>

        <v-menu
          location="bottom end"
          :close-on-content-click="false"
          content-class="media-folder-browser__places-menu media-folder-browser__view-menu"
        >
          <template #activator="{props: menuProps}">
            <v-btn
              v-bind="menuProps"
              size="small"
              variant="tonal"
              color="primary"
              rounded="xl"
              icon
              :class="{'media-folder-browser__view-btn--on': displayOptionsActive}"
              v-tooltip:top="t('media.adding.browser_view_options')"
            >
              <v-icon size="18" icon="mdi-eye-outline"/>
            </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item
              v-if="!foldersOnly && !isFilePicker"
              slim
              @click="hideInLibrary = !hideInLibrary"
            >
              <template #prepend>
                <v-checkbox-btn
                  v-model="hideInLibrary"
                  density="compact"
                  @click.stop
                />
              </template>
              <v-list-item-title>
                {{ t('media.adding.browser_hide_in_library') }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item
              v-if="!foldersOnly && !isFilePicker"
              slim
              @click="hideNonMedia = !hideNonMedia"
            >
              <template #prepend>
                <v-checkbox-btn
                  v-model="hideNonMedia"
                  density="compact"
                  @click.stop
                />
              </template>
              <v-list-item-title>
                {{ t('media.adding.browser_hide_non_media') }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item
              slim
              @click="showHidden = !showHidden"
            >
              <template #prepend>
                <v-checkbox-btn
                  v-model="showHidden"
                  density="compact"
                  @click.stop
                />
              </template>
              <v-list-item-title>
                {{ t('media.adding.browser_show_hidden') }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>

      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        density="compact"
        rounded="lg"
        class="ma-2 text-caption"
      >
        {{ error }}
      </v-alert>

      <v-alert
        v-if="truncated"
        type="warning"
        variant="tonal"
        density="compact"
        rounded="lg"
        class="ma-2 text-caption"
      >
        {{ t('media.adding.browser_truncated') }}
      </v-alert>

      <div class="media-folder-browser__list">
        <FoldersBrowseSkeleton
          v-if="loading"
          class="media-folder-browser__skeleton"
          view-mode="list"
          :size="3"
          gap-size="compact"
        />
        <div
          v-else-if="!visibleEntries.length"
          class="media-folder-browser__empty"
        >
          {{ t('media.adding.browser_empty') }}
        </div>
        <template v-else>
          <div
            class="media-folder-browser__header"
            :class="{'media-folder-browser__header--selectable': showSelection}"
          >
            <button
              type="button"
              class="media-folder-browser__col media-folder-browser__col--name media-folder-browser__sort"
              :class="{'media-folder-browser__sort--active': sortKey === 'name'}"
              @click="toggleSort('name')"
            >
              <span>{{ t('media.adding.browser_col_name') }}</span>
              <v-icon
                v-if="sortKey === 'name'"
                :icon="sortDesc ? 'mdi-menu-down' : 'mdi-menu-up'"
                size="14"
              />
            </button>
            <button
              type="button"
              class="media-folder-browser__col media-folder-browser__col--size media-folder-browser__sort"
              :class="{'media-folder-browser__sort--active': sortKey === 'size'}"
              @click="toggleSort('size')"
            >
              <span>{{ t('media.adding.browser_col_size') }}</span>
              <v-icon
                v-if="sortKey === 'size'"
                :icon="sortDesc ? 'mdi-menu-down' : 'mdi-menu-up'"
                size="14"
              />
            </button>
            <button
              type="button"
              class="media-folder-browser__col media-folder-browser__col--mtime media-folder-browser__sort"
              :class="{'media-folder-browser__sort--active': sortKey === 'mtime'}"
              @click="toggleSort('mtime')"
            >
              <span>{{ t('media.adding.browser_col_modified') }}</span>
              <v-icon
                v-if="sortKey === 'mtime'"
                :icon="sortDesc ? 'mdi-menu-down' : 'mdi-menu-up'"
                size="14"
              />
            </button>
            <span
              v-if="!foldersOnly && !isFilePicker"
              class="media-folder-browser__col media-folder-browser__col--status"
            />
          </div>
          <v-list
            density="compact"
            class="py-0"
          >
            <v-list-item
              v-for="entry in visibleEntries"
              :key="entry.path"
              :active="selectedPaths.has(entry.path)"
              :disabled="entry.inLibrary && !entry.isDirectory"
              rounded="0"
              @click="onEntryActivate(entry)"
            >
              <template #prepend>
                <v-checkbox
                  v-if="showSelection"
                  :model-value="selectedPaths.has(entry.path)"
                  :disabled="(entry.inLibrary && !entry.isDirectory && !isFilePicker) || (isFilePicker && entry.isDirectory)"
                  density="compact"
                  hide-details
                  class="mt-0 media-folder-browser__check"
                  @click.stop
                  @update:model-value="(checked) => toggleEntry(entry, Boolean(checked))"
                />
                <v-icon
                  :icon="entry.isDirectory ? 'mdi-folder' : 'mdi-file-outline'"
                  :color="entry.isDirectory ? folderIconColor : undefined"
                  :style="entry.isDirectory ? folderIconStyle : undefined"
                  class="media-folder-browser__icon"
                />
              </template>

              <div class="media-folder-browser__row-body">
                <span
                  class="media-folder-browser__col media-folder-browser__col--name text-truncate"
                  :title="entry.name"
                >
                  {{ entry.name }}
                  <span
                    v-if="enableFolderTags && entry.isDirectory && folderTagChips(entry.path).length"
                    class="media-folder-browser__tag-chips"
                  >
                    <v-chip
                      v-for="chip in folderTagChips(entry.path)"
                      :key="`${entry.path}:${chip.tagId}`"
                      size="x-small"
                      label
                      :color="chip.color || undefined"
                      variant="tonal"
                      class="ml-1"
                    >
                      {{ chip.name }}
                    </v-chip>
                  </span>
                </span>
                <span class="media-folder-browser__col media-folder-browser__col--size text-medium-emphasis">
                  {{ formatEntrySize(entry) }}
                </span>
                <span class="media-folder-browser__col media-folder-browser__col--mtime text-medium-emphasis">
                  {{ formatEntryMtime(entry) }}
                </span>
                <span
                  v-if="!foldersOnly && !isFilePicker"
                  class="media-folder-browser__col media-folder-browser__col--status"
                >
                  <v-chip
                    v-if="entry.inLibrary"
                    size="x-small"
                    color="secondary"
                    variant="tonal"
                    label
                  >
                    {{ t('media.adding.browser_in_library') }}
                  </v-chip>
                  <v-chip
                    v-else-if="entry.addable"
                    size="x-small"
                    color="success"
                    variant="tonal"
                    label
                  >
                    {{ t('media.adding.browser_addable') }}
                  </v-chip>
                  <v-chip
                    v-else-if="!entry.isDirectory"
                    size="x-small"
                    variant="outlined"
                    label
                  >
                    {{ t('media.adding.browser_not_media') }}
                  </v-chip>
                </span>
              </div>
            </v-list-item>
          </v-list>
        </template>
      </div>
    </div>

    <DialogFolderTagsManager
      v-if="enableFolderTags"
      v-model="folderTagsManagerOpen"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import type {BrowseDirectoryEntry, BrowsePlace} from '@/services/typedApi/browse'
import {getReadableFileSize} from '@/services/formatUtils'
import {getApiErrorMessage} from '@/types/vue'
import FolderTagsMenu from '@/components/dialogs/FolderTagsMenu.vue'
import DialogFolderTagsManager from '@/components/dialogs/DialogFolderTagsManager.vue'
import FoldersBrowseSkeleton from '@/components/folders/FoldersBrowseSkeleton.vue'
import {
  canGoFolderHistoryBack,
  canGoFolderHistoryForward,
  emptyFolderNavHistory,
  recordFolderNavPath,
  seedFolderNavHistory,
  stepFolderNavHistory,
} from '@/utils/folderNavHistory'

const props = withDefaults(defineProps<{
  baseUrl: string
  path: string
  extensions?: string
  selectedPaths: string[]
  places?: BrowsePlace[]
  activePlaceId?: string | null
  /** Folder picker mode: directories only, no media badges/filters. */
  foldersOnly?: boolean
  /** Show only directories + files matching these extensions (no media badges). */
  fileExtensions?: string[]
  /** Show row checkboxes and selection toolbar actions. */
  showSelection?: boolean
  /** Stretch list to fill parent height (side panel). */
  fillHeight?: boolean
  /** Allow editing / viewing tags on folders. */
  enableFolderTags?: boolean
}>(), {
  places: () => [],
  activePlaceId: null,
  foldersOnly: false,
  fileExtensions: () => [],
  showSelection: true,
  fillHeight: false,
  enableFolderTags: true,
})

const emit = defineEmits<{
  'update:path': [value: string]
  'update:selectedPaths': [value: string[]]
  selectPlace: [path: string]
}>()

const {t} = useI18n()

const loading = ref(false)
const error = ref('')
const truncated = ref(false)
const parentPath = ref<string | null>(null)
const rootPath = ref<string | null>(null)
const currentPath = ref('')
const entries = ref<BrowseDirectoryEntry[]>([])
const hideInLibrary = ref(false)
const hideNonMedia = ref(false)
const showHidden = ref(false)
const serverPlatform = ref('')
type SortKey = 'name' | 'size' | 'mtime'
const sortKey = ref<SortKey>('name')
const sortDesc = ref(false)
const folderTagsManagerOpen = ref(false)
const folderTagsByPath = ref<Record<string, Array<{
  tagId: number
  metaId: number
  name: string
  color?: string | null
}>>>({})

function canonicalizeFolderPath(folderPath: string): string {
  return String(folderPath || '').trim().replace(/[\\/]+$/, '')
}

watch(folderTagsManagerOpen, (open, wasOpen) => {
  if (!open && wasOpen) void reloadFolderTags()
})

function folderTagChips(folderPath: string) {
  const key = canonicalizeFolderPath(folderPath)
  return folderTagsByPath.value[key] || []
}

async function reloadFolderTags() {
  if (!props.enableFolderTags) {
    folderTagsByPath.value = {}
    return
  }

  const paths = [
    currentPath.value,
    ...entries.value.filter((entry) => entry.isDirectory).map((entry) => entry.path),
  ]
    .map(canonicalizeFolderPath)
    .filter(Boolean)

  if (!paths.length) {
    folderTagsByPath.value = {}
    return
  }

  try {
    const res = await typedApi.getTagsInFoldersByPaths(paths)
    const next: typeof folderTagsByPath.value = {}
    for (const [path, rows] of Object.entries(res.data || {})) {
      const key = canonicalizeFolderPath(path)
      next[key] = (rows || []).map((row) => {
        const tag = (row as {tag?: {name?: string; color?: string | null}}).tag
        return {
          tagId: Number(row.tagId),
          metaId: Number(row.metaId),
          name: String(tag?.name || row.tagId),
          color: tag?.color ?? null,
        }
      }).filter((row) => row.tagId && row.name)
    }
    folderTagsByPath.value = next
  } catch (error) {
    console.error(error)
  }
}

const selectedPaths = computed(() => new Set(props.selectedPaths))

/** Windows/Linux: classic yellow; macOS: Finder-like blue. */
const isMacServer = computed(() => serverPlatform.value === 'darwin')
const folderIconColor = computed(() => (isMacServer.value ? undefined : 'amber-darken-2'))
const folderIconStyle = computed(() => (
  isMacServer.value ? {color: '#5AC8FA'} : undefined
))

const isFilePicker = computed(() => props.fileExtensions.length > 0)
const allowedFileExtensions = computed(() =>
  new Set(props.fileExtensions.map((ext) => ext.replace(/^\./, '').toLowerCase())),
)

const displayOptionsActive = computed(() => {
  if (showHidden.value) return true
  if (props.foldersOnly || isFilePicker.value) return false
  return hideInLibrary.value || hideNonMedia.value
})

const visibleEntries = computed(() => {
  const filtered = entries.value.filter((entry) => {
    if (props.foldersOnly) return entry.isDirectory
    if (isFilePicker.value) {
      if (entry.isDirectory) return true
      return Boolean(entry.extension && allowedFileExtensions.value.has(entry.extension))
    }
    if (entry.isDirectory) return true
    if (hideInLibrary.value && entry.inLibrary) return false
    if (hideNonMedia.value && !entry.addable && !entry.inLibrary) return false
    return true
  })

  const direction = sortDesc.value ? -1 : 1
  return [...filtered].sort((a, b) => {
    // Keep folders above files, like Finder with “folders on top”.
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1

    let cmp = 0
    if (sortKey.value === 'size') {
      cmp = (a.size ?? -1) - (b.size ?? -1)
    } else if (sortKey.value === 'mtime') {
      cmp = (a.mtimeMs ?? 0) - (b.mtimeMs ?? 0)
    } else {
      cmp = a.name.localeCompare(b.name, undefined, {sensitivity: 'base', numeric: true})
    }
    if (cmp === 0) {
      cmp = a.name.localeCompare(b.name, undefined, {sensitivity: 'base', numeric: true})
    }
    return cmp * direction
  })
})

const breadcrumbItems = computed(() => {
  const root = rootPath.value
  const current = currentPath.value || props.path
  if (!root || !current) {
    return [{title: current || '/', path: current}]
  }

  const separator = root.includes('\\') ? '\\' : '/'
  const relative = current === root
    ? ''
    : current.slice(root.length).replace(/^[/\\]+/, '')
  const parts = relative ? relative.split(/[/\\]/).filter(Boolean) : []
  const items = [{title: root.split(/[/\\]/).filter(Boolean).pop() || root, path: root}]

  let cursor = root
  for (const part of parts) {
    cursor = cursor.endsWith('/') || cursor.endsWith('\\')
      ? `${cursor}${part}`
      : `${cursor}${separator}${part}`
    items.push({title: part, path: cursor})
  }
  return items
})

const knownPlaceIds = new Set([
  'home',
  'desktop',
  'documents',
  'downloads',
  'videos',
  'pictures',
  'music',
  'computer',
  'network',
])

function placeLabel(place: BrowsePlace): string {
  if (knownPlaceIds.has(place.id)) {
    return t(`media.adding.place_${place.id}`)
  }
  return place.name || place.path
}

function formatEntrySize(entry: BrowseDirectoryEntry): string {
  if (entry.isDirectory || entry.size == null) return ''
  return getReadableFileSize(entry.size)
}

function formatEntryMtime(entry: BrowseDirectoryEntry): string {
  if (entry.mtimeMs == null || !Number.isFinite(entry.mtimeMs)) return ''
  return new Date(entry.mtimeMs).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDesc.value = !sortDesc.value
    return
  }
  sortKey.value = key
  // First click: name A→Z; size/date newest/largest first (Finder-like).
  sortDesc.value = key !== 'name'
}

async function loadDirectory(targetPath: string) {
  if (!targetPath) return
  loading.value = true
  error.value = ''
  try {
    const {data} = await typedApi.listBrowseDirectory({
      path: targetPath,
      extensions: props.extensions,
      showHidden: showHidden.value,
    })
    currentPath.value = data.currentPath
    parentPath.value = data.parentPath
    rootPath.value = data.rootPath
    truncated.value = data.truncated
    serverPlatform.value = data.platform
    entries.value = data.entries
    if (data.currentPath !== props.path) {
      emit('update:path', data.currentPath)
    }
    await reloadFolderTags()
  } catch (err: unknown) {
    const message = getApiErrorMessage(err, t('media.adding.browser_load_error'))
    error.value = message
    entries.value = []
    folderTagsByPath.value = {}
  } finally {
    loading.value = false
  }
}

function navigateTo(targetPath: string | null | undefined) {
  if (!targetPath || loading.value) return
  emit('update:path', targetPath)
}

const browseHistory = ref(emptyFolderNavHistory())
let suppressBrowseHistory = false

const canGoBack = computed(() => canGoFolderHistoryBack(browseHistory.value))
const canGoForward = computed(() => canGoFolderHistoryForward(browseHistory.value))
const canGoUp = computed(() => Boolean(parentPath.value))

function recordBrowseHistory(path: string) {
  if (suppressBrowseHistory) {
    suppressBrowseHistory = false
    return
  }
  if (browseHistory.value.entries.length === 0) {
    browseHistory.value = seedFolderNavHistory(path)
    return
  }
  browseHistory.value = recordFolderNavPath(browseHistory.value, path)
}

function goHistoryBack() {
  if (!canGoBack.value || loading.value) return
  const stepped = stepFolderNavHistory(browseHistory.value, -1)
  if (!stepped?.path) return
  suppressBrowseHistory = true
  browseHistory.value = stepped.history
  navigateTo(stepped.path)
}

function goHistoryForward() {
  if (!canGoForward.value || loading.value) return
  const stepped = stepFolderNavHistory(browseHistory.value, 1)
  if (!stepped?.path) return
  suppressBrowseHistory = true
  browseHistory.value = stepped.history
  navigateTo(stepped.path)
}

function goUp() {
  if (!canGoUp.value || loading.value) return
  navigateTo(parentPath.value)
}

watch(
  () => props.path,
  (path) => {
    if (path) recordBrowseHistory(path)
  },
  {immediate: true},
)

function emitSelection(next: Set<string>) {
  emit('update:selectedPaths', [...next].sort((a, b) => a.localeCompare(b)))
}

function toggleEntry(entry: BrowseDirectoryEntry, checked: boolean) {
  if (entry.inLibrary && !entry.isDirectory && !isFilePicker.value) return
  const next = new Set(selectedPaths.value)
  // File picker: keep a single selected file
  if (isFilePicker.value && !entry.isDirectory && checked) {
    emitSelection(new Set([entry.path]))
    return
  }
  if (checked) next.add(entry.path)
  else next.delete(entry.path)
  emitSelection(next)
}

function onEntryActivate(entry: BrowseDirectoryEntry) {
  if (entry.isDirectory) {
    navigateTo(entry.path)
    return
  }
  if (isFilePicker.value) {
    if (!props.showSelection) {
      emitSelection(new Set([entry.path]))
      return
    }
    toggleEntry(entry, !selectedPaths.value.has(entry.path))
    return
  }
  if (!props.showSelection) return
  if (entry.inLibrary) return
  toggleEntry(entry, !selectedPaths.value.has(entry.path))
}

function selectCurrentFolder() {
  if (!currentPath.value) return
  const next = new Set(selectedPaths.value)
  next.add(currentPath.value)
  emitSelection(next)
}

function clearSelection() {
  emitSelection(new Set())
}

watch(
  () => [props.path, props.extensions, props.baseUrl, showHidden.value] as const,
  ([nextPath]) => {
    if (nextPath) void loadDirectory(nextPath)
  },
  {immediate: true},
)
</script>

<style scoped>
.media-folder-browser__panel {
  border: 1px solid rgba(var(--v-theme-primary), 0.14);
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
}

.media-folder-browser__toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(var(--v-theme-primary), 0.1);
  background: rgba(var(--v-theme-primary), 0.035);
}

.media-folder-browser__nav {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.media-folder-browser__nav-cluster {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  padding: 2px;
  border-radius: 12px;
  background: rgba(var(--v-theme-surface), 0.92);
  border: 1px solid rgba(var(--v-theme-primary), 0.14);
  box-shadow: 0 1px 0 rgba(var(--v-theme-on-surface), 0.04);
}

.media-folder-browser__nav-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.media-folder-browser__nav-btn .v-icon {
  color: inherit;
  opacity: 1;
}

.media-folder-browser__nav-btn:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.1);
}

.media-folder-browser__nav-btn:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: -2px;
}

.media-folder-browser__nav-btn:disabled {
  color: rgba(var(--v-theme-on-surface), 0.32);
  opacity: 1;
  cursor: default;
  pointer-events: none;
}

.media-folder-browser__nav-btn--on {
  background: rgba(var(--v-theme-primary), 0.12);
}

.media-folder-browser__nav-divider {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: rgba(var(--v-theme-primary), 0.16);
  flex-shrink: 0;
}

.media-folder-browser__path {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 2px;
}

.media-folder-browser__path-sep {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.32);
}

.media-folder-browser__path-seg {
  appearance: none;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  max-width: 160px;
  min-width: 0;
  height: 28px;
  margin: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.media-folder-browser__path-seg-label {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-folder-browser__path-seg:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.media-folder-browser__path-seg:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: 0;
}

.media-folder-browser__path-seg:disabled {
  opacity: 0.55;
  cursor: default;
}

.media-folder-browser__path-seg--current {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.media-folder-browser__path-seg--current:hover:not(:disabled) {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.media-folder-browser__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.media-folder-browser__selected-count {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
}

.media-folder-browser__view-btn--on {
  background: rgba(var(--v-theme-primary), 0.18) !important;
}

.media-folder-browser__list {
  max-height: 300px;
  overflow: auto;
}

.media-folder-browser__header {
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 16px 4px 40px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.media-folder-browser__header--selectable {
  padding-left: 72px;
}

.media-folder-browser__sort {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
  user-select: none;
}

.media-folder-browser__sort:hover,
.media-folder-browser__sort--active {
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.media-folder-browser__col--size.media-folder-browser__sort,
.media-folder-browser__col--mtime.media-folder-browser__sort {
  justify-content: flex-end;
}

.media-folder-browser__row-body {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.media-folder-browser__col {
  flex: 0 0 auto;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.2;
}

.media-folder-browser__col--name {
  flex: 1 1 auto;
}

.media-folder-browser__tag-chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  max-width: 100%;
  vertical-align: middle;
}

.media-folder-browser__col--size {
  width: 72px;
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.media-folder-browser__col--mtime {
  width: 148px;
  text-align: end;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.media-folder-browser__col--status {
  width: 96px;
  display: flex;
  justify-content: flex-end;
}

.media-folder-browser__empty {
  padding: 28px 16px;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.8125rem;
}

.media-folder-browser__skeleton {
  padding: 8px 10px 12px;
  min-height: 0;
}

.media-folder-browser__check {
  margin-inline-end: 12px;
}

.media-folder-browser--fill {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.media-folder-browser--fill .media-folder-browser__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.media-folder-browser--fill .media-folder-browser__list {
  max-height: none;
  flex: 1;
  min-height: 0;
}

.media-folder-browser__list :deep(.v-list-item__prepend > .v-list-item__spacer) {
  width: 6px;
  flex: 0 0 6px;
}

.media-folder-browser__icon {
  margin-inline-end: 0;
  font-size: 18px;
}

.media-folder-browser__list :deep(.v-list-item) {
  min-height: 30px;
  padding-top: 0;
  padding-bottom: 0;
}

/* Finder-like zebra stripes */
.media-folder-browser__list :deep(.v-list-item:nth-child(even):not(.v-list-item--active)) {
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.media-folder-browser__list :deep(.v-list-item:hover:not(.v-list-item--active)) {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.media-folder-browser__list :deep(.v-list-item--active) {
  background: rgba(var(--v-theme-primary), 0.16);
}

.media-folder-browser__list :deep(.v-list-item__content) {
  overflow: hidden;
}

.media-folder-browser__list :deep(.v-list-item__prepend),
.media-folder-browser__list :deep(.v-list-item__append) {
  align-self: center;
}

.media-folder-browser__list :deep(.v-checkbox) {
  --v-input-control-height: 30px;
}

.media-folder-browser__list :deep(.v-selection-control) {
  min-height: 30px;
}

@media (max-width: 720px) {
  .media-folder-browser__col--mtime,
  .media-folder-browser__header .media-folder-browser__col--mtime {
    display: none;
  }

  .media-folder-browser__col--status {
    width: 84px;
  }
}
</style>

<style>
.media-folder-browser__places-menu {
  min-width: 0 !important;
}

.media-folder-browser__places-menu .v-list {
  padding: 4px !important;
  max-height: min(360px, 50vh);
  overflow-y: auto;
}

.media-folder-browser__places-menu .v-list-item {
  min-height: 32px !important;
  padding-inline: 8px !important;
  border-radius: 8px;
}

.media-folder-browser__places-menu .v-list-item__prepend {
  margin-inline-end: 0 !important;
}

.media-folder-browser__places-menu .v-list-item__prepend > .v-icon {
  font-size: 16px !important;
  opacity: 0.85;
}

.media-folder-browser__places-menu .v-list-item__prepend .v-list-item__spacer {
  width: 8px !important;
}

.media-folder-browser__places-menu .v-list-item-title {
  font-size: 0.75rem !important;
  line-height: 1.2 !important;
}
</style>
