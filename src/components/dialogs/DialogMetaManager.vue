<template>
  <!-- Диалог для управления метой -->
  <v-dialog
    v-model="internalDialog"
    :fullscreen="xs"
    scrollable
    :width="600"
    @after-leave="resetDialogState"
  >
    <v-card>
      <DialogHeader
        @close="closeDialog"
        :header="dialogHeader"
        :buttons="buttons"
        closable
      />

      <v-card-text :key="metaKey" class="px-4 pb-6 pt-6 meta-manager-dialog-content">
        <div class="dialog-settings-stack">
          <SettingsSection padded>
            <MetaFieldFormPreview
              v-if="metaSettings.type"
              :meta="metaSettingsAsMeta"
            />

            <v-alert
              v-if="!editMode && metaSettings.type === 'array'"
              type="info"
              class="text-caption mb-4 mt-2"
              variant="tonal"
              density="compact"
              rounded="xl"
            >
              {{ t('meta.dialogs.array_meta_info') }}
            </v-alert>

            <v-form
              v-model="valid"
              ref="form"
              class="flex-grow-1"
              @submit.prevent
            >
              <v-select
                v-if="!editMode"
                v-model="metaSettings.type"
                :items="metaTypes"
                item-title="text"
                item-value="value"
                :rules="[(v) => !!v || t('validation.type_required')]"
                :menu-props="{ attach: '.meta-manager-dialog-content' }"
                persistent-hint
                :hint="getHint()"
                :label="t('common.type')"
                class="mb-3"
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
                v-model="metaSettings.name"
                :rules="[nameRules]"
                :label="t('common.name')"
                class="mb-3"
                density="comfortable"
              />

              <v-text-field
                v-model="metaSettings.hint"
                :label="t('common.hint')"
                :hint="t('meta.fields.hint_help')"
                persistent-hint
                class="mb-3"
                density="comfortable"
              />

              <DialogIcons
                :icon="metaSettings.icon"
                @apply="changeIcon"
              />
            </v-form>
          </SettingsSection>

          <MetaSettingsArray
            v-if="metaSettings.type === 'array'"
            @update="updateMetaSettings"
            :meta="metaSettingsAsMeta"
            :edit-mode="editMode"
          />

          <MetaSettingsRating
            v-if="metaSettings.type === 'rating'"
            @update="updateMetaSettings"
            :meta="metaSettingsAsMeta"
          />

          <MetaSettingsNumber
            v-if="metaSettings.type === 'number'"
            @update="updateMetaSettings"
            :meta="metaSettingsAsMeta"
          />

          <SettingsSection v-if="metaSettings.type === 'string'" padded>
            <settings-category-divider icon="link-variant" compact :title="t('meta.fields.link')"/>
            <v-switch
              v-model="metaSettings.isLink"
              :label="t('meta.fields.link')"
              hide-details
              inset
            />
          </SettingsSection>

          <SettingsSection
            v-if="!editMode && !hasOptions"
            padded
            class="d-flex flex-column justify-center align-center text-center"
          >
            <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-cog</v-icon>
            <div>{{ t('meta.fields.no_additional_settings') }}</div>
          </SettingsSection>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>

  <!-- Диалог подтверждения удаления (только в режиме редактирования) -->
  <DialogDeleteConfirm
    v-if="editMode && dialogDeleteMeta"
    :dialog="dialogDeleteMeta"
    @delete="deleteMeta"
    @close="dialogDeleteMeta=false"
    :text="textDialogDelete"
  ></DialogDeleteConfirm>
</template>

<script setup lang="ts">
import {ref, computed, watch, defineAsyncComponent} from 'vue'
import type {PropType} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {getErrorResponseData} from '@/types/vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue'
import MetaSettingsArray from '@/components/dialogs/meta/MetaSettingsArray.vue'
import MetaSettingsRating from '@/components/dialogs/meta/MetaSettingsRating.vue'
import MetaSettingsNumber from '@/components/dialogs/meta/MetaSettingsNumber.vue'
import MetaFieldFormPreview from '@/components/dialogs/meta/MetaFieldFormPreview.vue'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import MetaTypes from '@/assets/MetaTypes'
import {typedApi} from '@/services/typedApi'
import {validateName} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {
  canConvertMeasurementUnits,
  normalizeMeasurementUnit,
} from '@shared/measurementUnits'
import type {Meta} from '@/types/stores'
import type { MetaWritePayload } from '@shared/entities/meta'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  variant?: string
  action?: () => void | Promise<void>
}

interface MetaSettingsForm {
  type: string
  name: string
  hint: string
  icon: string
  isLink: boolean
  hidden: boolean
  parser: boolean
  imageAspectRatio: number
  tagPageDesign: string
  measurementUnit: string | null
  chipLabel: boolean
  chipVariant: string
  color: boolean
  autoColorFromImage: boolean
  favorite: boolean
  rating: boolean
  synonyms: boolean
  bookmark: boolean
  country: boolean
  career: boolean
  scraper: boolean
  nested: boolean
  marks: boolean
  ratingIcon: string
  ratingIconEmpty: string
  ratingIconHalf: string
  ratingHalf: boolean
  ratingMax: number
  ratingColor: string
  id?: number
  [key: string]: unknown
}

// Props
const props = defineProps({
  dialog: {
    type: Boolean,
    default: false
  },
  // Для режима редактирования
  meta: {
    type: Object as PropType<Meta | null>,
    default: null
  },
  // Режим работы: создание (false) или редактирование (true)
  editMode: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['updated', 'close', 'delete'])

// Stores
const {xs} = useDisplay()
const {t} = useI18n()

// Refs
const form = ref<VFormInstance>(null)
const internalDialog = ref(false)
const dialogIcons = ref(false)
const dialogDeleteMeta = ref(false)
const valid = ref(false)

// Meta data
const metaTypes = computed(() => MetaTypes.map(type => ({
  ...type,
  text: t(`meta.types.${type.value}`),
  hint: t(`meta.hints.${type.value}`),
})))

const metaSettingsDefault = ref<MetaSettingsForm>({

  // Основные настройки для всех типов
  type: 'array',
  name: '',
  hint: '',
  icon: 'shape',

  // Настройки для типа string
  isLink: false,

  // Настройки для типа array
  hidden: false,
  parser: false,
  imageAspectRatio: 1,
  tagPageDesign: 'profile',
  measurementUnit: null,
  chipLabel: false,
  chipVariant: 'flat',
  color: false,
  autoColorFromImage: false,
  favorite: false,
  rating: false,
  synonyms: false,
  bookmark: false,
  country: false,
  career: false,
  scraper: false,
  nested: false,
  marks: false,

  // Настройки для типа rating
  ratingIcon: "star",
  ratingIconEmpty: "star-outline",
  ratingIconHalf: "star-half-full",
  ratingHalf: false,
  ratingMax: 5,
  ratingColor: "#ffab00",
})

const metaSettings = ref<MetaSettingsForm>({...metaSettingsDefault.value})

function toMetaPreview(form: MetaSettingsForm): Meta {
  return {
    ...form,
    id: form.id ?? 0,
  }
}

const metaSettingsAsMeta = computed(() => toMetaPreview(metaSettings.value))

// Keys для принудительного перерисовывания
const metaKey = ref(0)

// Buttons for DialogHeader
const buttons = ref<DialogHeaderButton[]>([])

// Computed
const hasOptions = computed(() => ['array', 'rating', 'string', 'number'].includes(metaSettings.value.type))

const dialogHeader = computed(() => {
  return props.editMode ? t('media.type.editing_meta') : t('meta.dialogs.adding_meta')
})

const textDialogDelete = computed(() => {
  if (!props.editMode || !props.meta) return ''

  let text = t('meta.dialogs.delete_meta_assigned_confirm') + '\n'
  if (metaSettings.value.type === 'array') {
    text += t('meta.dialogs.delete_meta_tags_confirm') + '\n'
  }
  text += t('common.are_you_sure')
  return text
})

// Methods
const initButtons = () => {
  if (props.editMode && props.meta) {
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
        action: sendForm
      }
    ]
  } else {
    buttons.value = [
      {
        icon: 'plus',
        text: t('common.add'),
        color: 'success',
        variant: 'flat',
        action: sendForm
      }
    ]
  }
}

const changeIcon = (icon: string) => {
  dialogIcons.value = false
  metaSettings.value.icon = icon
}

const nameRules = (value: string) => {
  return validateName(value)
}

const buildMetaCreatePayload = (): MetaWritePayload => {
  const form = metaSettings.value
  const base: MetaWritePayload = {
    type: form.type,
    name: form.name,
    hint: form.hint,
    icon: form.icon,
  }

  if (form.type === 'string') {
    return {
      ...base,
      isLink: form.isLink,
    }
  }

  if (form.type === 'number') {
    return {
      ...base,
      measurementUnit: form.measurementUnit,
    }
  }

  if (form.type === 'rating' || form.type === 'array') {
    return {...form}
  }

  return base
}

const sendForm = async () => {
  if (!form.value) return

  const {valid: formValid} = await form.value.validate()
  if (!formValid) return

  if (props.editMode && props.meta?.id && metaSettings.value.type === 'number') {
    const fromUnit = normalizeMeasurementUnit(props.meta.measurementUnit)
    const toUnit = normalizeMeasurementUnit(metaSettings.value.measurementUnit)
    if (
      fromUnit
      && toUnit
      && fromUnit !== toUnit
      && canConvertMeasurementUnits(fromUnit, toUnit)
    ) {
      const confirmed = window.confirm(
        t('meta.settings.measurement_unit_convert_confirm', {
          from: t(`meta.settings.measurement_units.${fromUnit}`),
          to: t(`meta.settings.measurement_units.${toUnit}`),
        }),
      )
      if (!confirmed) return
    }
  }

  try {
    const payload = props.editMode && props.meta?.id
      ? metaSettings.value
      : buildMetaCreatePayload()

    const response = props.editMode && props.meta?.id
      ? await typedApi.updateMeta(props.meta.id, payload)
      : await typedApi.createMeta(payload)

    if (response.data !== undefined) {
      if (!props.editMode) {
        setNotification({
          type: 'success',
          title: t('meta.dialogs.meta_added', {name: metaSettings.value.name})
        })
      }

      emit('updated', metaSettings.value.type)
      closeDialog()
    }
  } catch (error) {
    console.error('Error adding meta:', error)

    const errorMessage = getErrorResponseData<{ message?: string }>(error)?.message
      || t('meta.dialogs.failed_add')

    setNotification({
      type: 'error',
      text: errorMessage
    })
  }
}

const updateMetaSettings = (newSettings: Partial<MetaSettingsForm>) => {
  metaSettings.value = {
    ...metaSettings.value,
    ...newSettings
  }
}

const closeDialog = () => {
  internalDialog.value = false
  emit('close')
}

const resetDialogState = () => {
  metaSettings.value = {...metaSettingsDefault.value}
  valid.value = false

  if (form.value) {
    form.value.reset()
    form.value.resetValidation()
  }
}

const deleteMeta = async () => {
  if (!props.meta?.id) return

  try {
    await typedApi.deleteMeta(props.meta.id)

    setNotification({
      type: 'success',
      title: t('meta.dialogs.meta_deleted', {name: metaSettings.value.name})
    })

    dialogDeleteMeta.value = false
    emit('updated', metaSettings.value.type)
    emit('delete')
    closeDialog()
  } catch (error) {
    console.error('Error deleting meta:', error)

    setNotification({
      type: 'error',
      text: t('meta.dialogs.failed_delete')
    })
  }
}

const getHint = () => {
  return metaTypes.value.find(type => type.value === metaSettings.value.type)?.hint || t('meta.dialogs.select_meta_type')
}

// Watchers
watch(() => props.dialog, (newVal) => {
  internalDialog.value = newVal
  initButtons()

  metaSettings.value = {...metaSettingsDefault.value}

  if (props.meta) {
    metaSettings.value = {...metaSettingsDefault.value, ...props.meta}
  }

  metaKey.value++
})
</script>