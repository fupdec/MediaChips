<template>
  <div>
    <v-dialog
      v-if="dialog"
      v-model="internalDialog"
      :fullscreen="xs"
      scrollable
      width="600"
      @after-leave="resetDialog"
    >
      <v-card rounded="xl">
        <DialogHeader
          @close="closeDialog"
          :header="t('media.type.editing_meta')"
          :buttons="buttons"
          closable
        />

        <v-card-text class="pa-4">
          <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
            <div class="d-flex align-center text-body-1">
              <v-icon start>{{ `mdi-${meta.icon}` }}</v-icon>
              {{ meta.name }}
            </div>
            <ChipMetaType :meta="meta"></ChipMetaType>
          </div>

          <v-form
            v-model="valid"
            ref="form"
            class="flex-grow-1"
            @submit.prevent
          >
            <v-text-field
              v-model="name"
              :rules="[nameRules]"
              label="Name"
              variant="outlined"
              density="comfortable"
              rounded="lg"
            />
            <v-text-field
              v-model="metaHint"
              label="Hint"
              hint="This text under the field is the hint"
              persistent-hint
              class="mt-4"
              variant="outlined"
              density="comfortable"
              rounded="lg"
            />

            <DialogIcons
              :icon="metaIcon"
              @apply="changeIcon"
            ></DialogIcons>
          </v-form>

          <!-- Rating settings -->
          <MetaSettingsRating
            v-if="meta.type === 'rating'"
            @update="updateRating"
            :meta="meta"
          />

          <!-- Link checkbox for string type -->
          <v-checkbox
            v-if="meta.type === 'string'"
            v-model="isLink"
            label="Link to an Internet address"
            hide-details
            class="mt-4"
          />

          <!-- Array settings -->
          <MetaSettingsArray
            v-if="meta.type === 'array'"
            @update="updateSettingsArray"
            :meta="meta"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <DialogConfirm
      v-if="dialogDeleteMeta"
      variant="delete"
      :dialog="dialogDeleteMeta"
      @delete="deleteMeta"
      @close="dialogDeleteMeta=false"
      :text="textDialogDelete"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, nextTick, defineAsyncComponent} from 'vue'
import type {PropType} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {getErrorResponseData} from '@/types/vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import ChipMetaType from '@/components/elements/ChipMetaType.vue'
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import MetaSettingsArray from '@/components/dialogs/meta/MetaSettingsArray.vue'
import MetaSettingsRating from '@/components/dialogs/meta/MetaSettingsRating.vue'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import type {Meta} from '@/types/stores'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  variant?: string
  action?: () => void | Promise<void>
}

// Props
const props = defineProps({
  dialog: {
    type: Boolean,
    default: false
  },
  meta: {
    type: Object as PropType<Meta>,
    required: true,
  }
})

// Emits
const emit = defineEmits(['update:model-value', 'update', 'delete', 'close'])

// Stores
const {xs} = useDisplay()
const {t} = useI18n()

// Refs
const form = ref<VFormInstance>(null)
const internalDialog = ref(false)
const dialogIcons = ref(false)
const dialogDeleteMeta = ref(false)
const valid = ref(false)

// Form fields
const name = ref('')
const metaHint = ref('')
const metaIcon = ref('shape')
const isLink = ref(false)

// Settings
const rating = ref<Record<string, unknown>>({})
const settingsArray = ref<Record<string, unknown>>({})

// Buttons for DialogHeader
const buttons = ref<DialogHeaderButton[]>([])

// Computed
const textDialogDelete = computed(() => {
  let text = `${t('meta.dialogs.delete_meta_assigned_confirm')}\n`
  if (props.meta.type === 'array') {
    text += `${t('meta.dialogs.delete_meta_tags_confirm')}\n`
  }
  text += t('common.are_you_sure')
  return text
})

// Methods
const initButtons = () => {
  buttons.value = [
    {
      icon: 'delete',
      text: t('common.delete'),
      color: 'error',
      variant: 'flat',
      action: () => {
        dialogDeleteMeta.value = true
      }
    },
    {
      icon: 'check',
      text: t('common.apply'),
      color: 'success',
      variant: 'flat',
      action: applyChanges
    }
  ]
}

const initMeta = () => {
  if (!props.meta) return

  name.value = props.meta.name || ''
  metaHint.value = String(props.meta.hint ?? '')
  metaIcon.value = String(props.meta.icon || 'shape')
}

const changeIcon = (icon: string) => {
  dialogIcons.value = false
  metaIcon.value = icon
}

const nameRules = (value: string) => {
  if (!value || value.trim().length === 0) {
    return t('validation.name_required')
  }
  if (value.length < 2) {
    return t('validation.name_too_short')
  }
  if (value.length > 100) {
    return t('validation.name_max_length')
  }
  return true
}

const applyChanges = async () => {
  if (!form.value) return

  const {valid: formValid} = await form.value.validate()
  if (!formValid) return

  try {
    const metaData = {
      name: name.value,
      hint: metaHint.value,
      icon: metaIcon.value,
      ...settingsArray.value,
      ...rating.value,
      ...{isLink: isLink.value}
    }

    await typedApi.updateMeta(props.meta.id, metaData)

    setNotification({
      type: 'success',
      title: `Meta "${name.value}" updated successfully`
    })

    // Emit update event
    emit('update', props.meta.type)

    // Update meta list if array type
    if (props.meta.type === 'array') {
      void reloadMetaCatalog()
    }

    closeDialog()
  } catch (error) {
    console.error('Error updating meta:', error)

    let errorMessage = 'Failed to update meta'
    const responseMessage = getErrorResponseData<{ message?: string }>(error)?.message
    if (responseMessage) {
      errorMessage = responseMessage
    }

    setNotification({
      type: 'error',
      text: errorMessage
    })
  }
}

const getSettings = async () => {
  try {
    const response = await typedApi.getMetaSetting(props.meta.id)
    isLink.value = response.data.isLink || false
  } catch (error) {
    console.error('Error fetching meta settings:', error)
  }
}

const updateRating = (ratingData: Record<string, unknown>) => {
  rating.value = ratingData
}

const updateSettingsArray = (settings: unknown) => {
  settingsArray.value = settings as Record<string, unknown>
}

const closeDialog = () => {
  internalDialog.value = false
  emit('close')
}

const deleteMeta = () => {
  dialogDeleteMeta.value = false
  emit('delete', props.meta)
}

const resetDialog = () => {
  // Reset form fields
  name.value = ''
  metaHint.value = ''
  metaIcon.value = 'shape'
  isLink.value = false
  rating.value = {}
  settingsArray.value = {}
  valid.value = false

  // Reset form validation
  if (form.value) {
    form.value.reset()
    form.value.resetValidation()
  }
  closeDialog()
}

// Lifecycle
onMounted(() => {
  initButtons()
})

// Watchers
watch(() => props.dialog, (newVal) => {
  internalDialog.value = newVal

  if (newVal && props.meta) {
    nextTick(() => {
      initMeta()
      getSettings()
    })
  }
})

watch(() => props.meta, () => {
  if (internalDialog.value && props.meta) {
    initMeta()
    getSettings()
  }
})

watch(internalDialog, (newVal) => {
  emit('update:model-value', newVal)
})

// Expose methods if needed
defineExpose({
  applyChanges,
  closeDialog
})
</script>
