<template>
  <div>
    <v-dialog
      v-model="internalDialog"
      scrollable
      width="500"
      @after-leave="resetForm"
      activator="parent"
    >
      <template #activator="{ props: activatorProps }">
        <v-btn
          v-bind="activatorProps"
          color="success"
          rounded="xl"
          variant="flat"
          prepend-icon="mdi-plus"
          text="Add new meta"
        ></v-btn>
      </template>

      <template #default>
        <v-card>
          <DialogHeader
            @close="closeDialog"
            :header="`Adding meta`"
            :buttons="buttons"
            closable
          />

          <v-card-text class="pa-4 meta-add-dialog-content">
            <v-alert color="info" class="text-caption mb-4" variant="tonal" density="compact" rounded="xl">
              {{ currentMetaType?.hint || 'Select a meta type' }}
              <div v-show="metaType === 'array' || metaType === 'rating'">
                After adding, a dialog with detailed settings will appear
              </div>
              <div v-show="metaType === 'array'">
                You can view and manage tags on the page of this tag type. A link
                of this page will appear in the navigation menu.
              </div>
            </v-alert>

            <v-form
              v-model="valid"
              ref="form"
              class="flex-grow-1"
              @submit.prevent
            >
              <v-select
                v-model="metaType"
                :items="metaTypes"
                item-title="text"
                item-value="value"
                :rules="[(v) => !!v || 'Type is required']"
                :menu-props="{ attach: '.meta-add-dialog-content' }"
                label="Type"
              >
                <template v-slot:selection="{ item }">
                  <v-icon :icon="item.raw.icon" size="16" start />
                  <span class="text-body-2">{{ item.raw.text }}</span>
                </template>

                <template v-slot:item="{ props, item }">
                  <v-list-item
                    v-bind="props"
                    :prepend-icon="item.raw.icon"
                    :title="item.raw.text"
                    density="compact"
                  />
                </template>
              </v-select>

              <v-text-field
                v-model="name"
                :rules="[nameRules]"
                label="Name"
              />

              <v-text-field
                v-model="metaHint"
                label="Hint"
                hint="This text under the field is the hint"
                persistent-hint
              />

              <DialogIcons
                :icon="metaIcon"
                @apply="changeIcon"
              />

              <v-switch
                v-if="metaType === 'string'"
                v-model="isLink"
                label="Link to an Internet address"
                hide-details
              />
            </v-form>
          </v-card-text>
        </v-card>
      </template>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, defineAsyncComponent} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {getErrorResponseData} from '@/types/vue'
import {useNotificationsStore} from '@/stores/notifications'
import DialogHeader from '@/components/elements/DialogHeader.vue'
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))
import MetaTypes from '@/assets/MetaTypes'
import {typedApi} from '@/services/typedApi'
import type { MetaWritePayload } from '@shared/entities/meta'

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
  }
})

// Emits
const emit = defineEmits(['update:model-value', 'added', 'close'])

// Stores
const notificationsStore = useNotificationsStore()

// Refs
const form = ref<VFormInstance>(null)
const internalDialog = ref(false)
const dialogIcons = ref(false)
const valid = ref(false)

const metaTypes = ref(MetaTypes)
const metaType = ref('array')
const name = ref('')
const singular = ref('')
const metaHint = ref('')
const metaIcon = ref('shape')
const isLink = ref(false)

// Buttons for DialogHeader
const buttons = ref<DialogHeaderButton[]>([])

const currentMetaType = computed(() => {
  return metaTypes.value.find((i) => i.value === metaType.value)
})

// Methods
const initButtons = () => {
  buttons.value = [
    {
      icon: 'plus',
      text: 'Add',
      color: 'success',
      variant: 'flat',
      action: addMeta
    }
  ]
}

const changeIcon = (icon: string) => {
  dialogIcons.value = false
  metaIcon.value = icon
}

const nameRules = (value: string) => {
  if (!value || value.trim().length === 0) {
    return 'Name is required'
  }
  if (value.length < 2) {
    return 'Name must be at least 2 characters'
  }
  if (value.length > 100) {
    return 'Name must be less than 100 characters'
  }
  return true
}

const addMeta = async () => {
  if (!form.value) return

  const {valid: formValid} = await form.value.validate()
  if (!formValid) return

  try {
    const metaData: MetaWritePayload = {
      type: metaType.value,
      name: name.value,
      nameSingular: metaType.value === 'array' ? (singular.value || name.value) : name.value,
      hint: metaHint.value,
      icon: metaIcon.value,
      metaSetting: {
        isLink: isLink.value
      }
    }

    // Add pageSetting for array type
    if (metaType.value === 'array') {
      metaData.pageSetting = {
        page: 1
      }
    }

    const response = await typedApi.createMeta(metaData)

    if (response.data) {
      notificationsStore.setNotification({
        type: 'success',
        title: `Meta "${name.value}" added successfully`
      })

      emit('added', metaType.value)
      closeDialog()
    }
  } catch (error) {
    console.error('Error adding meta:', error)

    let errorMessage = 'Failed to add meta'
    const responseMessage = getErrorResponseData<{ message?: string }>(error)?.message
    if (responseMessage) {
      errorMessage = responseMessage
    }

    notificationsStore.setNotification({
      type: 'error',
      text: errorMessage
    })
  }
}

const closeDialog = () => {
  internalDialog.value = false
  emit('close')
}

const resetForm = () => {
  // Reset form fields
  metaType.value = 'array'
  name.value = ''
  singular.value = ''
  metaHint.value = ''
  metaIcon.value = 'shape'
  isLink.value = false
  valid.value = false

  // Reset form validation
  if (form.value) {
    form.value.reset()
    form.value.resetValidation()
  }
}

// Lifecycle
onMounted(() => {
  initButtons()
})

// Watchers
watch(() => props.dialog, (newVal) => {
  internalDialog.value = newVal
})

// Expose methods if needed
defineExpose({
  addMeta,
  closeDialog
})
</script>
