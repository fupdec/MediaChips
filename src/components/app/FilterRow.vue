<template>
  <v-form ref="form"
    v-model="valid"
    class="filter-form"
  >
    <v-btn
      v-if="isDisabled"
      icon="mdi-lock"
      class="disabled-btn"
      disabled
    ></v-btn>

    <v-card
      class="rounded-xl filter"
      :class="{ active: active, removed: removed, disabled: isDisabled, 'filter--muted': !active && !removed }"
      :disabled="isDisabled"
      v-on="isMuted ? {click: activateMuted} : {}"
      :variant="active ? 'text' : 'flat'"
      :elevation="active ? undefined : 0"
    >
      <div class="d-flex align-center justify-space-between filter__header">
        <div class="d-flex align-center min-width-0 filter__title_block">
          <v-btn
            v-if="editable"
            @click="toggleRemoved"
            color="error"
            class="mr-0 flex-shrink-0"
            icon
            size="small"
            :title="removed ? t('common.restore') : t('common.remove')"
            :variant="removed?'text':'plain'"
          >
            <v-icon v-if="removed"
              size="20"
              color="error">mdi-restore
            </v-icon>
            <v-icon v-else
              size="20"
              color="grey">mdi-close
            </v-icon>
          </v-btn>

          <v-btn
            v-if="editable"
            class="filter__toggle flex-shrink-0"
            icon
            size="x-small"
            variant="text"
            :disabled="isDisabled"
            :title="active ? t('filters.turn_off_hint') : t('filters.turn_on_hint')"
            :aria-pressed="active"
            @click.stop="setActiveValue(!active)"
          >
            <v-icon size="18">{{ active ? 'mdi-eye-outline' : 'mdi-eye-off-outline' }}</v-icon>
          </v-btn>

          <v-btn
            v-if="editable && !is_locked"
            class="drag-handle flex-shrink-0"
            icon
            size="x-small"
            variant="text"
            :title="t('filters.drag_to_reorder')"
            :disabled="isDisabled"
          >
            <v-icon size="18">mdi-drag</v-icon>
          </v-btn>

          <div
            class="d-flex align-center min-width-0 filter__title_content"
            :class="{ 'pl-3': !editable }"
            :title="!active && !removed ? t('filters.turn_on_hint') : undefined"
          >
            <v-icon size="small" class="flex-shrink-0 filter__icon">mdi-{{ icon }}</v-icon>
            <div class="text-body-2 font-weight-regular filter__title" :title="title">{{ title }}</div>
          </div>
        </div>

        <div class="d-flex align-center flex-shrink-0 filter__actions">
          <v-select
            v-if="filter.active"
            @update:model-value="setCondition"
            :model-value="condition"
            :items="conditionOptions"
            :rules="[(v) => !!v || t('validation.condition_required')]"
            item-value="cond"
            class="filter__cond mt-0 pt-0"
            :class="{'filter__cond--text': condAsText}"
            :title="getConditionTitle(filter.type, condition)"
            hide-details
            density="compact"
            rounded
            variant="outlined"
            :menu-props="{
              contentClass: 'custom-list',
            }"
          >
            <template v-slot:selection="{ item }">
              <span v-if="condAsText" class="filter__cond-text">{{ getConditionText(item.raw.text) }}</span>
              <v-icon v-else :icon="`mdi-${item.raw.icon}`"
                size="small"></v-icon>
            </template>
            <template v-slot:item="{ item, props: menuProps }">
              <v-list-item v-bind="menuProps">
                <template v-slot:title>
                  <div class="text-body-2 py-1">
                    <v-icon :icon="`mdi-${item.raw.icon}`"
                      size="small"></v-icon>
                    <span class="pl-4">{{ getConditionText(item.raw.text) }}</span>
                  </div>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </div>
      </div>

      <div v-if="showsFilterValue" class="filter__body">
        <v-autocomplete
          v-if="isCatalogFilter"
          :model-value="filterValArray"
          :items="catalogOptions"
          :placeholder="title"
          :disabled="is_locked"
          :hint="parameter === 'availability' ? t('sources.catalog.observation_hint') : undefined"
          :persistent-hint="parameter === 'availability'"
          :menu-props="{contentClass: 'filter-catalog-menu', maxHeight: 320}"
          hide-details="auto"
          class="ma-1 pt-0"
          density="compact"
          variant="outlined"
          rounded
          multiple
          chips
          closable-chips
          @update:model-value="setValue"
        />
        <v-text-field
          v-if="is_value_required && isPathFilter && !isRegexFilter"
          v-model="filterValue"
          :disabled="is_locked || !is_value_required"
          class="ma-1 pt-0"
          hide-details
          density="compact"
          variant="outlined"
          rounded
          :placeholder="t('folder_browse.pick_folder')"
        >
          <template #append-inner>
            <v-btn
              icon="mdi-folder-search-outline"
              size="x-small"
              variant="text"
              :disabled="is_locked"
              :title="t('media.adding.browse_folders')"
              @click.stop="openFolderDialog"
            />
          </template>
        </v-text-field>

        <v-text-field
          v-else-if="is_value_required && isRegexFilter"
          v-model="filterValue"
          :disabled="is_locked || !is_value_required"
          class="ma-1 pt-0"
          density="compact"
          variant="outlined"
          rounded
          :placeholder="t('regex_builder.pattern')"
          :error="Boolean(regexPatternError)"
          :error-messages="regexPatternError"
          hide-details="auto"
        >
          <template #append-inner>
            <v-btn
              icon="mdi-regex"
              size="x-small"
              variant="text"
              :disabled="is_locked"
              :title="t('regex_builder.dialog_title')"
              @click.stop="regexDialog = true"
            />
          </template>
        </v-text-field>

        <v-text-field
          v-else-if="is_value_required && (filter.type === 'string' || filter.type === null)"
          v-model="filterValue"
          :disabled="is_locked || !is_value_required"
          class="ma-1 pt-0"
          hide-details
          density="compact"
          variant="outlined"
          rounded
        />

        <div
          v-if="filter.type === 'number' && parameter !== 'rating'"
          class="filter__number ma-1 pt-0"
        >
          <v-number-input
            :model-value="numberFilterValue"
            @update:model-value="setNumberValue"
            :disabled="is_locked || !is_value_required"
            control-variant="split"
            class="filter__number-input"
            :suffix="numberHintLabel || undefined"
            hide-details
            density="compact"
            variant="outlined"
            rounded
          />
        </div>

        <v-rating
          v-if="parameter === 'rating' && filter.type !== 'rating'"
          @update:model-value="setValue"
          :model-value="filterValNumber"
          color="yellow-darken-2"
          background-color="grey-lighten-1"
          empty-icon="mdi-star-outline"
          half-icon="mdi-star-half-full"
          density="compact"
          size="20"
          half-increments
          clearable
          hover
          class="filter__rating"
        />

        <MetaInputRating
          v-if="filter.type === 'rating'"
          @update:model-value="setValue"
          :model-value="filterValNumber"
          :meta_id="metaIdParam"
          size="20"
          class="filter__rating"
        />

          <v-text-field
          v-if="filter.type === 'date'"
          @click="pickDate"
          :model-value="filterDateDisplay"
          :disabled="is_locked || !is_value_required"
          class="ma-1 pt-0"
          readonly
          hide-details
          density="compact"
          rounded
          variant="outlined"
        />

        <div
          v-if="filter.type === 'array' && /\d/.test(paramAsString) && condition !== 'is null' && condition !== 'not null'"
          class="pa-1 filter__value-wrap"
        >
          <MetaInputArray
            @update:model-value="setValue"
            :model-value="filterValArray"
            :meta-id="metaIdParam"
            :cond="condition ?? undefined"
            :disabled="is_locked || !is_value_required"
            :rounded="true"
            :hide-details="true"
            :label="false"
            density="compact"
            purpose="filter"
            variant="outlined"
            multiple
          />
        </div>

        <div v-if="parameter === 'country'"
          class="pa-1 filter__value-wrap">
          <MetaInputCountry
            @update:model-value="setValue"
            :model-value="filterValArray"
            :cond="condition ?? undefined"
            :disabled="is_locked || !is_value_required"
            :view="{ hideIcon: true }"
            purpose="filter"
            variant="outlined"
          />
        </div>

        <div v-if="parameter === 'ext'"
          class="pa-1 filter__value-wrap">
          <v-autocomplete
            @update:model-value="setValue"
            :model-value="filterValArray"
            :disabled="is_locked || !is_value_required"
            density="compact"
            variant="outlined"
            rounded
            hide-details
            multiple
            chips
            closable-chips
            :chip-props="{ size: 'x-small', closeIcon: 'mdi-close' }"
          />
        </div>
      </div>

      <span
        v-if="editable && !isDisabled && !removed && isModified"
        class="filter__restore"
      >
        <EditingFieldRestoreBtn inline @click="restoreBaseline" />
      </span>

      <span
        v-if="rowCount && active && !removed"
        class="filter__count"
        :class="{'filter__count--zero': rowCount.matched === 0}"
        :title="t('filters.row_count_hint', {matched: rowCount.matched.toLocaleString(), total: rowCount.total.toLocaleString()})"
      >{{ rowCount.matched.toLocaleString() }}</span>

      <div
        v-if="editable && !isDisabled && !removed"
        class="filter__row-actions"
      >
        <v-btn
          class="filter__row-action"
          icon
          size="x-small"
          variant="text"
          :title="t('common.more')"
          :aria-label="t('common.more')"
          @click.stop="openRowMenu"
        >
          <v-icon size="16">mdi-dots-horizontal</v-icon>
        </v-btn>
      </div>
    </v-card>

    <DialogBrowseFolder
      v-if="isPathFilter"
      v-model="folderDialog"
      :header="t('media.adding.browse_folders')"
      :confirm-text="t('common.select')"
      :initial-path="pathDialogInitial"
      @confirm="onFolderPicked"
    />

    <DialogRegexBuilder
      v-if="isRegexFilter"
      v-model="regexDialog"
      :pattern="filterValString"
      :filter-parameter="parameter"
      @apply="onRegexApplied"
    />
  </v-form>
</template>

<script setup lang="ts">
import {ref, computed, inject, onMounted, watch} from 'vue'
import type { PropType } from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import find from 'lodash/find'
import type { FilterObject, FilterListParam } from '@/types/common'
import type { VForm } from 'vuetify/components'
import {
  getListCond,
  getReadableDuration,
  getReadableFileSize,
  formatFilterDateDisplay,
} from '@/services/formatUtils'
import MetaInputArray from '@/components/meta/input/MetaInputArray.vue'
import MetaInputCountry from '@/components/meta/input/MetaInputCountry.vue'
import MetaInputRating from '@/components/meta/input/MetaInputRating.vue'
import DialogBrowseFolder from '@/components/dialogs/DialogBrowseFolder.vue'
import DialogRegexBuilder from '@/components/dialogs/DialogRegexBuilder.vue'
import {validateRegexPattern} from '@shared/pathParser/regexMeta'
import {useCatalogSources} from '@/composable/useCatalogSources'
import {FILTER_ROW_COUNTS_KEY, filterRowKey} from '@/composable/useFilterRowCounts'
import {FILTER_ROW_BASELINE_KEY, isFilterRowModified} from '@/composable/filterRowBaseline'
import EditingFieldRestoreBtn from '@/components/items/EditingFieldRestoreBtn.vue'
import {useContextMenu} from '@/stores/contextMenu'
import type {ContextMenuEntry} from '@/types/stores'
// Props
const props = defineProps({
  filter: {
    type: Object as PropType<FilterObject>,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  listBy: {
    type: Array as PropType<FilterListParam[]>,
    default: () => []
  },
  editable: {
    type: Boolean,
    default: false,
  },
})

// Emits
const emit = defineEmits([
  'setCondition',
  'setValue',
  'remove',
  'pickDate',
  'setActive',
  'duplicate',
  'valid'
])

// Per-row match counts are provided by the filters host; rows rendered elsewhere simply show none.
const rowCounts = inject(FILTER_ROW_COUNTS_KEY, null)
const rowCount = computed(() => rowCounts?.value[filterRowKey(props.filter)] ?? null)

// Saved state of this row: when the user edits it, an undo button offers the previous value.
const rowBaselines = inject(FILTER_ROW_BASELINE_KEY, null)
const baseline = computed(() => rowBaselines?.value[filterRowKey(props.filter)])
const isModified = computed(() => isFilterRowModified(props.filter, baseline.value))

const restoreBaseline = () => {
  const saved = baseline.value
  if (!saved) return
  if ((modelFilter.value.cond ?? null) !== saved.cond) emit('setCondition', saved.cond)
  emit('setValue', JSON.parse(JSON.stringify(saved.val ?? null)))
}

// Reactive state
const form = ref<VForm | null>(null)
const valid = ref(false)
const active = ref(false)
const icon = ref('shape')
const title = ref('')
const folderDialog = ref(false)
const regexDialog = ref(false)

// Stores and composables
const {t, locale} = useI18n()
const contextMenuStore = useContextMenu()

// Computed properties
const modelFilter = computed(() => props.filter)
const removed = computed(() => modelFilter.value.removed)
const parameter = computed(() => modelFilter.value.param)
const isCatalogFilter = computed(() => parameter.value === 'source' || parameter.value === 'availability')
const {sourceOptions, availabilityOptions} = useCatalogSources(computed(() => parameter.value === 'source'))
const catalogOptions = computed(() => parameter.value === 'source' ? sourceOptions.value : availabilityOptions.value)
const conditionOptions = computed(() => isCatalogFilter.value
  ? getListCond('array').filter(option => ['in', 'not in'].includes(option.cond))
  : getListCond(modelFilter.value.type))
const condition = computed(() => modelFilter.value.cond)
// Numeric-like types keep the compact symbol (=, >, <); the rest show the condition as words.
const condAsText = computed(() => !['number', 'date', 'rating'].includes(String(modelFilter.value.type)))
const is_locked = computed(() => modelFilter.value.lock)
const isDisabled = computed(() => !!is_locked.value)
const metaIdParam = computed(() => {
  const param = parameter.value
  return typeof param === 'number' ? param : Number(param)
})
const filterValNumber = computed(() => Number(modelFilter.value.val))
const filterValArray = computed(() => Array.isArray(modelFilter.value.val) ? modelFilter.value.val : [])
const filterValString = computed(() => modelFilter.value.val == null ? '' : String(modelFilter.value.val))
const filterDateDisplay = computed(() =>
  formatFilterDateDisplay(modelFilter.value.val, locale.value),
)
const paramAsString = computed(() => String(parameter.value ?? ''))
const is_value_required = computed(() => !['is null', 'not null'].includes(condition.value ?? ''))
const isPathFilter = computed(() => parameter.value === 'path')
const isRegexFilter = computed(() => (
  (modelFilter.value.type === 'string' || modelFilter.value.type === null)
  && condition.value === 'regex'
))
const regexPatternError = computed(() => {
  if (!isRegexFilter.value) return ''
  const pattern = filterValString.value.trim()
  if (!pattern) return ''
  const result = validateRegexPattern(pattern, 'i')
  if (result.ok) return ''
  return result.code === 'empty'
    ? t('regex_builder.validation_empty_title')
    : t('regex_builder.validation_invalid_text')
})
const pathDialogInitial = computed(() => {
  const raw = Array.isArray(modelFilter.value.val)
    ? String(modelFilter.value.val[0] ?? '')
    : String(modelFilter.value.val ?? '')
  return raw.trim().replace(/[\\/]+$/, '')
})
const numberHintLabel = computed(() => {
  if (!Number.isFinite(filterValNumber.value)) return ''
  if (parameter.value === 'filesize') return getReadableFileSize(filterValNumber.value)
  if (parameter.value === 'duration' || parameter.value === 'time') {
    return getReadableDuration(filterValNumber.value)
  }
  return ''
})

const numberFilterValue = computed((): number | null => {
  const val = modelFilter.value.val
  if (val == null || val === '') return null
  const n = Number(val)
  return Number.isFinite(n) ? n : null
})

const setNumberValue = (val: number | null) => {
  emit('setValue', val)
}

const showsFilterValue = computed(() => {
  if (!active.value || !is_value_required.value) return false

  const type = modelFilter.value.type
  const param = parameter.value

  if (type === 'boolean') return false
  if (isCatalogFilter.value) return true

  if (type === 'string' || type === null) return true
  if (type === 'number' || type === 'date' || type === 'rating') return true
  if (param === 'rating' && type !== 'rating') return true
  if (type === 'array' && /\d/.test(paramAsString.value)) return true
  if (param === 'country' || param === 'ext') return true

  return false
})

// Methods
const getParamData = (data: string | number | null) => {
  const param = find(props.listBy, (i) => {
    if (typeof i.param === 'string') {
      return i.param === data
    } else {
      return i.param === Number(data)
    }
  })

  if (param) {
    icon.value = param.icon || 'shape'
    title.value = param.textKey ? t(param.textKey) : param.text || ''
    active.value = modelFilter.value.active
  }
}

const filterValue = computed({
  get() {
    return modelFilter.value.val || ''
  },
  set(value) {
    emit('setValue', value)
  },
})

const setCondition = (val: string | null) => {
  emit('setCondition', val)
}

// Opposite condition for the quick "invert" action; conditions without a clean opposite have none.
const CONDITION_INVERSE: Record<string, string> = {
  '=': '!==',
  '!==': '=',
  '>': '<=',
  '<=': '>',
  '<': '>=',
  '>=': '<',
  'like': 'not like',
  'not like': 'like',
  'in': 'not in',
  'not in': 'in',
  'in all': 'not in all',
  'not in all': 'in all',
  'is null': 'not null',
  'not null': 'is null',
}

const inverseCondition = computed(() => {
  const cond = condition.value
  if (!cond) return null
  const inverse = modelFilter.value.type === 'boolean'
    ? ({'=': '!=', '!=': '='} as Record<string, string>)[cond]
    : CONDITION_INVERSE[cond]
  if (!inverse) return null
  return conditionOptions.value.some(option => option.cond === inverse) ? inverse : null
})

const invertCondition = () => {
  if (inverseCondition.value) emit('setCondition', inverseCondition.value)
}

/** The "⋯" menu uses the app's context menu so it looks and behaves like every other one. */
const openRowMenu = (event: MouseEvent) => {
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  const content: ContextMenuEntry[] = []
  if (inverseCondition.value) {
    content.push({name: t('filters.invert_hint'), type: 'item', icon: 'swap-horizontal', action: invertCondition})
  }
  content.push({name: t('filters.duplicate_hint'), type: 'item', icon: 'content-copy', action: () => emit('duplicate')})
  if (hasValue.value) {
    content.push(
      {type: 'divider'},
      {name: t('filters.clear_value_hint'), type: 'item', icon: 'eraser', action: clearValue},
    )
  }
  contextMenuStore.showContextMenu({
    content,
    x: rect ? rect.right : event.clientX,
    y: rect ? rect.bottom + 4 : event.clientY,
  })
}

const hasValue = computed(() => {
  if (!is_value_required.value) return false
  const val = modelFilter.value.val
  if (Array.isArray(val)) return val.length > 0
  return val != null && val !== ''
})

const clearValue = () => {
  const val = modelFilter.value.val
  if (Array.isArray(val)) emit('setValue', [])
  else if (typeof val === 'string') emit('setValue', '')
  else emit('setValue', null)
}

const openFolderDialog = () => {
  if (is_locked.value) return
  folderDialog.value = true
}

const onFolderPicked = (paths: string[]) => {
  const folderPath = String(paths[0] || '').trim().replace(/[\\/]+$/, '')
  if (!folderPath) return
  emit('setValue', folderPath)
  if (condition.value !== 'under folder') {
    emit('setCondition', 'under folder')
  }
}

const onRegexApplied = (pattern: string) => {
  emit('setValue', pattern)
}

const setValue = (val: unknown) => {
  emit('setValue', val)
}

const toggleRemoved = () => {
  emit('remove')
}

const pickDate = () => {
  emit('pickDate')
}

const validate = () => {
  if (form.value) {
    form.value.validate()
  }
}

const setActiveValue = async (value: boolean | null) => {
  const next = value ?? false
  active.value = next
  emit('setActive', next)

  try {
    if (modelFilter.value.id != null) {
      await typedApi.updateFilterRow(modelFilter.value.id, {
        active: next,
      })
    }
  } catch (error) {
    console.error('Error toggling filter activation:', error)
  }
}

// Only a turned-off row reacts to a click (it turns on); other rows are not clickable at all.
const isMuted = computed(() => !active.value && !removed.value && !isDisabled.value)

// A condition saved as turned off shows as a muted row; a click on it turns it on.
// New conditions are always active, and the only way to drop one is to remove it.
const activateMuted = (event: MouseEvent) => {
  if (active.value || removed.value || isDisabled.value) return
  if ((event.target as HTMLElement | null)?.closest('button')) return
  setActiveValue(true)
}

const getConditionTitle = (type: string | null, condition: string | null) => {
  const conditions = getListCond(type)
  const item = conditions.find(i => i.cond == condition)
  return item ? getConditionText(item.text) : ''
}

const getConditionText = (conditionText?: string) => {
  const key = conditionText?.replaceAll(' ', '_')
  return key ? t(`filters.conditions.${key}`, conditionText ?? '') : ''
}

// Lifecycle
onMounted(() => {
  getParamData(parameter.value)
})
watch(valid, (val) => {
  emit('valid', val)
})

watch(() => modelFilter.value.active, (newValue) => {
  active.value = newValue
}, {immediate: true})

defineExpose({
  validate,
})
</script>
<style scoped>
.filter__title {
  font-weight: 400;
}

.filter--muted {
  cursor: pointer;
}

.filter__cond-text {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  font-size: 0.75rem;
  line-height: 1.2;
}

.filter__value-wrap {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.filter__number {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.filter__number-input {
  flex: 1 1 auto;
  min-width: 0;
}

.filter__hint-chip {
  flex: 0 0 auto;
}

/* Quick actions only exist in the top panel layout (FiltersPanel shows them). */
.filter__row-actions {
  display: none;
}

.filter__count {
  display: none;
}

.filter__restore {
  display: none;
}
</style>
