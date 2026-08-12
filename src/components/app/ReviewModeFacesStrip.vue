<template>
  <div
    v-if="faces.length"
    class="review-faces"
  >
    <div class="review-faces__label text-caption text-medium-emphasis">
      {{ t('review_mode.faces', {count: faces.length}) }}
    </div>
    <div class="review-faces__row">
      <button
        v-for="face in faces"
        :key="String(face.id)"
        type="button"
        class="review-faces__item"
        :title="faceTitle(face)"
        @click="emit('open')"
      >
        <img
          v-if="cropUrl(face)"
          :src="cropUrl(face)"
          alt=""
          class="review-faces__img"
        >
        <v-icon
          v-else
          size="20"
          color="white"
        >
          mdi-face-recognition
        </v-icon>
        <span
          v-if="face.tagName"
          class="review-faces__tag"
        >
          {{ face.tagName }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import path from 'path-browserify'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl} from '@/services/fileService'

type ReviewFace = {
  id: number
  cropPath?: string | null
  tagName?: string | null
  clusterRepresentative?: boolean
  clusterSize?: number
  score?: number
}

const props = defineProps<{
  mediaId: number | null
  dbPath: string
}>()

const emit = defineEmits<{
  open: []
}>()

const {t} = useI18n()
const faces = ref<ReviewFace[]>([])
let loadToken = 0

function normalizeFaces(raw: Array<Record<string, unknown>> | undefined): ReviewFace[] {
  const list = (raw || [])
    .map((entry) => ({
      id: Number(entry.id),
      cropPath: entry.cropPath ? String(entry.cropPath) : null,
      tagName: entry.tagName ? String(entry.tagName) : null,
      clusterRepresentative: Boolean(entry.clusterRepresentative),
      clusterSize: Number(entry.clusterSize) || 1,
      score: Number(entry.score) || 0,
    }))
    .filter((entry) => Number.isFinite(entry.id) && entry.id > 0)

  const reps = list.filter((face) => face.clusterRepresentative)
  const source = reps.length ? reps : list
  return [...source]
    .sort((a, b) => (b.clusterSize - a.clusterSize) || (b.score - a.score))
    .slice(0, 12)
}

function cropUrl(face: ReviewFace): string {
  if (!face.cropPath || !props.dbPath) return ''
  return buildLocalFileUrl(path.join(props.dbPath, face.cropPath))
}

function faceTitle(face: ReviewFace): string {
  return face.tagName || t('review_mode.face_untitled')
}

async function loadFaces(mediaId: number) {
  const token = ++loadToken
  faces.value = []
  try {
    const first = await typedApi.getFacesForMedia(mediaId, {ensureCrops: false})
    if (token !== loadToken) return
    let next = normalizeFaces(first.data?.faces)
    faces.value = next

    if (next.some((face) => !face.cropPath)) {
      const withCrops = await typedApi.getFacesForMedia(mediaId)
      if (token !== loadToken) return
      next = normalizeFaces(withCrops.data?.faces)
      faces.value = next
    }
  } catch (error) {
    console.error(error)
    if (token === loadToken) faces.value = []
  }
}

watch(
  () => [props.mediaId, props.dbPath] as const,
  ([mediaId]) => {
    if (!mediaId || mediaId <= 0 || !props.dbPath) {
      faces.value = []
      return
    }
    void loadFaces(mediaId)
  },
  {immediate: true},
)
</script>

<style scoped>
.review-faces {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
}

.review-faces__label {
  margin-bottom: 6px;
  text-align: center;
}

.review-faces__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.review-faces__item {
  position: relative;
  width: 56px;
  height: 56px;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-faces__item:hover {
  border-color: rgba(var(--v-theme-primary), 0.8);
}

.review-faces__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.review-faces__tag {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1px 3px;
  background: rgba(0, 0, 0, 0.72);
  font-size: 0.58rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
