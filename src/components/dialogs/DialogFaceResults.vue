<template>
  <v-dialog
    :model-value="dialogsStore.faceResults.show"
    :fullscreen="xs"
    :width="xl ? 1120 : 900"
    scrollable
    @update:model-value="onVisibilityChange"
  >
    <v-card class="face-results-card">
      <DialogHeader
        @close="close"
        :header="t('face_results.title')"
        :subheader="fileName"
        :subheader-copy-text="fileName"
        icon="face-recognition"
        closable
        :buttons="headerButtons"
      />

      <v-card-text class="pa-3 pa-sm-4">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mb-4"
        >
          {{ error }}
        </v-alert>

        <div v-if="loading" class="d-flex justify-center py-10">
          <v-progress-circular indeterminate color="primary"/>
        </div>

        <template v-else-if="!faces.length">
          <v-alert type="info" variant="tonal" rounded="xl">
            {{ t('face_results.empty') }}
          </v-alert>
        </template>

        <template v-else>
          <div class="face-toolbar mb-4">
            <div class="face-toolbar__row">
              <v-chip-group
                v-model="filter"
                mandatory
                selected-class="text-primary"
                class="face-toolbar__filters"
              >
                <v-chip value="needs_review" filter variant="tonal" size="small">
                  {{ t('face_results.filter_needs_review') }}
                  <span class="ml-1 opacity-70">{{ summaryCounts.needsReview }}</span>
                </v-chip>
                <v-chip value="matched" filter variant="tonal" size="small">
                  {{ t('face_results.filter_matched') }}
                  <span class="ml-1 opacity-70">{{ summaryCounts.matched }}</span>
                </v-chip>
                <v-chip value="all" filter variant="tonal" size="small">
                  {{ t('face_results.filter_all') }}
                  <span class="ml-1 opacity-70">{{ summaryCounts.total }}</span>
                </v-chip>
              </v-chip-group>

              <div class="face-toolbar__legend" :title="t('face_results.score_legend_hint')">
                <span class="face-toolbar__legend-label">{{ t('face_results.score_legend') }}</span>
                <span
                  v-for="item in scoreLegend"
                  :key="item.color"
                  class="face-toolbar__legend-item"
                >
                  <v-progress-circular
                    :model-value="item.percent"
                    :color="item.color"
                    :size="16"
                    :width="2.5"
                    bg-color="surface-variant"
                  />
                  <span>{{ item.label }}</span>
                </span>
              </div>
            </div>
          </div>

          <v-alert
            v-if="!visibleFaces.length"
            type="success"
            variant="tonal"
            rounded="xl"
            class="mb-2"
          >
            {{ t('face_results.filter_empty') }}
          </v-alert>

          <div v-else class="face-results-grid">
            <v-card
              v-for="face in visibleFaces"
              :key="face.id"
              variant="outlined"
              rounded="xl"
              class="face-card"
              :class="`face-card--${statusKey(face.matchStatus)}`"
            >
              <div class="face-card__preview">
                <button
                  type="button"
                  class="face-card__preview-hit"
                  :title="t('face_results.review_person')"
                  @click="openDetail(face)"
                >
                  <img
                    v-if="cropUrl(face)"
                    class="face-card__preview-frame"
                    :src="cropUrl(face)"
                    :alt="face.tagName || t('face_results.unknown_person')"
                    loading="lazy"
                  >
                  <div v-else class="face-card__preview-empty">
                    <v-icon icon="mdi-image-off-outline" size="40"/>
                  </div>

                  <div
                    v-if="(!face.clusterSize || face.clusterSize <= 1) && face.timestamp"
                    class="face-card__preview-badge face-card__preview-badge--right"
                  >
                    {{ face.timestamp }}
                  </div>
                </button>

                <div
                  v-if="clusterOtherFrames(face).length"
                  class="face-card__frames"
                >
                  <button
                    v-for="member in clusterThumbsVisible(face)"
                    :key="`thumb-${face.id}-${member.id}`"
                    type="button"
                    class="face-card__frame-thumb"
                    :title="member.timestamp || `#${member.id}`"
                    @click.stop="openDetailMember(face, member)"
                  >
                    <img
                      v-if="cropUrl(member)"
                      :src="cropUrl(member)"
                      :alt="member.timestamp || `#${member.id}`"
                      loading="lazy"
                    >
                    <v-icon v-else icon="mdi-image-off-outline" size="14"/>
                  </button>
                  <button
                    v-if="clusterThumbsOverflow(face) > 0"
                    type="button"
                    class="face-card__frame-more"
                    :title="t('face_results.cluster_frames', {count: face.clusterSize})"
                    @click.stop="openDetail(face)"
                  >
                    {{ t('face_results.cluster_more', {count: clusterThumbsOverflow(face)}) }}
                  </button>
                </div>
              </div>

              <div class="face-card__body">
                <div
                  v-if="statusKey(face.matchStatus) !== 'unmatched'"
                  class="d-flex align-center ga-2 mb-2"
                >
                  <v-chip
                    size="x-small"
                    :color="statusColor(face.matchStatus)"
                    variant="tonal"
                  >
                    {{ statusLabel(face.matchStatus) }}
                  </v-chip>
                  <span
                    v-if="face.matchScore != null"
                    class="text-caption text-medium-emphasis"
                  >
                    {{ formatScore(face.matchScore) }}
                  </span>
                </div>

                <div
                  v-if="face.tagId && face.tagMetaId"
                  class="face-card__tag d-flex align-center ga-2 mb-2"
                  @mouseover.stop="onTagHover($event, face.tagMetaId, face.tagId, face.tagName)"
                  @mouseleave.stop="hideHoverImage"
                >
                  <v-avatar v-if="tagThumb(face.tagMetaId, face.tagId)" size="32" rounded="circle">
                    <v-img :src="tagThumb(face.tagMetaId, face.tagId)" cover/>
                  </v-avatar>
                  <v-avatar v-else size="32" rounded="circle" color="surface-variant">
                    <v-icon size="16" icon="mdi-account"/>
                  </v-avatar>
                  <div class="text-body-2 font-weight-medium text-truncate">
                    {{ face.tagName || t('face_results.unknown') }}
                  </div>
                </div>
                <div v-else class="face-card__empty mb-2">
                  <v-icon size="18" icon="mdi-account-off-outline" class="face-card__empty-icon"/>
                  <span>{{ t('face_results.no_match') }}</span>
                </div>

                <div
                  v-if="showCandidates(face)"
                  class="face-card__candidates mb-3"
                >
                  <div class="text-caption text-medium-emphasis mb-1">
                    {{ t('face_results.candidates') }}
                  </div>
                  <div class="d-flex flex-wrap ga-1">
                    <button
                      v-for="candidate in visibleCandidates(face)"
                      :key="`${face.id}-${candidate.tagId}`"
                      type="button"
                      class="face-card__candidate"
                      :class="{'face-card__candidate--active': candidate.tagId === face.tagId}"
                      :disabled="busy"
                      :title="scoreTooltip(candidate.score, candidate.tagName)"
                      @click="assignCandidate(face, candidate.tagId, {matchScore: candidate.score})"
                      @mouseover.stop="onTagHover($event, candidate.tagMetaId, candidate.tagId, candidate.tagName)"
                      @mouseleave.stop="hideHoverImage"
                    >
                      <span class="face-card__candidate-thumb">
                        <img
                          v-if="candidate.tagMetaId && tagThumb(candidate.tagMetaId, candidate.tagId)"
                          :src="tagThumb(candidate.tagMetaId, candidate.tagId)"
                          :alt="candidate.tagName || ''"
                          loading="lazy"
                        >
                        <v-icon v-else icon="mdi-account" size="16"/>
                      </span>
                      <span class="face-card__candidate-name text-truncate">
                        {{ candidate.tagName || `#${candidate.tagId}` }}
                      </span>
                      <v-progress-circular
                        class="face-card__candidate-score"
                        :model-value="scorePercent(candidate.score)"
                        :color="scoreColor(candidate.score)"
                        :size="20"
                        :width="3"
                        bg-color="surface-variant"
                      />
                    </button>
                  </div>
                </div>

                <div class="face-card__actions d-flex flex-wrap ga-2">
                  <v-menu
                    v-if="needsReview(face) || face.matchStatus === 'matched' || face.matchStatus === 'manual'"
                    :model-value="detailFaceId == null && assigningFaceId === face.id"
                    :close-on-content-click="false"
                    location="bottom"
                    offset="8"
                    @update:model-value="(open) => setAssignMenu(face, open)"
                  >
                    <template #activator="{props: menuProps}">
                      <v-btn
                        v-bind="menuProps"
                        size="small"
                        color="secondary"
                        rounded
                        variant="outlined"
                        :disabled="busy || !performerMetaId"
                      >
                        {{ assignActionLabel(face) }}
                      </v-btn>
                    </template>
                    <v-card min-width="280" max-width="360" rounded="xl" class="pa-3">
                      <MetaInputArray
                        :key="`assign-${face.id}-${performerMetaId}`"
                        :meta-id="performerMetaId"
                        :model-value="[]"
                        autofocus
                        @update:model-value="(value) => onAssign(face, value)"
                      />
                    </v-card>
                  </v-menu>
                  <v-menu
                    v-if="canCreateTag(face)"
                    :model-value="detailFaceId == null && creatingFaceId === face.id"
                    :close-on-content-click="false"
                    location="bottom"
                    offset="8"
                    @update:model-value="(open) => setCreateMenu(face, open)"
                  >
                    <template #activator="{props: menuProps}">
                      <v-btn
                        v-bind="menuProps"
                        size="small"
                        color="success"
                        rounded
                        variant="tonal"
                        :disabled="busy || !performerMetaId"
                      >
                        {{ t('face_results.create_tag') }}
                      </v-btn>
                    </template>
                    <v-card min-width="260" max-width="320" rounded="xl" class="pa-3">
                      <div class="text-caption text-medium-emphasis mb-2">
                        {{ t('face_results.create_tag_hint') }}
                      </div>
                      <v-text-field
                        v-model="newTagName"
                        :label="t('face_results.create_tag_name')"
                        density="compact"
                        variant="outlined"
                        hide-details
                        autofocus
                        :disabled="busy"
                        @keydown.enter.prevent="createTagFromFace(face)"
                      />
                      <div class="d-flex flex-wrap ga-2 mt-3">
                        <v-btn
                          size="small"
                          color="success"
                          rounded
                          variant="flat"
                          :loading="busyFaceId === face.id"
                          :disabled="busy || !newTagName.trim()"
                          @click="createTagFromFace(face)"
                        >
                          {{ t('face_results.create_tag_submit') }}
                        </v-btn>
                        <v-btn
                          size="small"
                          color="secondary"
                          rounded
                          variant="text"
                          :disabled="busy"
                          @click="setCreateMenu(face, false)"
                        >
                          {{ t('common.cancel') }}
                        </v-btn>
                      </div>
                    </v-card>
                  </v-menu>
                  <v-btn
                    v-if="face.tagId && (face.matchStatus === 'matched' || face.matchStatus === 'manual')"
                    size="small"
                    color="secondary"
                    rounded
                    variant="text"
                    :loading="busyFaceId === face.id"
                    :disabled="busy"
                    @click="clearMatch(face)"
                  >
                    {{ t('face_results.clear') }}
                  </v-btn>
                  <v-btn
                    v-if="adultUiAvailable && face.cropPath"
                    size="small"
                    color="info"
                    rounded
                    variant="tonal"
                    :disabled="busy"
                    @click="openCamGirlFinder(face)"
                  >
                    {{ t('actions.camgirlfinder') }}
                  </v-btn>
                </div>
              </div>
            </v-card>
          </div>
        </template>
      </v-card-text>
    </v-card>

    <v-dialog
      :model-value="Boolean(detailFace)"
      :width="xs ? undefined : 640"
      :fullscreen="xs"
      scrollable
      @update:model-value="(open) => { if (!open) closeDetail() }"
    >
      <v-card v-if="detailFace" rounded="xl" class="face-detail-card">
        <DialogHeader
          @close="closeDetail"
          :header="detailFace.tagName || t('face_results.review_person')"
          icon="face-recognition"
          closable
        />
        <v-card-text class="pa-4">
          <div class="face-detail__frame mb-4">
            <img
              v-if="cropUrl(detailFace)"
              :src="cropUrl(detailFace)"
              :alt="detailFace.tagName || t('face_results.unknown_person')"
            >
            <div v-else class="face-card__preview-empty face-card__preview-empty--detail">
              <v-icon icon="mdi-image-off-outline" size="40"/>
            </div>
            <div
              v-if="detailFace.clusterSize && detailFace.clusterSize > 1"
              class="face-card__preview-badge face-card__preview-badge--left"
            >
              {{ t('face_results.cluster_frames', {count: detailFace.clusterSize}) }}
            </div>
            <div
              v-if="detailFace.timestamp"
              class="face-card__preview-badge face-card__preview-badge--right"
            >
              {{ detailFace.timestamp }}
            </div>
          </div>

          <div
            v-if="detailClusterFaces.length > 1"
            class="face-detail__cluster mb-4"
          >
            <div class="text-caption text-medium-emphasis mb-2">
              {{ t('face_results.cluster_timestamps') }}
            </div>
            <div class="d-flex flex-wrap ga-2">
              <button
                v-for="member in detailClusterFaces"
                :key="`cluster-ts-${member.id}`"
                type="button"
                class="face-detail__cluster-frame"
                :class="{'face-detail__cluster-frame--active': member.id === detailFace.id}"
                @click="detailFaceId = member.id"
              >
                <img
                  v-if="cropUrl(member)"
                  :src="cropUrl(member)"
                  :alt="member.timestamp || `#${member.id}`"
                  loading="lazy"
                >
                <span class="face-detail__cluster-frame-ts">
                  {{ member.timestamp || `#${member.id}` }}
                </span>
              </button>
            </div>
          </div>

          <div
            v-if="statusKey(detailFace.matchStatus) !== 'unmatched'"
            class="d-flex align-center ga-2 mb-3"
          >
            <v-chip
              size="small"
              :color="statusColor(detailFace.matchStatus)"
              variant="tonal"
            >
              {{ statusLabel(detailFace.matchStatus) }}
            </v-chip>
            <span v-if="detailFace.matchScore != null" class="text-caption text-medium-emphasis">
              {{ formatScore(detailFace.matchScore) }}
            </span>
          </div>

          <div
            v-if="detailFace.tagId && detailFace.tagMetaId"
            class="face-card__tag d-flex align-center ga-3 mb-4"
            @mouseover.stop="onTagHover($event, detailFace.tagMetaId, detailFace.tagId, detailFace.tagName)"
            @mouseleave.stop="hideHoverImage"
          >
            <v-avatar v-if="tagThumb(detailFace.tagMetaId, detailFace.tagId)" size="40" rounded="circle">
              <v-img :src="tagThumb(detailFace.tagMetaId, detailFace.tagId)" cover/>
            </v-avatar>
            <div>
              <div class="text-body-1 font-weight-medium">
                {{ detailFace.tagName || t('face_results.unknown') }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ t('face_results.current_match') }}
              </div>
            </div>
          </div>
          <div v-else class="face-card__empty face-card__empty--detail mb-4">
            <v-icon size="20" icon="mdi-account-off-outline" class="face-card__empty-icon"/>
            <span>{{ t('face_results.no_match') }}</span>
          </div>

          <div v-if="visibleCandidates(detailFace).length" class="mb-4">
            <div class="text-caption text-medium-emphasis mb-2">
              {{ t('face_results.candidates') }}
            </div>
            <div class="d-flex flex-wrap ga-2">
              <button
                v-for="candidate in visibleCandidates(detailFace)"
                :key="`detail-${detailFace.id}-${candidate.tagId}`"
                type="button"
                class="face-card__candidate face-card__candidate--detail"
                :class="{'face-card__candidate--active': candidate.tagId === detailFace.tagId}"
                :disabled="busy"
                :title="scoreTooltip(candidate.score, candidate.tagName)"
                @click="assignCandidate(detailFace, candidate.tagId, {matchScore: candidate.score})"
                @mouseover.stop="onTagHover($event, candidate.tagMetaId, candidate.tagId, candidate.tagName)"
                @mouseleave.stop="hideHoverImage"
              >
                <span class="face-card__candidate-thumb">
                  <img
                    v-if="candidate.tagMetaId && tagThumb(candidate.tagMetaId, candidate.tagId)"
                    :src="tagThumb(candidate.tagMetaId, candidate.tagId)"
                    :alt="candidate.tagName || ''"
                    loading="lazy"
                  >
                  <v-icon v-else icon="mdi-account" size="18"/>
                </span>
                <span class="face-card__candidate-name text-truncate">
                  {{ candidate.tagName || `#${candidate.tagId}` }}
                </span>
                <v-progress-circular
                  class="face-card__candidate-score"
                  :model-value="scorePercent(candidate.score)"
                  :color="scoreColor(candidate.score)"
                  :size="24"
                  :width="3"
                  bg-color="surface-variant"
                />
              </button>
            </div>
          </div>

          <div class="face-card__actions d-flex flex-wrap ga-2">
            <v-menu
              :model-value="assigningFaceId === detailFace.id"
              :close-on-content-click="false"
              location="bottom"
              offset="8"
              @update:model-value="(open) => setAssignMenu(detailFace, open)"
            >
              <template #activator="{props: menuProps}">
                <v-btn
                  v-bind="menuProps"
                  color="secondary"
                  rounded
                  variant="outlined"
                  :disabled="busy || !performerMetaId"
                >
                  {{ assignActionLabel(detailFace) }}
                </v-btn>
              </template>
              <v-card min-width="280" max-width="360" rounded="xl" class="pa-3">
                <MetaInputArray
                  :key="`detail-assign-${detailFace.id}-${performerMetaId}`"
                  :meta-id="performerMetaId"
                  :model-value="[]"
                  autofocus
                  @update:model-value="(value) => onAssign(detailFace, value)"
                />
              </v-card>
            </v-menu>
            <v-menu
              v-if="canCreateTag(detailFace)"
              :model-value="creatingFaceId === detailFace.id"
              :close-on-content-click="false"
              location="bottom"
              offset="8"
              @update:model-value="(open) => setCreateMenu(detailFace, open)"
            >
              <template #activator="{props: menuProps}">
                <v-btn
                  v-bind="menuProps"
                  color="success"
                  rounded
                  variant="tonal"
                  :disabled="busy || !performerMetaId"
                >
                  {{ t('face_results.create_tag') }}
                </v-btn>
              </template>
              <v-card min-width="280" max-width="340" rounded="xl" class="pa-3">
                <div class="text-caption text-medium-emphasis mb-2">
                  {{ t('face_results.create_tag_hint') }}
                </div>
                <v-text-field
                  v-model="newTagName"
                  :label="t('face_results.create_tag_name')"
                  density="compact"
                  variant="outlined"
                  hide-details
                  autofocus
                  :disabled="busy"
                  @keydown.enter.prevent="createTagFromFace(detailFace)"
                />
                <div class="d-flex flex-wrap ga-2 mt-3">
                  <v-btn
                    color="success"
                    rounded
                    variant="flat"
                    :loading="busyFaceId === detailFace.id"
                    :disabled="busy || !newTagName.trim()"
                    @click="createTagFromFace(detailFace)"
                  >
                    {{ t('face_results.create_tag_submit') }}
                  </v-btn>
                  <v-btn
                    color="secondary"
                    rounded
                    variant="text"
                    :disabled="busy"
                    @click="setCreateMenu(detailFace, false)"
                  >
                    {{ t('common.cancel') }}
                  </v-btn>
                </div>
              </v-card>
            </v-menu>
            <v-btn
              v-if="detailFace.tagId"
              color="secondary"
              rounded
              variant="text"
              :loading="busyFaceId === detailFace.id"
              :disabled="busy"
              @click="clearMatch(detailFace)"
            >
              {{ t('face_results.clear') }}
            </v-btn>
            <v-btn
              v-if="adultUiAvailable && detailFace.cropPath"
              color="info"
              rounded
              variant="tonal"
              :disabled="busy"
              @click="openCamGirlFinder(detailFace)"
            >
              {{ t('actions.camgirlfinder') }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import path from 'path-browserify'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl, createImage} from '@/services/fileService'
import {resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {setNotification} from '@/services/notificationService'
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {isAdultUiAvailable} from '@/services/adultFeatures'
import {useEventBus} from '@/utils/eventBus'
import {useItemsStore} from '@/stores/items'
import {refreshTagThumbDisplay} from '@/utils/tagThumbRefresh'
import {TAG_IMAGE_SAVE_WIDTH} from '@shared/tagImages'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import MetaInputArray from '@/components/meta/input/MetaInputArray.vue'

type FaceFilter = 'needs_review' | 'matched' | 'all'

interface FaceCandidate {
  tagId: number
  score: number
  tagName: string | null
  tagMetaId: number | null
}

interface FaceResult {
  id: number
  mediaId: number
  timestamp: string | null
  score: number
  cropPath: string | null
  tagId: number | null
  matchScore: number | null
  matchStatus: string | null
  tagName: string | null
  tagMetaId: number | null
  candidates?: FaceCandidate[]
  clusterId?: number
  clusterFaceIds?: number[]
  clusterSize?: number
  clusterRepresentative?: boolean
}

const emit = defineEmits<{close: []}>()
const {t} = useI18n()
const {xs, xl} = useDisplay()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const settingsStore = useSettingsStore()
const itemsStore = useItemsStore()
const listSync = useItemsListSync()
const eventBus = useEventBus()

const loading = ref(false)
const rematching = ref(false)
const confirmingAll = ref(false)
const error = ref('')
const faces = ref<FaceResult[]>([])
const filter = ref<FaceFilter>('needs_review')
const filterInitialized = ref(false)
const assigningFaceId = ref<number | null>(null)
const creatingFaceId = ref<number | null>(null)
const newTagName = ref('')
const busyFaceId = ref<number | null>(null)
const detailFaceId = ref<number | null>(null)

const media = computed(() => dialogsStore.faceResults.media)
const fileName = computed(() => {
  const mediaPath = media.value?.path || ''
  return mediaPath.split(/[/\\]/).pop() || mediaPath || String(media.value?.id || '')
})
const busy = computed(() => busyFaceId.value != null || rematching.value || confirmingAll.value)

const performerMetaId = computed(() => {
  const configured = Number(settingsStore['faceMatch.performerMetaId'] || 0)
  if (configured) return configured
  const scraper = (appStore.meta || []).find((meta) => meta.type === 'array' && meta.scraper)
  return scraper?.id ? Number(scraper.id) : 0
})

const peopleMeta = computed(() => (
  (appStore.meta || []).find((meta) => Number(meta.id) === performerMetaId.value) || null
))

const adultUiAvailable = computed(() => isAdultUiAvailable())

const resolveFaceTagContext = (face: FaceResult) => {
  const metaId = Number(face.tagMetaId || performerMetaId.value || 0)
  const tagId = Number(face.tagId || 0)
  const meta = (appStore.meta || []).find((item) => Number(item.id) === metaId) || peopleMeta.value
  const tag = tagId
    ? (appStore.tags || []).find((item) => Number(item.id) === tagId) || null
    : null
  return {meta, tag}
}

const openCamGirlFinder = (face: FaceResult) => {
  if (!adultUiAvailable.value || !face.cropPath) return
  const {meta, tag} = resolveFaceTagContext(face)
  const members = clusterMembers(face)
  dialogsStore.openCamGirlFinder({
    query: face.tagName || tag?.name || '',
    cropPath: face.cropPath,
    tag,
    meta: meta || peopleMeta.value,
    faceId: face.id,
    clusterFaceIds: members.map((member) => member.id),
    mediaId: Number(face.mediaId || media.value?.id || 0) || null,
  })
}

const clusterKey = (face: FaceResult) => (
  face.clusterId != null ? `c:${face.clusterId}` : `f:${face.id}`
)

const CLUSTER_THUMB_LIMIT = 1

const clusterMembers = (face: FaceResult) => {
  const ids = face.clusterFaceIds?.length
    ? face.clusterFaceIds
    : [face.id]
  const idSet = new Set(ids.map(Number))
  const members = faces.value.filter((entry) => idSet.has(Number(entry.id)))
  return members.length ? members : [face]
}

const clusterOtherFrames = (face: FaceResult) => (
  clusterMembers(face)
    .filter((member) => member.id !== face.id)
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
)

const clusterThumbsVisible = (face: FaceResult) => (
  clusterOtherFrames(face).slice(0, CLUSTER_THUMB_LIMIT)
)

const clusterThumbsOverflow = (face: FaceResult) => (
  Math.max(0, clusterOtherFrames(face).length - CLUSTER_THUMB_LIMIT)
)

const pickClusterRepresentative = (members: FaceResult[]) => {
  if (!members.length) return null
  const marked = members.find((face) => face.clusterRepresentative)
  if (marked) return marked
  return [...members].sort((a, b) => {
    const scoreA = (Number(a.matchScore) || 0) * 10 + (Number(a.score) || 0)
    const scoreB = (Number(b.matchScore) || 0) * 10 + (Number(b.score) || 0)
    return scoreB - scoreA
  })[0]
}

const enrichClusterFace = (face: FaceResult): FaceResult => {
  const members = clusterMembers(face)
  return {
    ...face,
    clusterFaceIds: members.map((member) => member.id),
    clusterSize: members.length,
  }
}

const summaryCounts = computed(() => {
  const groups = new Map<string, FaceResult[]>()
  for (const face of faces.value) {
    const key = clusterKey(face)
    const list = groups.get(key) || []
    list.push(face)
    groups.set(key, list)
  }

  let matched = 0
  let suggested = 0
  let unmatched = 0
  for (const members of groups.values()) {
    const hasMatched = members.some((face) => {
      const key = statusKey(face.matchStatus)
      return key === 'matched' || key === 'manual'
    })
    const hasSuggested = members.some((face) => statusKey(face.matchStatus) === 'suggested')
    if (hasMatched) matched += 1
    else if (hasSuggested) suggested += 1
    else unmatched += 1
  }

  return {
    total: groups.size,
    matched,
    suggested,
    unmatched,
    needsReview: suggested + unmatched,
    rawFaces: faces.value.length,
  }
})

const visibleFaces = computed(() => {
  const groups = new Map<string, FaceResult[]>()
  for (const face of faces.value) {
    const key = clusterKey(face)
    const list = groups.get(key) || []
    list.push(face)
    groups.set(key, list)
  }

  const rows: FaceResult[] = []
  for (const members of groups.values()) {
    const include = filter.value === 'all'
      || (filter.value === 'matched' && members.some((face) => {
        const key = statusKey(face.matchStatus)
        return key === 'matched' || key === 'manual'
      }))
      || (filter.value === 'needs_review' && members.some((face) => needsReview(face)))

    if (!include) continue

    let representative = pickClusterRepresentative(members)
    if (!representative) continue

    // Prefer a needs-review member while reviewing, so the card still invites action.
    if (filter.value === 'needs_review') {
      const reviewMember = pickClusterRepresentative(members.filter((face) => needsReview(face)))
      if (reviewMember) representative = reviewMember
    }

    rows.push(enrichClusterFace(representative))
  }

  return rows
})

const detailClusterFaces = computed(() => (
  detailFace.value ? clusterMembers(detailFace.value) : []
))

const detailFace = computed(() => (
  faces.value.find((face) => face.id === detailFaceId.value) || null
))

const suggestedFacesToConfirm = computed(() => {
  const groups = new Map<string, FaceResult[]>()
  for (const face of faces.value) {
    const key = clusterKey(face)
    const list = groups.get(key) || []
    list.push(face)
    groups.set(key, list)
  }

  const rows: FaceResult[] = []
  for (const members of groups.values()) {
    const suggested = members.find((face) => (
      statusKey(face.matchStatus) === 'suggested' && Number(face.tagId) > 0
    ))
    if (!suggested) continue
    rows.push(enrichClusterFace(suggested))
  }
  return rows
})

const headerButtons = computed(() => ([
  {
    text: t('face_results.rematch'),
    title: t('face_results.rematch_hint'),
    icon: 'refresh',
    color: 'secondary',
    outlined: true,
    order: 1,
    disabled: busy.value || !media.value?.id,
    action: rematch,
  },
  {
    text: t('face_results.apply_tags'),
    title: t('face_results.apply_tags_hint'),
    icon: 'tag-plus',
    color: 'primary',
    outlined: false,
    order: 2,
    disabled: busy.value || !suggestedFacesToConfirm.value.length,
    action: confirmAllSuggested,
  },
]))

const scoreLegend = computed(() => ([
  {
    color: 'success',
    percent: 85,
    label: t('face_results.score_high'),
  },
  {
    color: 'warning',
    percent: 60,
    label: t('face_results.score_medium'),
  },
  {
    color: 'error',
    percent: 30,
    label: t('face_results.score_low'),
  },
]))

const formatScore = (score: number | null | undefined) => {
  if (score == null || !Number.isFinite(Number(score))) return ''
  return Number(score).toFixed(2)
}

const scorePercent = (score: number | null | undefined) => {
  if (score == null || !Number.isFinite(Number(score))) return 0
  return Math.round(Math.min(1, Math.max(0, Number(score))) * 100)
}

const scoreColor = (score: number | null | undefined) => {
  const value = Number(score)
  if (!Number.isFinite(value)) return 'secondary'
  if (value >= 0.7) return 'success'
  if (value >= 0.55) return 'warning'
  return 'error'
}

const scoreTooltip = (score: number | null | undefined, name: string | null | undefined) => {
  const label = name || t('face_results.unknown')
  const formatted = formatScore(score)
  return formatted ? `${label} · ${formatted}` : label
}

const statusKey = (status: string | null | undefined) => {
  if (status === 'matched' || status === 'manual' || status === 'suggested') return status
  return 'unmatched'
}

const needsReview = (face: FaceResult) => {
  const key = statusKey(face.matchStatus)
  return key === 'suggested' || key === 'unmatched'
}

const showCandidates = (face: FaceResult) => {
  if (!needsReview(face)) return false
  return visibleCandidates(face).length > 0
}

const visibleCandidates = (face: FaceResult) => (
  (face.candidates || []).slice(0, 5)
)

const tagThumb = (metaId: number | null | undefined, tagId: number | null | undefined) => {
  if (!metaId || !tagId || !appStore.dbPath) return ''
  // Subscribe to store refresh so chips update after creating a tag image.
  void itemsStore.thumbRefreshKeys[Number(tagId)]
  return resolveTagThumbDisplayUrl({
    dbPath: appStore.dbPath,
    metaId,
    tagId,
    type: 'main',
  })
}

const cropUrl = (face: FaceResult) => {
  if (!face.cropPath || !appStore.dbPath) return ''
  return buildLocalFileUrl(path.join(appStore.dbPath, face.cropPath))
}

const absoluteCropPath = (face: FaceResult) => {
  if (!face.cropPath || !appStore.dbPath) return ''
  return path.join(appStore.dbPath, face.cropPath)
}

const saveTagMainFromFaceCrop = async (face: FaceResult, metaId: number, tagId: number) => {
  const cropSource = absoluteCropPath(face)
  if (!cropSource || !appStore.dbPath) return false
  const imagePath = path.join(
    appStore.dbPath,
    'meta',
    String(metaId),
    `${tagId}_main.jpg`,
  )
  const aspectRatio = Number(peopleMeta.value?.imageAspectRatio) || 1
  const sizes = {
    width: TAG_IMAGE_SAVE_WIDTH,
    height: TAG_IMAGE_SAVE_WIDTH / aspectRatio,
  }
  const imageResult = await createImage(cropSource, imagePath, sizes)
  if (imageResult.status !== 201) return false
  refreshTagThumbDisplay(itemsStore, appStore.dbPath, metaId, tagId)
  return true
}

const onTagHover = (
  event: MouseEvent,
  metaId: number | null | undefined,
  tagId: number | null | undefined,
  label: string | null | undefined,
) => {
  if (!metaId || !tagId) return
  showHoverImage(event, metaId, tagId, 'tag', {
    label: label || undefined,
    imageAspectRatio: peopleMeta.value?.imageAspectRatio,
  })
}

const statusColor = (status: string | null) => {
  if (status === 'matched' || status === 'manual') return 'success'
  if (status === 'suggested') return 'warning'
  return undefined
}

const statusLabel = (status: string | null) => {
  if (status === 'matched') return t('face_results.status_matched')
  if (status === 'suggested') return t('face_results.status_suggested')
  if (status === 'manual') return t('face_results.status_manual')
  return t('face_results.status_unmatched')
}

const assignActionLabel = (face: FaceResult) => {
  if (face.matchStatus === 'suggested') return t('face_results.someone_else')
  if (face.matchStatus === 'matched' || face.matchStatus === 'manual') return t('face_results.change')
  return t('face_results.assign')
}

const canCreateTag = (face: FaceResult) => {
  if (!performerMetaId.value) return false
  return needsReview(face) || !face.tagId
}

const setAssignMenu = (face: FaceResult, open: boolean) => {
  creatingFaceId.value = null
  newTagName.value = ''
  assigningFaceId.value = open ? face.id : null
}

const setCreateMenu = (face: FaceResult, open: boolean) => {
  assigningFaceId.value = null
  if (!open) {
    if (creatingFaceId.value === face.id) {
      creatingFaceId.value = null
      newTagName.value = ''
    }
    return
  }
  creatingFaceId.value = face.id
  newTagName.value = String(face.tagName || '').trim()
}

const openDetail = (face: FaceResult) => {
  assigningFaceId.value = null
  creatingFaceId.value = null
  newTagName.value = ''
  detailFaceId.value = face.id
}

const openDetailMember = (_face: FaceResult, member: FaceResult) => {
  assigningFaceId.value = null
  creatingFaceId.value = null
  newTagName.value = ''
  detailFaceId.value = member.id
}

const closeDetail = () => {
  assigningFaceId.value = null
  creatingFaceId.value = null
  newTagName.value = ''
  detailFaceId.value = null
  hideHoverImage()
}

const applyDefaultFilter = () => {
  if (filterInitialized.value) return
  filter.value = summaryCounts.value.needsReview > 0 ? 'needs_review' : 'all'
  filterInitialized.value = true
}

const refreshMediaCard = (mediaId: number) => {
  if (!Number.isFinite(mediaId) || mediaId <= 0) return
  listSync.getItemsFromDb({
    ids: [mediaId],
    type: 'media',
  })
}

const patchFaceLocally = (
  faceId: number,
  patch: Partial<FaceResult>,
) => {
  faces.value = faces.value.map((face) => (
    face.id === faceId ? {...face, ...patch} : face
  ))
}

const resolveTagInfo = (tagId: number) => {
  const fromStore = (appStore.tags || []).find((tag) => Number(tag.id) === tagId)
  if (fromStore) {
    return {
      tagName: fromStore.name || null,
      tagMetaId: fromStore.metaId != null ? Number(fromStore.metaId) : performerMetaId.value || null,
    }
  }
  for (const face of faces.value) {
    const candidate = (face.candidates || []).find((entry) => entry.tagId === tagId)
    if (candidate) {
      return {
        tagName: candidate.tagName,
        tagMetaId: candidate.tagMetaId,
      }
    }
    if (face.tagId === tagId) {
      return {
        tagName: face.tagName,
        tagMetaId: face.tagMetaId,
      }
    }
  }
  return {
    tagName: null as string | null,
    tagMetaId: performerMetaId.value || null,
  }
}

const loadFaces = async ({silent = false}: {silent?: boolean} = {}) => {
  const mediaId = Number(media.value?.id)
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    faces.value = []
    return
  }

  if (!silent) loading.value = true
  error.value = ''
  try {
    // Fast first paint: skip ffmpeg crop rebuild; fill thumbs in a follow-up if needed.
    const response = await typedApi.getFacesForMedia(mediaId, {ensureCrops: false})
    if (Number(media.value?.id) !== mediaId) return
    faces.value = Array.isArray(response.data?.faces) ? response.data.faces : []
    applyDefaultFilter()
    if (detailFaceId.value != null && !faces.value.some((face) => face.id === detailFaceId.value)) {
      detailFaceId.value = null
    }
    if (!silent) loading.value = false

    const needsCrops = faces.value.some((face) => !face.cropPath)
    if (needsCrops) {
      const withCrops = await typedApi.getFacesForMedia(mediaId)
      if (Number(media.value?.id) !== mediaId) return
      faces.value = Array.isArray(withCrops.data?.faces) ? withCrops.data.faces : faces.value
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    if (!silent) faces.value = []
  } finally {
    if (!silent) loading.value = false
  }
}

const rematch = async () => {
  const mediaId = Number(media.value?.id)
  if (!mediaId) return
  rematching.value = true
  error.value = ''
  try {
    const embedStatus = await typedApi.getFaceEmbedModelStatus()
    const status = String(embedStatus.data?.status || '')
    if (!['downloaded', 'loaded'].includes(status)) {
      setNotification({
        type: 'info',
        text: t('settings_labels.database.face_match_embed_downloading'),
      })
      await typedApi.downloadFaceEmbedModel()
      setNotification({
        type: 'success',
        text: t('settings_labels.database.face_match_embed_downloaded'),
      })
    }
    await typedApi.matchFacesForMedia({mediaId, force: true})
    filterInitialized.value = false
    await loadFaces()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    rematching.value = false
  }
}

const assignCandidate = async (
  face: FaceResult,
  tagId: number,
  options: {commit?: boolean; matchScore?: number | null} = {},
) => {
  if (!tagId) return
  hideHoverImage()
  const commit = options.commit === true
  const members = clusterMembers(face)
  const memberIds = members.map((member) => member.id)
  const tagInfo = resolveTagInfo(tagId)
  const matchScore = options.matchScore != null
    ? Number(options.matchScore)
    : (commit ? 1 : face.matchScore)
  const matchStatus = commit ? 'manual' : 'suggested'

  // Optimistic UI — draft picks must feel instant.
  for (const faceId of memberIds) {
    patchFaceLocally(faceId, {
      tagId,
      tagName: tagInfo.tagName,
      tagMetaId: tagInfo.tagMetaId,
      matchScore,
      matchStatus,
    })
  }
  assigningFaceId.value = null
  creatingFaceId.value = null
  newTagName.value = ''

  if (!commit) {
    void Promise.all(memberIds.map((faceId) => typedApi.assignFacePerformer({
      faceId,
      tagId,
      enroll: false,
      applyTag: false,
      matchScore: options.matchScore,
    }))).catch((err) => {
      setNotification({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      })
      void loadFaces({silent: true})
    })
    return
  }

  if (busyFaceId.value != null) return
  busyFaceId.value = face.id
  try {
    let mediaId = Number(face.mediaId || media.value?.id)
    await Promise.all(memberIds.map(async (faceId, index) => {
      const response = await typedApi.assignFacePerformer({
        faceId,
        tagId,
        enroll: index === 0,
        applyTag: index === 0,
        matchScore: options.matchScore,
      })
      mediaId = Number(response.data?.mediaId || mediaId)
    }))
    refreshMediaCard(mediaId)
  } catch (err) {
    setNotification({
      type: 'error',
      text: err instanceof Error ? err.message : String(err),
    })
    await loadFaces({silent: true})
    throw err
  } finally {
    busyFaceId.value = null
  }
}

const confirmAllSuggested = async () => {
  const pending = suggestedFacesToConfirm.value
  if (!pending.length || confirmingAll.value) return

  const jobs = pending
    .filter((face) => Number(face.tagId) > 0)
    .map((face) => ({
      tagId: Number(face.tagId),
      matchScore: face.matchScore,
      memberIds: clusterMembers(face).map((member) => member.id),
      mediaId: Number(face.mediaId || media.value?.id),
    }))
  if (!jobs.length) return

  confirmingAll.value = true
  close()

  let applied = 0
  let mediaId = jobs[0].mediaId
  try {
    for (const job of jobs) {
      for (let index = 0; index < job.memberIds.length; index++) {
        const response = await typedApi.assignFacePerformer({
          faceId: job.memberIds[index],
          tagId: job.tagId,
          enroll: index === 0,
          applyTag: index === 0,
          matchScore: job.matchScore,
        })
        mediaId = Number(response.data?.mediaId || job.mediaId || mediaId)
      }
      applied += 1
    }
    if (Number.isFinite(mediaId) && mediaId > 0) refreshMediaCard(mediaId)
    if (applied > 0) {
      setNotification({
        type: 'success',
        text: t('face_results.apply_tags_done', {count: applied}),
      })
    }
  } catch (err) {
    setNotification({
      type: 'error',
      text: err instanceof Error ? err.message : String(err),
    })
  }
}

const onAssign = async (face: FaceResult, value: number[] | number) => {
  const tagId = Number(Array.isArray(value) ? value[0] : value)
  if (!Number.isFinite(tagId) || tagId <= 0) return
  assigningFaceId.value = null
  creatingFaceId.value = null
  newTagName.value = ''
  await assignCandidate(face, tagId)
}

const createTagFromFace = async (face: FaceResult) => {
  const name = newTagName.value.trim()
  const metaId = performerMetaId.value
  if (!name || !metaId || busyFaceId.value != null) return

  const existing = (appStore.tags || []).find((tag) => (
    Number(tag.metaId) === metaId
    && String(tag.name || '').trim().toLowerCase() === name.toLowerCase()
  ))
  if (existing?.id) {
    creatingFaceId.value = null
    newTagName.value = ''
    await assignCandidate(face, Number(existing.id))
    setNotification({
      type: 'success',
      text: t('face_results.create_tag_existing', {name}),
    })
    return
  }

  busyFaceId.value = face.id
  hideHoverImage()
  try {
    const response = await typedApi.createTags([{name, metaId}])
    const tagId = Number(response.data?.[0]?.id)
    if (!Number.isFinite(tagId) || tagId <= 0) {
      throw new Error(t('face_results.create_tag_failed'))
    }

    await reloadTagsCatalog()
    await saveTagMainFromFaceCrop(face, metaId, tagId)

    creatingFaceId.value = null
    newTagName.value = ''
    busyFaceId.value = null
    await assignCandidate(face, tagId)
    // Keep the new person visible among variants with the fresh crop thumb.
    const members = clusterMembers(face)
    for (const member of members) {
      const nextCandidates = [
        {
          tagId,
          score: 1,
          tagName: name,
          tagMetaId: metaId,
        },
        ...(member.candidates || []).filter((entry) => Number(entry.tagId) !== tagId),
      ].slice(0, 5)
      patchFaceLocally(member.id, {candidates: nextCandidates})
    }
    setNotification({
      type: 'success',
      text: t('face_results.create_tag_done', {name}),
    })
  } catch (err) {
    setNotification({
      type: 'error',
      text: err instanceof Error ? err.message : String(err),
    })
  } finally {
    busyFaceId.value = null
  }
}

const clearMatch = async (face: FaceResult) => {
  busyFaceId.value = face.id
  hideHoverImage()
  const members = clusterMembers(face)
  const memberIds = members.map((member) => member.id)
  try {
    let mediaId = Number(face.mediaId || media.value?.id)
    for (const faceId of memberIds) {
      const response = await typedApi.clearFacePerformer({faceId})
      mediaId = Number(response.data?.mediaId || mediaId)
      patchFaceLocally(faceId, {
        tagId: null,
        tagName: null,
        tagMetaId: null,
        matchScore: null,
        matchStatus: 'unmatched',
      })
    }
    assigningFaceId.value = null
    creatingFaceId.value = null
    newTagName.value = ''
    refreshMediaCard(mediaId)
    await loadFaces({silent: true})
  } catch (err) {
    setNotification({
      type: 'error',
      text: err instanceof Error ? err.message : String(err),
    })
    await loadFaces({silent: true})
  } finally {
    busyFaceId.value = null
  }
}

const close = () => {
  hideHoverImage()
  detailFaceId.value = null
  creatingFaceId.value = null
  newTagName.value = ''
  dialogsStore.closeFaceResults()
  emit('close')
}

const onVisibilityChange = (open: boolean) => {
  if (!open) close()
}

watch(() => media.value?.id, () => {
  assigningFaceId.value = null
  creatingFaceId.value = null
  newTagName.value = ''
  detailFaceId.value = null
  filterInitialized.value = false
  hideHoverImage()
  void loadFaces()
})

onMounted(() => {
  void loadFaces()
  eventBus.on('camgirlFinderApplied', onCamGirlFinderApplied)
})

onBeforeUnmount(() => {
  eventBus.off('camgirlFinderApplied', onCamGirlFinderApplied)
  hideHoverImage()
})

async function onCamGirlFinderApplied(payload?: {
  faceIds?: number[]
  tagId?: number
  mediaId?: number | null
}) {
  const mediaId = Number(payload?.mediaId || media.value?.id || 0)
  if (mediaId) refreshMediaCard(mediaId)
  assigningFaceId.value = null
  creatingFaceId.value = null
  newTagName.value = ''
  await loadFaces({silent: true})
}
</script>

<style scoped lang="scss">
.face-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.face-toolbar__filters {
  margin-inline: -4px;
  flex: 1 1 auto;
  min-width: 0;
}

.face-toolbar__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  flex: 0 1 auto;
  margin-left: auto;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.75rem;
  line-height: 1.2;
}

.face-toolbar__legend-label {
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.face-toolbar__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.face-results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.face-card {
  overflow: hidden;
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

.face-card--suggested {
  border-color: rgba(var(--v-theme-warning), 0.45);
}

.face-card--matched,
.face-card--manual {
  border-color: rgba(var(--v-theme-success), 0.35);
}

.face-card__preview {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(var(--v-theme-surface-variant), 0.55), rgba(var(--v-theme-surface), 0.95));
}

.face-card__preview-hit {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.face-card__preview-frame {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.face-card__preview-empty {
  width: 100%;
  height: 100%;
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.face-card__preview-empty--detail {
  min-height: 220px;
  border-radius: 16px;
  background:
    linear-gradient(145deg, rgba(var(--v-theme-surface-variant), 0.55), rgba(var(--v-theme-surface), 0.95));
}

.face-card__preview-badge {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.face-card__preview-badge--left {
  top: 8px;
  left: 8px;
}

.face-card__preview-badge--right {
  top: auto;
  bottom: 8px;
  right: 8px;
}

.face-card__frames {
  position: absolute;
  left: auto;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 16px);
  padding: 4px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  overflow: hidden;
  pointer-events: auto;
  width: max-content;
}

.face-card__frame-thumb {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &:hover {
    border-color: #fff;
  }
}

.face-card__frame-more {
  flex: 0 0 auto;
  height: 36px;
  min-width: 36px;
  padding: 0 8px;
  border: 1px dashed rgba(255, 255, 255, 0.45);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;

  &:hover {
    border-color: #fff;
    background: rgba(0, 0, 0, 0.4);
  }
}

.face-card__body {
  padding: 12px;
}

.face-card__tag {
  cursor: default;
  border-radius: 8px;

  :deep(.v-img__img) {
    object-position: top center;
  }
}

.face-card__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.22);
  background: rgba(var(--v-theme-on-surface), 0.03);
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.8125rem;
  line-height: 1.25;
}

.face-card__empty--detail {
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 12px;
}

.face-card__empty-icon {
  opacity: 0.75;
  flex: 0 0 auto;
}

.face-card__candidate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 32px;
  padding: 0 8px 0 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: inherit;
  cursor: pointer;
  overflow: hidden;
  text-align: left;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }

  &:not(:disabled):hover {
    border-color: rgba(var(--v-theme-primary), 0.45);
    background: rgba(var(--v-theme-primary), 0.08);
  }
}

.face-card__candidate--active {
  border-color: rgba(var(--v-theme-primary), 0.55);
  background: rgba(var(--v-theme-primary), 0.14);
}

.face-card__candidate--detail {
  height: 36px;
  padding-right: 10px;
}

.face-card__candidate-thumb {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.08);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    display: block;
  }
}

.face-card__candidate--detail .face-card__candidate-thumb {
  width: 36px;
  height: 36px;
}

.face-card__candidate-name {
  min-width: 0;
  max-width: 9.5rem;
  font-size: 0.8125rem;
  line-height: 1.2;
}

.face-card__candidate-score {
  flex: 0 0 auto;
  margin-left: 2px;
}

.face-card__actions {
  margin-top: 24px;
}

.face-detail__frame {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 240px;
  border-radius: 16px;
  background:
    linear-gradient(145deg, rgba(var(--v-theme-surface-variant), 0.55), rgba(var(--v-theme-surface), 0.95));
  overflow: hidden;

  img {
    max-width: 100%;
    max-height: 50vh;
    object-fit: contain;
    display: block;
  }
}

.face-detail__cluster-frame {
  position: relative;
  width: 72px;
  height: 72px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.06);
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.face-detail__cluster-frame--active {
  border-color: rgb(var(--v-theme-primary));
}

.face-detail__cluster-frame-ts {
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: 4px;
  padding: 1px 4px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.65rem;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
