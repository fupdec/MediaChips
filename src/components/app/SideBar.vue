<template>
  <v-navigation-drawer
    app
    clipped
    expand-on-hover
    permanent
    mini-variant
    rail
    class="sidebar-nav"
    @mouseenter="isDrawerHovered = true"
    @mouseleave="isDrawerHovered = false"
  >
    <div class="scrollable vertical">
      <div class="scrollable-child">
        <v-list nav density="compact">

          <v-list-subheader class="sidebar-section">
            {{ t('navigation.section_library') }}
          </v-list-subheader>

          <v-list-item
            v-for="link in libraryLinks"
            :key="link.key"
            :to="link.to"
            :prepend-icon="link.icon"
            :title="link.title"
            :exact="link.exact"
            draggable="false"
            color="primary"
            link
          >
            <v-tooltip activator="parent" location="end" :disabled="isDrawerHovered">
              {{ link.title }}
            </v-tooltip>
          </v-list-item>

          <v-list-subheader class="sidebar-section">
            {{ t('navigation.section_tags') }}
          </v-list-subheader>

          <div class="mb-1">
            <v-list-item
              :to="allTagsLink.to"
              :prepend-icon="allTagsLink.icon"
              :title="allTagsLink.title"
              :exact="allTagsLink.exact"
              draggable="false"
              color="primary"
              link
            >
              <v-tooltip activator="parent" location="end" :disabled="isDrawerHovered">
                {{ allTagsLink.title }}
              </v-tooltip>
            </v-list-item>
          </div>

          <template v-if="meta_arr.length">
            <Draggable
              v-model="meta_arr"
              @start="drag = true"
              @end="updateMetaOrder"
              v-bind="dragOptions"
              item-key="id"
              handle=".drag-handle"
            >
              <template #item="{ element: item }">
                <div class="mb-1">
                  <v-list-item
                    v-if="item.type === 'toggler'"
                    @click="isShowHidden = !isShowHidden"
                    :prepend-icon="`mdi-chevron-${isShowHidden ? 'up' : 'down'}`"
                    :title="hiddenToggleLabel"
                    class="drag-handle sidebar-hidden-toggle"
                    draggable="false"
                  >
                    <v-tooltip activator="parent" location="end" :disabled="isDrawerHovered">
                      {{ hiddenToggleLabel }}
                    </v-tooltip>
                  </v-list-item>

                  <v-list-item
                    v-else
                    :to="metaPath(item.id)"
                    :prepend-icon="`mdi-${item.icon}`"
                    :title="item.name"
                    :active="route.query.metaId == String(item.id)"
                    :class="{
                      'd-none': item.hidden && !isShowHidden,
                      'sidebar-meta--hidden': item.hidden && isShowHidden,
                    }"
                    color="primary"
                    class="drag-handle"
                    exact
                    link
                  >
                    <v-tooltip activator="parent" location="end" :disabled="isDrawerHovered">
                      {{ item.name }}
                    </v-tooltip>
                  </v-list-item>
                </div>
              </template>
            </Draggable>
          </template>

          <v-list-subheader class="sidebar-section">
            {{ t('navigation.section_system') }}
          </v-list-subheader>

          <v-list-item
            :to="settingsLink.to"
            :prepend-icon="settingsLink.icon"
            :title="settingsLink.title"
            draggable="false"
            color="primary"
            link
          >
            <v-tooltip activator="parent" location="end" :disabled="isDrawerHovered">
              {{ settingsLink.title }}
            </v-tooltip>
          </v-list-item>

          <v-list-item
            v-if="showTrash"
            :prepend-icon="trashLink.icon"
            :title="trashLink.title"
            draggable="false"
            @click="openTrash()"
          >
            <v-tooltip activator="parent" location="end" :disabled="isDrawerHovered">
              {{ trashLink.title }}
            </v-tooltip>
          </v-list-item>

          <v-list-item
            v-if="showInbox"
            :disabled="watcherBusy"
            :title="t('media_inbox.nav')"
            @click="openInbox()"
          >
            <template #prepend>
              <v-badge
                v-if="!watcherBusy"
                :content="inboxBadgeCount"
                :model-value="inboxBadgeCount > 0"
                :dot="!isDrawerHovered"
                color="success"
                location="top right"
              >
                <v-badge
                  :content="inboxLostCount"
                  :model-value="inboxLostCount > 0"
                  :dot="!isDrawerHovered"
                  color="error"
                  location="bottom right"
                >
                  <v-icon icon="mdi-inbox-outline"/>
                </v-badge>
              </v-badge>
              <v-icon v-else icon="mdi-inbox-outline"/>
            </template>
            <v-tooltip activator="parent" location="end" :disabled="isDrawerHovered">
              {{ t('media_inbox.nav') }}
            </v-tooltip>
          </v-list-item>

        </v-list>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, defineAsyncComponent} from 'vue'
import {useRoute} from 'vue-router'
import {typedApi} from '@/services/typedApi'
import orderBy from 'lodash/orderBy'
import {useI18n} from 'vue-i18n'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'
import type {Meta} from '@/types/stores'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

type MetaNavItem = Meta & {hidden?: boolean; order?: number}
type MetaNavRow = MetaNavItem | {type: 'toggler'; id: string}

const isShowHidden = ref(false)
const isDrawerHovered = ref(false)
const meta_arr = ref<MetaNavRow[]>([])
const drag = ref(false)

const route = useRoute()
const {t} = useI18n()

const {
  metaArray,
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
  metaPath,
} = useLibraryNavItems()

const dragOptions = {
  animation: 200,
  group: 'description',
  ghostClass: 'ghost',
}

const hiddenMetaCount = computed(() =>
  meta_arr.value.filter((item) => isMetaNavItem(item) && item.hidden).length,
)

const hiddenToggleLabel = computed(() =>
  isShowHidden.value
    ? t('navigation.hidden')
    : t('navigation.show_hidden', {count: hiddenMetaCount.value}),
)

function reorderMeta(items: MetaNavItem[]): MetaNavRow[] {
  const sorted = orderBy(items, ['hidden', 'order'], ['asc', 'asc'])
  if (sorted.length > 1) {
    const visibleCount = sorted.filter((item) => !item.hidden).length
    const arr: MetaNavRow[] = [...sorted]
    arr.splice(visibleCount, 0, {type: 'toggler', id: 'toggler'})
    return arr
  }
  return sorted
}

onMounted(() => {
  meta_arr.value = reorderMeta(metaArray.value as MetaNavItem[])
})

watch(metaArray, (value) => {
  if (drag.value) return

  const currentItems = meta_arr.value.filter(isMetaNavItem)
  if (metaNavItemsEqual(currentItems, value as MetaNavItem[])) return

  meta_arr.value = reorderMeta(value as MetaNavItem[])
})

function isMetaNavItem(item: MetaNavRow): item is MetaNavItem {
  return item.type !== 'toggler'
}

function metaNavItemsEqual(a: MetaNavItem[], b: MetaNavItem[]): boolean {
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (a[i].order !== b[i].order) return false
    if (Boolean(a[i].hidden) !== Boolean(b[i].hidden)) return false
  }

  return true
}

async function updateMetaOrder() {
  drag.value = false

  const indexToggler = meta_arr.value.findIndex((item) => item.type === 'toggler')

  const payload = meta_arr.value
    .map((item, idx) => {
      if (!isMetaNavItem(item)) return null

      let hidden = item.hidden
      if (indexToggler >= 0) {
        hidden = idx >= indexToggler
      }
      return {
        id: item.id,
        order: idx,
        hidden,
      }
    })
    .filter((entry): entry is {id: number; order: number; hidden: boolean | undefined} => entry !== null)

  await Promise.all(
    payload.map(async (entry) => {
      try {
        await typedApi.updateMeta(entry.id, {
          order: entry.order,
          hidden: entry.hidden,
        })
      } catch (error) {
        console.error('Failed updating meta', entry.id, error)
      }
    }),
  )

  await reloadMetaCatalog()
}
</script>

<style scoped
  lang="scss">
.scrollable {
  height: 100%;
}

:deep(.v-navigation-drawer__content) {
  overflow: hidden;
}

.ghost {
  opacity: 0.6;
}

.d-none {
  display: none !important;
}

.sidebar-section {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  height: 28px;
  min-height: 28px;
  padding-inline: 16px;
  opacity: 0.65;
  overflow: hidden;
}

.sidebar-nav.v-navigation-drawer--rail:not(.v-navigation-drawer--is-hovering) {
  /* Keep header space so icons do not jump when labels appear */
  :deep(.sidebar-section) {
    visibility: hidden;
  }
}

.sidebar-hidden-toggle {
  opacity: 0.72;

  :deep(.v-list-item-title) {
    font-size: 0.8rem;
    opacity: 0.85;
  }
}

.sidebar-meta--hidden {
  opacity: 0.55;
}
</style>
