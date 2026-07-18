<template>
  <v-dialog
    v-if="dialogsStore.tagMerge.show"
    :model-value="dialogsStore.tagMerge.show"
    @update:model-value="onDialogToggle"
    width="520"
    scrollable
    persistent
  >
    <v-card>
      <DialogHeader
        :header="t('meta.dialogs.merge_tags_title')"
        :subheader="meta?.name"
        icon="set-merge"
        closable
        @close="close"
      />

      <v-card-text class="pa-4">
        <div class="text-body-2 text-medium-emphasis mb-4">
          {{ t('meta.dialogs.merge_tags_hint', { count: Math.max(tags.length - 1, 0) }) }}
        </div>

        <v-radio-group v-model="survivorId" hide-details class="mt-0">
          <v-radio
            v-for="tag in tags"
            :key="tag.id"
            :value="tag.id"
            :label="tag.name || `#${tag.id}`"
            color="primary"
            class="mb-1"
          />
        </v-radio-group>

        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4 text-caption"
        >
          {{ t('meta.dialogs.merge_tags_keep_note') }}
        </v-alert>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-btn variant="text" :disabled="saving" @click="close">
          {{ t('common.cancel') }}
        </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!canMerge"
          @click="merge"
        >
          {{ t('meta.dialogs.merge_tags_confirm') }}
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
import {useAppStore} from '@/stores/app'
import {useNotificationsStore} from '@/stores/notifications'
import {typedApi} from '@/services/typedApi'
import {useEventBus} from '@/utils/eventBus'
import {getErrorResponseData} from '@/types/vue'
import type {Tag} from '@/types/stores'

const {t} = useI18n()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const appStore = useAppStore()
const notificationsStore = useNotificationsStore()
const eventBus = useEventBus()

const survivorId = ref<number | null>(null)
const saving = ref(false)

const tags = computed(() => dialogsStore.tagMerge.tags)
const meta = computed(() => dialogsStore.tagMerge.meta)

const canMerge = computed(() =>
  Boolean(meta.value?.id)
    && tags.value.length >= 2
    && survivorId.value != null
    && !saving.value,
)

function pickDefaultSurvivor(list: Tag[]): number | null {
  if (!list.length) return null
  return [...list].sort((a, b) => Number(a.id) - Number(b.id))[0]?.id ?? null
}

watch(
  () => dialogsStore.tagMerge.show,
  (show) => {
    if (show) {
      survivorId.value = pickDefaultSurvivor(dialogsStore.tagMerge.tags)
      saving.value = false
    }
  },
  {immediate: true},
)

function close() {
  if (saving.value) return
  dialogsStore.closeTagMerge()
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

async function merge() {
  if (!canMerge.value || survivorId.value == null || !meta.value?.id) return

  const sourceIds = tags.value
    .map((tag) => Number(tag.id))
    .filter((id) => id !== survivorId.value)

  saving.value = true
  try {
    const res = await typedApi.mergeTags({
      metaId: Number(meta.value.id),
      survivorId: Number(survivorId.value),
      sourceIds,
    })

    const survivor = res.data.survivor
    const deletedIds = res.data.deletedIds || []

    appStore.tags = appStore.tags.filter((tag) => !deletedIds.includes(Number(tag.id)))
    const survivorIndex = appStore.tags.findIndex((tag) => Number(tag.id) === Number(survivor.id))
    if (survivorIndex >= 0) {
      appStore.tags[survivorIndex] = {
        ...appStore.tags[survivorIndex],
        ...survivor,
        synonyms: survivor.synonyms ?? undefined,
        metaId: survivor.metaId ?? undefined,
      }
    }

    eventBus.emit('removeEntitiesFromState', {
      ids: deletedIds,
      type: 'tag',
    })
    eventBus.emit('getItemsFromDb', {
      ids: [survivor.id],
      type: 'tag',
    })
    eventBus.emit('getTags')

    itemsStore.selection = []
    itemsStore.isSelect = false

    notificationsStore.setNotification({
      type: 'success',
      title: t('meta.dialogs.merge_tags_done'),
      text: t('meta.dialogs.merge_tags_done_text', {
        name: survivor.name || '',
        count: deletedIds.length,
      }),
    })

    dialogsStore.closeTagMerge()
  } catch (error) {
    console.error(error)
    notificationsStore.setNotification({
      type: 'error',
      title: t('meta.dialogs.merge_tags_failed'),
      text: getErrorResponseData<{message?: string}>(error)?.message
        || (error instanceof Error ? error.message : String(error)),
    })
  } finally {
    saving.value = false
  }
}
</script>
