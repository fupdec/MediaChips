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
        icon="set-merge"
        closable
        @close="close"
      />

      <v-card-text class="pa-4">
        <div class="text-body-2 text-medium-emphasis mb-4">
          {{ t('media.dialogs.merge_media_hint', {count: Math.max(items.length - 1, 0)}) }}
        </div>

        <v-radio-group v-model="survivorId" hide-details class="mt-0">
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
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-btn variant="text" :disabled="saving" @click="close">
          {{ t('common.cancel') }}
        </v-btn>
        <v-spacer/>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!canMerge"
          @click="merge"
        >
          {{ t('media.dialogs.merge_media_confirm') }}
        </v-btn>
      </v-card-actions>
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
const saving = ref(false)

const items = computed(() => dialogsStore.mediaMerge.items)

const canMerge = computed(() =>
  items.value.length >= 2
    && survivorId.value != null
    && !saving.value,
)

function formatMeta(item: MediaItem) {
  const parts: string[] = []
  parts.push(getReadableFileSize(Number(item.filesize || 0)))
  if (item.rating != null) parts.push(`★ ${item.rating}`)
  if (item.views != null) parts.push(`${item.views} views`)
  return parts.join(' · ')
}

watch(
  () => dialogsStore.mediaMerge.show,
  (show) => {
    if (show) {
      survivorId.value = pickDefaultSurvivorId(dialogsStore.mediaMerge.items)
      saving.value = false
    }
  },
  {immediate: true},
)

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
</script>

<style scoped>
.media-merge-option {
  min-width: 0;
  padding-top: 2px;
}
</style>
