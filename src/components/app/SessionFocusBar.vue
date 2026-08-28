<template>
  <Teleport
    defer
    :to="dockHost"
  >
    <div
      v-if="isVisible"
      class="floating-bottom-dock-lane session-focus-tray"
      :class="{
        'session-focus-tray--drop-target': isDropTarget,
        'session-focus-tray--empty': !focusTags.length,
      }"
      data-dock-order="tray"
      role="status"
      @dragover.prevent="onTrayDragOver"
      @dragleave="onTrayDragLeave"
      @drop.prevent="onTrayDrop"
    >
      <div class="floating-bottom-dock-lane__row">
        <div class="floating-bottom-dock-lane__left">
          <span
            class="floating-bottom-dock-lane__glyph"
            aria-hidden="true"
          >
            <v-icon size="16" icon="mdi-bullseye-arrow"/>
          </span>
          <span class="floating-bottom-dock-lane__title">{{ t('session_focus.bar_label') }}</span>
          <v-chip
            v-if="focusTags.length"
            size="x-small"
            color="primary"
            variant="tonal"
            label
            class="ml-1"
          >
            {{ focusTags.length }}
          </v-chip>
          <ButtonDocumentation
            id="tags.session_focus"
            dense
          />
        </div>

        <div
          ref="entriesContainerRef"
          class="floating-bottom-dock-lane__entries"
        >
          <span
            v-if="!focusTags.length"
            class="floating-bottom-dock-lane__empty"
          >
            {{ t('session_focus.drop_here') }}
          </span>
          <template v-else>
            <v-chip
              v-for="entry in focusTags"
              :key="entry.tagId"
              size="x-small"
              variant="tonal"
              label
              closable
              :draggable="true"
              class="session-focus-tray__entry"
              :prepend-icon="entry.icon ? `mdi-${entry.icon}` : undefined"
              :title="entry.name"
              @click="openFocusTagPage(entry)"
              @click:close.stop.prevent="removeFromTray(entry.tagId)"
              @dragstart="onChipDragStart($event, entry)"
              @dragend="onChipDragEnd"
            >
              <span class="session-focus-tray__entry-name">{{ entry.name }}</span>
            </v-chip>
            <v-chip
              size="x-small"
              variant="tonal"
              label
              class="session-focus-tray__entry session-focus-tray__entry--more"
              :class="{'session-focus-tray__entry--more-hidden': overflowCount <= 0}"
              :title="overflowNames"
            >
              +{{ overflowCount || '0' }}
            </v-chip>
          </template>
        </div>

        <div
          v-if="focusTags.length"
          class="floating-bottom-dock-lane__actions"
        >
          <v-btn
            size="x-small"
            variant="tonal"
            icon="mdi-tag-plus"
            color="success"
            v-tooltip:top="`${t('session_focus.apply_all')} (T)`"
            :disabled="!canApplyToTargets"
            @click="onApplyAll"
          />
          <v-btn
            size="x-small"
            variant="tonal"
            icon="mdi-filter-outline"
            v-tooltip:top="t('session_focus.browse_with')"
            @click="browseWithFocus()"
          />
          <v-btn
            size="x-small"
            variant="tonal"
            icon="mdi-filter-off-outline"
            v-tooltip:top="t('session_focus.browse_without')"
            @click="browseWithoutFocus()"
          />
          <div class="floating-bottom-dock-lane__divider"/>
          <v-btn
            size="x-small"
            variant="tonal"
            icon="mdi-close"
            v-tooltip:top="t('session_focus.clear')"
            @click="clearFocus"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useSessionFocusStore} from '@/stores/sessionFocus'
import {useSessionFocusActions} from '@/composable/useSessionFocusActions'
import {useItemsStore} from '@/stores/items'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import {recalcChipBarOverflow} from '@/utils/chipBarOverflow'
import {FLOATING_BOTTOM_DOCK_HOST} from '@/utils/floatingBottomDock'
import {
  clearMediaTagDrag,
  isMediaTagDragActive,
  onMediaTagDragChange,
} from '@/utils/mediaTagDrag'
import {
  isSessionFocusTagsDragEvent,
  readSessionFocusTagsDrag,
  writeSessionFocusTagsDrag,
} from '@/utils/sessionFocusDrag'

/** Pages where the tray is meaningful (media / tags grids, folders browse). */
const SESSION_FOCUS_ROUTE_NAMES = new Set([
  'Home',
  'Items',
  'Tag',
  'AllTags',
  'Folders',
])

const {t} = useI18n()
const route = useRoute()
const focusStore = useSessionFocusStore()
const itemsStore = useItemsStore()
const {
  clearFocus,
  browseWithFocus,
  browseWithoutFocus,
  openFocusTagPage,
  removeFromTray,
  addTagsToTray,
  applyTrayToCurrentTargets,
} = useSessionFocusActions()

const dockHost = FLOATING_BOTTOM_DOCK_HOST
const entriesContainerRef = ref<HTMLElement | null>(null)
const overflowCount = ref(0)
const isDropTarget = ref(false)
const mediaTagDragActive = ref(isMediaTagDragActive())

const focusTags = computed(() => focusStore.tags)
const onRelevantRoute = computed(() => SESSION_FOCUS_ROUTE_NAMES.has(String(route.name || '')))
const isVisible = computed(() =>
  onRelevantRoute.value && (focusTags.value.length > 0 || mediaTagDragActive.value),
)
const canApplyToTargets = computed(() =>
  itemsStore.selection.length > 0 || Number(itemsStore.selected_last) > 0,
)
const overflowNames = computed(() => {
  if (overflowCount.value <= 0) return ''
  return focusTags.value.slice(-overflowCount.value).map((tag) => tag.name).join(', ')
})

function recalcOverflow() {
  overflowCount.value = recalcChipBarOverflow(entriesContainerRef.value, {
    chipSelector: ':scope > .session-focus-tray__entry:not(.session-focus-tray__entry--more)',
    moreSelector: '.session-focus-tray__entry--more',
  })
}

function onChipDragStart(event: DragEvent, tag: typeof focusTags.value[number]) {
  writeSessionFocusTagsDrag(event, [tag])
}

function onChipDragEnd() {
  clearMediaTagDrag()
  isDropTarget.value = false
}

function onTrayDragOver(event: DragEvent) {
  if (!isSessionFocusTagsDragEvent(event) && !mediaTagDragActive.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  isDropTarget.value = true
}

function onTrayDragLeave(event: DragEvent) {
  const next = event.relatedTarget
  if (next instanceof Node && (event.currentTarget as HTMLElement | null)?.contains(next)) return
  isDropTarget.value = false
}

function onTrayDrop(event: DragEvent) {
  isDropTarget.value = false
  const tags = readSessionFocusTagsDrag(event)
  clearMediaTagDrag()
  if (!tags.length) return
  addTagsToTray(tags)
}

function onApplyAll() {
  void applyTrayToCurrentTargets()
}

let unsubscribeDrag: (() => void) | null = onMediaTagDragChange((active) => {
  mediaTagDragActive.value = active
  if (!active) isDropTarget.value = false
})

let overflowObserver: ResizeObserver | null = null

onBeforeUnmount(() => {
  unsubscribeDrag?.()
  unsubscribeDrag = null
  overflowObserver?.disconnect()
  overflowObserver = null
})

watch(entriesContainerRef, (el) => {
  overflowObserver?.disconnect()
  overflowObserver = null
  if (!el) return
  overflowObserver = new ResizeObserver(() => {
    recalcOverflow()
  })
  overflowObserver.observe(el)
  void nextTick().then(recalcOverflow)
})

watch(
  () => [focusTags.value.length, route.fullPath, isVisible.value] as const,
  () => {
    void nextTick().then(recalcOverflow)
  },
)
</script>

<style scoped>
.session-focus-tray--drop-target {
  background: rgba(var(--v-theme-primary), 0.08);
}

.session-focus-tray__entry {
  flex-shrink: 0;
  max-width: 160px;
  overflow: hidden;
  cursor: grab;
}

.session-focus-tray__entry :deep(.v-chip__content) {
  min-width: 0;
  overflow: hidden;
}

.session-focus-tray__entry-name {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-focus-tray__entry.chip-bar-entry--overflow-hidden {
  display: none !important;
}

.session-focus-tray__entry--more {
  flex-shrink: 0;
  min-width: 2.25rem;
  justify-content: center;
  font-weight: 600;
  cursor: default;
}

.session-focus-tray__entry--more-hidden {
  display: none !important;
}

.session-focus-tray__entry--more.chip-bar-entry--more-measure {
  display: inline-flex !important;
  position: absolute;
  visibility: hidden;
  pointer-events: none;
}
</style>
