<template>
  <v-slide-y-transition>
    <div
      v-if="isVisible"
      class="session-focus-tray"
      :class="{
        'session-focus-tray--bottom-nav': useBottomBar,
        'session-focus-tray--drop-target': isDropTarget,
        'session-focus-tray--empty': !focusTags.length,
      }"
      :style="barStyle"
      role="status"
      @dragover.prevent="onTrayDragOver"
      @dragleave="onTrayDragLeave"
      @drop.prevent="onTrayDrop"
    >
      <div class="session-focus-tray__inner">
        <div class="session-focus-tray__left">
          <span
            class="session-focus-tray__glyph"
            aria-hidden="true"
          >
            <v-icon size="16" icon="mdi-bullseye-arrow"/>
          </span>
          <span class="session-focus-tray__title">{{ t('session_focus.bar_label') }}</span>
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
          class="session-focus-tray__entries"
        >
          <span
            v-if="!focusTags.length"
            class="session-focus-tray__empty"
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
          class="session-focus-tray__actions"
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
          <div class="session-focus-tray__divider"/>
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
  </v-slide-y-transition>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useSessionFocusStore} from '@/stores/sessionFocus'
import {useSessionFocusActions} from '@/composable/useSessionFocusActions'
import {useFixedGridBarBounds} from '@/composable/useFixedGridBarBounds'
import {useItemsStore} from '@/stores/items'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import {recalcChipBarOverflow} from '@/utils/chipBarOverflow'
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

/** Pages where the tray is meaningful (media / tags grids). */
const SESSION_FOCUS_ROUTE_NAMES = new Set([
  'Home',
  'Items',
  'Tag',
  'AllTags',
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
const {barStyle, useBottomBar, syncBounds, observeGrid} = useFixedGridBarBounds()

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

onMounted(() => {
  observeGrid()
  syncBounds()
})

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
  void nextTick().then(() => {
    syncBounds()
    recalcOverflow()
  })
})

watch(
  () => [focusTags.value.length, route.fullPath, isVisible.value] as const,
  () => {
    void nextTick().then(() => {
      observeGrid()
      syncBounds()
      recalcOverflow()
    })
  },
)
</script>

<style scoped>
.session-focus-tray {
  position: fixed;
  box-sizing: border-box;
  bottom: 16px;
  /* Stay inside the grid column: drawers set --v-layout-*, v-container adds 16px. */
  left: calc(var(--v-layout-left, 0px) + 16px);
  right: calc(var(--v-layout-right, 0px) + 16px);
  margin-inline: auto;
  transform: none;
  width: auto;
  max-width: min(100%, var(--container-max-width, 1184px));
  z-index: 1005;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 18px;
  box-shadow:
    0 0 0 1px rgba(var(--v-theme-primary), 0.06),
    0 -6px 18px -4px rgba(0, 0, 0, 0.16),
    0 0 20px -2px rgba(0, 0, 0, 0.14),
    0 10px 28px -8px rgba(0, 0, 0, 0.28);
  padding: 0 14px;
}

.session-focus-tray--bottom-nav {
  bottom: 72px;
}

.session-focus-tray--drop-target {
  border-color: rgb(var(--v-theme-primary));
  box-shadow:
    0 0 0 2px rgba(var(--v-theme-primary), 0.28),
    0 -6px 18px -4px rgba(0, 0, 0, 0.16),
    0 0 20px -2px rgba(0, 0, 0, 0.14),
    0 10px 28px -8px rgba(0, 0, 0, 0.28);
}

.session-focus-tray__inner {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  max-height: 56px;
  overflow: hidden;
}

.session-focus-tray__left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
}

.session-focus-tray__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.session-focus-tray__title {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.session-focus-tray__entries {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
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

.session-focus-tray__empty {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
  white-space: nowrap;
}

.session-focus-tray__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.session-focus-tray__divider {
  width: 1px;
  height: 20px;
  background: rgba(var(--v-theme-on-surface), 0.15);
  margin: 0 2px;
  flex-shrink: 0;
}
</style>
