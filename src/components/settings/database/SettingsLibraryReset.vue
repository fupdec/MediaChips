<template>
  <SettingsHealthTask id="settings-library-reset" status="error" compact>
    <div>
      <SettingsHealthSectionHeader
        :title="t('settings_labels.database.library_reset')"
        icon="database-remove-outline"
        :hint="t('settings_labels.database.library_reset_hint')"
        status="error"
        :status-label="t('settings_labels.database.library_reset_not_trash')"
        compact
      />

      <div class="library-reset__group">
        <div class="library-reset__group-title">
          {{ t('settings_labels.database.library_reset_media') }}
        </div>
        <div class="library-reset__list">
          <div
            v-for="mediaType in mediaTypes"
            :key="`media-${mediaType.id}`"
            class="library-reset__row"
          >
            <div class="library-reset__icon" aria-hidden="true">
              <v-icon size="18">{{ mediaTypeIcon(mediaType) }}</v-icon>
            </div>
            <div class="library-reset__meta">
              <div class="library-reset__title-row">
                <div class="library-reset__title">{{ mediaTypeLabel(mediaType) }}</div>
                <div class="library-reset__count text-caption text-medium-emphasis">
                  {{ formatCount(mediaCount(mediaType.id)) }}
                </div>
              </div>
              <div
                v-if="mediaShare(mediaType.id) != null"
                class="library-reset__bar"
                aria-hidden="true"
              >
                <div
                  class="library-reset__bar-fill"
                  :style="{width: `${mediaShare(mediaType.id)}%`}"
                />
              </div>
            </div>
            <v-btn
              color="error"
              rounded
              variant="tonal"
              size="small"
              class="pr-3 library-reset__action"
              :disabled="busy"
              @click="openMediaType(mediaType)"
            >
              <v-icon icon="mdi-delete-outline" start size="18"/>
              {{ t('common.delete') }}
            </v-btn>
          </div>

          <div class="library-reset__row library-reset__row--all">
            <div class="library-reset__icon" aria-hidden="true">
              <v-icon size="18">mdi-delete-sweep-outline</v-icon>
            </div>
            <div class="library-reset__meta">
              <div class="library-reset__title-row">
                <div class="library-reset__title">
                  {{ t('settings_labels.database.library_reset_all_media') }}
                </div>
                <div class="library-reset__count text-caption text-medium-emphasis">
                  {{ formatCount(counts.mediaTotal) }}
                </div>
              </div>
            </div>
            <v-btn
              color="error"
              rounded
              variant="tonal"
              size="small"
              class="pr-3 library-reset__action"
              :disabled="busy"
              @click="openAllMedia"
            >
              <v-icon icon="mdi-delete-outline" start size="18"/>
              {{ t('common.delete') }}
            </v-btn>
          </div>
        </div>
      </div>

      <div class="library-reset__group">
        <div class="library-reset__group-title">
          {{ t('settings_labels.database.library_reset_tags') }}
        </div>
        <div class="library-reset__list">
          <div
            v-for="category in tagCategories"
            :key="`meta-${category.id}`"
            class="library-reset__row"
          >
            <div class="library-reset__icon" aria-hidden="true">
              <v-icon size="18">{{ categoryIcon(category) }}</v-icon>
            </div>
            <div class="library-reset__meta">
              <div class="library-reset__title-row">
                <div class="library-reset__title">{{ category.name }}</div>
                <div class="library-reset__count text-caption text-medium-emphasis">
                  {{ formatCount(tagCount(category.id)) }}
                </div>
              </div>
            </div>
            <v-btn
              color="error"
              rounded
              variant="tonal"
              size="small"
              class="pr-3 library-reset__action"
              :disabled="busy"
              @click="openCategory(category)"
            >
              <v-icon icon="mdi-delete-outline" start size="18"/>
              {{ t('common.delete') }}
            </v-btn>
          </div>

          <div class="library-reset__row library-reset__row--all">
            <div class="library-reset__icon" aria-hidden="true">
              <v-icon size="18">mdi-tag-off-outline</v-icon>
            </div>
            <div class="library-reset__meta">
              <div class="library-reset__title-row">
                <div class="library-reset__title">
                  {{ t('settings_labels.database.library_reset_all_tags') }}
                </div>
                <div class="library-reset__count text-caption text-medium-emphasis">
                  {{ formatCount(counts.tagsTotal) }}
                </div>
              </div>
            </div>
            <v-btn
              color="error"
              rounded
              variant="tonal"
              size="small"
              class="pr-3 library-reset__action"
              :disabled="busy"
              @click="openAllTags"
            >
              <v-icon icon="mdi-delete-outline" start size="18"/>
              {{ t('common.delete') }}
            </v-btn>
          </div>
        </div>
      </div>

      <DialogConfirm
        v-if="pending"
        variant="delete"
        :dialog="Boolean(pending)"
        :text="pending.text"
        :confirm-phrase="pending.phrase"
        :confirm-phrase-label="t('settings_labels.database.library_reset_type_to_confirm', {
          phrase: pending.phrase,
        })"
        :check-box-text="t('actions.delete_permanently')"
        :check-box="permanent"
        :check-box2-text="pending.withFile ? t('actions.also_delete_files') : ''"
        :check-box2="withFile"
        :check-box2-requires-primary="pending.withFile"
        @update:check-box="permanent = $event"
        @update:check-box2="withFile = $event"
        @close="pending = null"
        @delete="runPending"
      />
    </div>
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import orderBy from 'lodash/orderBy'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import SettingsHealthSectionHeader from '@/components/settings/database/SettingsHealthSectionHeader.vue'
import SettingsHealthTask from '@/components/settings/database/SettingsHealthTask.vue'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {useAppStore} from '@/stores/app'
import {useTasksStore} from '@/stores/tasks'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {useItemsListSync} from '@/composable/itemsListSync'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {useEventBus} from '@/utils/eventBus'
import type {LibraryResetCounts, LibraryResetStreamEvent} from '@shared/api/payloads'
import type {MediaType, Meta} from '@/types/stores'

type PendingReset = {
  kind: 'media' | 'tags'
  phrase: string
  text: string
  withFile: boolean
  mediaTypeId?: number | 'all'
  metaId?: number | 'all'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const {t} = useI18n()
const appStore = useAppStore()
const tasksStore = useTasksStore()
const listSync = useItemsListSync()
const eventBus = useEventBus()

const busy = ref(false)
const pending = ref<PendingReset | null>(null)
const permanent = ref(false)
const withFile = ref(false)
const countsLoading = ref(false)
const counts = ref<LibraryResetCounts>({
  mediaByType: {},
  mediaTotal: 0,
  tagsByMeta: {},
  tagsTotal: 0,
})

const mediaTypes = computed(() =>
  orderBy(appStore.mediaTypes || [], ['order', 'id'], ['asc', 'asc']) as MediaType[],
)

const tagCategories = computed(() =>
  orderBy(
    (appStore.meta || []).filter((item) => item.type === 'array'),
    ['hidden', 'order', 'name'],
    ['asc', 'asc', 'asc'],
  ) as Meta[],
)

function lookupCount(map: Record<number, number>, id: number | string | undefined) {
  const key = Number(id)
  if (!Number.isFinite(key) || key <= 0) return 0
  return Number(map[key] ?? map[String(key) as unknown as number] ?? 0) || 0
}

function mediaCount(id: number | string | undefined) {
  return lookupCount(counts.value.mediaByType, id)
}

function tagCount(id: number | string | undefined) {
  return lookupCount(counts.value.tagsByMeta, id)
}

function mediaShare(id: number | string | undefined): number | null {
  const total = counts.value.mediaTotal
  const size = mediaCount(id)
  if (countsLoading.value || total <= 0) return null
  return Math.max(0, Math.min(100, (size / total) * 100))
}

function formatCount(value: number) {
  if (countsLoading.value) return t('common.loading')
  return value.toLocaleString()
}

async function loadCounts() {
  countsLoading.value = true
  try {
    const {data} = await typedApi.getLibraryResetCounts()
    counts.value = {
      mediaByType: data?.mediaByType || {},
      mediaTotal: Number(data?.mediaTotal) || 0,
      tagsByMeta: data?.tagsByMeta || {},
      tagsTotal: Number(data?.tagsTotal) || 0,
    }
  } catch (error) {
    console.error('Failed to load library reset counts:', error)
  } finally {
    countsLoading.value = false
  }
}

function mediaTypeLabel(mediaType: MediaType) {
  return getMediaTypeName(mediaType, t)
}

function mediaTypeIcon(mediaType: MediaType) {
  const icon = String(mediaType.icon || '').trim()
  if (!icon) return 'mdi-folder-outline'
  return icon.startsWith('mdi-') ? icon : `mdi-${icon}`
}

function categoryIcon(category: Meta) {
  const icon = String(category.icon || '').trim()
  if (!icon) return 'mdi-tag-outline'
  return icon.startsWith('mdi-') ? icon : `mdi-${icon}`
}

function openMediaType(mediaType: MediaType) {
  const name = mediaTypeLabel(mediaType)
  pending.value = {
    kind: 'media',
    phrase: name,
    text: t('settings_labels.database.library_reset_confirm_media_type', {
      name: escapeHtml(name),
      phrase: escapeHtml(name),
    }),
    withFile: true,
    mediaTypeId: Number(mediaType.id),
  }
  permanent.value = false
  withFile.value = false
}

function openAllMedia() {
  const phrase = t('settings_labels.database.library_reset_phrase_all_media')
  pending.value = {
    kind: 'media',
    phrase,
    text: t('settings_labels.database.library_reset_confirm_all_media', {
      phrase: escapeHtml(phrase),
    }),
    withFile: true,
    mediaTypeId: 'all',
  }
  permanent.value = false
  withFile.value = false
}

function openCategory(category: Meta) {
  const name = String(category.name || '').trim() || `category-${category.id}`
  pending.value = {
    kind: 'tags',
    phrase: name,
    text: t('settings_labels.database.library_reset_confirm_category', {
      name: escapeHtml(name),
      phrase: escapeHtml(name),
    }),
    withFile: false,
    metaId: Number(category.id),
  }
  permanent.value = false
  withFile.value = false
}

function openAllTags() {
  const phrase = t('settings_labels.database.library_reset_phrase_all_tags')
  pending.value = {
    kind: 'tags',
    phrase,
    text: t('settings_labels.database.library_reset_confirm_all_tags', {
      phrase: escapeHtml(phrase),
    }),
    withFile: false,
    metaId: 'all',
  }
  permanent.value = false
  withFile.value = false
}

async function refreshAfterSuccess(kind: 'media' | 'tags') {
  await reloadMetaCatalog()
  await reloadTagsCatalog()
  await loadCounts()
  listSync.getItemsFromDb({type: 'media'})
  listSync.getItemsFromDb({type: 'tag'})
  if (kind === 'media') {
    eventBus.emit('update:watcher')
  }
}

function formatComplete(
  kind: 'media' | 'tags',
  event: LibraryResetStreamEvent,
  isPermanent: boolean,
) {
  if (kind === 'media') {
    return isPermanent
      ? t('settings_labels.database.library_reset_complete_media_permanent', {
        deleted: event.mediaDeleted || event.deleted || 0,
      })
      : t('settings_labels.database.library_reset_complete_media', {
        deleted: event.mediaDeleted || event.deleted || 0,
      })
  }
  return isPermanent
    ? t('settings_labels.database.library_reset_complete_tags_permanent', {
      deleted: event.tagsDeleted || 0,
      metaDeleted: event.metaDeleted || 0,
    })
    : t('settings_labels.database.library_reset_complete_tags', {
      deleted: event.tagsDeleted || 0,
      metaDeleted: event.metaDeleted || 0,
    })
}

async function runPending() {
  const action = pending.value
  const isPermanent = permanent.value
  const deleteFiles = withFile.value
  pending.value = null
  if (!action || busy.value) return

  busy.value = true
  const abort = new AbortController()
  const title = action.kind === 'media'
    ? t('settings_labels.database.library_reset_task_media')
    : t('settings_labels.database.library_reset_task_tags')
  const taskId = tasksStore.setTask({
    title,
    subtitle: t('settings_labels.database.library_reset_progress', {
      processed: 0,
      total: 0,
    }),
    icon: 'database-remove-outline',
    progress: 0,
    action: () => abort.abort(),
  })

  let sawComplete = false

  try {
    const onEvent = (event: LibraryResetStreamEvent) => {
      if (event.type === 'progress') {
        const processed = event.processed || 0
        const total = event.total || 0
        tasksStore.updateTask(taskId, {
          subtitle: t('settings_labels.database.library_reset_progress', {
            processed,
            total,
          }),
          progress: total ? Math.min((processed / total) * 100, 100) : 0,
        })
        return
      }

      if (event.type === 'error') {
        tasksStore.updateTask(taskId, {
          subtitle: event.message || t('settings_labels.database.library_reset_failed'),
          color: 'error',
          done: true,
          action: undefined,
        })
        setNotification({
          type: 'error',
          title,
          text: event.message || t('settings_labels.database.library_reset_failed'),
        })
        return
      }

      if (event.type !== 'complete') return
      sawComplete = true
      const stopped = event.stopped === true
      const text = stopped
        ? t('settings_labels.database.library_reset_stopped')
        : formatComplete(action.kind, event, isPermanent)
      tasksStore.updateTask(taskId, {
        subtitle: text,
        progress: 100,
        color: stopped ? 'warning' : 'success',
        done: true,
        action: undefined,
      })
      if (!stopped) {
        setNotification({type: 'success', title, text})
        void refreshAfterSuccess(action.kind)
      }
    }

    if (action.kind === 'media') {
      await typedApi.resetLibraryMedia({
        mediaTypeId: action.mediaTypeId ?? 'all',
        permanent: isPermanent,
        withFile: deleteFiles,
      }, onEvent, {signal: abort.signal})
    } else {
      await typedApi.resetLibraryTags({
        metaId: action.metaId ?? 'all',
        permanent: isPermanent,
      }, onEvent, {signal: abort.signal})
    }

    if (!sawComplete && abort.signal.aborted) {
      tasksStore.updateTask(taskId, {
        subtitle: t('settings_labels.database.library_reset_stopped'),
        color: 'warning',
        done: true,
        action: undefined,
      })
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : t('settings_labels.database.library_reset_failed')
    tasksStore.updateTask(taskId, {
      subtitle: message,
      color: 'error',
      done: true,
      action: undefined,
    })
    setNotification({
      type: 'error',
      title,
      text: message,
    })
  } finally {
    window.setTimeout(() => tasksStore.removeTask(taskId), 1600)
    busy.value = false
  }
}

onMounted(loadCounts)
</script>

<style scoped lang="scss">
.library-reset__group {
  margin-top: 12px;
}

.library-reset__group-title {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin: 0 2px 8px;
}

.library-reset__list {
  display: grid;
  gap: 8px;
}

.library-reset__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.55);
}

.library-reset__row--all {
  border-style: dashed;
}

.library-reset__icon {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}

.library-reset__meta {
  flex: 1 1 auto;
  min-width: 0;
}

.library-reset__title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.library-reset__title {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.3;
}

.library-reset__count {
  flex: 0 0 auto;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.library-reset__bar {
  margin-top: 8px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.library-reset__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-error), 0.55),
    rgba(var(--v-theme-error), 0.9)
  );
  transition: width 0.35s ease;
}

.library-reset__action {
  flex: 0 0 auto;
}

@media (max-width: 600px) {
  .library-reset__row {
    flex-wrap: wrap;
  }

  .library-reset__action {
    margin-left: auto;
  }
}
</style>
