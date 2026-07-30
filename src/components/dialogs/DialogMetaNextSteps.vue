<template>
  <v-dialog
    :model-value="dialog"
    :width="580"
    :fullscreen="xs"
    content-class="dialog-position-start"
    @update:model-value="onDialogChange"
  >
    <v-card rounded="xl">
      <DialogHeader
        :header="t('meta.dialogs.next_steps_title', {name: metaName})"
        closable
        @close="close"
      />

      <v-card-text class="px-4 pb-4">
        <div class="text-body-2 text-medium-emphasis mb-4">
          {{ t('meta.dialogs.next_steps_intro') }}
        </div>

        <v-list class="next-steps-list pa-0" lines="two">
          <v-list-item
            rounded="lg"
            class="mb-2 next-steps-list__item"
            @click="emitAction('assign')"
          >
            <template #prepend>
              <v-avatar color="primary" variant="tonal" size="40">
                <v-icon>mdi-file-outline</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title class="text-body-2 font-weight-medium">
              {{ t('meta.dialogs.next_steps_assign') }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              {{ t('meta.dialogs.next_steps_assign_hint') }}
            </v-list-item-subtitle>
            <template #append>
              <v-icon size="18">mdi-chevron-right</v-icon>
            </template>
          </v-list-item>

          <v-list-item
            rounded="lg"
            class="mb-2 next-steps-list__item"
            @click="goChildFields"
          >
            <template #prepend>
              <v-avatar color="primary" variant="tonal" size="40">
                <v-icon>mdi-tag-multiple-outline</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title class="text-body-2 font-weight-medium">
              {{ t('meta.dialogs.next_steps_children') }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              {{ t('meta.dialogs.next_steps_children_hint') }}
            </v-list-item-subtitle>
            <template #append>
              <span class="text-caption text-medium-emphasis mr-2">
                {{ t('common.optional') }}
              </span>
              <v-icon size="18">mdi-chevron-right</v-icon>
            </template>
          </v-list-item>

          <v-list-item
            rounded="lg"
            class="next-steps-list__item"
            @click="emitAction('path')"
          >
            <template #prepend>
              <v-avatar color="primary" variant="tonal" size="40">
                <v-icon>mdi-folder-search-outline</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title class="text-body-2 font-weight-medium">
              {{ t('meta.dialogs.next_steps_path') }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              {{ t('meta.dialogs.next_steps_path_hint') }}
            </v-list-item-subtitle>
            <template #append>
              <span class="text-caption text-medium-emphasis mr-2">
                {{ t('common.optional') }}
              </span>
              <v-icon size="18">mdi-chevron-right</v-icon>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" rounded="lg" @click="close">
          {{ t('meta.dialogs.next_steps_later') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import type {PropType} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import type {Meta} from '@/types/stores'

const props = defineProps({
  dialog: {
    type: Boolean,
    default: false,
  },
  meta: {
    type: Object as PropType<Meta | null>,
    default: null,
  },
})

const emit = defineEmits<{
  close: []
  assign: [meta: Meta]
  'edit-path': [meta: Meta]
}>()

const {xs} = useDisplay()
const {t} = useI18n()
const router = useRouter()

const metaName = computed(() => props.meta?.name || '')

const onDialogChange = (value: boolean) => {
  if (!value) emit('close')
}

const close = () => emit('close')

const emitAction = (kind: 'assign' | 'path') => {
  if (!props.meta) return
  if (kind === 'assign') emit('assign', props.meta)
  else emit('edit-path', props.meta)
  close()
}

const goChildFields = async () => {
  if (!props.meta?.id) return
  close()
  await router.push({
    path: '/settings',
    query: {
      tab: 'library',
      section: 'field_pinning',
      view: 'tags',
      metaId: props.meta.id,
    },
  })
}
</script>

<style scoped>
.next-steps-list__item {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
}

.next-steps-list__item:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}
</style>
