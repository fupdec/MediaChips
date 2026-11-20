<template>
  <div class="meta-card-preview">
    <div class="meta-card-preview__heading text-caption text-medium-emphasis">
      {{ t('meta.settings.preview_title') }}
    </div>

    <div class="meta-card-preview__card">
      <div class="meta-card-preview__thumb">
        <v-icon size="34" color="primary">mdi-{{ icon }}</v-icon>
      </div>
      <div class="meta-card-preview__body">
        <div class="meta-card-preview__title text-body-2 font-weight-medium text-truncate">{{ title }}</div>

        <div
          v-for="(field, index) in shownFields"
          :key="field.id"
          class="meta-card-preview__field"
          :class="{'meta-card-preview__field--hidden': field.hidden}"
        >
          <v-icon size="14" class="meta-card-preview__field-icon">mdi-{{ field.icon || 'shape' }}</v-icon>
          <span class="meta-card-preview__label text-caption">{{ field.name }}</span>

          <template v-for="sample in [sampleFor(field)]" :key="sample.kind">
            <span v-if="sample.kind === 'chips'" class="meta-card-preview__chips">
              <span v-for="chip in sample.items" :key="chip" class="meta-card-preview__chip">{{ chip }}</span>
            </span>
            <span v-else-if="sample.kind === 'rating'" class="meta-card-preview__stars">
              <v-icon v-for="n in 5" :key="n" size="12">{{ n <= sample.value ? 'mdi-star' : 'mdi-star-outline' }}</v-icon>
            </span>
            <v-icon v-else-if="sample.kind === 'boolean'" size="14" color="primary">mdi-check-circle</v-icon>
            <span v-else-if="sample.kind === 'text'" class="meta-card-preview__text text-caption">{{ sample.value }}</span>
            <span
              v-else
              class="meta-card-preview__value"
              :style="{width: valueWidths[index % valueWidths.length]}"
            />
          </template>

          <v-icon v-if="field.hidden" size="13" class="meta-card-preview__eye text-medium-emphasis">mdi-eye-off-outline</v-icon>
        </div>

        <div v-if="!shownFields.length" class="meta-card-preview__empty text-caption text-medium-emphasis">
          {{ t('meta.settings.preview_empty') }}
        </div>
      </div>
    </div>

    <v-btn
      v-if="hiddenCount"
      class="meta-card-preview__toggle mt-3"
      size="small"
      variant="tonal"
      color="primary"
      rounded="lg"
      block
      :prepend-icon="showHidden ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
      @click="showHidden = !showHidden"
    >
      {{ showHidden ? t('meta.settings.preview_hide_hidden') : t('meta.settings.preview_show_hidden', {count: hiddenCount}) }}
    </v-btn>

    <div class="text-caption text-medium-emphasis mt-2">
      {{ t('meta.settings.preview_hint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import orderBy from 'lodash/orderBy'
import {useAppStore} from '@/stores/app'

export interface MetaCardPreviewField {
  id: number
  icon?: string
  name?: string
  type?: string
  hidden?: boolean
}

type PreviewSample =
  | {kind: 'chips'; items: string[]}
  | {kind: 'rating'; value: number}
  | {kind: 'boolean'}
  | {kind: 'text'; value: string}
  | {kind: 'skeleton'}

const props = withDefaults(defineProps<{
  icon?: string
  title?: string
  fields?: MetaCardPreviewField[]
}>(), {
  icon: 'shape',
  title: '',
  fields: () => [],
})

const {t} = useI18n()
const appStore = useAppStore()
const valueWidths = ['62%', '44%', '72%', '52%', '38%']
const showHidden = ref(false)

const hiddenCount = computed(() => props.fields.filter((field) => field.hidden).length)
const shownFields = computed(() =>
  showHidden.value ? props.fields : props.fields.filter((field) => !field.hidden)
)

// Real tag names of the category (most viewed first); falls back to "<name> 1, 2".
const sampleTags = (field: MetaCardPreviewField): string[] => {
  const tags = (appStore.tags || []).filter((tag) => Number(tag.metaId) === Number(field.id) && tag.name)
  const top = orderBy(tags, [(tag) => Number(tag.views) || 0], ['desc']).slice(0, 3)
  if (top.length) return top.map((tag) => String(tag.name))
  const base = field.name || ''
  return [`${base} 1`, `${base} 2`]
}

const sampleFor = (field: MetaCardPreviewField): PreviewSample => {
  switch (field.type) {
    case 'array':
      return {kind: 'chips', items: sampleTags(field)}
    case 'number':
      return {kind: 'text', value: String(60 + ((Number(field.id) * 37) % 120))}
    case 'date':
      return {kind: 'text', value: '2024-05-12'}
    case 'rating':
      return {kind: 'rating', value: 4}
    case 'boolean':
      return {kind: 'boolean'}
    default:
      return {kind: 'skeleton'}
  }
}
</script>
