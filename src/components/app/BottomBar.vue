<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {RouterLink, useRoute} from 'vue-router'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'
import {isLibraryNavLinkActive} from '@/utils/libraryNavActive'
import {useFixedGridBarBounds} from '@/composable/useFixedGridBarBounds'

const CONTENT_HEIGHT = 56
/** Floating bar: free space above / below the card (keep in sync with the CSS below). */
const FLOAT_GAP_TOP = 8
const FLOAT_GAP_BOTTOM = 12

const inboxHovered = ref(false)
const hiddenMetaMenu = ref(false)
const safeAreaBottom = ref(0)

const {mobile} = useDisplay()
const {t} = useI18n()
const route = useRoute()

function linkActive(link: {to: string; exact?: boolean}): boolean {
  return isLibraryNavLinkActive(link, route)
}

const {
  mediaTypesHidden,
  metaVisibleLeaves,
  metaHiddenLeaves,
  libraryLinks,
  settingsLink,
  allTagsLink,
  trashLink,
  showTrash,
  showInbox,
  inboxBadgeCount,
  inboxLostCount,
  watcherBusy,
  openInbox,
  openTrash,
  metaLink,
  mediaTypePath,
  mediaTypeTitle,
} = useLibraryNavItems()

const metaVisibleLinks = computed(() => metaVisibleLeaves.value.map((item) => metaLink(item)))

type NavEntry = {key: string; title: string; icon: string; to?: string; exact?: boolean; hidden?: boolean; action?: () => void}
const navigation = ref<HTMLElement | null>(null)
const availableWidth = ref(0)
const itemWidth = computed(() => mobile.value ? 48 : 54)
const MORE_WIDTH = 32
const entries = computed<NavEntry[]>(() => [
  ...libraryLinks.value,
  ...metaVisibleLinks.value,
  ...(showTrash.value ? [{...trashLink.value, action: openTrash}] : []),
  ...(showInbox.value ? [{key: 'inbox', title: t('media_inbox.nav'), icon: 'mdi-inbox-outline', action: openInbox}] : []),
])
const hiddenEntries = computed<NavEntry[]>(() => [
  allTagsLink.value,
  ...mediaTypesHidden.value.map(item => ({key: `media-${item.id}`, title: mediaTypeTitle(item), icon: `mdi-${item.icon}`, to: mediaTypePath(item.id), exact: true, hidden: true})),
  ...metaHiddenLeaves.value.map(item => ({...metaLink(item), hidden: true})),
])
const capacity = computed(() => {
  const width = Math.max(0, availableWidth.value - 2)
  const needsMore = hiddenEntries.value.length > 0 || (entries.value.length + 1) * itemWidth.value > width
  return Math.max(0, Math.floor((width - (needsMore ? MORE_WIDTH : 0)) / itemWidth.value) - 1)
})
const visibleEntries = computed(() => entries.value.slice(0, capacity.value))
const overflowEntries = computed(() => [...entries.value.slice(capacity.value), ...hiddenEntries.value])
function groupFor(entry: NavEntry) {
  if (entry.key.startsWith('media-')) return 'media'
  if (entry.key.startsWith('meta-') || entry.key === 'all-tags') return 'tags'
  if (entry.key === 'trash' || entry.key === 'inbox') return 'system'
  return 'library'
}

const overflowGroups = computed(() => {
  return [
    {key: 'library', title: t('navigation.section_library')},
    {key: 'media', title: t('media.adding.media_types')},
    {key: 'tags', title: t('navigation.section_tags')},
    {key: 'system', title: t('navigation.section_system')},
  ].map(group => ({...group, entries: overflowEntries.value.filter(entry => groupFor(entry) === group.key)}))
    .filter(group => group.entries.length > 0)
})

const cardWidth = computed(() => (visibleEntries.value.length + 1) * itemWidth.value + (overflowEntries.value.length ? MORE_WIDTH : 0) + 2)

function entryActive(entry: NavEntry) {
  return entry.to ? linkActive({...entry, to: entry.to}) : false
}

function measureAvailableWidth() {
  const el = navigation.value
  if (!el) return
  const style = getComputedStyle(el)
  const width = el.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  const gridWidth = parseFloat((barStyle.value as {maxWidth?: string}).maxWidth || '')
  availableWidth.value = Math.max(0, Math.min(width, gridWidth || 1184))
}
let navigationObserver: ResizeObserver | null = null

function readSafeAreaBottom() {
  if (typeof document === 'undefined') return 0
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)'
  document.body.appendChild(probe)
  const value = probe.getBoundingClientRect().height
  probe.remove()
  return Number.isFinite(value) ? value : 0
}

function updateSafeAreaBottom() {
  safeAreaBottom.value = readSafeAreaBottom()
}

/** Visual height only: the floating card must not reserve a full-width layout strip. */
const navHeight = computed(() => (
  CONTENT_HEIGHT + FLOAT_GAP_TOP + FLOAT_GAP_BOTTOM + Math.ceil(safeAreaBottom.value)
))

// Max width = the page container (same anchor as the floating dock above the bar).
const {barStyle, syncBounds, observeGrid} = useFixedGridBarBounds()

// The bar spans the window while the content is narrowed by side panels. Their sizes
// are exposed as --v-layout-left/right on <v-main> only, so read them from there
// and center the card inside the content area (same as the dock above it).
const insetLeft = ref(0)
const insetRight = ref(0)

const floatStyle = computed(() => {
  const maxWidth = (barStyle.value as {maxWidth?: string}).maxWidth
  return {
    height: `${navHeight.value}px`,
    ...(maxWidth ? {'--bottom-bar-max-width': maxWidth} : {}),
    '--bottom-bar-card-width': `${cardWidth.value}px`,
    '--bottom-bar-item-width': `${itemWidth.value}px`,
    '--bottom-bar-inset-left': `${insetLeft.value}px`,
    '--bottom-bar-inset-right': `${insetRight.value}px`,
  }
})

let mainEl: HTMLElement | null = null
let mainObserver: MutationObserver | null = null
let boundsTimer: ReturnType<typeof setTimeout> | null = null
let mainPollTimer: ReturnType<typeof setInterval> | null = null

function readInsets() {
  if (!mainEl) return
  const styles = getComputedStyle(mainEl)
  insetLeft.value = parseFloat(styles.getPropertyValue('--v-layout-left')) || 0
  insetRight.value = parseFloat(styles.getPropertyValue('--v-layout-right')) || 0
}

function attachMainObserver() {
  const el = document.querySelector<HTMLElement>('.v-main')
  if (!el) return false
  if (el === mainEl) return true
  mainObserver?.disconnect()
  mainEl = el
  readInsets()
  if (typeof MutationObserver !== 'undefined') {
    mainObserver = new MutationObserver(readInsets)
    mainObserver.observe(el, {attributes: true, attributeFilter: ['style']})
  }
  return true
}

function refreshBounds() {
  attachMainObserver()
  readInsets()
  observeGrid()
  syncBounds()
  measureAvailableWidth()
}

// The page container mounts after the route changes; re-measure it.
watch(() => route.fullPath, () => {
  void nextTick(refreshBounds)
  if (boundsTimer) clearTimeout(boundsTimer)
  boundsTimer = setTimeout(refreshBounds, 300)
})

watch([barStyle, insetLeft, insetRight, mobile], () => { void nextTick(measureAvailableWidth) })

onMounted(() => {
  navigationObserver = new ResizeObserver(measureAvailableWidth)
  if (navigation.value) navigationObserver.observe(navigation.value)
  refreshBounds()
  if (!mainEl) {
    // <v-main> may mount a moment later than the bar.
    let tries = 0
    mainPollTimer = setInterval(() => {
      tries += 1
      if (attachMainObserver() || tries >= 40) {
        if (mainPollTimer) clearInterval(mainPollTimer)
        mainPollTimer = null
        refreshBounds()
      }
    }, 100)
  }
  updateSafeAreaBottom()
  window.addEventListener('resize', updateSafeAreaBottom)
  window.visualViewport?.addEventListener('resize', updateSafeAreaBottom)
})

onUnmounted(() => {
  navigationObserver?.disconnect()
  if (boundsTimer) clearTimeout(boundsTimer)
  if (mainPollTimer) clearInterval(mainPollTimer)
  mainObserver?.disconnect()
  mainObserver = null
  mainEl = null
  window.removeEventListener('resize', updateSafeAreaBottom)
  window.visualViewport?.removeEventListener('resize', updateSafeAreaBottom)
})
</script>

<template>
  <nav
    ref="navigation"
    class="bottom-menu"
    :class="{'bottom-menu--mobile': mobile}"
    :style="floatStyle"
    :aria-label="t('navigation.section_library')"
  >
    <div class="bottom-menu__content">
      <v-tooltip v-for="(entry, index) in visibleEntries" :key="entry.key" location="top" :disabled="mobile">
        <template #activator="{props}">
          <component
            :is="entry.to ? RouterLink : 'button'"
            class="bottom-menu__button"
            :class="{
              'bottom-menu__button--active': entryActive(entry),
              'bottom-menu__button--separator': index > 0 && groupFor(entry) !== groupFor(visibleEntries[index - 1]),
            }"
            v-bind="props"
            :to="entry.to"
            :type="entry.to ? undefined : 'button'"
            :aria-current="entryActive(entry) ? 'page' : undefined"
            :aria-label="entry.title"
            :disabled="entry.key === 'inbox' && watcherBusy"
            @click="entry.action?.()"
            @mouseover="inboxHovered = entry.key === 'inbox'"
            @mouseleave="inboxHovered = false"
          >
            <v-badge v-if="entry.key === 'inbox'" :content="inboxBadgeCount" :model-value="inboxBadgeCount > 0" :dot="!inboxHovered" color="success">
              <v-badge :content="inboxLostCount" :model-value="inboxLostCount > 0" :dot="!inboxHovered" color="error" location="bottom right">
                <v-icon>{{ entry.icon }}</v-icon>
              </v-badge>
            </v-badge>
            <v-icon v-else>{{ entry.icon }}</v-icon>
            <span class="bottom-menu__label">{{ entry.title }}</span>
          </component>
        </template>
        {{ entry.title }}
      </v-tooltip>

      <v-menu v-if="overflowEntries.length" v-model="hiddenMetaMenu" location="top" :offset="8" content-class="bottom-more-menu">
        <template #activator="{props}">
          <button v-bind="props" type="button" :class="{'bottom-menu__button--active': overflowEntries.some(entryActive)}" class="bottom-menu__button btn-hidden" :aria-label="t('common.more')">
            <v-icon>{{ hiddenMetaMenu ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
          </button>
        </template>
        <v-list class="bottom-more-list" density="compact" nav>
          <template v-for="(group, index) in overflowGroups" :key="group.key">
            <v-divider v-if="index" class="bottom-more-list__divider" />
            <v-list-subheader class="bottom-more-list__heading">{{ group.title }}</v-list-subheader>
            <v-list-item
              v-for="entry in group.entries"
              :key="entry.key"
              :class="{'bottom-more-list__item--hidden': entry.hidden}"
              :aria-label="entry.hidden ? `${entry.title} (${t('navigation.hidden')})` : entry.title"
              :to="entry.to"
              :exact="entry.exact"
              :active="entryActive(entry)"
              :disabled="entry.key === 'inbox' && watcherBusy"
              color="primary"
              rounded="lg"
              :title="entry.title"
              @click="entry.action?.()"
            >
              <template #prepend>
                <span class="bottom-more-list__icon"><v-icon size="18">{{ entry.icon }}</v-icon></span>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-menu>

      <v-tooltip location="top" :disabled="mobile">
        <template #activator="{props}">
          <RouterLink v-bind="props" :to="settingsLink.to" class="bottom-menu__button bottom-menu__button--separator" :class="{'bottom-menu__button--active': linkActive(settingsLink)}" :aria-label="settingsLink.title">
            <v-icon>{{ settingsLink.icon }}</v-icon>
            <span class="bottom-menu__label">{{ settingsLink.title }}</span>
          </RouterLink>
        </template>
        {{ settingsLink.title }}
      </v-tooltip>
    </div>
  </nav>
</template>

<style lang="scss">
.bottom-menu {
  --bottom-bar-gap-x: 16px;
  position: fixed;
  inset: auto 0 0;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8px calc(var(--bottom-bar-inset-right, 0px) + var(--bottom-bar-gap-x))
    calc(12px + env(safe-area-inset-bottom, 0px))
    calc(var(--bottom-bar-inset-left, 0px) + var(--bottom-bar-gap-x));
  pointer-events: none;
  z-index: 1004;
}

.bottom-menu__content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  box-sizing: border-box;
  width: var(--bottom-bar-card-width);
  max-width: min(100%, var(--bottom-bar-max-width, 1184px));
  height: 56px;
  overflow: hidden;
  pointer-events: auto;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.05),
    0 12px 36px -8px rgba(0, 0, 0, 0.34), 0 3px 12px -2px rgba(0, 0, 0, 0.16);
}

.bottom-menu__button {
  position: relative;
  box-sizing: border-box;
  flex: 0 0 calc(var(--bottom-bar-item-width) - 8px);
  width: calc(var(--bottom-bar-item-width) - 8px);
  min-width: 0;
  height: calc(var(--bottom-bar-item-width) - 8px);
  margin: 4px;
  padding: 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.72);
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover { background: rgba(var(--v-theme-primary), 0.07); }
  &:focus-visible {
    outline: 2px solid rgba(var(--v-theme-primary), 0.6);
    outline-offset: -2px;
  }
  &:active { background: rgba(var(--v-theme-primary), 0.18); }
  &:disabled { opacity: 0.4; cursor: default; }
  .v-icon { font-size: 24px; }
  &.btn-hidden { flex-basis: 24px; width: 24px; }
}

.bottom-menu__button--separator::before {
  content: '';
  position: absolute;
  left: -4px;
  top: 50%;
  width: 1px;
  height: 20px;
  transform: translateY(-50%);
  background: rgba(var(--v-theme-on-surface), 0.14);
  pointer-events: none;
}

.bottom-menu__button--active {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.bottom-menu__label {
  display: none;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 14px;
}

.bottom-menu__button--active .bottom-menu__label { display: block; }
.bottom-menu--mobile .bottom-menu__label { display: none; }

/* Hidden categories sub-menu (teleported to the overlay container). */
.v-menu > .v-overlay__content.bottom-more-menu {
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
}

.bottom-more-menu .v-list.bottom-more-list {
  min-width: 220px;
  max-height: min(70vh, 480px);
  padding: 8px;
  border-radius: 16px;
  background-color: rgba(var(--v-theme-surface), 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: thin solid rgba(var(--v-border-color), 0.16);
}

.bottom-more-list .v-list-item {
  --v-list-prepend-gap: 10px;
  min-height: 44px;
  padding: 6px 8px;
  font-weight: 500;
}

.bottom-more-list .v-list-item:not(:last-child) {
  margin-bottom: 2px;
}

.bottom-more-list .bottom-more-list__heading {
  min-height: 28px;
  padding: 4px 8px 6px;
  line-height: 16px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.bottom-more-list .bottom-more-list__divider {
  margin: 8px 8px 4px;
}

.bottom-more-list .bottom-more-list__item--hidden {
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.bottom-more-list .bottom-more-list__item--hidden:hover,
.bottom-more-list .bottom-more-list__item--hidden:focus-visible {
  opacity: 0.85;
}

.bottom-more-list__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  background: rgba(var(--v-theme-on-surface), 0.06);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.bottom-more-list .v-list-item:hover .bottom-more-list__icon {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.bottom-more-list .v-list-item--active .bottom-more-list__icon {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.16);
}

@media (max-width: 600px) {
  .bottom-menu { --bottom-bar-gap-x: 8px; }
}
</style>
