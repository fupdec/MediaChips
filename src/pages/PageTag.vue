<template>
  <div>
    <v-responsive
      :aspect-ratio="1400/609"
      color="transparent"
      class="tag-header"
      :light="!is_dark"
      :dark="is_dark"
      :class="{'no-header-image': !is_header_exists}"
      :style="{'background-image': `url('${is_header_exists ? images.header : images.main}')`}"
    >
      <v-container class="profile-container my-6">
        <v-row>
          <v-col cols="12">
            <v-btn @click="openMetaPage" :title="t('actions.open_page')" rounded>
              <v-icon start>mdi-{{ meta.icon }}</v-icon>
              <div class="text">{{ meta.name }}</div>
              <v-icon end>mdi-arrow-left</v-icon>
            </v-btn>
          </v-col>
        </v-row>

        <v-row style="position: relative;">
          <v-col cols="12">
            <v-card class="text-md-h2 text-xl-h1" variant="text">
              <v-avatar v-if="is_avatar_exists" :size="lg ? 120 : md ? 80 : sm ? 60 : xs ? 40 : 160" class="mr-8">
                <v-img :src="images.avatar ?? undefined"></v-img>
              </v-avatar>
              <v-icon v-else start>mdi-{{ meta.icon }}</v-icon>
              <span>{{ tag.name }}</span>
            </v-card>
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="3">
            <v-responsive
              v-if="images.main"
              :aspect-ratio="meta?.imageAspectRatio"
            >
              <v-img :src="images.main" rounded="xl" :class="{'main-img':is_header_exists}"></v-img>
            </v-responsive>
          </v-col>
          <v-col cols="12" md="9" style="position:relative;">
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
                  ></v-progress-linear>
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
                  ></ItemPinnedMeta>
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
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {useTheme, useDisplay} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useRegistrationStore} from '@/stores/registration'
import {typedApi} from '@/services/typedApi'
import {checkColorForDarkText} from '@/services/formatUtils'
import {cloneFilters} from '@/utils/filterClone'
import {resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import uniq from 'lodash/uniq'
import groupBy from 'lodash/groupBy'
import ItemPinnedMeta from '@/components/items/ItemPinnedMeta.vue'
import {useEventBus} from '@/utils/eventBus'
import path from 'path-browserify';
import LayoutItems from "@/layouts/LayoutItems.vue";
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {sortByMenuMediaTypeOrder} from '@/utils/mediaType'
import {getUrlParam} from '@/services/routeService'
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
const theme = useTheme()
const {xl, lg, md, sm, xs} = useDisplay()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const registrationStore = useRegistrationStore()
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
const bgc = ref("#777")
const tags_filter = ref<Record<string, Tag[]>>({})
const tags_filter_value = ref<number[]>([])
const pinnedParentMeta = ref<Meta[]>([])
const pinnedMeta = ref<AssignedMeta[]>([])
const pinnedMedia = ref<PinnedMediaTab[]>([])
const values = ref<unknown[]>([])
const completionStatus = ref(0)

// Computed
const ITEMS = computed(() => itemsStore)
const ENV = computed(() => itemsStore.environment)
const SETTINGS = computed(() => settingsStore)
const reg = computed(() => registrationStore.reg)
const is_dark = computed(() => theme.global.current.value.dark)
const isTextDark = computed(() => checkColorForDarkText(bgc.value))
const is_header_exists = computed(() => {
  if (images.value.header) {
    return !images.value.header.includes('unavailable.png')
  } else {
    return false
  }
})
const is_avatar_exists = computed(() => {
  if (images.value.avatar) {
    return !images.value.avatar.includes('unavailable.png')
  } else {
    return false
  }
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

  // увеличиваем кол-во просмотров
  await itemsStore.countViewNumber(tag.value, 'tag')
}

const getMeta = async () => {
  try {
    const res = await typedApi.getMetaById(Number(ENV.value.meta_id))
    meta.value = res.data
  } catch (e) {
    console.log(e)
  }
}

const getTag = async () => {
  let query = {
    metaId: meta.value.id,
    filters: [],
    sortBy: 'name',
    sortDir: 'asc',
    ids: [ENV.value.tag_id],
  }

  try {
    const res = await typedApi.postTagItems(query)
    tag.value = res.data.items[0] || { id: 0, tags: [], values: [] }
  } catch (e) {
    console.log(e)
  }
}

const resolveTagImage = (type: 'main' | 'header' | 'avatar'): string =>
  resolveTagThumbDisplayUrl({
    dbPath: appStore.dbPath,
    metaId: meta.value.id,
    tagId: tag.value.id,
    type,
  })

const getImages = () => {
  for (const i of ['main', 'header', 'avatar'] as const) {
    images.value[i] = resolveTagImage(i)
  }
  upd.value = Date.now()
}

const getPinnedMedia = async () => {
  try {
    const res = await typedApi.getAssignedMetaForMeta(Number(ENV.value.meta_id))
    pinnedMedia.value = sortByMenuMediaTypeOrder(
      (res.data || []).filter((item): item is PinnedMediaTab => Boolean(item.mediaType)),
      appStore.mediaTypes,
    )
  } catch (e) {
    console.log(e)
  }
}

const getPinnedParentMeta = async () => {
  try {
    const res = await typedApi.getPinnedParentMeta(Number(ENV.value.meta_id))
    let childMetas = res.data || []
    let metas = []

    for (let cm of childMetas) {
      let found = appStore.meta.find(i => i.id === cm.metaId)
      if (found) {
        metas.push(found)
      }
    }
    pinnedParentMeta.value = metas
  } catch (e) {
    console.log(e)
  }
}

const getCompletionStatus = async () => {
  let tags: TagInTagEntry[] = []
  let values: ValueInTagEntry[] = []
  let pinned: AssignedMeta[] = []

  try {
    const tagsRes = await typedApi.getTagsInTag(tag.value.id)
    tags = tagsRes.data || []
  } catch (e) {
    console.log(e)
  }

  try {
    const valuesRes = await typedApi.getValuesInTag(tag.value.id)
    values = valuesRes.data || []
  } catch (e) {
    console.log(e)
  }

  try {
    const pinnedRes = await typedApi.getPinnedChildMeta(meta.value.id)
    pinned = pinnedRes.data || []
    pinnedMeta.value = pinned
  } catch (e) {
    console.log(e)
  }

  let vals: Record<string | number, unknown> = {}
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
  for (let i of completed) {
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

const getTagsInMedia = async () => {
  let query = {
    mediaTypeId: ENV.value.media_type_id ?? undefined,
    filters: cloneFilters(ITEMS.value.filters.filter(i => i.lock)),
    sortBy: 'createdAt',
    direction: 'asc',
    find_duplicates: false,
    ids: [],
  }

  try {
    const res = await typedApi.postItemsList('/api/media/items', query)
    const medias = res.data.items ?? []
    let tags: number[] = []
    for (const i of medias) {
      const itemTags = Array.isArray(i.tags) ? i.tags : []
      tags = [...tags, ...itemTags.map((t: { tagId: number }) => t.tagId)]
    }
    tags = uniq(tags)
    tags_filter.value = groupBy(appStore.tags.filter(i => tags.includes(i.id)), 'metaId')
  } catch (e) {
    console.log(e)
  }
}

const changeTab = async (tab_value: string | null) => {
  if (!tab_value) return
  let item_types = ['tag', 'media']
  for (let item_type of item_types) {
    if (tab_value.includes(item_type)) {
      itemsStore.type = item_type
    }
  }

  let id = Number(tab_value.match(/\d+/g)) || null
  let metaId = itemsStore.type === 'tag' ? id : null
  let mediaTypeId = itemsStore.type === 'media' ? id : null

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
  } catch (e) {
    console.log(e)
  }

  upd.value = Date.now()
  tab.value = tab_value
}

const openMetaPage = () => {
  router.push("/meta?metaId=" + String(meta.value.id))
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
  eventBus.on("updateLayoutItems", handleUpdateLayoutItems)

  panel.value = [0]
})

onBeforeUnmount(() => {
  eventBus.off("updateLayoutItems")
  eventBus.off("getTag")
})

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