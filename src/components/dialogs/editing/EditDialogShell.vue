<template>
  <v-dialog
    :model-value="show"
    :fullscreen="xs"
    :width="xl ? 1400 : 1000"
    :persistent="persistent"
    scrollable
    @update:model-value="emit('visibility-change', $event)"
  >
    <v-card class="edit-dialog-card">
      <DialogHeader
        :header="header || t('common.editing')"
        :subheader="subheader"
        :subheader-copy-text="subheader"
        :buttons="buttons"
        :icon="icon"
        :breadcrumbs="breadcrumbs"
        :dirty="dirty"
        :loading="loading"
        compact
        closable
        @close="emit('request-close')"
      />

      <v-card-text class="edit-dialog-card__body">
        <slot />
      </v-card-text>
    </v-card>

    <slot name="dialogs" />

    <DialogConfirm
      v-if="unsavedConfirm"
      variant="confirm"
      :dialog="unsavedConfirm"
      :text="t('editing.discard_unsaved_confirm')"
      @confirm="emit('discard')"
      @close="emit('update:unsavedConfirm', false)"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import type {EditDialogHeaderButton} from '@/composable/useEditDialog'

/** Common frame for all edit dialogs: same size, header, body and unsaved-changes confirm. */
withDefaults(defineProps<{
  show: boolean
  header?: string
  subheader?: string
  icon?: string
  buttons?: EditDialogHeaderButton[]
  persistent?: boolean
  unsavedConfirm?: boolean
  breadcrumbs?: string[]
  dirty?: boolean
  loading?: boolean
}>(), {
  icon: 'pencil',
  buttons: () => [],
  breadcrumbs: () => [],
})

const emit = defineEmits<{
  'visibility-change': [show: boolean]
  'request-close': []
  'discard': []
  'update:unsavedConfirm': [value: boolean]
}>()

const {xs, xl} = useDisplay()
const {t} = useI18n()
</script>
