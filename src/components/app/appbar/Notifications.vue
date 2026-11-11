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
      <v-card width="420" max-width="calc(100vw - 24px)" class="notifications-wrap" rounded="xl">
        <v-card-actions class="notifications-header px-4">
          <div class="d-flex align-center font-weight-medium">
            <v-icon size="20" icon="mdi-bell" class="me-2" />
            {{ t("appbar.notifications") }}
          </div>
          <v-spacer></v-spacer>
          <v-btn
            v-if="notifications.length > 0"
            @click="closeAll"
            variant="text"
            size="small"
          >
            <v-icon start>mdi-notification-clear-all</v-icon>
            {{ t('appbar.closeAll') }}
          </v-btn>
        </v-card-actions>

        <v-divider></v-divider>

        <div class="notifications-list">
          <v-card-text class="notifications-stack">
            <v-card v-for="job in copyJobs" :key="job.id" class="task-notification">
              <div class="task-notification__header">
                <v-avatar size="32" color="primary" variant="tonal" icon="mdi-file-find-outline" />
                <div class="task-notification__body">
                  <div class="task-notification__title">{{ t('copyDiscovery.title') }}</div>
                  <div class="task-notification__status">{{ t(`copyDiscovery.states.${job.state}`) }}</div>
                </div>
              </div>
              <div class="task-notification__actions">
                <v-btn size="small" variant="tonal" color="primary" :disabled="!!copyAction" @click="controlCopyJob(job, job.state === 'paused' ? 'resume' : 'pause')">
                  {{ t(job.state === 'paused' ? 'copyDiscovery.resume' : 'copyDiscovery.pause') }}
                </v-btn>
                <v-btn size="small" variant="text" color="error" :disabled="!!copyAction" @click="controlCopyJob(job, 'cancel')">
                  {{ t('copyDiscovery.cancel') }}
                </v-btn>
                <v-btn size="small" variant="text" :to="copySettings" @click="showMenu = false">{{ t('copyDiscovery.configure') }}</v-btn>
              </div>
            </v-card>
            <v-alert v-if="copyError" type="error" density="compact">{{ t('copyDiscovery.states.failed') }}</v-alert>
            <template
              v-for="item in activityItems"
              :key="item.key"
            >
              <v-card
                v-if="item.kind === 'task'"
                class="task-notification"
              >
                <div class="task-notification__header">
                  <v-avatar
                    :color="item.color || 'primary'"
                    :icon="`mdi-${item.icon || 'cog'}`"
                    size="32"
                    variant="tonal"
                  />
                  <div class="task-notification__body">
                    <div class="task-notification__title">{{ item.title }}</div>
                    <div v-if="item.subtitle" class="task-notification__status">{{ item.subtitle }}</div>
                    <div v-if="item.progress != null" class="task-notification__progress">
                      <v-progress-linear
                        :model-value="item.progress"
                        :color="item.color || 'primary'"
                        height="5"
                        rounded
                      />
                      <span class="task-notification__percent">{{ Math.round(item.progress) }}%</span>
                    </div>
                  </div>
                </div>

                <div v-if="item.click || item.action || item.done" class="task-notification__actions">
                  <v-btn
                    v-if="item.click"
                    @click.stop="openTask(item.click)"
                    color="primary"
                    variant="text"
                    size="small"
                  >
                    <v-icon start>mdi-open-in-new</v-icon>
                    {{ t('media.adding.open_process_dialog') }}
                  </v-btn>
                  <v-btn
                    v-if="item.action || item.done"
                    @click.stop="stopTask(item)"
                    :color="item.done ? 'secondary' : 'error'"
                    variant="text"
                    size="small"
                  >
                    <v-icon start>{{ item.done ? 'mdi-close' : 'mdi-close-octagon' }}</v-icon>
                    {{ item.done ? t('common.close') : t('common.stop') }}
                  </v-btn>
                </div>
              </v-card>

              <Notification
                v-else
                :notification="item.notification"
              />
            </template>

            <div v-if="activityItems.length === 0 && copyJobs.length === 0" class="text-center py-2">
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
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useTasksStore } from '@/stores/tasks'
import { useSceneScraperStore } from '@mediachips/plugin-adult/stores/sceneScraper'
import { useScraperStore } from '@mediachips/plugin-adult/stores/scraper'
import {useI18n} from "vue-i18n";
import type { TaskItem } from '@/types/stores'

import {copyDiscoveryApi} from '@/services/typedApi/copyDiscovery'
import {useAppStore} from '@/stores/app'
import type {CopyDiscoveryJob} from '@shared/copyDiscovery'

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

type CopyActivity = Pick<CopyDiscoveryJob, 'id' | 'state'>
const app = useAppStore()
const copyJobs = ref<CopyActivity[]>([])
const copyAction = ref(false)
const copyError = ref(false)
const copySettings = {name: 'Settings', query: {tab: 'maintenance', section: 'copy_discovery'}}
const copyPolling = new AbortController()
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function pollCopyJobs() {
  const dbPath = app.dbPath
  try {
    if (!document.hidden && !copyAction.value) {
      const {data} = await copyDiscoveryApi.activity(copyPolling.signal)
      if (app.dbPath === dbPath && !copyAction.value) copyJobs.value = data
    }
  } catch {
    // The backend can be briefly unavailable while switching libraries.
  } finally {
    const busy = copyJobs.value.some(job => job.state !== 'paused')
    if (!copyPolling.signal.aborted) copyTimer = setTimeout(pollCopyJobs, busy ? 3000 : 30000)
  }
}

async function controlCopyJob(job: CopyActivity, action: 'pause' | 'resume' | 'cancel') {
  const dbPath = app.dbPath
  copyAction.value = true
  copyError.value = false
  try {
    const {data} = await copyDiscoveryApi[action](job.id)
    if (app.dbPath !== dbPath) return
    copyJobs.value = copyJobs.value.flatMap(item => item.id !== job.id ? [item] :
      data.state === 'cancelled' ? [] : [{id: data.id, state: data.state}])
  } catch {
    if (app.dbPath === dbPath) copyError.value = true
  } finally {
    copyAction.value = false
  }
}

watch(() => app.dbPath, () => { copyJobs.value = []; copyError.value = false })

onMounted(pollCopyJobs)
onBeforeUnmount(() => {
  copyPolling.abort()
  clearTimeout(copyTimer)
})

const badge = computed(() => activityItems.value.length + copyJobs.value.length)

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
@use "../../../assets/styles/notification-card" as card;

.notifications-menu {
  display: inline-flex;
  align-items: center;
}

.notifications-header {
  min-height: 52px;
  background: linear-gradient(
    115deg,
    rgba(var(--v-theme-primary), 0.15),
    rgba(var(--v-theme-primary), 0.04) 72%,
    rgba(var(--v-theme-secondary), 0.09)
  );
}

.notifications-stack {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px;
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.task-notification {
  @include card.surface;
  box-shadow: 0 2px 5px rgba(var(--v-theme-on-surface), 0.04);

  :deep(.v-avatar) {
    @include card.icon;
  }
}

.task-notification__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.task-notification__body {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.task-notification__title {
  @include card.title;
}

.task-notification__status {
  @include card.text;
}

.task-notification__progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.task-notification__percent {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  font-weight: 600;
}

.task-notification__actions {
  @include card.actions;
  margin-inline-start: 44px;
}

.notifications-list {
  max-height: min(65dvh, calc(100dvh - 112px));
  overflow: auto;
  overscroll-behavior: contain;
}
</style>
