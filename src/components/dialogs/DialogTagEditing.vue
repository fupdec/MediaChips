<template>
  <v-dialog
    v-if="dialogsStore.tagEditing.show"
    :model-value="dialogsStore.tagEditing.show"
    @click:outside="dialogsStore.tagEditing.show = false"
    :fullscreen="xs"
    :width="xl ? 1400 : 1000"
    scrollable
  >
    <v-card>
      <DialogHeader
        @close="dialogsStore.tagEditing.show = false"
        :header="'Editing'"
        :subheader="tag?.name"
        :subheader-copy-text="tag?.name"
        :buttons="buttons"
        icon="pencil"
        closable
      />

      <v-card-text class="pa-2 pa-sm-4">
        <EditPinnedMetaValues
          v-if="tag && meta"
          :key="`${tag.id}-${editReloadKey}`"
          layout="hero"
          @close="close"
          :tag="tag"
          :meta="meta"
          ref="editingComponent"
        >
          <template #media>
            <EditDialogMediaPanel
              mode="tag"
              :images="images"
              :current-index="currentIndex"
              @update:current-index="currentIndex = $event"
              @edited="onImageEdited"
            />
          </template>
        </EditPinnedMetaValues>
      </v-card-text>
    </v-card>

    <DialogDeleteConfirm
      v-if="is_show_dialog_delete_confirm"
      :dialog="is_show_dialog_delete_confirm"
      @delete="deleteTag"
      @close="is_show_dialog_delete_confirm = false"
      text="Delete tag?"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, shallowRef, nextTick} from 'vue'
import {useDisplay} from 'vuetify'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {useScraperStore} from "@mediachips/plugin-adult/stores/scraper"
import {useNotificationsStore} from "@/stores/notifications"
import {isAdultUiAvailable} from '@/services/adultFeatures'
import {typedApi} from '@/services/typedApi'
import {checkFileExists} from '@/services/fileService'
import {isThumbUnavailable, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {refreshTagThumbDisplay} from '@/utils/tagThumbRefresh'
import {checkCurrentPage, getUrlParam} from '@/services/routeService'
import path from 'path-browserify'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import EditPinnedMetaValues from '@/components/items/EditPinnedMetaValues.vue'
import EditDialogMediaPanel from '@/components/items/EditDialogMediaPanel.vue'
import {useEventBus} from "@/utils/eventBus"
import DialogDeleteConfirm from "@/components/dialogs/DialogDeleteConfirm.vue"
import type {ImageEditedPayload} from '@/components/dialogs/DialogImageEditing.vue'

interface TagImage {
  type: string
  path: string
  src: string
  aspectRatio: number
  width: number
  height: number
  key: string
}

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  variant?: string
  action?: () => void | Promise<void>
}

interface EditComponentInstance {
  save?: () => Promise<boolean>
  tryApplyAutoColorFromImage?: (color: string) => void
  reload?: () => Promise<void>
}

const {xl, xs} = useDisplay()
const router = useRouter()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const store = useAppStore()
const scraperStore = useScraperStore()
const notificationsStore = useNotificationsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const images = ref<TagImage[]>([])
const buttons = ref<DialogHeaderButton[]>([])
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const is_show_dialog_delete_confirm = ref(false)
const editingComponent = ref<EditComponentInstance | null>(null)
const currentIndex = shallowRef(0)
const editReloadKey = ref(0)

const tag = computed(() => dialogsStore.tagEditing.tag)
const meta = computed(() => dialogsStore.tagEditing.meta)

const isTagPage = computed(() => checkCurrentPage(router.currentRoute.value, 'tag'))

const initButtons = () => {
  buttons.value = [
    {
      icon: 'delete',
      text: t('common.delete'),
      color: 'error',
      variant: 'flat',
      action: () => {
        is_show_dialog_delete_confirm.value = true
      }
    }
  ]

  if (isAdultUiAvailable() && meta.value?.scraper) {
    buttons.value.push({
      icon: 'search-web',
      text: t('actions.scrape_info'),
      color: 'info',
      variant: 'flat',
      action: openScraper
    })
    buttons.value.push({
      icon: 'cloud-download',
      text: t('actions.auto_scrape_info'),
      color: 'info',
      variant: 'tonal',
      action: autoScrape
    })
  }

  buttons.value.push({
    icon: 'content-save',
    text: t('common.save'),
    color: 'success',
    variant: 'flat',
    action: save
  })
}

const getImages = async ({cacheBust = false}: {cacheBust?: boolean} = {}) => {
  images.value = []
  if (!tag.value || !meta.value) return

  const imageTypes = [
    {type: 'main', aspectRatio: meta.value.imageAspectRatio || 1, width: 300},
    {type: 'alt', aspectRatio: meta.value.imageAspectRatio || 1, width: 300},
    {type: 'custom1', aspectRatio: meta.value.imageAspectRatio || 1, width: 300},
    {type: 'custom2', aspectRatio: meta.value.imageAspectRatio || 1, width: 300},
    {type: 'avatar', aspectRatio: 1, width: 164},
    {type: 'header', aspectRatio: 2.3, width: 1400}
  ]

  for (const imgType of imageTypes) {
    const fileName = `${tag.value.id}_${imgType.type}.jpg`
    const imgPath = path.join(
      store.dbPath,
      'meta',
      String(meta.value.id),
      fileName,
    )
    if (!await checkFileExists(imgPath)) continue

    const src = resolveTagThumbDisplayUrl({
      dbPath: store.dbPath,
      metaId: meta.value.id,
      tagId: tag.value.id,
      type: imgType.type,
      cacheBust,
    })

    if (!isThumbUnavailable(src)) {
      images.value.push({
        type: imgType.type,
        path: imgPath,
        src,
        aspectRatio: imgType.aspectRatio,
        width: imgType.width,
        height: Math.floor(imgType.width / imgType.aspectRatio),
        key: `${imgType.type}-${tag.value.id}`,
      })
    }
  }

  if (currentIndex.value >= images.value.length) {
    currentIndex.value = 0
  }
}

const onImageEdited = (payload?: ImageEditedPayload) => {
  if (tag.value && meta.value) {
    refreshTagThumbDisplay(itemsStore, store.dbPath, meta.value.id, tag.value.id)
  }
  getImages({cacheBust: true})
  if (payload?.extractedColor) {
    editingComponent.value?.tryApplyAutoColorFromImage?.(payload.extractedColor)
  }
  if (!tag.value) return
  eventBus.emit('getItemsFromDb', {
    ids: [tag.value.id],
    type: 'tag'
  })
}

const deleteTag = async () => {
  if (!tag.value || !meta.value) return

  const deletedTagId = tag.value.id
  const deletedMetaId = meta.value.id
  const deletedTagName = tag.value.name

  try {
    await typedApi.deleteEntityOne('tag', {
      metaId: deletedMetaId,
      id: deletedTagId,
    })

    if (itemsStore.type === 'media') {
      const visibleIds = itemsStore.itemsOnPage.map((item) => item.id)
      for (const itemId of visibleIds) {
        itemsStore.removeTagFromItem({itemId, tagId: deletedTagId})
      }
    }

    itemsStore.removeItem(deletedTagId)

    eventBus.emit('removeEntitiesFromState', {
      ids: [deletedTagId],
      type: 'tag',
    })

    eventBus.emit('getTags', [])

    close()

    notificationsStore.setNotification({
      type: 'info',
      title: 'The tag has been deleted',
      text: deletedTagName,
    })

    const routeTagId = getUrlParam(router.currentRoute.value, 'tagId')
    const isDeletingCurrentPageTag = isTagPage.value
      && routeTagId != null
      && Number(routeTagId) === Number(deletedTagId)

    if (isDeletingCurrentPageTag) {
      await router.push(`/meta?metaId=${deletedMetaId}`)
      await nextTick()
    }

    eventBus.emit('getItemsFromDb', {type: 'tag'})
  } catch (error) {
    console.error('Error deleting tag:', error)
  }
}

const save = async () => {
  if (!editingComponent.value?.save) {
    console.error('Component or method not available')
    return
  }

  const saved = await editingComponent.value.save()
  if (!saved) return

  const savedTagId = tag.value?.id

  if (isTagPage.value) {
    eventBus.emit('getTag')
  }

  if (savedTagId != null) {
    eventBus.emit('getItemsFromDb', {ids: [savedTagId], type: 'tag'})
  }

  if (itemsStore.type === 'media') {
    eventBus.emit('getTags')
  }

  dialogsStore.tagEditing.show = false
}

const close = () => {
  dialogsStore.tagEditing.show = false
}

const openScraper = () => {
  if (tag.value?.name) {
    scraperStore.query = tag.value.name
  }
  dialogsStore.scraper.show = true
}

const autoScrape = async () => {
  if (!tag.value || !meta.value) return

  dialogsStore.process.show = true
  dialogsStore.process.text = t('scraper.auto_scrape_in_progress', { name: tag.value.name || '' })

  try {
    const result = await scraperStore.autoScrapeTag({
      tag: tag.value,
      meta: meta.value,
    })

    if (result.success) {
      notificationsStore.setNotification({
        type: 'success',
        title: t('scraper.auto_scrape_done'),
        text: result.performerName || tag.value.name || '',
      })

      try {
        const response = await typedApi.getTagById(tag.value.id)
        if (response.data) {
          dialogsStore.tagEditing.tag = response.data
        }
      } catch (error) {
        console.error('Error refreshing tag after auto scrape:', error)
      }

      eventBus.emit('getItemsFromDb', { ids: [tag.value.id], type: 'tag' })
      if (isTagPage.value) {
        eventBus.emit('getTag')
      }
      editReloadKey.value += 1
      getImages({ cacheBust: true })
    } else {
      notificationsStore.setNotification({
        type: result.error === 'not_found' ? 'warning' : 'error',
        title: t('scraper.auto_scrape_failed'),
        text: tag.value.name || '',
      })
    }
  } finally {
    dialogsStore.process.show = false
    dialogsStore.process.text = null
  }
}

const handleScraperImages = () => {
  if (tag.value && meta.value) {
    refreshTagThumbDisplay(itemsStore, store.dbPath, meta.value.id, tag.value.id)
  }
  getImages({cacheBust: true})
  if (!tag.value) return
  eventBus.emit('getItemsFromDb', {ids: [tag.value.id], type: 'tag'})
}

onMounted(() => {
  initButtons()
  getImages()

  eventBus.on('scraperGotImages', handleScraperImages)
})

onBeforeUnmount(() => {
  eventBus.off('scraperGotImages', handleScraperImages)
  if (debounceTimer.value) clearTimeout(debounceTimer.value)
})
</script>
