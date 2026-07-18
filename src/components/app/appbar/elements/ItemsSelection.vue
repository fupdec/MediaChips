<template>
  <div class="d-flex align-center" style="height: 40px;">
    <AppBarButton
      icon="select-off"
      :text="t('appbar.buttons.unselect')"
      :action="toggleSelect"
    />

    <AppBarButton
      icon="select-group"
      :text="t('appbar.buttons.selectVisible')"
      :action="selectVisible"
    />

    <AppBarButton
      icon="select-all"
      :text="t('appbar.buttons.selectAll')"
      :action="selectAll"
    />

    <AppBarButton
      v-if="canAutoScrape"
      icon="cloud-download"
      :text="t('appbar.buttons.auto_scrape')"
      :disabled="itemsStore.selection.length === 0 || scraperStore.autoScrapeInProgress"
      :action="autoScrapeSelected"
    />

    <AppBarButton
      v-if="canSceneAutoScrape"
      icon="cloud-download"
      :text="t('appbar.buttons.auto_scrape_scenes')"
      :disabled="itemsStore.selection.length === 0 || sceneScraperStore.autoScrapeInProgress"
      :action="autoScrapeScenesSelected"
    />

    <span class="text-caption ml-6" v-html="selectedText"></span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useItemsStore } from '@/stores/items'
import { useAppStore } from '@/stores/app'
import { useContextMenu } from '@/stores/contextMenu'
import { useScraperStore } from '@mediachips/plugin-adult/stores/scraper'
import { useSceneScraperStore } from '@mediachips/plugin-adult/stores/sceneScraper'
import { useAutoScrapeBatch } from '@mediachips/plugin-adult/composables/useAutoScrapeBatch'
import { useAutoSceneScrapeBatch } from '@mediachips/plugin-adult/composables/useAutoSceneScrapeBatch'
import { isVideoMediaType, getCurrentMediaType } from '@/utils/mediaType'
import { isAdultUiAvailable } from '@/services/adultFeatures'

import AppBarButton from '@/components/app/appbar/AppBarButton.vue'
import {getReadableFileSize} from '@/services/formatUtils'

const itemsStore = useItemsStore()
const appStore = useAppStore()
const contextMenu = useContextMenu()
const scraperStore = useScraperStore()
const sceneScraperStore = useSceneScraperStore()
const { runForSelection } = useAutoScrapeBatch()
const { runForSelection: runSceneScrapeForSelection } = useAutoSceneScrapeBatch()
const { t } = useI18n()

const performerMeta = computed(() => {
  const metaId = itemsStore.environment.meta_id
  if (!metaId) return null
  return appStore.meta.find((item) => item.id === metaId) ?? null
})

const canAutoScrape = computed(() =>
  itemsStore.type === 'tag'
  && isAdultUiAvailable()
  && performerMeta.value?.scraper === true
)

const currentMediaType = computed(() =>
  getCurrentMediaType(appStore.mediaTypes, itemsStore.environment?.media_type_id),
)

const canSceneAutoScrape = computed(() =>
  itemsStore.type === 'media'
  && isAdultUiAvailable()
  && isVideoMediaType(currentMediaType.value)
)

const filesizes = computed(() => {
  if (itemsStore.type !== 'media') return ''

  if (itemsStore.isAllFilteredSelected) {
    return getReadableFileSize(itemsStore.totalFilesize)
  }

  const selectedFiles = itemsStore.entities.filter(i =>
    itemsStore.selection.includes(i.id)
  )

  const sum = selectedFiles.reduce((a, b) => a + Number(b.filesize || 0), 0)

  return getReadableFileSize(sum)
})

const selectedText = computed(() => {
  const selection = itemsStore.selection.length

  if (!selection) {
    return t('appbar.buttons.Please_select_items')
  }

  let text = `${selection} ${t('appbar.buttons.selected')}`

  if (itemsStore.type === 'media') {
    text += `, ${filesizes.value}`
  }

  return text
})

function toggleSelect() {
  itemsStore.isSelect = !itemsStore.isSelect
  itemsStore.selection = []
  itemsStore.selected_last = null
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (event.defaultPrevented) return
  if (contextMenu.show) return
  // Let open Vuetify dialogs/menus handle Escape first
  if (document.querySelector('.v-overlay--active')) return

  event.preventDefault()
  toggleSelect()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})

function selectVisible() {
  itemsStore.selection = itemsStore.itemsOnPage.map(i => i.id)
}

async function selectAll() {
  await itemsStore.selectAllFiltered()
}

async function autoScrapeSelected() {
  const meta = performerMeta.value
  if (!meta || itemsStore.selection.length === 0) return
  await runForSelection(meta)
}

async function autoScrapeScenesSelected() {
  if (itemsStore.selection.length === 0) return
  await runSceneScrapeForSelection()
}
</script>
