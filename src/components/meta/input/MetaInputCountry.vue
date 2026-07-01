<template>
  <v-autocomplete
    v-bind="attrs"
    @update:model-value="setVal"
    :model-value="modelValue"
    :items="countries"
    :custom-filter="filterCountryForAutocomplete"
    :rules="[rules]"
    :disabled="disabled"
    :prepend-icon="showIcons && !purpose ? 'mdi-flag' : ''"
    :label="purpose === 'filter' ? '' : 'Country'"
    :hide-details="purpose ? true : false"
    :rounded="view.rounded"
    :variant="view.filled ? 'filled' : 'outlined'"
    :density="view.dense ? 'compact' : 'default'"
    :append-icon="view.hideIcon ? '' : 'mdi-chevron-down'"
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
        class="pl-0 ma-1"
        label
        size="small"
        closable
      >
        <country-flag :country="item.raw.code" size="normal" class="lang-flag"/>
        <span>{{ item.value }}</span>
      </v-chip>
    </template>

    <template v-slot:item="{ props, item }">
      <v-list-item v-bind="props" density="compact">
        <template v-slot:prepend>
          <country-flag :country="item.raw.code" size="normal" class="lang-flag  mr-1"/>
        </template>
        <template v-slot:title>
          {{ item.raw.name }}
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, useAttrs} from 'vue'
import {foundByChars} from '@/services/formatUtils'
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
  settingsStore.showIconsInsteadTextOnFiltersChips === '1'
)

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
  display: inline-block;
  vertical-align: middle;
}
</style>