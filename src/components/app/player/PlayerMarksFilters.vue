<template>
  <v-chip-group v-model="marksType" color="primary" column multiple>
    <v-chip value="favorite" size="small" variant="tonal" filter>
      <v-icon icon="mdi-heart" size="small" start/>
      {{ t('meta.default_names.favorite') }}
    </v-chip>
    <v-chip value="bookmark" size="small" variant="tonal" filter>
      <v-icon icon="mdi-bookmark" size="small" start/>
      {{ t('meta.default_names.bookmark') }}
    </v-chip>
    <v-chip value="scene" size="small" variant="tonal" filter>
      <v-icon icon="mdi-movie-open-outline" size="small" start/>
      {{ t('player.auto_chapters') }}
    </v-chip>
    <v-chip
      v-for="i in assignedWithMeta"
      :key="i.meta!.id"
      :value="i.meta!.id"
      size="small"
      variant="tonal"
      filter
      :prepend-icon="`mdi-${i.meta!.icon}`"
      :text="i.meta!.name"
    />
  </v-chip-group>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {AssignedMeta} from '@/types/stores'

const props = defineProps<{
  assigned?: AssignedMeta[]
}>()

const assignedWithMeta = computed(() =>
  (props.assigned ?? []).filter((entry): entry is AssignedMeta & { meta: NonNullable<AssignedMeta['meta']> } =>
    Boolean(entry.meta),
  ),
)

const marksType = defineModel<Array<number | string>>({
  default: () => ['favorite', 'bookmark', 'scene'],
})

const {t} = useI18n()
</script>
