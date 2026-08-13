<template>
  <v-row class="mb-2 widget-total-stats" dense>
    <v-col
      v-for="card in cards"
      :key="card.id"
      cols="6"
      md="3"
    >
      <v-card class="rounded-lg card-total" color="primary" variant="tonal">
        <v-card-text class="card-total-content">
          <template v-if="loading">
            <div
              class="card-total-skel"
              aria-hidden="true"
            >
              <v-skeleton-loader type="heading" width="48%"/>
              <v-skeleton-loader type="text" width="36%" class="mt-1"/>
            </div>
          </template>
          <template v-else>
            <div class="card-total-value">
              {{ card.value }}
              <span v-if="card.unit" class="card-total-unit">{{ card.unit }}</span>
            </div>
            <div class="card-total-label">{{ card.label }}</div>
          </template>
          <v-icon class="icon">{{ card.icon }}</v-icon>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, type Ref} from "vue"
import {typedApi} from '@/services/typedApi'
import {getReadableFileSize} from '@/services/formatUtils'
import {useAppStore} from "@/stores/app"
import {useI18n} from 'vue-i18n'

const store = useAppStore()
const {t} = useI18n()

/* ---------------------- State ---------------------- */

const loading = ref(true)
const numberTags = ref(0)
const numberMetas = ref(0)
const numberFiles = ref(0)
const numberFilesize = ref(0)

const tweenedTags = ref(0)
const tweenedMetas = ref(0)
const tweenedFiles = ref(0)
const tweenedFilesize = ref(0)

const filesizeText = ref("")

/* ---------------------- Computed ---------------------- */

const animatedTags = computed(() => tweenedTags.value.toFixed(0))
const animatedMetas = computed(() => tweenedMetas.value.toFixed(0))
const animatedFiles = computed(() => tweenedFiles.value.toFixed(0))
const animatedFilesize = computed(() => tweenedFilesize.value.toFixed(2))

const cards = computed(() => [
  {
    id: 'tags',
    value: animatedTags.value,
    label: t('widgets.stats.tags'),
    icon: 'mdi-tag',
  },
  {
    id: 'metas',
    value: animatedMetas.value,
    label: t('widgets.stats.meta'),
    icon: 'mdi-shape',
  },
  {
    id: 'files',
    value: animatedFiles.value,
    label: t('widgets.stats.files'),
    icon: 'mdi-file',
  },
  {
    id: 'filesize',
    value: animatedFilesize.value,
    unit: filesizeText.value,
    label: t('widgets.stats.disk_space'),
    icon: 'mdi-harddisk',
  },
])

/* ---------------------- API ---------------------- */

async function getStats() {
  loading.value = true
  try {
    const [mediaRes, tagsRes] = await Promise.all([
      typedApi.getMediaStats(),
      typedApi.getTagCount(),
    ])

    numberFiles.value = mediaRes.data.total
    numberTags.value = tagsRes.data.count

    const readable = getReadableFileSize(mediaRes.data.filesize, true)
    numberFilesize.value = Number(readable.number)
    filesizeText.value = readable.text
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function animate(refValue: Ref<number>, tweened: { value: number }) {
  const {gsap} = await import('gsap')
  gsap.to(tweened, {duration: 1, value: refValue.value, ease: "power2.out"})
}

watch(numberTags, () => animate(numberTags, tweenedTags))
watch(numberMetas, () => animate(numberMetas, tweenedMetas))
watch(numberFiles, () => animate(numberFiles, tweenedFiles))
watch(numberFilesize, () => animate(numberFilesize, tweenedFilesize))

/* ---------------------- Mounted ---------------------- */

watch(() => store.meta.length, (value) => {
  numberMetas.value = value
}, {immediate: true})

onMounted(async () => {
  await getStats()
})
</script>

<style lang="scss" scoped>
.widget-total-stats {
  .card-total {
    height: 100%;
    position: relative;
    isolation: isolate;
    overflow: hidden;
  }

  .card-total-content {
    position: relative;
    padding: 10px 12px !important;
    min-height: 64px;
  }

  .card-total-value {
    position: relative;
    z-index: 2;
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.2;
    padding-right: 28px;
  }

  .card-total-unit {
    font-size: 0.75rem;
    font-weight: 500;
    margin-left: 2px;
  }

  .card-total-label {
    position: relative;
    z-index: 2;
    margin-top: 2px;
    font-size: 0.75rem;
    line-height: 1.2;
    opacity: 0.85;
    padding-right: 28px;
  }

  .icon {
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: 1;
    opacity: 0.22;
    font-size: 22px;
    pointer-events: none;
  }

  .card-total-skel {
    position: relative;
    z-index: 2;
    padding-right: 28px;

    :deep(.v-skeleton-loader) {
      background: transparent !important;
      padding: 0 !important;
    }

    :deep(.v-skeleton-loader__bone) {
      margin-block: 2px;
    }
  }
}
</style>
