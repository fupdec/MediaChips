<template>
  <div
    class="media-folder-browser"
    :class="{'media-folder-browser--fill': fillHeight}"
  >    <div
      v-if="places.length"
      class="media-folder-browser__places"
    >
      <div class="text-caption text-medium-emphasis mb-2">
        {{ t('media.adding.browser_places') }}
      </div>
      <div class="d-flex flex-wrap ga-1">
        <v-chip
          v-for="place in places"
          :key="place.id"
          size="small"
          label
          :color="activePlaceId === place.id ? 'primary' : undefined"
          :variant="activePlaceId === place.id ? 'flat' : 'tonal'"
          :prepend-icon="place.icon || 'mdi-folder'"
          @click="emit('selectPlace', place.path)"
        >
          {{ placeLabel(place) }}
        </v-chip>
      </div>
    </div>

    <div class="media-folder-browser__panel">
      <div class="media-folder-browser__toolbar">
        <div class="media-folder-browser__nav">
          <v-btn
            icon="mdi-arrow-up"
            size="x-small"
            color="primary"
            variant="tonal"
            :disabled="loading || !parentPath"
            :aria-label="t('media.adding.browser_up')"
            @click="navigateTo(parentPath)"
          />
          <div class="media-folder-browser__crumbs">
            <template
              v-for="(item, index) in breadcrumbItems"
              :key="item.path"
            >
              <v-icon
                v-if="index > 0"
                icon="mdi-chevron-right"
                size="14"
                class="text-medium-emphasis flex-shrink-0"
              />
              <v-chip
                size="small"
                label
                :color="index === breadcrumbItems.length - 1 ? 'primary' : undefined"
                :variant="index === breadcrumbItems.length - 1 ? 'flat' : 'tonal'"
                :disabled="loading"
                :prepend-icon="index === 0 ? 'mdi-folder-outline' : undefined"
                class="flex-shrink-0"
                @click="navigateTo(item.path)"
              >
                {{ item.title }}
              </v-chip>
            </template>
          </div>
        </div>

        <div
          v-if="showSelection"
          class="media-folder-browser__actions"
        >
          <v-btn
            v-if="!isFilePicker"
            size="small"
            variant="tonal"
            color="primary"
            :disabled="loading || !currentPath"
            prepend-icon="mdi-folder-check-outline"
            @click="selectCurrentFolder"
          >
            {{ t('media.adding.browser_select_folder') }}
          </v-btn>
          <v-btn
            size="small"
            variant="text"
            :disabled="loading || !selectedPaths.size"
            @click="clearSelection"
          >
            {{ t('media.adding.browser_clear_selection') }}
          </v-btn>
        </div>
      </div>

        <div class="media-folder-browser__filters">
          <v-checkbox
            v-if="!foldersOnly && !isFilePicker"
            v-model="hideInLibrary"
            density="compact"
            hide-details
            :label="t('media.adding.browser_hide_in_library')"
            class="mt-0 media-folder-browser__filter-check"
          />
          <v-checkbox
            v-if="!foldersOnly && !isFilePicker"
            v-model="hideNonMedia"
            density="compact"
            hide-details
            :label="t('media.adding.browser_hide_non_media')"
            class="mt-0 media-folder-browser__filter-check"
          />
          <v-checkbox
            v-model="showHidden"
            density="compact"
            hide-details
            :label="t('media.adding.browser_show_hidden')"
            class="mt-0 media-folder-browser__filter-check"
          />
          <v-spacer />
          <div
            v-if="showSelection && selectedPaths.size"
            class="text-caption text-medium-emphasis"
          >
            {{ t('media.adding.browser_selected_count', {count: selectedPaths.size}) }}
          </div>
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
        <div
          v-if="loading"
          class="media-folder-browser__empty"
        >
          {{ t('common.loading') }}
        </div>
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
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  fetchBrowseDirectory,
  type BrowseDirectoryEntry,
} from '@/services/browseDirectoryService'
import type {BrowsePlace} from '@/services/browsePlacesService'
import {getReadableFileSize} from '@/services/formatUtils'

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
}>(), {
  places: () => [],
  activePlaceId: null,
  foldersOnly: false,
  fileExtensions: () => [],
  showSelection: true,
  fillHeight: false,
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
    const result = await fetchBrowseDirectory(props.baseUrl, {
      path: targetPath,
      extensions: props.extensions,
      showHidden: showHidden.value,
    })
    currentPath.value = result.currentPath
    parentPath.value = result.parentPath
    rootPath.value = result.rootPath
    truncated.value = result.truncated
    serverPlatform.value = result.platform
    entries.value = result.entries
    if (result.currentPath !== props.path) {
      emit('update:path', result.currentPath)
    }
  } catch (err: unknown) {
    const message = (err as {response?: {data?: {message?: string}}; message?: string})
      ?.response?.data?.message
      || (err as {message?: string})?.message
      || t('media.adding.browser_load_error')
    error.value = message
    entries.value = []
  } finally {
    loading.value = false
  }
}

function navigateTo(targetPath: string | null | undefined) {
  if (!targetPath || loading.value) return
  emit('update:path', targetPath)
}

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
.media-folder-browser__places {
  margin-bottom: 12px;
}

.media-folder-browser__panel {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
}

.media-folder-browser__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.media-folder-browser__nav {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 240px;
}

.media-folder-browser__crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 4px;
  min-width: 0;
}

.media-folder-browser__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-inline-start: auto;
}

.media-folder-browser__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  padding: 4px 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.media-folder-browser__filter-check :deep(.v-label) {
  font-size: 0.75rem;
  opacity: 0.85;
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

.media-folder-browser__check {
  margin-inline-end: 12px;
}

.media-folder-browser--fill {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.media-folder-browser--fill .media-folder-browser__places {
  flex-shrink: 0;
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
