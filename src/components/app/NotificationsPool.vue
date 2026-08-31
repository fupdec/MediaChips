<template>
  <div class="notifications-pool">
    <transition name="toast-slide" @before-leave="onBeforeLeave">
      <div
        v-if="taskSummaryItem"
        ref="taskSummaryEl"
        :key="taskSummaryItem.key"
        class="task-summary"
        :class="swipeClass"
        :style="swipeStyle"
        @pointerdown="onSwipePointerDown"
      >
        <v-btn color="secondary" class="task-summary__icon" variant="tonal" icon>
          <v-icon>mdi-progress-clock</v-icon>
        </v-btn>

        <div class="task-summary__body">
          <div class="task-summary__title">{{ taskSummaryItem.title }}</div>
          <div class="task-summary__text">{{ taskSummaryItem.text }}</div>
          <div class="task-summary__actions">
            <v-btn
              @click="showAll"
              color="secondary"
              variant="text"
              size="small"
              class="task-summary__action"
            >
              <v-icon start>mdi-bell-outline</v-icon>
              {{ t('appbar.openNotificationsList') }}
            </v-btn>
          </div>
        </div>
      </div>
    </transition>

    <transition-group
      name="toast-slide"
      tag="div"
      class="notifications-pool__stack"
      @before-leave="onBeforeLeave"
    >
      <Notification
        v-for="item in visibleNotificationPoolItems"
        :key="item.key"
        :notification="item.notification"
      />
    </transition-group>

    <div
      v-if="hiddenUnderCutCount > 0"
      class="notifications-pool__actions"
    >
      <v-btn
        @click="showAll"
        class="notifications-pool__action-btn"
        color="primary"
        elevation="10"
        rounded
      >
        <v-icon start>mdi-bell-outline</v-icon>
        {{ t('appbar.showAllNotifications', {count: hiddenUnderCutCount}) }}
      </v-btn>
      <v-btn
        @click="closeAll"
        class="notifications-pool__action-btn"
        color="secondary"
        elevation="10"
        rounded
      >
        <v-icon start>mdi-notification-clear-all</v-icon>
        {{ t('appbar.closeAll') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onUnmounted, ref, watch} from 'vue'
import {useNotificationsStore} from '@/stores/notifications'
import {useTasksStore} from '@/stores/tasks'
import {useI18n} from 'vue-i18n'
import {useSwipeToDismiss} from '@/composable/useSwipeToDismiss'
import Notification from '@/components/app/Notification.vue'
import type {NotificationInput} from '@/services/notificationService'

type PoolNotification = NotificationInput & {id: number; timestamp?: number; title?: string}

interface PoolItemBase {
  key: string
}

interface TaskSummaryItem extends PoolItemBase {
  kind: 'task-summary'
  title: string
  text: string
}

interface NotificationPoolItem extends PoolItemBase {
  kind: 'notification'
  notification: PoolNotification
  timestamp: number
}

const notificationsStore = useNotificationsStore()
const tasksStore = useTasksStore()
const {t} = useI18n()
const taskSummaryVisible = ref(false)
const knownTaskIds = ref(new Set<string>())
const taskSummaryTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const taskSummaryEl = ref<HTMLElement | null>(null)

const hideTaskSummary = () => {
  taskSummaryVisible.value = false
  if (taskSummaryTimer.value) clearTimeout(taskSummaryTimer.value)
  taskSummaryTimer.value = null
}

const {
  swipeStyle,
  swipeClass,
  onPointerDown: onSwipePointerDown,
  bindWheel,
  unbindWheel,
  reset: resetSwipe,
} = useSwipeToDismiss(() => {
  hideTaskSummary()
})

const showTaskSummary = () => {
  resetSwipe()
  taskSummaryVisible.value = true
  if (taskSummaryTimer.value) clearTimeout(taskSummaryTimer.value)
  taskSummaryTimer.value = setTimeout(() => {
    taskSummaryVisible.value = false
    taskSummaryTimer.value = null
  }, 5000)
}

const notifications = computed(() => notificationsStore.getNotifications)
const tasks = computed(() => tasksStore.list)

const taskSummaryItem = computed((): TaskSummaryItem | null => {
  if (!taskSummaryVisible.value || tasks.value.length === 0) return null
  return {
    kind: 'task-summary',
    key: 'task-summary',
    title: t('appbar.processStarted'),
    text: tasks.value.length === 1
      ? t('appbar.openProcessInNotifications')
      : t('appbar.activeProcessesCount', {count: tasks.value.length}),
  }
})

const notificationPoolItems = computed((): NotificationPoolItem[] =>
  notifications.value.map(notification => ({
    kind: 'notification' as const,
    key: `notification-${notification.id}`,
    notification: notification as PoolNotification,
    timestamp: notification.timestamp || 0,
  })),
)

/** Max 2 pool slots total (task summary counts as one). */
const visibleNotificationPoolItems = computed((): NotificationPoolItem[] => {
  const maxNotifications = taskSummaryItem.value ? 1 : 2
  return notificationPoolItems.value.slice(0, maxNotifications)
})

const poolItemsCount = computed(() => (
  (taskSummaryItem.value ? 1 : 0) + notificationPoolItems.value.length
))

const hiddenUnderCutCount = computed(() => Math.max(0, poolItemsCount.value - 2))

const showAll = () => {
  hideTaskSummary()
  notificationsStore.show = true
  notificationsStore.hideAllNotifications()
}

const closeAll = () => {
  hideTaskSummary()
  notificationsStore.closeAllNotifications()
}

/** Pin leave geometry before the item leaves flow — otherwise the stack
 *  collapses (`width: fit-content`) and `max-width: 100%` squeezes the card
 *  into a leftover strip on the left. */
const onBeforeLeave = (el: Element) => {
  const node = el as HTMLElement
  const top = node.offsetTop
  const left = node.offsetLeft
  const width = node.offsetWidth
  const height = node.offsetHeight
  node.style.position = 'absolute'
  node.style.top = `${top}px`
  node.style.left = `${left}px`
  node.style.right = 'auto'
  node.style.width = `${width}px`
  node.style.maxWidth = `${width}px`
  node.style.height = `${height}px`
  node.style.margin = '0'
}

watch(taskSummaryEl, (el) => {
  if (el) bindWheel(el)
  else unbindWheel()
})

watch(taskSummaryVisible, async (visible) => {
  if (!visible) {
    unbindWheel()
    return
  }
  await nextTick()
  if (taskSummaryEl.value) {
    bindWheel(taskSummaryEl.value)
  }
})

watch(
  () => tasks.value.map(task => task.id),
  (ids) => {
    const previous = knownTaskIds.value
    const hasNewTask = ids.some(id => !previous.has(id))
    knownTaskIds.value = new Set(ids)

    if (ids.length === 0) {
      hideTaskSummary()
      return
    }

    if (hasNewTask) {
      showTaskSummary()
    }
  },
  {immediate: true},
)

watch(
  () => notificationsStore.show,
  (show) => {
    if (show) hideTaskSummary()
  },
)

onUnmounted(() => {
  if (taskSummaryTimer.value) clearTimeout(taskSummaryTimer.value)
})
</script>

<style scoped lang="scss">
.notifications-pool {
  --toast-width: 370px;

  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 0;
  position: fixed;
  top: 55px;
  right: 15px;
  // Only as wide/tall as visible toasts — not a full-window overlay.
  width: fit-content;
  max-width: min(var(--toast-width), calc(100vw - 30px));
  height: auto;
  max-height: calc(100vh - 65px);
  overflow: visible;
  z-index: 10005;
  pointer-events: none;
  overscroll-behavior-x: none;
  padding: 10px;
  box-sizing: border-box;
}

.notifications-pool__stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
  // Keep width while a toast is `position: absolute` on leave.
  width: var(--toast-width);
  min-width: min(var(--toast-width), 100%);
  max-width: 100%;

  &:empty {
    display: none;
  }
}

.notifications-pool__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: var(--toast-width);
  max-width: 100%;
  margin-top: 4px;
  pointer-events: all;
}

.notifications-pool__action-btn {
  width: 100%;
}

.task-summary {
  display: flex;
  align-items: flex-start;
  min-height: 90px;
  width: var(--toast-width);
  max-width: 100%;
  margin: 0 0 16px;
  padding: 16px 16px 25px;
  position: relative;
  overflow: hidden;
  pointer-events: all;
  touch-action: pan-y;
  overscroll-behavior-x: none;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  transition: box-shadow 0.3s ease;
  cursor: grab;

  &.swipe-dismiss--swiping {
    transition: none;
    cursor: grabbing;
  }

  &.swipe-dismiss--active {
    user-select: none;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  &__body {
    padding-right: 25px;
    flex: 1;
  }

  &__icon {
    width: 48px;
    min-width: 48px;
    height: 48px;
    margin-right: 16px;
    border-radius: 50px;
    pointer-events: none;
  }

  &__title {
    font-size: 14px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  &__text {
    font-size: 12px;
    line-height: 1.4;
    max-width: 240px;
    margin-top: 4px;
    opacity: 0.7;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }

  &__action {
    min-width: 0;
  }
}

// Unique name — avoid Vuetify's global slide-x (slides LEFT via translateX(-15px)).
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.28s ease;
}

.toast-slide-leave-active {
  position: absolute;
  left: 0;
  right: auto;
  width: var(--toast-width);
  max-width: var(--toast-width);
  z-index: 1;
  pointer-events: none;
  will-change: transform, opacity;
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(120%);
}

.toast-slide-move {
  transition: transform 0.28s ease;
}

@media (max-width: 768px) {
  .notifications-pool {
    top: 45px;
    right: 10px;
    max-height: calc(100vh - 55px);
  }
}

@media (max-width: 480px) {
  .notifications-pool {
    --toast-width: 300px;
    top: 40px;
    right: 5px;
    max-width: calc(100vw - 10px);
  }
}
</style>
