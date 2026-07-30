<template>
  <v-card
    ref="cardRef"
    @pointerdown="onPointerDown"
    @mouseenter="stopTimer"
    @mouseleave="resumeTimer"
    class="notification"
    :class="{
      'notification-hidden': progress < 5 && !isHidden,
      'notification--swiping': isDragging,
      'notification--swipe-active': offsetX > 0,
    }"
    :style="swipeStyle"
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

const DISMISS_PX = 96
const MAX_OFFSET_PX = 420
const WHEEL_SETTLE_MS = 140

const settingsStore = useSettingsStore()
const locale = settingsStore.locale == 'cn' ? 'zh-cn' : settingsStore.locale == 'pt' ? 'pt-br' : settingsStore.locale

dayjs.extend(relativeTime)
dayjs.locale(locale)

const props = defineProps<{
  notification: PoolNotification
}>()

const cardRef = ref<{ $el?: HTMLElement } | null>(null)
const interval = ref<ReturnType<typeof setInterval> | null>(null)
const progress = ref(100)
const collapsed = ref(true)
const offsetX = ref(0)
const isDragging = ref(false)
const dismissing = ref(false)

let dragPointerId: number | null = null
let dragStartX = 0
let dragOriginOffset = 0
let wheelSettleTimer: ReturnType<typeof setTimeout> | null = null

const notificationsStore = useNotificationsStore()

const isHidden = computed(() => props.notification.hidden)
const actions = computed(() => Array.isArray(props.notification.actions) ? props.notification.actions : [])

const swipeStyle = computed(() => {
  const baseHiddenShift = isHidden.value || progress.value >= 5 ? 0 : 20
  const x = offsetX.value + (offsetX.value > 0 ? 0 : baseHiddenShift)
  return {
    transform: `translateX(${x}px)`,
    opacity: String(Math.max(0.2, 1 - offsetX.value / (DISMISS_PX * 1.6))),
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

const closeNotification = () => {
  notificationsStore.closeNotification(props.notification.id)
}

const hideNotification = () => {
  notificationsStore.hideNotification(props.notification.id)
}

const dismissBySwipe = () => {
  if (dismissing.value) return
  dismissing.value = true
  offsetX.value = MAX_OFFSET_PX
  stopTimer()
  window.setTimeout(() => {
    if (isHidden.value) {
      closeNotification()
    } else {
      hideNotification()
    }
  }, 160)
}

const snapBack = () => {
  offsetX.value = 0
}

const finishDrag = (clientX: number) => {
  if (!isDragging.value) return
  isDragging.value = false
  dragPointerId = null
  const delta = clientX - dragStartX
  offsetX.value = Math.max(0, Math.min(MAX_OFFSET_PX, dragOriginOffset + delta))
  if (offsetX.value >= DISMISS_PX) {
    dismissBySwipe()
  } else {
    snapBack()
  }
}

const onPointerDown = (event: PointerEvent) => {
  if (dismissing.value || event.button !== 0) return
  const target = event.target as HTMLElement | null
  if (target?.closest('button, a, .v-btn, .notification__action')) return

  dragPointerId = event.pointerId
  isDragging.value = true
  dragStartX = event.clientX
  dragOriginOffset = offsetX.value
  stopTimer()

  const el = event.currentTarget as HTMLElement | null
  el?.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

const onPointerMove = (event: PointerEvent) => {
  if (!isDragging.value || event.pointerId !== dragPointerId) return
  const delta = event.clientX - dragStartX
  offsetX.value = Math.max(0, Math.min(MAX_OFFSET_PX, dragOriginOffset + delta))
}

const onPointerUp = (event: PointerEvent) => {
  if (dragPointerId != null && event.pointerId !== dragPointerId) return
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  finishDrag(event.clientX)
}

const onWheel = (event: WheelEvent) => {
  if (dismissing.value) return

  // Mac trackpad two-finger swipe: horizontal delta dominates.
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) + 0.5) return

  event.preventDefault()
  event.stopPropagation()
  stopTimer()

  // Natural scroll: fingers right → deltaX < 0 → toast moves right (off-screen).
  offsetX.value = Math.max(0, Math.min(MAX_OFFSET_PX, offsetX.value - event.deltaX))

  if (wheelSettleTimer) clearTimeout(wheelSettleTimer)

  if (offsetX.value >= DISMISS_PX) {
    dismissBySwipe()
    return
  }

  wheelSettleTimer = setTimeout(() => {
    wheelSettleTimer = null
    if (!dismissing.value && offsetX.value < DISMISS_PX) {
      snapBack()
      resumeTimer()
    }
  }, WHEEL_SETTLE_MS)
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
  if (isHidden.value || dismissing.value) {
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
  if (dismissing.value || isDragging.value || offsetX.value > 0) return
  if (!interval.value) {
    runTimer()
  }
}

const getCardEl = () => {
  const refValue = cardRef.value
  if (!refValue) return null
  return (refValue.$el as HTMLElement | undefined) || (refValue as unknown as HTMLElement)
}

onMounted(() => {
  if (!props.notification.hidden && props.notification.timeout && props.notification.timeout > 0) {
    runTimer()
  }
  const el = getCardEl()
  el?.addEventListener('wheel', onWheel, {passive: false})
})

onUnmounted(() => {
  stopTimer()
  if (wheelSettleTimer) clearTimeout(wheelSettleTimer)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  const el = getCardEl()
  el?.removeEventListener('wheel', onWheel)
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
  touch-action: pan-y;
  transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.3s ease;
  will-change: transform, opacity;
  cursor: grab;

  &--swiping {
    transition: none;
    cursor: grabbing;
  }

  &--swipe-active {
    user-select: none;
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
