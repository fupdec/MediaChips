<template>
  <v-autocomplete
    v-bind="attrs"
    @update:model-value="setVal"
    :model-value="modelValue"
    :items="countries"
    :custom-filter="filterCountryForAutocomplete"
    :rules="[rules]"
    :disabled="disabled"
    :prepend-icon="showIcons && !purpose ? 'mdi-flag' : undefined"
    :label="fieldLabel"
    :placeholder="fieldPlaceholder"
    :persistent-placeholder="Boolean(fieldPlaceholder)"
    :hide-details="fieldHideDetails"
    :rounded="view.rounded"
    :variant="fieldVariant"
    :density="fieldDensity"
    :append-icon="undefined"
    :menu-props="countryMenuProps"
    item-text="name"
    item-value="name"
    ref="field"
    class="val"
    hide-selected
    multiple
    clearable
    chips
    closable-chips
  >
    <template v-slot:chip="{ item }">
      <v-chip
        @click:close="remove(item)"
        :class="purpose === 'filter' ? 'pl-0 ma-0 filter-form-chip' : 'pl-0 country-field-chip'"
        label
        :size="purpose === 'filter' ? 'x-small' : 'small'"
        closable
        close-icon="mdi-close"
      >
        <country-flag :country="item.raw.code" size="normal" class="lang-flag"/>
        <span>{{ item.value }}</span>
      </v-chip>
    </template>

    <template v-slot:item="{ props: itemProps, item }">
      <v-list-item
        v-bind="itemProps"
        density="compact"
        class="country-dropdown__item"
      >
        <template #title>
          <span class="country-dropdown__row">
            <span class="country-dropdown__flag">
              <country-flag
                :country="item.raw.code"
                size="small"
                class="lang-flag"
              />
            </span>
            <span>{{ item.raw.name }}</span>
          </span>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, useAttrs} from 'vue'
import {foundByChars} from '@/services/formatUtils'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import CountryFlag from '@/components/ui/CountryFlagLazy.vue'
import Countries from '@/assets/Countries'
import type {CountryEntry} from '@/types/metaInput'

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  modelValue?: string[]
  purpose?: string
  cond?: string | null
  disabled?: boolean
}>(), {
  modelValue: () => [],
  purpose: '',
  cond: null,
  disabled: false,
})

const emit = defineEmits<{
  'update:model-value': [value: string[]]
}>()

const settingsStore = useSettingsStore()
const {t} = useI18n()

interface AutocompleteFieldInstance {
  lazySearch?: string | null
}

interface CountryListItem {
  raw: CountryEntry
  value: string
}

const field = ref<AutocompleteFieldInstance | null>(null)
const val = ref<string[]>([])
const countries = ref<CountryEntry[]>(Countries as CountryEntry[])

const view = ref({
  persistentHint: true,
  hideDetails: false,
  filled: false,
  rounded: false,
  dense: false,
  hideIcon: false,
})

const showIcons = computed(() =>
  settingsStore.showIconsOfMetaInEditingDialog === '1'
)

const fieldDensity = computed(() => {
  if (attrs.density === 'default' || attrs.density === 'comfortable' || attrs.density === 'compact') {
    return attrs.density
  }
  return view.value.dense ? 'compact' : 'default'
})

const countryMenuProps = computed(() => {
  const extra = (attrs.menuProps || attrs['menu-props']) as Record<string, unknown> | undefined
  const extraClass = typeof extra?.contentClass === 'string' ? extra.contentClass : ''
  return {
    zIndex: 2800,
    maxHeight: 400,
    ...extra,
    contentClass: ['custom-list', 'ac-dropdown', 'country-dropdown', extraClass].filter(Boolean).join(' '),
  }
})

const fieldLabel = computed(() => {
  if (props.purpose === 'filter') return ''
  const fromAttrs = attrs.label
  if (typeof fromAttrs === 'string') return fromAttrs || undefined
  if (typeof attrs.placeholder === 'string' && attrs.placeholder) return undefined
  return t('meta.default_names.country')
})

const fieldPlaceholder = computed(() => {
  if (typeof attrs.placeholder === 'string' && attrs.placeholder) return attrs.placeholder
  return undefined
})

const fieldVariant = computed(() => {
  if (attrs.variant === 'filled' || attrs.variant === 'outlined' || attrs.variant === 'solo' || attrs.variant === 'plain' || attrs.variant === 'underlined') {
    return attrs.variant
  }
  return view.value.filled ? 'filled' : 'outlined'
})

const fieldHideDetails = computed(() => {
  if (props.purpose) return true
  const fromAttrs = attrs.hideDetails ?? attrs['hide-details']
  if (fromAttrs === '' || fromAttrs === true) return true
  return Boolean(fromAttrs)
})

const typingFiltersDefault = computed(() =>
  settingsStore.typingFiltersDefault === '1'
)

const setVal = (newVal: string[]) => {
  if (field.value) {
    field.value.lazySearch = null
  }
  val.value = newVal
  emit('update:model-value', newVal)
}

const remove = (country: CountryListItem) => {
  const name = country.value ?? country.raw.name
  const index = val.value.indexOf(name)
  if (index > -1) {
    const newVal = [...val.value]
    newVal.splice(index, 1)
    setVal(newVal)
  }
}

const filterCountry = (title: string, queryText: string, item: CountryListItem) => {
  const countryName = item.raw.name.toLowerCase()
  const code = item.raw.code.toLowerCase()
  const query = queryText.toLowerCase()

  if (typingFiltersDefault.value) {
    return countryName.includes(query) || code.includes(query)
  }
  return foundByChars(countryName, query) || foundByChars(code, query)
}

const filterCountryForAutocomplete = filterCountry as (
  value: string,
  query: string,
  item?: CountryListItem,
) => boolean

const rules = () => {
  if (props.purpose !== 'filter') return true
  if (val.value !== null && val.value.length > 0) return true
  if (props.cond === 'is null' || props.cond === 'null') return true
  return 'Value is required'
}

onMounted(() => {
  if (props.purpose === 'filter') {
    view.value = {
      persistentHint: false,
      hideDetails: true,
      filled: true,
      rounded: true,
      dense: true,
      hideIcon: true,
    }
  }

  val.value = props.modelValue
})

watch(() => props.modelValue, (newVal) => {
  val.value = newVal
}, { immediate: true })

defineExpose({
  setVal,
  remove,
})
</script>

<style scoped>
.lang-flag {
  display: block;
  line-height: 0;
}

.country-dropdown__row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 25px;
}

.country-dropdown__flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 17px;
  overflow: hidden;
  flex-shrink: 0;
  line-height: 0;
}
</style>