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
      :class="{ active: active, removed: removed, disabled: isDisabled }"
      :disabled="isDisabled"
      :variant="active ? 'text' : 'flat'"
      :elevation="active ? undefined : 0"
    >
      <div class="d-flex align-center justify-space-between filter__header">
        <div class="d-flex align-center min-width-0 filter__title_block">
          <v-btn
            @click="toggleRemoved"
            color="error"
            class="mr-2 flex-shrink-0"
            icon
            size="small"
            :title="removed ? t('common.restore') : t('common.remove')"
            :variant="removed?'text':'plain'"
          >
            <v-icon v-if="removed"
              size="20"
              color="error">mdi-close-circle
            </v-icon>
            <v-icon v-else
              size="20"
              color="grey">mdi-close
            </v-icon>
          </v-btn>

          <div class="d-flex align-center min-width-0 filter__title_content">
            <v-icon size="small" class="flex-shrink-0 filter__icon">mdi-{{ icon }}</v-icon>
            <div class="text-body-2 filter__title">{{ title }}</div>
          </div>
        </div>

        <div class="d-flex align-center flex-shrink-0 filter__actions">
          <v-select
            v-if="filter.active"
            @update:model-value="setCondition"
            :model-value="condition"
            :items="getListCond(filter.type)"
            :rules="[(v) => !!v || t('validation.condition_required')]"
            item-value="cond"
            class="filter__cond mt-0 pt-0"
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
              <v-icon :icon="`mdi-${item.raw.icon}`"
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

          <v-switch
            :model-value="active"
            @update:model-value="setActiveValue"
            :disabled="isDisabled"
            color="success"
            density="compact"
            hide-details
            inset
            class="filter__switch"
          />
        </div>
      </div>

      <div v-if="showsFilterValue" class="filter__body">
        <v-text-field
          v-if="is_value_required && (filter.type === 'string' || filter.type === null)"
          v-model="filterValue"
          :disabled="is_locked || !is_value_required"
          class="ma-1 pt-0"
          hide-details
          density="compact"
          variant="outlined"
          rounded
        />

        <v-text-field
          v-if="filter.type === 'number' && parameter !== 'rating'"
          :model-value="filterValue"
          @update:model-value="setValue"
          :disabled="is_locked || !is_value_required"
          type="number"
          class="ma-1 pt-0"
          hide-details
          density="compact"
          variant="outlined"
          rounded
        >
          <template v-slot:append>
            <span
              v-if="parameter === 'filesize'"
              class="mr-2"
              style="white-space: nowrap;"
              v-html="getReadableFileSize(filterValNumber)"
            ></span>
            <span
              v-if="parameter === 'duration'"
              class="mr-2"
              style="white-space: nowrap;"
              v-html="getReadableDuration(filterValNumber)"
            ></span>
          </template>
        </v-text-field>

        <v-rating
          v-if="parameter === 'rating' && filter.type !== 'rating'"
          @update:model-value="setValue"
          :model-value="filterValNumber"
          color="yellow-darken-2"
          background-color="grey-lighten-1"
          empty-icon="mdi-star-outline"
          half-icon="mdi-star-half-full"
          density="compact"
          half-increments
          clearable
          hover
        />

        <MetaInputRating
          v-if="filter.type === 'rating'"
          @update:model-value="setValue"
          :model-value="filterValNumber"
          :meta_id="metaIdParam"
        ></MetaInputRating>

        <v-text-field
          v-if="filter.type === 'date'"
          @click="pickDate"
          :model-value="filterValString"
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
          class="pa-1"
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
          class="pa-1">
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
          class="pa-1">
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
          />
        </div>
      </div>
    </v-card>
  </v-form>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue'
import type { PropType } from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import find from 'lodash/find'
import {useItemsStore} from '@/stores/items'
import type { FilterObject, FilterListParam } from '@/types/common'
import type { VForm } from 'vuetify/components'
import {
  getListCond,
  getReadableDuration,
  getReadableFileSize,
} from '@/services/formatUtils'
import MetaInputArray from '@/components/meta/input/MetaInputArray.vue'
import MetaInputCountry from '@/components/meta/input/MetaInputCountry.vue'
import MetaInputRating from '@/components/meta/input/MetaInputRating.vue'

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
  }
})

// Emits
const emit = defineEmits([
  'setCondition',
  'setValue',
  'remove',
  'pickDate',
  'setActive',
  'valid'
])

// Reactive state
const form = ref<VForm | null>(null)
const valid = ref(false)
const active = ref(false)
const icon = ref('shape')
const title = ref('')

// Stores and composables
const itemsStore = useItemsStore()
const {t} = useI18n()

// Computed properties
const modelFilter = computed(() => props.filter)
const removed = computed(() => modelFilter.value.removed)
const parameter = computed(() => modelFilter.value.param)
const condition = computed(() => modelFilter.value.cond)
const is_locked = computed(() => modelFilter.value.lock)
const isDisabled = computed(() => !!(is_locked.value || (itemsStore.environment.media_type_id && itemsStore.find_duplicates)))
const metaIdParam = computed(() => {
  const param = parameter.value
  return typeof param === 'number' ? param : Number(param)
})
const filterValNumber = computed(() => Number(modelFilter.value.val))
const filterValArray = computed(() => Array.isArray(modelFilter.value.val) ? modelFilter.value.val : [])
const filterValString = computed(() => modelFilter.value.val == null ? '' : String(modelFilter.value.val))
const paramAsString = computed(() => String(parameter.value ?? ''))
const is_value_required = computed(() => !['is null', 'not null'].includes(condition.value ?? ''))

const showsFilterValue = computed(() => {
  if (!active.value || !is_value_required.value) return false

  const type = modelFilter.value.type
  const param = parameter.value

  if (type === 'boolean') return false

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