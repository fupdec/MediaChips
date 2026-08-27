<template>
  <v-dialog
    :model-value="dialogsStore.tagTrashConflict.show"
    persistent
    width="460"
    scrollable
    @update:model-value="onVisible"
  >
    <v-card
      class="confirm-dialog"
      rounded="xl"
    >
      <v-card-text class="confirm-dialog__body text-center px-6 pt-8">
        <div class="text-h6 mb-3">
          {{ title }}
        </div>
        <div class="confirm-dialog__text text-body-1">
          {{ text }}
        </div>
      </v-card-text>

      <v-card-actions class="confirm-dialog__actions px-5 pb-5 pt-1">
        <v-btn
          variant="text"
          rounded="pill"
          class="px-4"
          @click="choose('cancel')"
        >
          {{ t('common.cancel') }}
        </v-btn>

        <v-spacer />

        <v-btn
          color="error"
          variant="tonal"
          rounded="pill"
          class="px-4"
          @click="choose('purge')"
        >
          {{ t('media_trash.purge') }}
        </v-btn>

        <v-btn
          color="success"
          variant="flat"
          rounded="pill"
          class="px-5"
          @click="choose('restore')"
        >
          {{ t('common.restore') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'

const {t} = useI18n()
const dialogsStore = useDialogsStore()

const names = computed(() => (
  dialogsStore.tagTrashConflict.tags
    .map((tag) => String(tag.name || '').trim())
    .filter(Boolean)
))

const title = computed(() => {
  if (names.value.length === 1) {
    return t('meta.dialogs.tag_in_trash_title', {name: names.value[0]})
  }
  return t('meta.dialogs.tag_in_trash_title_many', {count: names.value.length})
})

const text = computed(() => {
  if (names.value.length <= 1) {
    return t('meta.dialogs.tag_in_trash_text')
  }
  return t('meta.dialogs.tag_in_trash_text_many', {items: names.value.join(', ')})
})

function choose(action: 'restore' | 'purge' | 'cancel') {
  dialogsStore.closeTagTrashConflict(action)
}

function onVisible(value: boolean) {
  if (!value && dialogsStore.tagTrashConflict.show) {
    dialogsStore.closeTagTrashConflict('cancel')
  }
}
</script>

<style scoped>
.confirm-dialog__text {
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.confirm-dialog__actions {
  gap: 8px;
}
</style>
