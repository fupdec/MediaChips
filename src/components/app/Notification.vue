<template>
  <v-card
    ref="cardRef"
    @pointerdown="onSwipePointerDown"
    @mouseenter="stopTimer"
    @mouseleave="resumeTimer"
    class="notification"
    :class="[
      swipeClass,
      {
        'notification-hidden': progress < 5 && !isHidden,
      },
    ]"
    :style="notificationSwipeStyle"
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

    <div
      v-else
      class="notification__timeout"
      aria-hidden="true"
    >
      <div
        class="notification__timeout-bar"
        :style="{
          transform: `scaleX(${Math.max(0, progress) / 100})`,
          backgroundColor: `rgb(var(--v-theme-${notification.color || 'primary'}))`,
        }"
      ></div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch} from 'vue'
import {useSettingsStore} from '@/stores/settings'
import {useNotificationsStore} from '@/stores/notifications'
import {useSwipeToDismiss} from '@/composable/useSwipeToDismiss'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/fr'
import 'dayjs/locale/ja'
import 'dayjs/locale/pt-br'
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
const locale = settingsStore.locale == 'cn' ? 'zh-cn' : settingsStore.locale == 'pt' ? 'pt-br' : settingsStore.locale

dayjs.extend(relativeTime)
dayjs.locale(locale)

const props = defineProps<{
  notification: PoolNotification
}>()

const cardRef = ref<{ $el?: HTMLElement } | null>(null)
const progress = ref(100)
const collapsed = ref(true)
let rafId = 0
let periodMs = 5000
let endsAt = 0

const notificationsStore = useNotificationsStore()

const isHidden = computed(() => props.notification.hidden)
const actions = computed(() => Array.isArray(props.notification.actions) ? props.notification.actions : [])

const closeNotification = () => {
  notificationsStore.closeNotification(props.notification.id)
}

const hideNotification = () => {
  notificationsStore.hideNotification(props.notification.id)
}

const {
  offsetX,
  isDragging,
  dismissing,
  swipeStyle,
  swipeClass,
  onPointerDown: onSwipePointerDown,
  bindWheel,
  resolveEl,
} = useSwipeToDismiss(() => {
  // Swipe away from the toast pool removes the toast (same as auto-timeout / X).
  closeNotification()
})

const notificationSwipeStyle = computed(() => {
  // Idle: no inline transform — pool leave CSS must be able to slide right.
  // (Previously a near-end translateX(20px) blocked auto-hide leave animation.)
  if (!isDragging.value && offsetX.value === 0 && !dismissing.value) {
    return undefined
  }

  return {
    transform: `translateX(${offsetX.value}px)`,
    opacity: swipeStyle.value?.opacity,
  }
})

const displayText = computed(() => {
  let text = props.notification.text || ''
  if (collapsed.value && text.length > 100) {
    text = text.slice(0, 100) + '...'
  }
  return text
})

const getSafeFormattedTimestamp = (timestamp?: number) => {
  try {
    if (!timestamp) return ''

    const date = dayjs(timestamp)
    if (date.isValid()) {
      return date.fromNow()
    }

    return new Date(timestamp).toLocaleTimeString()
  } catch (error) {
    console.error('Error in getSafeFormattedTimestamp:', error)
    return ''
  }
}

const formattedTimestamp = computed(() => {
  return getSafeFormattedTimestamp(props.notification.timestamp)
})

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

const tick = (now: number) => {
  const left = Math.max(0, endsAt - now)
  progress.value = periodMs > 0 ? (left / periodMs) * 100 : 0
  if (left <= 0) {
    rafId = 0
    hideNotification()
    return
  }
  rafId = requestAnimationFrame(tick)
}

const stopTimer = () => {
  if (!rafId) return
  cancelAnimationFrame(rafId)
  rafId = 0
  // Freeze remaining fraction so resume continues from here.
  if (periodMs > 0 && endsAt > 0) {
    const left = Math.max(0, endsAt - performance.now())
    progress.value = (left / periodMs) * 100
  }
}

const runTimer = () => {
  if (isHidden.value || dismissing.value) {
    stopTimer()
    return
  }

  periodMs = props.notification.timeout || 5000
  if (periodMs <= 0) return

  stopTimer()
  const remaining = Math.max(0, (progress.value / 100) * periodMs)
  if (remaining <= 0) {
    hideNotification()
    return
  }
  endsAt = performance.now() + remaining
  rafId = requestAnimationFrame(tick)
}

const resumeTimer = () => {
  if (dismissing.value || isDragging.value || offsetX.value > 0) return
  if (isHidden.value) return
  if (!props.notification.timeout || props.notification.timeout <= 0) return
  if (!rafId && progress.value > 0) {
    runTimer()
  }
}

watch([isDragging, offsetX, dismissing], ([dragging, ox, isDismissing]) => {
  if (dragging || ox > 0 || isDismissing) {
    stopTimer()
    return
  }
  resumeTimer()
})

onMounted(() => {
  if (!props.notification.hidden && props.notification.timeout && props.notification.timeout > 0) {
    runTimer()
  }
  bindWheel(resolveEl(cardRef))
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
  width: var(--toast-width, 370px);
  max-width: 100%;
  margin: 0 0 16px;
  padding: 16px 16px 25px;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
  z-index: 50000;
  pointer-events: all;
  touch-action: pan-y;
  overscroll-behavior-x: none;
  // Swipe uses inline transform; leave slide is driven by the pool transition.
  transition: box-shadow 0.3s ease;
  will-change: transform, opacity;
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
    right: 0;
    bottom: 0;
    height: 2px;
    overflow: hidden;
    pointer-events: none;
  }

  &__timeout-bar {
    width: 100%;
    height: 100%;
    transform-origin: left center;
    will-change: transform;
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
}

@media (max-width: 480px) {
  .notification {
    &__title,
    &__text {
      max-width: 160px;
    }
  }
}
</style>
