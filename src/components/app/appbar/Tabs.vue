<template>
  <v-tabs
    v-model="active"
    class="borders"
    hide-slider
    show-arrows
    height="26"
  >
    <Draggable
      v-model="tabs"
      item-key="id"
      v-bind="dragOptions"
      @start="startDrag"
      @end="endDrag"
    >
      <template #item="{ element, index }">
        <v-tab
          :value="element.id"
          :to="getTabUrl(element)"
          @click.middle.prevent="closeTab($event, element.id)"
          @contextmenu.prevent.stop="showContextMenu($event, element.id, index)"
          :ripple="false"
          :key="element.id"
          :id="element.id"
          :class="{'dragged': draggableTabIndex === index}"
          exact
        >
          <div class="tab-name" :title="element.name">
            <v-icon size="16">{{ `mdi-${element.icon}` }}</v-icon>
            {{ element.name }}
          </div>
          <v-btn
            @click="closeTab($event, element.id)"
            :ripple="false"
            class="close-btn"
            icon
          >
            <v-icon size="14">mdi-close</v-icon>
          </v-btn>
        </v-tab>
      </template>
    </Draggable>
  </v-tabs>
</template>

<script setup lang="ts">
import {ref, watch, onMounted, computed, defineAsyncComponent} from 'vue'
import {useAppStore} from '@/stores/app'
import {useContextMenu} from '@/stores/contextMenu'
import {useDialogsStore} from '@/stores/dialogs'
import {useRouter, useRoute} from 'vue-router'
import {typedApi} from '@/services/typedApi'
import orderBy from 'lodash/orderBy'
import {useEventBus} from '@/utils/eventBus'
import {useI18n} from 'vue-i18n'
import {getTabUrl} from '@/services/routeService'
import type { Tab } from '@/types/stores'
import type { LocationQueryValue } from 'vue-router'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const contextMenuStore = useContextMenu()
const dialogsStore = useDialogsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const tabs = ref<Tab[]>([])
const active = ref<LocationQueryValue | LocationQueryValue[] | null>(null)
const drag = ref(false)
const draggableTabIndex = ref<number | null>(null)

const tabsStore = computed(() => useAppStore().tabs)

const dragOptions = {
  animation: 200,
  group: 'tabs',
  ghostClass: 'ghost',
}

onMounted(() => {
  tabs.value = orderBy([...tabsStore.value], "order");
  active.value = route.query.tabId ?? null
})

watch(
  () => tabsStore.value,
  (val) => {
    tabs.value = orderBy([...tabsStore.value], "order");
  }
)

watch(
  () => route.query.tabId,
  (id) => {
    active.value = id
  }
)

function startDrag(tab: { oldIndex: number }) {
  draggableTabIndex.value = tab.oldIndex
  drag.value = true
}

const deleteTabs = async (tabsToDelete: Tab[]) => {
  for (const tab of tabsToDelete) {
    if (tab.id != null) {
      await typedApi.deleteTab(Number(tab.id))
    }
  }

  eventBus.emit('getTabs')
}

const closeTab = async (e: Event, tabId: number | string) => {
  e.preventDefault()

  if (route.query.tabId == tabId) {
    router.push('/')
  }
  await typedApi.deleteTab(Number(tabId))
  eventBus.emit('getTabs')
}

const editTab = (index: number) => {
  const tab = tabs.value[index]
  dialogsStore.editTab(tab)
}

const endDrag = async () => {
  draggableTabIndex.value = null
  
  drag.value = false
  const tabsWithOrder = tabs.value.map((tab, index) => ({
    id: tab.id,
    order: index
  }))

  try {
    const updatePromises = tabsWithOrder
      .filter((tab): tab is { id: number; order: number } => tab.id != null)
      .map((tab) => typedApi.updateTab(tab.id, tab))

    await Promise.all(updatePromises)
    eventBus.emit('getTabs')
  } catch (error) {
    console.error('Error reordering tabs:', error)
  }
}

const closeTabsOnRight = async (index: number) => {
  if (index < -1) return

  const indexCurrent = tabs.value.findIndex(tab => tab.id === route.query.tabId)
  if (indexCurrent > index) {
    changeRoute(index)
  }

  const tabsToClose = tabs.value.slice(index + 1)
  await deleteTabs(tabsToClose)
}

const closeTabsOther = async (tabId: number | string, index: number) => {
  const tabsToClose = tabs.value.filter(tab => tab.id !== tabId)

  if (route.query.tabId && route.query.tabId !== tabId) {
    changeRoute(index)
  }

  await deleteTabs(tabsToClose)
}

const closeTabsAll = async () => {
  if (route.query.tabId) {
    router.push('/')
  }

  await deleteTabs(tabs.value)
}

const changeRoute = (tabIndex: number) => {
  const tab = tabs.value[tabIndex]
  if (tab) {
    const url = getTabUrl({ ...tab, url: tab.url ?? '/' })
    router.push(url)
  }
}

const showContextMenu = (e: MouseEvent, tabId: number | string, index: number) => {
  e.preventDefault()

  const contextMenu = [
    {
      name: t('tabs.edit_tab'),
      type: 'item',
      icon: 'pencil',
      action: () => {
        editTab(index)
      },
    },
    {type: 'divider'},
    {
      name: t('tabs.close_tab'),
      type: 'item',
      icon: 'close',
      action: () => {
        closeTab(e, tabId)
      },
    },
    {
      name: t('tabs.close_tabs_right'),
      type: 'item',
      icon: 'format-horizontal-align-right',
      action: () => {
        closeTabsOnRight(index)
      },
      disabled: tabs.value.length - 1 == index,
    },
    {
      name: t('tabs.close_other_tabs'),
      type: 'item',
      icon: 'swap-horizontal',
      action: () => {
        closeTabsOther(tabId, index)
      },
      disabled: tabs.value.length == 1,
    },
    {
      name: t('tabs.close_all_tabs'),
      type: 'item',
      icon: 'table-row-remove',
      action: () => {
        closeTabsAll()
      },
    },
  ]

  contextMenuStore.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    content: contextMenu,
  })
}
</script>

<style scoped>
.dragged {
  * {
    opacity: 0;
  }
}

.tab-name {
  display: flex;
  align-items: center;
}
</style>
