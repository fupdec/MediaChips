<template>
  <v-menu
    v-model="menuOpen"
    :close-on-content-click="false"
    location="bottom end"
    max-width="440"
    min-width="360"
  >
    <template #activator="{props: menuProps}">
      <slot
        name="activator"
        :props="menuProps"
      />
    </template>

    <v-card
      class="folder-tags-menu pa-3"
      rounded="lg"
      min-width="360"
      max-width="440"
    >
      <div
        class="text-caption text-medium-emphasis text-truncate mb-2"
        :title="folderPath"
      >
        {{ folderPath }}
      </div>

      <div
        v-if="!arrayMetas.length"
        class="text-medium-emphasis text-body-2 mb-2"
      >
        {{ t('media.adding.folder_tags_no_categories') }}
      </div>

      <template v-else>
        <div
          v-if="selectedItems.length"
          class="d-flex flex-wrap ga-1 mb-2"
        >
          <v-chip
            v-for="item in selectedItems"
            :key="item.key"
            size="small"
            label
            closable
            :color="item.color || undefined"
            variant="tonal"
            :prepend-icon="`mdi-${item.metaIcon}`"
            @click:close="removeSelected(item.key)"
          >
            {{ item.name }}
          </v-chip>
        </div>

        <v-autocomplete
          v-model="selectedKeys"
          v-model:search="search"
          :items="filteredItems"
          :loading="loading"
          item-title="title"
          item-value="key"
          multiple
          density="compact"
          variant="outlined"
          hide-details
          hide-selected
          no-filter
          auto-select-first
          rounded="pill"
          :placeholder="t('media.adding.folder_tags_autocomplete_placeholder')"
          :no-data-text="t('common.no_data')"
          :menu-props="{maxHeight: 360, contentClass: 'folder-tags-menu__dropdown'}"
        >
          <template #chip />
          <template #selection />

          <template #item="{props: itemProps, item}">
            <div
              v-if="item.raw.kind === 'header'"
              class="folder-tags-menu__category"
            >
              <v-icon
                size="16"
                class="folder-tags-menu__category-icon"
              >
                mdi-{{ item.raw.icon || 'tag-multiple-outline' }}
              </v-icon>
              <span class="folder-tags-menu__category-title">{{ item.raw.title }}</span>
              <v-chip
                size="x-small"
                variant="tonal"
                color="primary"
                class="ml-2"
              >
                {{ item.raw.count }}
              </v-chip>
            </div>
            <v-list-item
              v-else
              v-bind="itemProps"
              density="compact"
              class="folder-tags-menu__tag"
              :class="{'folder-tags-menu__tag--zebra': item.raw.zebra}"
            >
              <template #title>
                <div class="folder-tags-menu__tag-row">
                  <v-icon
                    size="12"
                    class="folder-tags-menu__tag-icon text-medium-emphasis"
                  >
                    mdi-tag-outline
                  </v-icon>
                  <v-icon
                    v-if="item.raw.color"
                    :color="item.raw.color"
                    size="10"
                    class="folder-tags-menu__tag-color"
                  >
                    mdi-circle
                  </v-icon>
                  <span class="folder-tags-menu__tag-name">{{ item.raw.name }}</span>
                </div>
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>
      </template>

      <div class="d-flex justify-end ga-2 mt-3">
        <v-btn
          variant="text"
          size="small"
          @click="close"
        >
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          :loading="saving"
          :disabled="!folderPath || !arrayMetas.length || loading"
          @click="save"
        >
          {{ t('common.save') }}
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {leafCategoryOptions} from '@/utils/tagCategoryTree'
import {useNotificationsStore} from '@/stores/notifications'

type TagOption = {
  kind: 'tag'
  key: string
  title: string
  name: string
  value: string
  tagId: number
  metaId: number
  metaName: string
  metaIcon: string
  color?: string | null
  zebra: boolean
}

type HeaderOption = {
  kind: 'header'
  key: string
  title: string
  icon?: string | null
  count: number
  disabled: true
}

type AutocompleteItem = TagOption | HeaderOption

const props = defineProps<{
  folderPath: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const {t} = useI18n()
const appStore = useAppStore()
const notificationsStore = useNotificationsStore()

const menuOpen = defineModel<boolean>('open', {default: false})
const loading = ref(false)
const saving = ref(false)
const search = ref('')
const selectedKeys = ref<string[]>([])
const initialByMeta = ref<Record<number, number[]>>({})

function metaIconName(icon: unknown): string {
  const value = String(icon || '').replace(/^mdi-/, '').trim()
  return value || 'tag-multiple-outline'
}

const arrayMetas = computed(() =>
  leafCategoryOptions(appStore.meta || []),
)

const tagOptions = computed((): TagOption[] => {
  const options: TagOption[] = []
  for (const meta of arrayMetas.value) {
    const metaId = Number(meta.id)
    const metaName = String(meta.name || metaId)
    const icon = metaIconName(meta.icon)
    const tags = appStore.tags
      .filter((tag) => Number(tag.metaId) === metaId)
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

    for (const tag of tags) {
      const tagId = Number(tag.id)
      if (!tagId) continue
      const key = `${metaId}:${tagId}`
      options.push({
        kind: 'tag',
        key,
        title: `${metaName}: ${tag.name}`,
        name: String(tag.name || tagId),
        value: key,
        tagId,
        metaId,
        metaName,
        metaIcon: icon,
        color: tag.color ?? null,
        zebra: false,
      })
    }
  }
  return options
})

const tagByKey = computed(() => {
  const map = new Map<string, TagOption>()
  for (const option of tagOptions.value) map.set(option.key, option)
  return map
})

const selectedItems = computed(() =>
  selectedKeys.value
    .map((key) => tagByKey.value.get(key))
    .filter((item): item is TagOption => Boolean(item)),
)

const filteredItems = computed((): AutocompleteItem[] => {
  const query = search.value.trim().toLowerCase()
  const items: AutocompleteItem[] = []
  let tagIndex = 0

  for (const meta of arrayMetas.value) {
    const metaId = Number(meta.id)
    const tags = tagOptions.value.filter((option) => {
      if (option.metaId !== metaId) return false
      if (!query) return true
      return option.name.toLowerCase().includes(query)
        || option.metaName.toLowerCase().includes(query)
    })
    if (!tags.length) continue

    items.push({
      kind: 'header',
      key: `header:${metaId}`,
      title: String(meta.name || metaId),
      icon: metaIconName(meta.icon),
      count: tags.length,
      disabled: true,
    })
    for (const tag of tags) {
      items.push({
        ...tag,
        zebra: tagIndex % 2 === 1,
      })
      tagIndex += 1
    }
  }

  return items
})

function close() {
  menuOpen.value = false
}

function removeSelected(key: string) {
  selectedKeys.value = selectedKeys.value.filter((entry) => entry !== key)
}

async function loadTags() {
  selectedKeys.value = []
  initialByMeta.value = {}
  if (!props.folderPath) return

  loading.value = true
  try {
    const res = await typedApi.getTagsInFolder(props.folderPath)
    const next: Record<number, number[]> = {}
    const keys: string[] = []
    for (const row of res.data || []) {
      const metaId = Number(row.metaId)
      const tagId = Number(row.tagId)
      if (!metaId || !tagId) continue
      if (!next[metaId]) next[metaId] = []
      next[metaId].push(tagId)
      keys.push(`${metaId}:${tagId}`)
    }
    selectedKeys.value = keys
    initialByMeta.value = Object.fromEntries(
      Object.entries(next).map(([key, ids]) => [Number(key), [...ids]]),
    )
  } catch (error) {
    console.error(error)
    notificationsStore.setNotification({
      type: 'error',
      text: t('media.adding.folder_tags_load_error'),
    })
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!props.folderPath) return
  saving.value = true
  try {
    const nextByMeta: Record<number, number[]> = {}
    for (const key of selectedKeys.value) {
      const option = tagByKey.value.get(key)
      if (!option) continue
      if (!nextByMeta[option.metaId]) nextByMeta[option.metaId] = []
      nextByMeta[option.metaId].push(option.tagId)
    }

    const metaIds = new Set([
      ...Object.keys(nextByMeta).map(Number),
      ...Object.keys(initialByMeta.value).map(Number),
      ...arrayMetas.value.map((meta) => Number(meta.id)),
    ])

    for (const metaId of metaIds) {
      if (!metaId) continue
      await typedApi.replaceFolderTagsForMeta({
        path: props.folderPath,
        metaId,
        tagIds: nextByMeta[metaId] || [],
      })
    }

    emit('saved')
    close()
  } catch (error) {
    console.error(error)
    notificationsStore.setNotification({
      type: 'error',
      text: t('media.adding.folder_tags_save_error'),
    })
  } finally {
    saving.value = false
  }
}

watch(selectedKeys, (keys) => {
  const cleaned = keys.filter((key) => !key.startsWith('header:'))
  if (cleaned.length !== keys.length) selectedKeys.value = cleaned
})

watch(menuOpen, (open) => {
  if (open) {
    search.value = ''
    void loadTags()
  }
})
</script>

<style scoped>
.folder-tags-menu__category {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 8px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  pointer-events: none;
  user-select: none;
}

.folder-tags-menu__category-icon {
  color: rgb(var(--v-theme-primary));
  opacity: 0.9;
}

.folder-tags-menu__category-title {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.folder-tags-menu__tag {
  min-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.folder-tags-menu__tag :deep(.v-list-item__content) {
  padding: 0;
}

.folder-tags-menu__tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.folder-tags-menu__tag-icon,
.folder-tags-menu__tag-color {
  flex-shrink: 0;
}

.folder-tags-menu__tag-name {
  font-size: 0.75rem;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-tags-menu__tag--zebra {
  background-color: rgba(100, 100, 100, 0.05);
}
</style>
