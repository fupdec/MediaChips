<template>
  <v-dialog
    v-model="internalDialog"
    :fullscreen="xs"
    scrollable
    :width="dialogWidth"
    content-class="dialog-position-start meta-manager-dialog"
    @after-leave="resetDialogState"
  >
    <v-card rounded="xl">
      <DialogHeader
        @close="closeDialog"
        :header="dialogHeader"
        :buttons="buttons"
        closable
      />

      <v-card-text :key="metaKey" class="px-4 pb-6 pt-4 meta-manager-dialog-content">
        <div
          class="meta-manager-tabs-layout"
          :class="{'meta-manager-tabs-layout--vertical': showEditTabs && mdAndUp}"
        >
          <v-tabs
            v-if="showEditTabs"
            v-model="editTab"
            :direction="mdAndUp ? 'vertical' : undefined"
            density="compact"
            class="meta-manager-tabs"
            :class="mdAndUp ? '' : 'mb-4'"
            color="primary"
            :grow="!mdAndUp"
          >
            <v-tab value="basics" prepend-icon="mdi-cog-outline">
              {{ t('meta.dialogs.tab_basics') }}
            </v-tab>
            <v-tab value="where" prepend-icon="mdi-pin-outline">
              {{ t('meta.dialogs.tab_where') }}
            </v-tab>
            <v-tab
              v-if="isArrayType"
              value="appearance"
              prepend-icon="mdi-palette-outline"
            >
              {{ t('meta.dialogs.tab_appearance') }}
            </v-tab>
            <v-tab
              v-if="isArrayType"
              value="from-path"
              prepend-icon="mdi-folder-search-outline"
            >
              {{ t('meta.dialogs.tab_from_path') }}
            </v-tab>
            <v-tab
              v-if="isArrayType"
              value="capabilities"
              prepend-icon="mdi-shape"
            >
              {{ t('meta.dialogs.tab_capabilities') }}
            </v-tab>
          </v-tabs>

          <div class="dialog-settings-stack">
          <!-- Basics (always for create; tab for array edit) -->
          <template v-if="showBasicsPanel">
            <SettingsSection padded>
              <v-form
                v-model="valid"
                ref="form"
                class="flex-grow-1"
                @submit.prevent
              >
                <div v-if="!editMode" class="mb-4">
                  <template v-if="showTypePicker">
                    <div class="text-caption text-medium-emphasis mb-2">
                      {{ t('common.type') }}
                    </div>
                    <div class="meta-type-filters d-flex flex-wrap ga-2 mb-3">
                      <v-chip
                        v-for="typeOption in metaTypes"
                        :key="typeOption.value"
                        size="small"
                        label
                        :color="metaSettings.type === typeOption.value ? 'primary' : undefined"
                        :variant="metaSettings.type === typeOption.value ? 'flat' : 'outlined'"
                        @click="selectMetaType(typeOption.value)"
                      >
                        <v-icon start size="16">{{ typeOption.icon }}</v-icon>
                        {{ typeOption.text }}
                      </v-chip>
                    </div>
                  </template>
                  <v-alert
                    type="info"
                    variant="tonal"
                    density="compact"
                    rounded="xl"
                    class="text-caption"
                  >
                    {{ createInfoText }}
                  </v-alert>
                </div>

                <v-text-field
                  v-model="metaSettings.name"
                  :rules="[nameRules]"
                  :label="isTagCategoryDialog
                    ? t('meta.dialogs.tag_category_name')
                    : t('common.name')"
                  class="mb-3"
                  density="comfortable"
                />

                <v-text-field
                  v-model="metaSettings.hint"
                  :label="t('common.hint')"
                  :hint="isTagCategoryDialog
                    ? t('meta.dialogs.tag_category_hint_help')
                    : t('meta.fields.hint_help')"
                  persistent-hint
                  class="mb-3"
                  density="comfortable"
                />

                <DialogIcons
                  :icon="metaSettings.icon"
                  @apply="changeIcon"
                />
              </v-form>

              <MetaFieldFormPreview
                v-if="metaSettings.type && !isTagCategoryDialog"
                :meta="metaSettingsAsMeta"
                class="mt-4"
              />
            </SettingsSection>

            <!-- Create: only hide-in-nav for array -->
            <MetaSettingsArray
              v-if="!editMode && metaSettings.type === 'array'"
              :meta="metaSettingsAsMeta"
              :edit-mode="false"
              :sections="['basics']"
              @update="updateMetaSettings"
            />

            <!-- Edit basics tab: hide-in-nav -->
            <MetaSettingsArray
              v-if="editMode && metaSettings.type === 'array' && editTab === 'basics'"
              ref="arrayBasicsRef"
              :meta="metaSettingsAsMeta"
              :edit-mode="true"
              :sections="['basics']"
              @update="updateMetaSettings"
              @request-assign="focusWhereTab"
            />

            <MetaSettingsRating
              v-if="showBasicsPanel && metaSettings.type === 'rating'"
              @update="updateMetaSettings"
              :meta="metaSettingsAsMeta"
            />

            <MetaSettingsNumber
              v-if="showBasicsPanel && metaSettings.type === 'number'"
              @update="updateMetaSettings"
              :meta="metaSettingsAsMeta"
            />

            <SettingsSection v-if="showBasicsPanel && metaSettings.type === 'string'" padded>
              <settings-category-divider icon="link-variant" compact :title="t('meta.fields.link')"/>
              <v-switch
                v-model="metaSettings.isLink"
                :label="t('meta.fields.link')"
                hide-details
                inset
              />
            </SettingsSection>

            <SettingsSection
              v-if="showBasicsPanel && !editMode && !hasOptions"
              padded
              class="d-flex flex-column justify-center align-center text-center"
            >
              <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-cog</v-icon>
              <div>{{ t('meta.fields.no_additional_settings') }}</div>
            </SettingsSection>
          </template>

          <!-- Where it appears (edit only) -->
          <MetaWhereAppears
            v-if="showWherePanel"
            ref="whereAppearsRef"
            :meta="metaSettingsAsMeta"
            @updated="onAssignmentsUpdated"
            @close="closeDialog"
          />

          <!-- Appearance tab -->
          <MetaSettingsArray
            v-if="editMode && metaSettings.type === 'array' && editTab === 'appearance'"
            :meta="metaSettingsAsMeta"
            :edit-mode="true"
            :sections="['appearance']"
            @update="updateMetaSettings"
          />

          <!-- From path tab -->
          <MetaSettingsArray
            v-if="editMode && metaSettings.type === 'array' && editTab === 'from-path'"
            ref="arrayFromPathRef"
            :meta="metaSettingsAsMeta"
            :edit-mode="true"
            :sections="['from-path']"
            @update="updateMetaSettings"
            @request-assign="focusWhereTab"
            @close="closeDialog"
          />

          <!-- Capabilities tab (last) -->
          <MetaSettingsArray
            v-if="editMode && metaSettings.type === 'array' && editTab === 'capabilities'"
            ref="arrayCapabilitiesRef"
            :meta="metaSettingsAsMeta"
            :edit-mode="true"
            :sections="['capabilities']"
            @update="updateMetaSettings"
            @request-assign="focusWhereTab"
          />
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>

  <DialogConfirm
    v-if="editMode && dialogDeleteMeta"
    variant="delete"
    :dialog="dialogDeleteMeta"
    @delete="deleteMeta"
    @close="dialogDeleteMeta=false"
    :text="textDialogDelete"
  />

  <DialogMetaNextSteps
    :dialog="nextStepsDialog"
    :meta="createdMeta"
    @close="nextStepsDialog = false"
    @assign="onNextStepsAssign"
    @edit-path="onNextStepsEditPath"
  />
</template>

<script setup lang="ts">
import {ref, computed, watch, defineAsyncComponent, nextTick} from 'vue'
import type {PropType} from 'vue'
import type {VFormInstance} from '@/types/vue'
import {getErrorResponseData} from '@/types/vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
const DialogIcons = defineAsyncComponent(() => import('@/components/dialogs/DialogIcons.vue'))
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import DialogMetaNextSteps from '@/components/dialogs/DialogMetaNextSteps.vue'
import MetaSettingsArray from '@/components/dialogs/meta/MetaSettingsArray.vue'
import MetaSettingsRating from '@/components/dialogs/meta/MetaSettingsRating.vue'
import MetaSettingsNumber from '@/components/dialogs/meta/MetaSettingsNumber.vue'
import MetaFieldFormPreview from '@/components/dialogs/meta/MetaFieldFormPreview.vue'
import MetaWhereAppears from '@/components/dialogs/meta/MetaWhereAppears.vue'
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

type EditTab = 'basics' | 'where' | 'appearance' | 'capabilities' | 'from-path'

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
  pathRegex: string
  pathRegexReplace: string
  pathRegexCreateTags: boolean
  pathRegexEnabled: boolean
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

const props = defineProps({
  dialog: {
    type: Boolean,
    default: false
  },
  meta: {
    type: Object as PropType<Meta | null>,
    default: null
  },
  editMode: {
    type: Boolean,
    default: false
  },
  /** When opening edit, jump to a specific tab (e.g. from-path after next steps) */
  initialTab: {
    type: String as PropType<EditTab | null>,
    default: null,
  },
  /** Limit creatable types (e.g. only `array` for tag categories). Null = all types. */
  allowedTypes: {
    type: Array as PropType<string[] | null>,
    default: null,
  },
})

const emit = defineEmits(['updated', 'close', 'delete', 'created', 'request-edit'])

const {xs, mdAndUp} = useDisplay()
const {t} = useI18n()

const form = ref<VFormInstance>(null)
const internalDialog = ref(false)
const dialogIcons = ref(false)
const dialogDeleteMeta = ref(false)
const valid = ref(false)
const editTab = ref<EditTab>('basics')
const nextStepsDialog = ref(false)
const createdMeta = ref<Meta | null>(null)
const whereAppearsRef = ref<{refresh: () => Promise<void>} | null>(null)
const arrayBasicsRef = ref<{refreshPinState: () => Promise<void>} | null>(null)
const arrayCapabilitiesRef = ref<{refreshPinState: () => Promise<void>} | null>(null)
const arrayFromPathRef = ref<{refreshPinState: () => Promise<void>} | null>(null)

const metaTypes = computed(() => {
  const allowed = props.allowedTypes
  const source = allowed?.length
    ? MetaTypes.filter((type) => allowed.includes(type.value))
    : MetaTypes
  return source.map((type) => ({
    ...type,
    text: t(`meta.types.${type.value}`),
    hint: t(`meta.hints.${type.value}`),
  }))
})

const showTypePicker = computed(() => !props.editMode && metaTypes.value.length > 1)

function isArrayOnlyAllowed(allowed: string[] | null | undefined): boolean {
  return Array.isArray(allowed) && allowed.length === 1 && allowed[0] === 'array'
}

function iconNameFromMetaType(type: string): string | null {
  const typeMeta = MetaTypes.find((item) => item.value === type)
  if (!typeMeta?.icon) return null
  return typeMeta.icon.replace(/^mdi-/, '')
}

function buildCreateDefaults(): MetaSettingsForm {
  const defaults: MetaSettingsForm = {...metaSettingsDefault.value}
  const allowed = props.allowedTypes
  if (allowed?.length && !allowed.includes(String(defaults.type))) {
    const first = MetaTypes.find((type) => allowed.includes(type.value))
    if (first) {
      defaults.type = first.value
      defaults.icon = first.icon.replace(/^mdi-/, '')
    }
  } else if (isArrayOnlyAllowed(allowed)) {
    defaults.icon = iconNameFromMetaType('array') || defaults.icon
  }
  return defaults
}

const metaSettingsDefault = ref<MetaSettingsForm>({
  type: 'array',
  name: '',
  hint: '',
  icon: 'shape',
  isLink: false,
  hidden: false,
  parser: true,
  pathRegex: '',
  pathRegexReplace: '$1',
  pathRegexCreateTags: true,
  pathRegexEnabled: false,
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
const metaKey = ref(0)
const buttons = ref<DialogHeaderButton[]>([])

const hasOptions = computed(() => ['array', 'rating', 'string', 'number'].includes(metaSettings.value.type))
const isArrayType = computed(() => metaSettings.value.type === 'array')
const isTagCategoryDialog = computed(() => isArrayOnlyAllowed(props.allowedTypes))

const createInfoText = computed(() => {
  if (isTagCategoryDialog.value) return t('meta.dialogs.adding_tag_category_info')
  if (metaSettings.value.type === 'array') return t('meta.dialogs.array_meta_info')
  return getHint()
})

const dialogWidth = computed(() => {
  if (!props.editMode) return 550
  return 830
})

const showEditTabs = computed(() => props.editMode)

const availableEditTabs = computed((): EditTab[] => {
  if (isArrayType.value) {
    return ['basics', 'where', 'appearance', 'from-path', 'capabilities']
  }
  return ['basics', 'where']
})

const showBasicsPanel = computed(() => {
  if (!props.editMode) return true
  return editTab.value === 'basics'
})

const showWherePanel = computed(() => {
  if (!props.editMode || !metaSettings.value.id) return false
  return editTab.value === 'where'
})

const dialogHeader = computed(() => {
  if (isTagCategoryDialog.value) {
    return props.editMode
      ? t('all_tags.edit_category')
      : t('meta.dialogs.adding_tag_category')
  }
  return props.editMode ? t('media.type.editing_meta') : t('meta.dialogs.adding_meta')
})

const textDialogDelete = computed(() => {
  if (!props.editMode || !props.meta) return ''

  if (isTagCategoryDialog.value) {
    return t('meta.dialogs.delete_tag_category_confirm') + '\n' + t('common.are_you_sure')
  }

  let text = t('meta.dialogs.delete_meta_assigned_confirm') + '\n'
  if (metaSettings.value.type === 'array') {
    text += t('meta.dialogs.delete_meta_tags_confirm') + '\n'
  }
  text += t('common.are_you_sure')
  return text
})

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

const selectMetaType = (type: string) => {
  if (metaSettings.value.type === type) return
  metaSettings.value.type = type
  const typeMeta = MetaTypes.find((item) => item.value === type)
  if (typeMeta?.icon) {
    // MetaTypes icons are mdi-*; form stores bare name
    metaSettings.value.icon = typeMeta.icon.replace(/^mdi-/, '')
  }
}

const nameRules = (value: string) => {
  const result = validateName(value)
  return result === true ? true : t(result)
}

const focusWhereTab = () => {
  editTab.value = 'where'
}

const onAssignmentsUpdated = async () => {
  await Promise.all([
    arrayBasicsRef.value?.refreshPinState(),
    arrayCapabilitiesRef.value?.refreshPinState(),
    arrayFromPathRef.value?.refreshPinState(),
  ])
}

const buildMetaCreatePayload = (): MetaWritePayload => {
  const formData = metaSettings.value
  const base: MetaWritePayload = {
    type: formData.type,
    name: formData.name,
    hint: formData.hint,
    icon: formData.icon,
  }

  if (formData.type === 'string') {
    return {
      ...base,
      isLink: formData.isLink,
    }
  }

  if (formData.type === 'number') {
    return {
      ...base,
      measurementUnit: formData.measurementUnit,
    }
  }

  if (formData.type === 'array') {
    return {
      ...base,
      hidden: formData.hidden,
      // Assigned tag categories parse file paths unless the user turns this off.
      parser: formData.parser !== false,
    }
  }

  if (formData.type === 'rating') {
    return {...formData}
  }

  return base
}

const sendForm = async () => {
  if (!form.value && showBasicsPanel.value) {
    // Form may be unmounted on non-basics tabs; skip name validation only when basics not visible
  }

  if (showBasicsPanel.value && form.value) {
    const {valid: formValid} = await form.value.validate()
    if (!formValid) {
      editTab.value = 'basics'
      return
    }
  } else if (!metaSettings.value.name?.trim()) {
    editTab.value = 'basics'
    await nextTick()
    if (form.value) {
      await form.value.validate()
    }
    return
  }

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
    // Nesting is managed elsewhere (tag category board). Never send parentMetaId
    // from this dialog — a copied Meta row always has the key (often null), and
    // the API treats any parentMetaId as a reparent request.
    const payload = props.editMode && props.meta?.id
      ? (() => {
          const {parentMetaId: _ignored, ...settings} = metaSettings.value
          return settings
        })()
      : buildMetaCreatePayload()

    const response = props.editMode && props.meta?.id
      ? await typedApi.updateMeta(props.meta.id, payload)
      : await typedApi.createMeta(payload)

    if (response.data !== undefined) {
      if (!props.editMode) {
        setNotification({
          type: 'success',
          title: t(
            isTagCategoryDialog.value
              ? 'meta.dialogs.tag_category_added'
              : 'meta.dialogs.meta_added',
            {name: metaSettings.value.name},
          )
        })

        const created = response.data as Meta
        emit('created', created)
        emit('updated', metaSettings.value.type)
        closeDialog()

        if (created.type === 'array') {
          createdMeta.value = created
          nextStepsDialog.value = true
        } else {
          // Any field type can be pinned to media types — open pinning right away.
          emit('request-edit', {meta: created, tab: 'where' as EditTab})
        }
        return
      }

      emit('updated', metaSettings.value.type)
      closeDialog()
    }
  } catch (error) {
    console.error('Error adding meta:', error)

    const errorMessage = getErrorResponseData<{ message?: string }>(error)?.message
      || t(isTagCategoryDialog.value
        ? 'meta.dialogs.failed_add_tag_category'
        : 'meta.dialogs.failed_add')

    setNotification({
      type: 'error',
      text: errorMessage
    })
  }
}

const updateMetaSettings = (newSettings: unknown) => {
  metaSettings.value = {
    ...metaSettings.value,
    ...(newSettings as Partial<MetaSettingsForm>),
  }
}

const closeDialog = () => {
  internalDialog.value = false
  emit('close')
}

const resetDialogState = () => {
  metaSettings.value = buildCreateDefaults()
  valid.value = false
  editTab.value = 'basics'

  if (form.value) {
    form.value.reset()
    form.value.resetValidation()
  }
}

const openCreatedForPath = (meta: Meta) => {
  nextStepsDialog.value = false
  emit('request-edit', {meta, tab: 'from-path' as EditTab})
}

const onNextStepsEditPath = (meta: Meta) => {
  openCreatedForPath(meta)
}

const onNextStepsAssign = (meta: Meta) => {
  nextStepsDialog.value = false
  emit('request-edit', {meta, tab: 'where' as EditTab})
}

const deleteMeta = async () => {
  if (!props.meta?.id) return

  try {
    await typedApi.deleteMeta(props.meta.id)

    setNotification({
      type: 'success',
      title: t(
        isTagCategoryDialog.value
          ? 'meta.dialogs.tag_category_deleted'
          : 'meta.dialogs.meta_deleted',
        {name: metaSettings.value.name},
      )
    })

    dialogDeleteMeta.value = false
    emit('updated', metaSettings.value.type)
    emit('delete')
    closeDialog()
  } catch (error) {
    console.error('Error deleting meta:', error)

    setNotification({
      type: 'error',
      text: t(isTagCategoryDialog.value
        ? 'meta.dialogs.failed_delete_tag_category'
        : 'meta.dialogs.failed_delete')
    })
  }
}

const getHint = () => {
  return metaTypes.value.find(type => type.value === metaSettings.value.type)?.hint || t('meta.dialogs.select_meta_type')
}

watch(() => props.dialog, (newVal) => {
  internalDialog.value = newVal
  initButtons()

  metaSettings.value = buildCreateDefaults()

  if (props.meta) {
    metaSettings.value = {
      ...metaSettingsDefault.value,
      ...props.meta,
      pathRegex: props.meta.pathRegex ?? '',
      pathRegexReplace: props.meta.pathRegexReplace ?? '',
    }
  }

  const requested = props.initialTab || 'basics'
  editTab.value = availableEditTabs.value.includes(requested) ? requested : 'basics'
  metaKey.value++
})

watch(internalDialog, (open) => {
  // Outside click / Esc closes v-dialog without going through closeDialog().
  if (!open && props.dialog) {
    emit('close')
  }
})

watch(() => props.initialTab, (tab) => {
  if (tab && props.dialog) {
    editTab.value = availableEditTabs.value.includes(tab) ? tab : 'basics'
  }
})

watch(availableEditTabs, (tabs) => {
  if (!tabs.includes(editTab.value)) {
    editTab.value = 'basics'
  }
})</script>
