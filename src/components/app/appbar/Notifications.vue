<template>
  <div class="notifications-menu">
    <v-badge
      :model-value="!!badge"
      :content="badge"
      color="secondary"
      offset-x="35"
      offset-y="10"
    >
      <v-btn
        ref="activatorRef"
        icon
      >
        <v-icon>mdi-bell-outline</v-icon>
        <v-tooltip activator="parent" location="bottom">
          {{ t("appbar.notifications") }}
        </v-tooltip>
      </v-btn>
    </v-badge>

    <v-menu
      ref="menuRef"
      v-model="showMenu"
      :activator="activatorRef as never"
      location="bottom end"
      origin="top end"
      offset="8"
      :close-on-content-click="false"
      scroll-strategy="reposition"
      @update:model-value="hideAll"
    >
      <v-card width="400" class="notifications-wrap" rounded="lg">
        <v-card-actions class="px-4">
          <div class="d-flex align-center">
            <v-icon size="20" start>mdi-bell</v-icon>
            {{ t("appbar.notifications") }}
          </div>
          <v-spacer></v-spacer>
          <v-btn
            v-if="notifications.length > 0"
            @click="closeAll"
            variant="outlined"
            size="small"
          >
            <v-icon start>mdi-notification-clear-all</v-icon>
            {{ t('appbar.closeAll') }}
          </v-btn>
        </v-card-actions>

        <v-divider></v-divider>

        <div class="notifications-list">
          <v-card-text class="py-2 px-1">
            <template
              v-for="item in activityItems"
              :key="item.key"
            >
              <v-card
                v-if="item.kind === 'task'"
                class="task-notification"
                elevation="3"
                rounded="lg"
              >
                <template #prepend>
                  <v-avatar :color="item.color || 'primary'">
                    <v-icon :icon="`mdi-${item.icon || 'cog'}`" dark></v-icon>
                  </v-avatar>
                </template>

                <template #title>
                  {{ item.title }}
                </template>

                <template #subtitle>
                  {{ item.subtitle }}
                </template>

                <template v-if="item.progress" #loader>
                  <v-progress-linear
                    :model-value="item.progress"
                    :color="item.color || 'primary'"
                    height="2"
                  ></v-progress-linear>
                </template>

                <v-card-actions class="pt-0">
                  <v-btn
                    v-if="item.click"
                    @click.stop="openTask(item.click)"
                    color="primary"
                    variant="text"
                    class="px-4"
                  >
                    <v-icon start>mdi-open-in-new</v-icon>
                    {{ t('media.adding.open_process_dialog') }}
                  </v-btn>
                  <v-btn
                    v-if="item.action"
                    @click.stop="stopTask(item)"
                    :color="item.done ? 'secondary' : 'error'"
                    variant="text"
                    class="px-4"
                  >
                    <v-icon start>{{ item.done ? 'mdi-close' : 'mdi-close-octagon' }}</v-icon>
                    {{ item.done ? t('common.close') : t('common.stop') }}
                  </v-btn>
                </v-card-actions>
              </v-card>

              <Notification
                v-else
                :notification="item.notification"
              />
            </template>

            <div v-if="activityItems.length === 0" class="text-center py-2">
              <div class="layout-img">
                <v-img
                  src="/images/bell.svg"
                  max-height="140"
                  class="my-4"
                  contain
                ></v-img>
                <div class="text-medium-emphasis">
                  {{ t("appbar.noNotifications") }}
                </div>
              </div>
            </div>
          </v-card-text>
        </div>
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useSceneScraperStore } from '@/stores/sceneScraper'
import { useScraperStore } from '@/stores/scraper'
import {useI18n} from "vue-i18n";
import type { TaskItem } from '@/types/stores'

import Notification from '@/components/app/Notification.vue'

type NotificationEntry = ReturnType<typeof useNotificationsStore>['getNotificationsHidden'][number]

type TaskActivityItem = TaskItem & { kind: 'task'; key: string }
type NotificationActivityItem = {
  kind: 'notification'
  key: string
  notification: NotificationEntry
  timestamp: number
}

const notificationsStore = useNotificationsStore()
const tasksStore = useTasksStore()
const sceneScraperStore = useSceneScraperStore()
const scraperStore = useScraperStore()
const activatorRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
const menuRef = ref<{ updateLocation?: () => void } | null>(null)

const {t} = useI18n()

// Computed свойства
const notifications = computed(() => {
  return [...notificationsStore.getNotificationsHidden].reverse()
})

const tasks = computed(() => tasksStore.list)

const activityItems = computed((): Array<TaskActivityItem | NotificationActivityItem> => {
  const taskItems: TaskActivityItem[] = tasks.value.map(task => ({
    ...task,
    kind: 'task' as const,
    key: `task-${task.id}`,
  }))

  const notificationItems: NotificationActivityItem[] = notifications.value.map(notification => ({
    kind: 'notification' as const,
    key: `notification-${notification.id}`,
    notification,
    timestamp: notification.timestamp || 0,
  }))

  return [
    ...taskItems,
    ...notificationItems,
  ]
})

const badge = computed(() => activityItems.value.length)

const showMenu = computed({
  get: () => notificationsStore.show,
  set: (value) => notificationsStore.show = value
})

watch(() => notificationsStore.show, async (show) => {
  if (!show) return
  await nextTick()
  menuRef.value?.updateLocation?.()
})

// Методы
const hideAll = () => {
  notificationsStore.hideAllNotifications()
}

const openTask = (action: unknown) => {
  showMenu.value = false
  if (action && typeof action === 'function') {
    action()
  }
}

const stopTask = (task: TaskActivityItem) => {
  if (!task.done && task.action && typeof task.action === 'function') {
    task.action()
  }
  tasksStore.removeTask(task.id)
  if (task.id && sceneScraperStore.batchTaskId === task.id) {
    sceneScraperStore.batchTaskId = null
  }
  if (task.id && scraperStore.batchTaskId === task.id) {
    scraperStore.batchTaskId = null
  }
}

const closeAll = () => {
  showMenu.value = false
  setTimeout(() => {
    notificationsStore.closeAllNotifications()
  }, 300)
}
</script>

<style lang="scss" scoped>
.notifications-menu {
  display: inline-flex;
  align-items: center;
}

.notifications-wrap {
  .notification {
    width: calc(100% - 10px);
    margin: 5px 5px 15px;

    &:last-child {
      margin-bottom: 0 !important;
    }
  }

  .v-alert:last-of-type {
    margin-bottom: 0 !important;
  }
}

.task-notification {
  width: calc(100% - 10px);
  margin: 5px 5px 15px;

  &:last-child {
    margin-bottom: 0 !important;
  }
}

.notifications-list {
  max-height: calc(60vh - 60px);
  overflow: auto;
}
</style>
