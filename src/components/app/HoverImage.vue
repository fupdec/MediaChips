<template>
  <div
    v-show="hover.show && !contextMenuVisible"
    class="hover-image"
    :style="style"
  >
    <img v-if="src" :src="src" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import path from 'path-browserify'

import { useAppStore } from '@/stores/app'
import { buildLocalFileUrl } from '@/services/fileService'
import { useContextMenu } from '@/stores/contextMenu'
import { getCachedThumb, isPersistentThumbUrl, mediaThumbKey, tagThumbKey } from '@/utils/thumbDisplayCache'

const appStore = useAppStore()
const contextMenuStore = useContextMenu()
const hover = useAppStore().hover

const src = ref<string | null>(null)
let loadToken = 0

const contextMenuVisible = computed(
  () => contextMenuStore.show,
)

const style = computed(() => ({
  top: `${hover.y + 30}px`,
  left: `${hover.x + 30}px`,
  width: `${hover.previewWidth || 160}px`,
  height: `${hover.previewHeight || 160}px`,
}))

const resolveHoverImageUrl = (): string | null => {
  if (!hover?.tagId) return null

  if (hover.data_type === 'media') {
    const cached = getCachedThumb(mediaThumbKey('videos', hover.tagId))
    if (isPersistentThumbUrl(cached)) return cached!

    const imgPath = path.join(
      appStore.dbPath,
      'media',
      'videos',
      'thumbs',
      `${hover.tagId}.jpg`,
    )

    return buildLocalFileUrl(imgPath)
  }

  for (const variant of ['avatar', 'main'] as const) {
    if (hover.metaId == null) continue

    const cached = getCachedThumb(tagThumbKey(hover.metaId, hover.tagId, variant))
    if (isPersistentThumbUrl(cached)) return cached!
  }

  if (hover.metaId == null) return null

  return buildLocalFileUrl(path.join(
    appStore.dbPath,
    'meta',
    String(hover.metaId),
    `${hover.tagId}_avatar.jpg`,
  ))
}

async function getHoveredImage() {
  const token = ++loadToken
  const nextSrc = resolveHoverImageUrl()

  if (token !== loadToken) return

  if (!nextSrc) {
    src.value = null
    return
  }

  if (src.value !== nextSrc) {
    src.value = nextSrc
  }
}

watch(
  () => [hover.tagId, hover.metaId, hover.data_type, hover.show] as const,
  ([, , , visible]) => {
    if (!visible) {
      loadToken += 1
      src.value = null
      return
    }

    void getHoveredImage()
  },
)
</script>
