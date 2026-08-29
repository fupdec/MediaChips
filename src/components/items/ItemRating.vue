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

// Keep stars in sync when the item is refreshed after dialog save / refetch,
// and when the same component instance is reused for another card.
watch(
  () => [props.item.id, props.item.rating] as const,
  ([, val]) => {
    if (rating.value !== val) {
      rating.value = val as number | undefined
    }
  },
)

watch(rating, async (val) => {
  const itemId = props.item.id
  if (val === props.item.rating) return

  try {
    await typedApi.updateEntity(props.type, itemId, { rating: val })

    // Drop the update if the card was rebound while the request was in flight.
    if (props.item.id !== itemId) return

    itemsStore.updateItemField({
      id: itemId,
      field: 'rating',
      value: val,
    })
  } catch (error) {
    console.error('Error updating rating:', error)
    if (props.item.id === itemId) {
      rating.value = props.item.rating as number | undefined
    }
  }
})
</script>
