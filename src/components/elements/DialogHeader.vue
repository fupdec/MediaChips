<template>
  <div class="dialog-header">
    <div class="content">
      <div class="headline">
        <v-icon
          v-if="icon"
          class="headline__icon"
          size="small"
          :icon="`mdi-${icon}`"
        />

        <div
          v-if="subheader"
          class="headline__text"
        >
          <div
            class="headline__title"
            :title="header"
          >
            {{ header }}
          </div>
          <div class="headline__subheader text-medium-emphasis">
            <span
              class="headline__subheader-text"
              :title="subheader"
            >{{ subheader }}</span>
            <v-btn
              v-if="subheaderCopyText"
              class="flex-shrink-0"
              variant="text"
              icon
              size="x-small"
              :title="subheaderCopyTitle || t('common.copy_name')"
              @click.stop="copySubheader"
            >
              <v-icon
                icon="mdi-content-copy"
                size="small"
              />
            </v-btn>
          </div>
        </div>

        <span
          v-else
          class="headline__title"
          :title="header"
        >
          {{ header }}
        </span>
      </div>

      <div
        v-if="buttonsOrdered.length"
        class="actions"
      >
        <v-btn
          v-for="(btn, index) in buttonsOrdered"
          :key="index"
          :color="btn.color"
          :variant="btn.outlined ? 'outlined' : 'flat'"
          :disabled="btn.disabled"
          :title="btn.title"
          @click="run(btn)"
        >
          <v-icon
            v-if="btn.icon"
            :icon="`mdi-${btn.icon}`"
            start
          />
          {{ btn.text }}
        </v-btn>
      </div>

      <v-btn
        v-if="closable"
        class="dialog-header__close"
        icon
        variant="text"
        :aria-label="t('common.close')"
        :title="t('common.close')"
        @click="emit('close')"
      >
        <v-icon icon="mdi-close" />
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import type { PropType } from 'vue'
import {useI18n} from 'vue-i18n'
import sortBy from 'lodash/sortBy'
import {copyToClipboard} from '@/utils/copyToClipboard'

interface DialogHeaderButton {
  icon?: string
  text?: string
  title?: string
  color?: string
  outlined?: boolean
  disabled?: boolean
  order?: number
  action?: () => void
  function?: () => void
}

const emit = defineEmits(['close'])

const props = defineProps({
  icon: String,
  header: {
    type: String,
    required: true,
  },
  subheader: String,
  subheaderCopyText: String,
  subheaderCopyTitle: String,
  buttons: {
    type: Array as PropType<DialogHeaderButton[]>,
    default: () => [],
  },
  closable: Boolean,
})

const {t} = useI18n()

const buttonsOrdered = computed(() =>
  sortBy(props.buttons, 'order'),
)

const run = (btn: DialogHeaderButton) => {
  btn.function ? btn.function() : btn.action?.()
}

const copySubheader = () => {
  if (!props.subheaderCopyText) return
  void copyToClipboard(props.subheaderCopyText, {
    successText: t('common.copied'),
  })
}

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], .v-btn, .v-selection-control'

const dragWindow = (headerSelector: string, dialogSelector: string) => {
  let isDragging = false
  let dragElement: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let initialLeft = 0
  let initialTop = 0

  const onMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (!target?.closest(headerSelector)) return
    if (target.closest(INTERACTIVE_SELECTOR)) return

    const dialog = target.closest(dialogSelector)
    if (!dialog) return

    const dialogContent = dialog.closest('.v-overlay__content') as HTMLElement | null
    if (!dialogContent) return

    dragElement = dialogContent
    isDragging = true

    const rect = dragElement.getBoundingClientRect()
    startX = e.clientX
    startY = e.clientY
    initialLeft = rect.left
    initialTop = rect.top

    dragElement.style.position = 'fixed'
    dragElement.style.margin = '0'
    dragElement.style.left = `${initialLeft}px`
    dragElement.style.top = `${initialTop}px`
    dragElement.style.zIndex = '9999'

    const oldTransition = dragElement.style.transition
    dragElement.style.transition = 'none'
    dragElement.dataset.oldTransition = oldTransition

    e.preventDefault()
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging || !dragElement) return

    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY

    let newLeft = initialLeft + deltaX
    let newTop = initialTop + deltaY

    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight
    const elementWidth = dragElement.offsetWidth
    const elementHeight = dragElement.offsetHeight

    newLeft = Math.max(0, Math.min(newLeft, windowWidth - elementWidth))
    newTop = Math.max(0, Math.min(newTop, windowHeight - elementHeight))

    dragElement.style.left = `${newLeft}px`
    dragElement.style.top = `${newTop}px`
  }

  const onMouseUp = () => {
    if (!isDragging || !dragElement) return

    if (dragElement.dataset.oldTransition !== undefined) {
      dragElement.style.transition = dragElement.dataset.oldTransition
    }

    isDragging = false
    dragElement = null
  }

  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)

  return () => {
    document.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
}

const cleanupDragWindow = ref<(() => void) | null>(null)

onMounted(() => {
  cleanupDragWindow.value = dragWindow('.dialog-header', '.v-overlay__content')
})

onBeforeUnmount(() => {
  if (cleanupDragWindow.value) {
    cleanupDragWindow.value()
  }
})
</script>

<style scoped lang="scss">
.dialog-header {
  -webkit-app-region: no-drag;
  cursor: grab;
  z-index: 1;
  background-color: rgba(150, 150, 150, 0.1);
  box-shadow: 0 2px 10px #0000002b;
  user-select: none;

  &:active {
    cursor: grabbing;
  }

  .content {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    min-width: 0;
  }

  .headline {
    display: flex;
    align-items: center;
    gap: 8px;
    /* Shrinks first so action buttons keep a single row */
    flex: 1 1 0;
    min-width: 7.5rem;
    overflow: hidden;

    &__icon {
      flex-shrink: 0;
      opacity: 0.72;
    }

    &__text {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }

    &__title {
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__subheader {
      display: flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      max-width: 100%;
      font-size: 0.75rem;
      line-height: 1.3;
    }

    &__subheader-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .actions {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: 8px;
  }

  &__close {
    flex: 0 0 auto;
  }
}

@media (max-width: 480px) {
  .dialog-header .content {
    padding: 10px 12px;
    gap: 8px;
  }
}
</style>
