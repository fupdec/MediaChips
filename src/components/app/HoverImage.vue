<template>
  <div
    v-show="hover.show && !contextMenuVisible"
    class="hover-image"
    :style="style"
  >
    <div class="hover-image__media">
      <img
        v-if="src"
        :key="src"
        :src="src"
        alt=""
        @load="onLoad"
        @error="onError"
      />
      <div
        v-else-if="loading"
        class="hover-image__placeholder"
      >
        <v-progress-circular
          indeterminate
          size="28"
          width="2"
          color="primary"
        />
      </div>
      <div
        v-else
        class="hover-image__placeholder"
      >
        <v-icon
          icon="mdi-image-off-outline"
          size="36"
          color="medium-emphasis"
        />
      </div>
    </div>
    <div
      v-if="hover.label"
      class="hover-image__label"
      :title="hover.label"
    >
      {{ hover.label }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

import { useAppStore } from '@/stores/app'
import { useContextMenu } from '@/stores/contextMenu'
import { getTagHoverPreviewDimensions } from '@/services/formatUtils'
import {
  getTagHoverThumbCandidates,
  isThumbUnavailable,
  resolveMediaThumbDisplayUrl,
  type TagHoverThumbCandidate,
} from '@/utils/thumbSource'
import { getCachedThumb, mediaThumbKey } from '@/utils/thumbDisplayCache'

const appStore = useAppStore()
const contextMenuStore = useContextMenu()
const hover = appStore.hover

const src = ref<string | null>(null)
const loading = ref(false)
const candidates = ref<TagHoverThumbCandidate[]>([])
const candidateIndex = ref(0)
let loadToken = 0

const contextMenuVisible = computed(
  () => contextMenuStore.show,
)

const style = computed(() => ({
  top: `${hover.y + 30}px`,
  left: `${hover.x + 30}px`,
  width: `${hover.previewWidth || 180}px`,
  '--hover-media-height': `${hover.previewHeight || 180}px`,
}))

const resolveHoverCandidates = (): TagHoverThumbCandidate[] => {
  if (!hover.tagId) return []

  if (hover.data_type === 'media') {
    const cached = getCachedThumb(mediaThumbKey('videos', hover.tagId))
    if (cached && !isThumbUnavailable(cached)) {
      return [{type: 'thumb', url: cached}]
    }

    const url = resolveMediaThumbDisplayUrl(
      appStore.mediaPath,
      'videos',
      hover.tagId,
    )
    return url && !isThumbUnavailable(url) ? [{type: 'thumb', url}] : []
  }

  if (hover.metaId == null) return []

  return getTagHoverThumbCandidates({
    dbPath: appStore.dbPath,
    metaId: hover.metaId,
    tagId: hover.tagId,
  })
}

function updatePreviewDimensions(thumbType: string) {
  const {previewWidth, previewHeight} = getTagHoverPreviewDimensions(
    thumbType,
    hover.imageAspectRatio,
  )
  hover.previewWidth = previewWidth
  hover.previewHeight = previewHeight
}

function applyCandidate() {
  const candidate = candidates.value[candidateIndex.value]
  const nextSrc = candidate?.url ?? null
  loading.value = Boolean(nextSrc)
  src.value = nextSrc

  if (candidate && hover.data_type !== 'media') {
    updatePreviewDimensions(candidate.type)
  }
}

function resetHoverImage() {
  loadToken += 1
  candidates.value = []
  candidateIndex.value = 0
  src.value = null
  loading.value = false
}

function getHoveredImage() {
  const token = ++loadToken
  const nextCandidates = resolveHoverCandidates()

  if (token !== loadToken) return

  candidates.value = nextCandidates
  candidateIndex.value = 0
  applyCandidate()
}

function onLoad() {
  loading.value = false
}

function onError() {
  if (candidateIndex.value < candidates.value.length - 1) {
    candidateIndex.value += 1
    applyCandidate()
    return
  }

  loading.value = false
  src.value = null
}

watch(
  () => [hover.tagId, hover.metaId, hover.data_type, hover.show] as const,
  ([, , , visible]) => {
    if (!visible) {
      resetHoverImage()
      return
    }

    void getHoveredImage()
  },
)
</script>
