<template>
  <v-rating
    @update:model-value="setVal"
    :model-value="internalValue"
    :readonly="read_only"
    :length="meta?.ratingMax"
    :full-icon="fullIcon"
    :empty-icon="emptyIcon"
    :half-increments="meta?.ratingHalf"
    :half-icon="halfIcon"
    :active-color="meta?.ratingColor"
    :size="size"
    color="grey"
    density="compact"
    :class="{ 'in-card': in_card }"
    clearable
    hover
  ></v-rating>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import type {RatingMeta} from '@/types/metaInput'
import type {Meta} from '@/types/stores'

const props = withDefaults(defineProps<{
  modelValue?: number | string
  meta_id: number
  read_only?: boolean
  in_card?: boolean
  size?: string | number
}>(), {
  modelValue: 0,
  read_only: false,
  in_card: false,
  size: undefined,
})

const emit = defineEmits<{
  'update:model-value': [value: number | string | null]
}>()

const metaStore = useAppStore().meta
const meta = ref<RatingMeta>({} as RatingMeta)

const internalValue = computed(() => props.modelValue || 0)

const fullIcon = computed(() => `mdi-${meta.value?.ratingIcon || 'star'}`)

const emptyIcon = computed(() => {
  const icon = meta.value?.ratingIconEmpty || meta.value?.ratingIcon || 'star'
  return `mdi-${icon}`
})

const halfIcon = computed(() => {
  const icon = meta.value?.ratingIconHalf || meta.value?.ratingIcon || 'star'
  return `mdi-${icon}`
})

const setVal = (val: number | string | null) => {
  emit('update:model-value', val)
}

const getMeta = async () => {
  if (!props.meta_id) return

  try {
    const metaFromStore = metaStore.find((m: Meta) => m.id === props.meta_id)

    if (metaFromStore) {
      meta.value = metaFromStore as RatingMeta
    } else {
      const response = await typedApi.getMetaById(props.meta_id)
      meta.value = response.data
    }
  } catch (error) {
    console.error('Error fetching meta:', error)
  }
}

onMounted(() => {
  getMeta()
})

watch(() => props.meta_id, (newId) => {
  if (newId) {
    getMeta()
  }
})
</script>
