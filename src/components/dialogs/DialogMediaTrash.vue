<template>
  <v-dialog
    v-if="dialogsStore.mediaTrash.show"
    :model-value="dialogsStore.mediaTrash.show"
    @update:model-value="onDialogToggle"
    width="820"
    :fullscreen="xs"
    scrollable
  >
    <v-card>
      <DialogHeader
        :header="t('media_trash.title')"
        :subheader="t('media_trash.subtitle', {days: retentionDays})"
        icon="delete-outline"
        closable
        @close="close"
      />

      <v-card-text class="pa-3 pa-sm-4">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ error }}
        </v-alert>

        <div class="d-flex flex-wrap ga-2 mb-3">
          <v-btn
            color="primary"
            variant="tonal"
            rounded="xl"
            prepend-icon="mdi-restore"
            :disabled="!selectedIds.length || busy"
            @click="restoreSelected"
          >
            {{ t('media_trash.restore') }}
          </v-btn>
          <v-btn
            color="error"
            variant="tonal"
            rounded="xl"
            prepend-icon="mdi-delete-forever"
            :disabled="!selectedIds.length || busy"
            @click="confirmPurgeSelected"
          >
            {{ t('media_trash.purge_selected') }}
          </v-btn>
          <v-spacer />
          <v-btn
            color="error"
            variant="text"
            rounded="xl"
            prepend-icon="mdi-delete-sweep"
            :disabled="!items.length || busy"
            @click="confirmEmptyTrash"
          >
            {{ t('media_trash.empty_trash') }}
          </v-btn>
        </div>

        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          class="mb-3"
        />

        <div
          v-if="!loading && !items.length"
          class="text-center pa-8"
        >
          <v-icon size="64" color="success">mdi-delete-empty-outline</v-icon>
          <div class="text-h6 mt-2">{{ t('media_trash.empty') }}</div>
        </div>

        <div
          v-else
          class="media-trash__list"
        >
          <div
            v-for="item in items"
            :key="item.id"
            class="media-trash__row"
            :class="{'media-trash__row--selected': selected.has(item.id)}"
            @click="toggleSelect(item.id)"
          >
            <v-checkbox
              :model-value="selected.has(item.id)"
              hide-details
              density="compact"
              color="primary"
              class="flex-grow-0"
              @click.stop
              @update:model-value="toggleSelect(item.id)"
            />
            <div class="media-trash__meta min-width-0">
              <div class="media-trash__name text-truncate" :title="itemLabel(item)">
                {{ itemLabel(item) }}
              </div>
              <div
                class="media-trash__path text-caption text-medium-emphasis text-truncate"
                :title="item.originalPath || item.path || ''"
              >
                {{ item.originalPath || item.path }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ daysLeftLabel(item.deletedAt) }}
                <span v-if="item.purgeFile"> · {{ t('media_trash.purge_file_hint') }}</span>
              </div>
            </div>
            <div class="media-trash__actions" @click.stop>
              <v-btn
                size="small"
                variant="text"
                color="primary"
                :disabled="busy"
                @click="restoreIds([item.id])"
              >
                {{ t('media_trash.restore') }}
              </v-btn>
              <v-btn
                size="small"
                variant="text"
                color="error"
                :disabled="busy"
                @click="confirmPurgeIds([item.id])"
              >
                {{ t('media_trash.purge') }}
              </v-btn>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {typedApi} from '@/services/typedApi'
import DialogHeader from '@/components/elements/DialogHeader.vue'

type TrashItem = {
  id: number
  name: string | null
  basename: string | null
  path: string | null
  originalPath: string | null
  mediaTypeId: number | null
  deletedAt: string
  purgeFile: boolean
  filesize: number | null
}

const {t} = useI18n()
const {xs} = useDisplay()
const dialogsStore = useDialogsStore()

const items = ref<TrashItem[]>([])
const retentionDays = ref(30)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const selected = ref(new Set<number>())

const selectedIds = computed(() => [...selected.value])

function itemLabel(item: TrashItem) {
  return item.name || item.basename || item.originalPath || item.path || `#${item.id}`
}

function daysLeftLabel(deletedAt: string) {
  const deletedMs = Date.parse(deletedAt)
  if (!Number.isFinite(deletedMs)) return ''
  const expiresAt = deletedMs + retentionDays.value * 86400000
  const days = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000))
  return t('media_trash.days_left', {days})
}

function toggleSelect(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function close() {
  dialogsStore.closeMediaTrash()
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    await typedApi.purgeExpiredMediaTrash().catch(() => null)
    const res = await typedApi.listMediaTrash({limit: 500})
    items.value = res.data.items || []
    retentionDays.value = Number(res.data.retentionDays) || 30
    selected.value = new Set()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function restoreIds(ids: number[]) {
  if (!ids.length) return
  busy.value = true
  error.value = ''
  try {
    await typedApi.restoreMediaTrash({ids})
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function purgeIds(ids: number[]) {
  if (!ids.length) return
  busy.value = true
  error.value = ''
  try {
    await typedApi.purgeMediaTrash({ids})
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function restoreSelected() {
  void restoreIds(selectedIds.value)
}

function confirmPurgeIds(ids: number[]) {
  dialogsStore.confirm.variant = 'delete'
  dialogsStore.confirm.text = t('media_trash.purge_confirm')
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.action = () => { void purgeIds(ids) }
  dialogsStore.confirm.show = true
}

function confirmPurgeSelected() {
  confirmPurgeIds(selectedIds.value)
}

function confirmEmptyTrash() {
  dialogsStore.confirm.variant = 'delete'
  dialogsStore.confirm.text = t('media_trash.empty_confirm')
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.action = () => {
    void purgeIds(items.value.map((item) => item.id))
  }
  dialogsStore.confirm.show = true
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.media-trash__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(60vh, 560px);
  overflow: auto;
}

.media-trash__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
}

.media-trash__row:hover,
.media-trash__row--selected {
  background: rgba(var(--v-theme-primary), 0.08);
}

.media-trash__meta {
  flex: 1;
  min-width: 0;
}

.media-trash__name {
  font-weight: 600;
}

.media-trash__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  flex-shrink: 0;
}
</style>
