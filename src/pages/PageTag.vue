<template>
  <div :class="['tag-page', `tag-page--${tagPageDesign}`]">
    <v-container v-if="loadError" class="py-4">
      <v-alert type="error" rounded="xl" variant="tonal">
        {{ loadError }}
      </v-alert>
    </v-container>

    <template v-else>
    <v-container
      v-if="tagPageDesign === 'minimal'"
      class="tag-header-minimal py-4"
    >
      <v-row align="center">
        <v-col cols="12" lg="6">
          <v-btn
            @click="openMetaPage"
            :title="t('actions.open_page')"
            class="tag-meta-link"
            rounded
            variant="tonal"
          >
            <v-icon start>mdi-{{ meta.icon }}</v-icon>
            <div class="text">{{ meta.name }}</div>
            <v-icon end>mdi-arrow-left</v-icon>
          </v-btn>
        </v-col>
        <v-col cols="12" lg="6" class="d-flex justify-lg-end">
          <TagPageDesignSwitcher
            :model-value="tagPageDesign"
            :loading="designSaving"
            @update:model-value="changeTagPageDesign"
          />
        </v-col>
      </v-row>

      <v-row align="center" class="mt-2">
        <v-col cols="auto">
          <v-avatar
            v-if="avatarDisplaySrc"
            :size="avatarSize"
            class="tag-profile-heading__avatar"
          >
            <v-img :src="avatarDisplaySrc" cover />
          </v-avatar>
          <v-icon v-else class="tag-profile-heading__icon" size="40">mdi-{{ meta.icon }}</v-icon>
        </v-col>
        <v-col>
          <div class="tag-profile-heading__name-row d-inline-flex align-center">
            <span class="tag-profile-heading__name text-h4">{{ tag.name }}</span>
            <v-btn
              @click="copyTagName"
              variant="text"
              icon
              size="small"
              class="tag-profile-heading__copy ml-1"
              :title="t('common.copy_name')"
            >
              <v-icon icon="mdi-content-copy" />
            </v-btn>
          </div>
        </v-col>
        <v-col cols="auto">
          <v-btn @click="editMetaTag" color="primary" rounded variant="flat">
            <v-icon start>mdi-pencil</v-icon>
            {{ t('common.edit') }}
          </v-btn>
        </v-col>
      </v-row>

      <v-card class="tag-panel tag-panel--flat mt-4" rounded="xl" variant="outlined">
        <v-card-title class="d-flex align-center justify-space-between">
          <span>{{ t('meta.fields.metadata') }}</span>
          <v-progress-linear
            :model-value="completionStatus"
            height="4"
            color="primary"
            class="tag-panel__progress ml-4"
            rounded
          />
        </v-card-title>
        <v-card-text>
          <ItemPinnedMeta
            :item="tag"
            :tags="tag.tags"
            :values="tag.values"
            :assignment="pinnedMeta"
            :is-show-all="true"
            type="tag"
            tag-page
          />
        </v-card-text>
      </v-card>
    </v-container>

    <v-responsive
      v-else
      :aspect-ratio="headerAspectRatio"
      class="tag-header"
      :class="{
        'no-header-image': !is_header_exists,
        'tag-header--has-bg': Boolean(headerBackgroundSrc),
        'tag-header--compact': tagPageDesign === 'compact',
      }"
    >
      <div
        v-if="headerBackgroundSrc"
        :class="['bg-image', {'bg-header': is_header_exists}]"
        aria-hidden="true"
      >
        <v-img :key="upd" :src="headerBackgroundSrc" cover />
      </div>

      <v-container class="profile-container my-6">
        <v-row align="center">
          <v-col cols="12" lg="6">
            <v-btn
              @click="openMetaPage"
              :title="t('actions.open_page')"
              class="tag-meta-link"
              rounded
              variant="tonal"
            >
              <v-icon start>mdi-{{ meta.icon }}</v-icon>
              <div class="text">{{ meta.name }}</div>
              <v-icon end>mdi-arrow-left</v-icon>
            </v-btn>
          </v-col>
          <v-col cols="12" lg="6" class="d-flex justify-lg-end">
            <TagPageDesignSwitcher
              :model-value="tagPageDesign"
              :loading="designSaving"
              @update:model-value="changeTagPageDesign"
            />
          </v-col>
        </v-row>

        <v-row style="position: relative;">
          <v-col cols="12">
            <v-card
              class="tag-profile-heading"
              :class="tagPageDesign === 'compact' ? 'text-h3' : 'text-md-h2 text-xl-h1'"
              variant="text"
            >
              <v-avatar
                v-if="avatarDisplaySrc"
                :size="avatarSize"
                class="tag-profile-heading__avatar mr-4 mr-md-8"
              >
                <v-img :src="avatarDisplaySrc" cover />
              </v-avatar>
              <v-icon v-else class="tag-profile-heading__icon" start>mdi-{{ meta.icon }}</v-icon>
              <span class="tag-profile-heading__name-row d-inline-flex align-center">
                <span class="tag-profile-heading__name">{{ tag.name }}</span>
                <v-btn
                  @click="copyTagName"
                  variant="text"
                  icon
                  size="small"
                  class="tag-profile-heading__copy ml-1"
                  :title="t('common.copy_name')"
                >
                  <v-icon icon="mdi-content-copy" />
                </v-btn>
              </span>
            </v-card>
          </v-col>
        </v-row>

        <v-row :class="{'tag-profile-body--compact': tagPageDesign === 'compact'}">
          <v-col
            v-if="mainFileExists && images.main"
            :cols="tagPageDesign === 'compact' ? 12 : 12"
            :md="tagPageDesign === 'compact' ? 'auto' : 3"
            class="d-flex"
            :class="tagPageDesign === 'compact' ? 'justify-start mb-4' : ''"
          >
            <v-responsive
              :aspect-ratio="meta?.imageAspectRatio"
              :max-width="tagPageDesign === 'compact' ? 180 : undefined"
              class="tag-main-image-wrap"
            >
              <v-img :src="images.main" rounded="xl" class="main-img" cover />
            </v-responsive>
          </v-col>
          <v-col cols="12" :md="tagPageDesign === 'compact' ? 12 : 9" style="position:relative;">
            <v-expansion-panels v-model="panel" multiple focusable>
              <v-expansion-panel class="rounded-xl tag-panel" :key="0">
                <v-expansion-panel-title class="pa-6" ripple hide-actions style="position: relative">
                  <div class="buttons-right">
                    <v-btn @click.stop="editMetaTag" color="primary" class="pr-4" rounded depressed>
                      <v-icon start>mdi-pencil</v-icon>
                      {{ t('common.edit') }}
                    </v-btn>
                  </div>

                  <div class="meta-card-name">{{ t('meta.fields.metadata') }}</div>
                  <v-progress-linear
                    :model-value="completionStatus"
                    height="2"
                    color="primary"
                    class="profile-complete-progress-linear"
                  />
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <ItemPinnedMeta
                    :item="tag"
                    :tags="tag.tags"
                    :values="tag.values"
                    :assignment="pinnedMeta"
                    :is-show-all="true"
                    type="tag"
                    tag-page
                    class="mt-4"
                  />
                </v-expansion-panel-text>
                <div class="profile-hover-btn show">
                  <v-icon>mdi-chevron-down</v-icon>
                </div>
                <div class="profile-hover-btn hide">
                  <v-icon>mdi-chevron-up</v-icon>
                </div>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-col>
        </v-row>
      </v-container>
    </v-responsive>

    <div v-if="pinnedMedia.length > 0 || pinnedParentMeta.length > 0">
      <div v-show="pinnedMedia.length + pinnedParentMeta.length > 1">
        <v-tabs
          v-if="is_init"
          :model-value="tab"
          @update:model-value="changeTab"
          class="fullwidth-tabs"
          slider-size="3"
          color="primary"
          icons-and-text
          show-arrows
          fixed-tabs
        >
          <v-tab
            v-for="i in pinnedMedia"
            :key="'media_type_tab'+i.mediaType.id"
            :value="`media_${i.mediaType.id}`"
          >
            <v-icon start>mdi-{{ i.mediaType.icon }}</v-icon>
            {{ getMediaTypeName(i.mediaType, t) }}
          </v-tab>
          <v-tab v-for="i in pinnedParentMeta" :key="'meta_tab'+i.id" :value="`tag_${i.id}`">
            <v-icon start>mdi-{{ i.icon }}</v-icon>
            {{ i.name }}
          </v-tab>
        </v-tabs>
      </div>

      <v-window v-if="is_init" v-model="tab" class="fullwidth-tabs transparent-tabs-only">
        <template v-for="i in pinnedMedia" :key="'media_type_tab_item'+i.mediaType.id">
          <v-window-item :value="`media_${i.mediaType.id}`">
            <LayoutItems
              v-if="tab === `media_${i.mediaType.id}`"
              :key="'media_type_' + upd + '_' + i.mediaType.id"
              :items_type="'media'"
              :mediaTypeId="i.mediaType.id"
              :metaId="ENV.meta_id ?? undefined"
              :tagId="ENV.tag_id ?? undefined"
              :tabId="ENV.tab_id ?? undefined"
            ></LayoutItems>
          </v-window-item>
        </template>

        <template v-for="i in pinnedParentMeta" :key="'meta_tab_item'+i.id">
          <v-window-item :value="`tag_${i.id}`">
            <LayoutItems
              v-if="tab === `tag_${i.id}`"
              :key="'meta_' + upd + '_' + i.id"
              :items_type="'tag'"
              :mediaTypeId="ENV.media_type_id ?? undefined"
              :metaId="i.id"
              :tagId="ENV.tag_id ?? undefined"
              :tabId="ENV.tab_id ?? undefined"
            ></LayoutItems>
          </v-window-item>
        </template>
      </v-window>
    </div>

    <v-container v-else>
      <v-alert type="warning" rounded="xl" variant="tonal">
        {{ t('items.no_media_or_meta_with_tag') }}
      </v-alert>
    </v-container>

    <DialogImageEditing
      v-if="dialogImageEditing"
      @edited="getImages"
      @close="dialogImageEditing = false"
      :dialog="dialogImageEditing"
      :image="images.main"
      :options="cropperOps"
      :imagePath="imgPath"
    />
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {useDisplay} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {typedApi} from '@/services/typedApi'
import {resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {checkFileExists} from '@/services/fileService'
import ItemPinnedMeta from '@/components/items/ItemPinnedMeta.vue'
import TagPageDesignSwitcher from '@/components/tags/TagPageDesignSwitcher.vue'
import {useEventBus} from '@/utils/eventBus'
import path from 'path-browserify';
import LayoutItems from "@/layouts/LayoutItems.vue";
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {sortByMenuMediaTypeOrder} from '@/utils/mediaType'
import {getUrlParam} from '@/services/routeService'
import {setNotification} from '@/services/notificationService'
import {copyToClipboard} from '@/utils/copyToClipboard'
import {
  getTagPageHeaderAspectRatio,
  normalizeTagPageDesign,
  type TagPageDesign,
} from '@/utils/tagPageDesign'
import type { Meta, Tag, AssignedMeta } from '@/types/stores'
import type { MediaType } from '@/types/media'
import type { MetaInMediaTypeAssignment } from '@/types/metaAssignment'
import type { TagInTagEntry, ValueInTagEntry } from '@shared/api/responses'

type PinnedMediaTab = MetaInMediaTypeAssignment & { mediaType: MediaType }

interface TagImages {
  main: string | null
  header: string | null
  avatar: string | null
}
const route = useRoute()
const router = useRouter()
const {lg, md, sm, xs} = useDisplay()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const eventBus = useEventBus()
const {t} = useI18n()

// Refs
const upd = ref(0)
const upd_tag = ref<string | number>(0)
const tab = ref<string | null>(null)
const is_init = ref(false)
const meta = ref<Meta>({ id: 0 })
const tag = ref<Tag>({ id: 0, tags: [], values: [] })
const images = ref<TagImages>({
  main: null,
  header: null,
  avatar: null,
})
const panel = ref<number[]>([])
const dialogImageEditing = ref(false)
const imgPath = ref("")
const cropperOps = ref({
  aspectRatio: 1,
})
const pinnedParentMeta = ref<Meta[]>([])
const pinnedMeta = ref<AssignedMeta[]>([])
const pinnedMedia = ref<PinnedMediaTab[]>([])
const completionStatus = ref(0)
const loadError = ref<string | null>(null)
const headerFileExists = ref(false)
const avatarFileExists = ref(false)
const mainFileExists = ref(false)
const designSaving = ref(false)

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function notifyLoadError(error: unknown): void {
  const text = getErrorText(error)
  setNotification({
    type: 'error',
    title: t('common.error'),
    text: text || t('common.unknown'),
  })
}

// Computed
const ENV = computed(() => itemsStore.environment)
const tagPageDesign = computed(() => normalizeTagPageDesign(meta.value.tagPageDesign))
const headerAspectRatio = computed(() => getTagPageHeaderAspectRatio(tagPageDesign.value))
const avatarSize = computed(() => {
  if (tagPageDesign.value === 'minimal') {
    return 48
  }
  if (tagPageDesign.value === 'compact') {
    return lg.value ? 80 : md.value ? 64 : sm.value ? 52 : xs.value ? 40 : 96
  }
  return lg.value ? 120 : md.value ? 80 : sm.value ? 60 : xs.value ? 40 : 160
})
const is_header_exists = computed(() => headerFileExists.value)
const avatarDisplaySrc = computed(() => {
  if (!avatarFileExists.value || !images.value.avatar) {
    return null
  }
  return images.value.avatar
})
const headerBackgroundSrc = computed(() => {
  if (headerFileExists.value && images.value.header) {
    return images.value.header
  }
  if (mainFileExists.value && images.value.main) {
    return images.value.main
  }
  return null
})
const resolveInitialTab = () => {
  const urlMediaTypeId = getUrlParam(route, 'mediaTypeId')

  if (urlMediaTypeId) {
    const mediaEntry = pinnedMedia.value.find(
      entry => Number(entry.mediaType?.id) === urlMediaTypeId,
    )
    if (mediaEntry) {
      itemsStore.type = 'media'
      itemsStore.environment.media_type_id = mediaEntry.mediaType.id
      return `media_${mediaEntry.mediaType.id}`
    }
  }

  if (pinnedMedia.value.length > 0) {
    const mediaEntry = pinnedMedia.value[0]
    itemsStore.type = 'media'
    itemsStore.environment.media_type_id = mediaEntry.mediaType.id
    return `media_${mediaEntry.mediaType.id}`
  }

  if (pinnedParentMeta.value.length > 0) {
    const childMeta = pinnedParentMeta.value[0]
    itemsStore.type = 'tag'
    itemsStore.environment.meta_id = childMeta.id
    return `tag_${childMeta.id}`
  }

  return null
}

// Methods
const init = async () => {
  loadError.value = null

  try {
    await getMeta()
    await getTag()
    await getImages()
    await getPinnedMedia()
    await getPinnedParentMeta()
    await getCompletionStatus()
    tab.value = resolveInitialTab()
    is_init.value = true

    cropperOps.value.aspectRatio = meta.value?.imageAspectRatio ?? 1
    imgPath.value = path.join(
      appStore.dbPath,
      "meta/",
      `${ENV.value.meta_id}`,
      `${ENV.value.tag_id}_main.jpg`
    )

    await itemsStore.countViewNumber(tag.value, 'tag')
  } catch (error) {
    loadError.value = getErrorText(error) || t('items.tag_load_failed')
  }
}

const getMeta = async () => {
  try {
    const res = await typedApi.getMetaById(Number(ENV.value.meta_id))
    meta.value = res.data
  } catch (error) {
    notifyLoadError(error)
    throw error
  }
}

const getTag = async () => {
  const query = {
    metaId: meta.value.id,
    filters: [],
    sortBy: 'name',
    sortDir: 'asc',
    ids: [ENV.value.tag_id],
  }

  try {
    const res = await typedApi.postTagItems(query)
    tag.value = res.data.items[0] || { id: 0, tags: [], values: [] }
    if (!tag.value.id) {
      throw new Error(t('items.tag_not_found'))
    }
  } catch (error) {
    notifyLoadError(error)
    throw error
  }
}

const resolveTagImage = (type: 'main' | 'header' | 'avatar'): string =>
  resolveTagThumbDisplayUrl({
    dbPath: appStore.dbPath,
    metaId: meta.value.id,
    tagId: tag.value.id,
    type,
  })

const getImages = async () => {
  if (!appStore.dbPath || !meta.value.id || !tag.value.id) return

  for (const i of ['main', 'header', 'avatar'] as const) {
    images.value[i] = resolveTagImage(i)
  }

  const metaDir = path.join(appStore.dbPath, 'meta', String(meta.value.id))
  const tagId = tag.value.id

  headerFileExists.value = await checkFileExists(path.join(metaDir, `${tagId}_header.jpg`))
  avatarFileExists.value = await checkFileExists(path.join(metaDir, `${tagId}_avatar.jpg`))
  mainFileExists.value = await checkFileExists(path.join(metaDir, `${tagId}_main.jpg`))
  upd.value = Date.now()
}

const getPinnedMedia = async () => {
  try {
    const res = await typedApi.getAssignedMetaForMeta(Number(ENV.value.meta_id))
    pinnedMedia.value = sortByMenuMediaTypeOrder(
      (res.data || []).filter((item): item is PinnedMediaTab => Boolean(item.mediaType)),
      appStore.mediaTypes,
    )
  } catch (error) {
    notifyLoadError(error)
  }
}

const getPinnedParentMeta = async () => {
  try {
    const res = await typedApi.getPinnedParentMeta(Number(ENV.value.meta_id))
    const childMetas = res.data || []
    const metas = []

    for (const cm of childMetas) {
      const found = appStore.meta.find(i => i.id === cm.metaId)
      if (found) {
        metas.push(found)
      }
    }
    pinnedParentMeta.value = metas
  } catch (error) {
    notifyLoadError(error)
  }
}

const getCompletionStatus = async () => {
  let tags: TagInTagEntry[] = []
  let values: ValueInTagEntry[] = []
  let pinned: AssignedMeta[] = []

  try {
    const tagsRes = await typedApi.getTagsInTag(tag.value.id)
    tags = tagsRes.data || []
  } catch (error) {
    notifyLoadError(error)
  }

  try {
    const valuesRes = await typedApi.getValuesInTag(tag.value.id)
    values = valuesRes.data || []
  } catch (error) {
    notifyLoadError(error)
  }

  try {
    const pinnedRes = await typedApi.getPinnedChildMeta(meta.value.id)
    pinned = pinnedRes.data || []
    pinnedMeta.value = pinned
  } catch (error) {
    notifyLoadError(error)
  }

  const vals: Record<string | number, unknown> = {}
  const setValByKey = (val: unknown, key: string | number) => {
    vals[key] = val
  }

  for (const i of pinned) setValByKey(null, i.pinnedMetaId as number)

  // parsing values and place their value into meta values
  for (const i of values) {
    let v = i.value
    const x = pinned.findIndex((j) => j.pinnedMetaId == i.metaId)
    if (x > -1) {
      const type = pinned[x].meta?.type
      if (type === "rating") {
        v = Number(v)
        if (isNaN(v as number)) v = 0
      } else if (type === "number") {
        // оставляем как есть
      }
    }
    setValByKey(v, i.metaId)
  }

  // parsing tags. creating array and place it into meta values
  const pi: Record<string | number, number[]> = {}
  for (const i of tags) {
    if (!pi[i.metaId]) pi[i.metaId] = [i.tagId]
    else pi[i.metaId].push(i.tagId)
  }
  for (const i in pi) setValByKey(pi[i], i)

  const completed: number[] = []
  for (const m of pinned) {
    const val = vals[m.pinnedMetaId as number]
    if (val === undefined || val === null) completed.push(0)
    else if (typeof val == "boolean") completed.push(1)
    else if (typeof val == "number")
      (val as number) > 0 ? completed.push(1) : completed.push(0)
    else (val as unknown[]).length > 0 ? completed.push(1) : completed.push(0)
  }
  let completedValue = 0
  for (const i of completed) {
    completedValue = completedValue + i
  }
  completionStatus.value = Math.ceil((completedValue / completed.length) * 100)
}

// const setVal = async (val, key) => {
//   try {
//     await axios({
//       method: "put",
//       url: apiUrl.value + "/api/tag/" + tag.value.id,
//       data: {
//         [key]: val,
//       },
//     })
//   } catch (e) {
//     console.log(e)
//   }
// }

const editMetaTag = async () => {
  await getTag()
  dialogsStore.tagEditing.meta = meta.value
  dialogsStore.tagEditing.tag = tag.value
  dialogsStore.tagEditing.show = true
}

const changeTab = async (tab_value: string | null) => {
  if (!tab_value) return
  const item_types = ['tag', 'media']
  for (const item_type of item_types) {
    if (tab_value.includes(item_type)) {
      itemsStore.type = item_type
    }
  }

  const id = Number(tab_value.match(/\d+/g)) || null
  const metaId = itemsStore.type === 'tag' ? id : null
  const mediaTypeId = itemsStore.type === 'media' ? id : null

  itemsStore.environment.media_type_id = mediaTypeId
  itemsStore.environment.meta_id = metaId

  try {
    const filter = await typedApi.postSavedFilterContext({
      name: null,
      tagId: ENV.value.tag_id,
      mediaTypeId: mediaTypeId,
      metaId: metaId,
    })

    await typedApi.savePageSetting({
      filterId: Number(filter.data[0]?.id),
      tagId: ENV.value.tag_id,
      mediaTypeId: mediaTypeId,
      metaId: metaId,
    })
  } catch (error) {
    notifyLoadError(error)
  }

  upd.value = Date.now()
  tab.value = tab_value
}

const openMetaPage = () => {
  router.push("/meta?metaId=" + String(meta.value.id))
}

const copyTagName = () => {
  const name = tag.value?.name
  if (!name) return
  void copyToClipboard(name, {
    successText: t('common.copied'),
  })
}

const syncMetaInStore = (patch: Partial<Meta>) => {
  meta.value = {
    ...meta.value,
    ...patch,
  }

  const storeIndex = appStore.meta.findIndex((entry) => entry.id === meta.value.id)
  if (storeIndex > -1) {
    appStore.meta[storeIndex] = {
      ...appStore.meta[storeIndex],
      ...patch,
    }
  }
}

const changeTagPageDesign = async (design: TagPageDesign) => {
  if (!meta.value.id || design === tagPageDesign.value || designSaving.value) {
    return
  }

  designSaving.value = true
  try {
    await typedApi.updateMeta(meta.value.id, {tagPageDesign: design})
    syncMetaInStore({tagPageDesign: design})
  } catch (error) {
    notifyLoadError(error)
  } finally {
    designSaving.value = false
  }
}

// Event handlers
const handleGetTag = async () => {
  await getTag()
  await getImages()
  setTimeout(() => {
    upd_tag.value = Date.now() + '_tag'
  }, 1000)
}

const handleUpdateLayoutItems = () => {
  upd.value = Date.now()
}

const handleGetMeta = async () => {
  if (!is_init.value || !meta.value.id) return

  try {
    await getMeta()
    syncMetaInStore(meta.value)
    cropperOps.value.aspectRatio = meta.value?.imageAspectRatio ?? 1
    await getPinnedMedia()
    await getPinnedParentMeta()
    await getCompletionStatus()
    upd.value = Date.now()
  } catch (error) {
    notifyLoadError(error)
  }
}

const applyRouteContext = () => {
  itemsStore.environment.media_type_id = getUrlParam(route, "mediaTypeId")
  itemsStore.environment.meta_id = getUrlParam(route, "metaId")
  itemsStore.environment.tag_id = getUrlParam(route, "tagId")
  itemsStore.environment.tab_id = getUrlParam(route, "tabId")
}

const reloadTagPage = async () => {
  is_init.value = false
  applyRouteContext()
  await init()
}

// Lifecycle
onMounted(async () => {
  applyRouteContext()
  await init()

  eventBus.on("getTag", handleGetTag)
  eventBus.on("getMeta", handleGetMeta)
  eventBus.on("updateLayoutItems", handleUpdateLayoutItems)

  panel.value = [0]
})

onBeforeUnmount(() => {
  eventBus.off("updateLayoutItems")
  eventBus.off("getTag")
  eventBus.off("getMeta", handleGetMeta)
})

watch(
  () => appStore.dbPath,
  (dbPath) => {
    if (!dbPath || !tag.value.id) return
    void getImages()
  },
)

watch(
  () => [
    route.query.tagId,
    route.query.metaId,
    route.query.mediaTypeId,
    route.query.tabId,
  ],
  async (newParams, oldParams) => {
    if (!oldParams || route.path !== '/tag') return

    const hasChanged = newParams.some((value, index) => value !== oldParams[index])
    if (!hasChanged) return

    await reloadTagPage()
  },
)
</script>