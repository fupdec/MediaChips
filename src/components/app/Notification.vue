<template>
  <v-card
    @mouseenter="stopTimer"
    @mouseleave="resumeTimer"
    class="notification"
    :class="{'notification-hidden': progress < 5 && !isHidden}"
    :elevation="isHidden ? 3 : 9"
    rounded="lg"
  >
    <v-btn :color="notification.color" class="notification__icon" variant="tonal" icon>
      <v-icon>mdi-{{ notification.icon }}</v-icon>
    </v-btn>

    <div class="notification__body">
      <div class="notification__title">{{ notification.title }}</div>
      <div
        @click="collapsed = !collapsed"
        class="notification__text"
        v-html="displayText"
      ></div>
      <div
        v-if="actions.length"
        class="notification__actions"
      >
        <v-btn
          v-for="action in actions"
          :key="action.id || action.text"
          @click.stop="runAction(action)"
          :color="action.color || notification.color"
          :variant="action.variant || 'text'"
          size="small"
          class="notification__action"
        >
          <v-icon
            v-if="action.icon"
            start
          >mdi-{{ action.icon }}</v-icon>
          {{ action.text }}
        </v-btn>
      </div>
    </div>

    <div class="notification__manage">
      <v-btn
        @click="closeNotification"
        class="notification__close-btn"
        icon variant="plain"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
      <v-btn
        v-if="!notification.hidden"
        @click="hideNotification"
        class="notification__close-btn"
        variant="plain"
        icon
      >
        <v-icon>mdi-minus</v-icon>
      </v-btn>
    </div>

    <div
      v-if="isHidden"
      class="notification__timestamp"
      v-html="formattedTimestamp"
    ></div>

    <v-progress-linear
      v-else
      :model-value="progress"
      class="notification__timeout"
      :color="notification.color"
      height="2"
      style="transition: none;"
    ></v-progress-linear>
  </v-card>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue'
import {useSettingsStore} from '@/stores/settings'
import {useNotificationsStore} from '@/stores/notifications'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/fr'
import 'dayjs/locale/es'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ru'
import type { NotificationInput } from '@/services/notificationService'

interface NotificationAction {
  id?: string
  text?: string
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'outlined' | 'plain' | 'tonal'
  icon?: string
  hide?: boolean
  close?: boolean
  action?: (notification: PoolNotification) => void
}

type PoolNotification = NotificationInput & {
  id: number
  title?: string
  timestamp?: number
  actions?: NotificationAction[]
}

const settingsStore = useSettingsStore()
const locale = settingsStore.locale == 'cn' ? 'zh-cn' : settingsStore.locale

dayjs.extend(relativeTime)
dayjs.locale(locale)

const props = defineProps<{
  notification: PoolNotification
}>()

// Reactive state
const interval = ref<ReturnType<typeof setInterval> | null>(null)
const progress = ref(100)
const collapsed = ref(true)

// Store
const notificationsStore = useNotificationsStore()

// Computed properties
const isHidden = computed(() => props.notification.hidden)
const actions = computed(() => Array.isArray(props.notification.actions) ? props.notification.actions : [])

const displayText = computed(() => {
  let text = props.notification.text || ''
  if (collapsed.value && text.length > 100) {
    text = text.slice(0, 100) + '...'
  }
  return text
})

// Метод для безопасного форматирования (альтернатива)
const getSafeFormattedTimestamp = (timestamp?: number) => {
  try {
    if (!timestamp) return ''

    const date = dayjs(timestamp)
    if (date.isValid()) {
      return date.fromNow()
    }

    // Fallback: форматируем как обычную дату
    return new Date(timestamp).toLocaleTimeString()
  } catch (error) {
    console.error('Error in getSafeFormattedTimestamp:', error)
    return ''
  }
}

// Альтернативное computed свойство с безопасным форматированием
const formattedTimestamp = computed(() => {
  return getSafeFormattedTimestamp(props.notification.timestamp)
})

// Methods
const closeNotification = () => {
  notificationsStore.closeNotification(props.notification.id)
}

const hideNotification = () => {
  notificationsStore.hideNotification(props.notification.id)
}

const runAction = (action: NotificationAction) => {
  if (action.action && typeof action.action === 'function') {
    action.action(props.notification)
  }

  if (action.hide) {
    hideNotification()
  }

  if (action.close) {
    closeNotification()
  }
}

const runTimer = (percent?: number) => {
  if (isHidden.value) {
    if (interval.value) clearInterval(interval.value)
    return
  }

  const step = percent ?? ((props.notification.timeout || 5000) / 100)

  if (interval.value) clearInterval(interval.value)

  interval.value = setInterval(() => {
    progress.value--
    if (progress.value < 1) {
      hideNotification()
    }
  }, step)
}

const stopTimer = () => {
  if (interval.value) clearInterval(interval.value)
  interval.value = null
}

const resumeTimer = () => {
  if (!interval.value) {
    runTimer()
  }
}

// Lifecycle hooks
onMounted(() => {
  if (!props.notification.hidden && props.notification.timeout && props.notification.timeout > 0) {
    runTimer()
  }
})

onUnmounted(() => {
  stopTimer()
})
</script>

<style scoped lang="scss">
.notification {
  display: flex;
  align-items: flex-start;
  min-height: 90px;
  width: 370px;
  margin: 0 0 16px;
  padding: 16px 16px 25px;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
  z-index: 50000;
  pointer-events: all;
  transition: all 0.3s ease;

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
    display: flex;
    justify-content: center;
    pointer-events: none;

    &::before {
      opacity: .08;
    }
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
    cursor: pointer;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 1;
    }
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

  &__timeout {
    position: absolute;
    left: 0;
    bottom: 0;
    margin: 0;
  }

  &__timestamp {
    position: absolute;
    right: 10px;
    bottom: 9px;
    font-size: 10px;
    opacity: 0.7;
  }

  &__manage {
    position: absolute;
    right: 5px;
    top: 5px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__close-btn {
    width: 28px;
    height: 28px;
    font-size: 16px;
    margin-top: 4px;
  }
}

.notification-hidden {
  opacity: 0.7;
  transform: translateX(20px);
}

@media (max-width: 480px) {
  .notification {
    max-width: 250px;

    &__title,
    &__text {
      max-width: 160px;
    }
  }
}
</style>