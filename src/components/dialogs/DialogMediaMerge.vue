<template>
  <v-dialog
    v-if="dialogsStore.mediaMerge.show"
    :model-value="dialogsStore.mediaMerge.show"
    @update:model-value="onDialogToggle"
    width="640"
    scrollable
    persistent
  >
    <v-card>
      <DialogHeader
        :header="t('media.dialogs.merge_media_title')"
        :subheader="t('media.dialogs.merge_media_hint', {count: Math.max(items.length - 1, 0)})"
        icon="set-merge"
        :buttons="headerButtons"
        closable
        @close="close"
      />

      <v-card-text class="pa-4">
        <v-radio-group
          v-model="survivorId"
          hide-details
          class="mt-0"
        >
          <v-radio
            v-for="item in items"
            :key="item.id"
            :value="item.id"
            color="primary"
            class="mb-2 align-start"
          >
            <template #label>
              <div class="media-merge-option">
                <div class="text-body-2 font-weight-medium text-truncate">
                  {{ item.name || item.basename || `#${item.id}` }}
                </div>
                <div class="text-caption text-medium-emphasis text-truncate">
                  {{ item.path || '' }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ formatMeta(item) }}
                </div>
              </div>
            </template>
          </v-radio>
        </v-radio-group>

        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4 text-caption"
        >
          {{ t('media.dialogs.merge_media_keep_note') }}
        </v-alert>

        <v-checkbox
          v-model="withFile"
          density="compact"
          hide-details
          color="primary"
          class="mt-3"
          :label="t('actions.also_delete_files')"
          :disabled="saving"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useNotificationsStore} from '@/stores/notifications'
import {typedApi} from '@/services/typedApi'
import {useItemsListSync} from '@/composable/itemsListSync'
import {getReadableFileSize} from '@/services/formatUtils'
import {getErrorResponseData} from '@/types/vue'
import {pickDefaultSurvivorId} from '@shared/mediaMerge'
import type {MediaItem} from '@/types/stores'

const {t} = useI18n()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const notificationsStore = useNotificationsStore()
const listSync = useItemsListSync()

const survivorId = ref<number | null>(null)
const withFile = ref(false)
const saving = ref(false)

const items = computed(() => dialogsStore.mediaMerge.items)

const canMerge = computed(() =>
  items.value.length >= 2
    && survivorId.value != null
    && !saving.value,
)

const headerButtons = computed(() => [
  {
    icon: 'set-merge',
    text: t('media.dialogs.merge_media_confirm'),
    color: 'primary',
    disabled: !canMerge.value,
    order: 1,
    action: () => { void merge() },
  },
])

function formatMeta(item: MediaItem) {
  const parts: string[] = []
  parts.push(getReadableFileSize(Number(item.filesize || 0)))
  if (item.rating != null) parts.push(`★ ${item.rating}`)
  if (item.views != null) parts.push(`${item.views} views`)
  return parts.join(' · ')
}

function close() {
  if (saving.value) return
  dialogsStore.closeMediaMerge()
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

async function merge() {
  if (!canMerge.value || survivorId.value == null) return

  const sourceIds = items.value
    .map((item) => Number(item.id))
    .filter((id) => id !== survivorId.value)

  saving.value = true
  try {
    const res = await typedApi.mergeMedia({
      survivorId: Number(survivorId.value),
      sourceIds,
      with_file: withFile.value,
    })

    const survivor = res.data.survivor
    const deletedIds = res.data.deletedIds || []

    listSync.removeEntitiesFromState({
      ids: deletedIds,
      type: 'media',
    })
    listSync.getItemsFromDb({
      ids: [Number(survivor.id)],
      type: 'media',
    })

    itemsStore.selection = []
    itemsStore.isSelect = false

    notificationsStore.setNotification({
      type: 'success',
      title: t('media.dialogs.merge_media_done'),
      text: t('media.dialogs.merge_media_done_text', {
        name: survivor.name || survivor.path || `#${survivor.id}`,
        count: deletedIds.length,
      }),
    })

    dialogsStore.closeMediaMerge()
  } catch (error) {
    console.error(error)
    notificationsStore.setNotification({
      type: 'error',
      title: t('media.dialogs.merge_media_failed'),
      text: getErrorResponseData<{message?: string}>(error)?.message
        || (error instanceof Error ? error.message : String(error)),
    })
  } finally {
    saving.value = false
  }
}

watch(
  () => dialogsStore.mediaMerge.show,
  (show) => {
    if (show) {
      const preferred = Number(dialogsStore.mediaMerge.survivorId)
      survivorId.value = Number.isFinite(preferred) && preferred > 0
        ? preferred
        : pickDefaultSurvivorId(dialogsStore.mediaMerge.items)
      withFile.value = false
      saving.value = false
    }
  },
  {immediate: true},
)
</script>

<style scoped>
.media-merge-option {
  min-width: 0;
  padding-top: 2px;
}
</style>
