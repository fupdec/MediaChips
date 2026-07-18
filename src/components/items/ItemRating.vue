<template>
  <v-rating
    v-model="rating"
    active-color="yellow-darken-2"
    color="#eee"
    class="rating"
    empty-icon="mdi-star-outline"
    half-icon="mdi-star-half-full"
    density="compact"
    half-increments
    hover
    clearable
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {typedApi} from '@/services/typedApi'
import { useItemsStore } from '@/stores/items'
import type {MediaItem, Tag} from '@/types/stores'

const props = defineProps<{
  item: MediaItem | Tag
  type: 'media' | 'tag'
}>()

const itemsStore = useItemsStore()

const rating = ref(props.item.rating as number | undefined)

// Keep stars in sync when the item is refreshed after dialog save / refetch.
watch(
  () => props.item.rating,
  (val) => {
    if (rating.value !== val) {
      rating.value = val as number | undefined
    }
  },
)

watch(rating, async (val) => {
  if (val === props.item.rating) return

  try {
    await typedApi.updateEntity(props.type, props.item.id, { rating: val })

    itemsStore.updateItemField({
      id: props.item.id,
      field: 'rating',
      value: val,
    })
  } catch (error) {
    console.error('Error updating rating:', error)
    rating.value = props.item.rating as number | undefined
  }
})
</script>
