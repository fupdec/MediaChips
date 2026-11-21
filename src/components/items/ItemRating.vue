<template>
  <div
    class="rating v-rating item-rating-native"
    role="slider"
    tabindex="0"
    :aria-label="t('meta.default_names.rating')"
    :aria-valuenow="Number(rating) || 0"
    aria-valuemin="0"
    aria-valuemax="5"
    :aria-valuetext="`${Number(rating) || 0} / 5`"
    @keydown="onKeyDown"
    @click.stop
    @dblclick.stop
    @mouseleave="hoverRating = null"
  >
    <span
      v-for="star in 5"
      :key="star"
      aria-hidden="true"
      class="item-rating-native__star"
      :class="{'item-rating-native__star--filled': displayedRating > star - 1}"
      @mouseenter="hoverRating = star"
      @click.stop="onStarClick($event, star)"
    >
      <i class="v-icon mdi" :class="displayedRating >= star ? 'mdi-star' : displayedRating >= star - 0.5 ? 'mdi-star-half-full' : 'mdi-star-outline'"/>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import { useItemsStore } from '@/stores/items'
import type {MediaItem, Tag} from '@/types/stores'

const props = defineProps<{
  item: MediaItem | Tag
  type: 'media' | 'tag'
}>()

const itemsStore = useItemsStore()
const {t} = useI18n()
const hoverRating = ref<number | null>(null)
const displayedRating = computed(() => hoverRating.value ?? (Number(rating.value) || 0))

function onStarClick(event: MouseEvent, star: number) {
  const target = event.currentTarget as HTMLElement
  target.parentElement?.focus({preventScroll: true})
  const rect = target.getBoundingClientRect()
  const next = event.clientX - rect.left < rect.width / 2 ? star - 0.5 : star
  rating.value = Number(rating.value) === next ? 0 : next
  hoverRating.value = null
}

function onKeyDown(event: KeyboardEvent) {
  const current = Number(rating.value) || 0
  let next: number
  switch (event.key) {
    case 'ArrowRight': case 'ArrowUp': next = current + 0.5; break
    case 'ArrowLeft': case 'ArrowDown': next = current - 0.5; break
    case 'Home': case 'Delete': case 'Backspace': next = 0; break
    case 'End': next = 5; break
    default: return
  }
  event.preventDefault()
  event.stopPropagation()
  rating.value = Math.min(5, Math.max(0, next))
}

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

<style scoped>
.item-rating-native {
  display: inline-flex;
  align-items: center;
  gap: var(--item-rating-star-gap, 1px);
  width: max-content;
  line-height: 1;
}
.item-rating-native:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 4px;
}
.item-rating-native__star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--item-rating-icon, 20px);
  height: var(--item-rating-icon, 20px);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--item-rating-favorite-muted-color, #eee);
  cursor: pointer;
}
.item-rating-native__star--filled { color: #fbc02d; }
.item-rating-native__star .v-icon {
  font-size: var(--item-rating-icon, 20px);
  width: var(--item-rating-icon, 20px);
  height: var(--item-rating-icon, 20px);
  text-shadow: var(--item-rating-favorite-icon-shadow, none);
}
</style>
