<template>
  <div class="dialog-header">
    <div class="content">
      <!-- Title -->
      <div
        class="headline d-flex align-center ma-sm-4 ma-2"
        :class="{ 'my-sm-2': subheader }"
      >
        <v-icon v-if="icon"
          class="mr-4"
          :icon="`mdi-${icon}`"/>

        <div v-if="subheader">
          <div class="text-h6">{{ header }}</div>
          <div class="text-caption text-medium-emphasis d-inline-flex align-center">
            <span class="text-truncate">{{ subheader }}</span>
            <v-btn
              v-if="subheaderCopyText"
              @click.stop="copySubheader"
              variant="text"
              icon
              size="x-small"
              :title="subheaderCopyTitle || t('common.copy_name')"
              class="ml-1 flex-shrink-0"
            >
              <v-icon icon="mdi-content-copy" size="small" />
            </v-btn>
          </div>
        </div>

        <span
          v-else
          class="text-h6"
          :class="{ 'text-body-1': smAndDown }"
        >
          {{ header }}
        </span>
      </div>

      <!-- Actions -->
      <div
        class="actions mx-sm-4 mx-2"
        :class="{ 'flex-wrap': xs }"
      >
        <v-btn
          v-if="closable"
          class="my-2"
          variant="outlined"
          :size="smAndDown ? 'small' : 'default'"
          @click="emit('close')"
        >
          <v-icon icon="mdi-close"
            start/>
          {{ t('common.close') }}
        </v-btn>

        <v-btn
          v-for="(btn, index) in buttonsOrdered"
          :key="index"
          class="ml-sm-4 ml-2 my-2"
          :color="btn.color"
          :variant="btn.outlined ? 'outlined' : 'flat'"
          :disabled="btn.disabled"
          :size="smAndDown ? 'small' : 'default'"
          @click="run(btn)"
        >
          <v-icon
            v-if="btn.icon"
            class="mr-2"
            :icon="`mdi-${btn.icon}`"
            start
          />
          {{ btn.text }}
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import type { PropType } from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import sortBy from 'lodash/sortBy'
import {copyToClipboard} from '@/utils/copyToClipboard'

interface DialogHeaderButton {
  icon?: string
  text?: string
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

/* Vuetify 3 breakpoints */
const {xs, smAndDown} = useDisplay()
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

    // Устанавливаем стили для перетаскивания
    dragElement.style.position = 'fixed'
    dragElement.style.margin = '0'
    dragElement.style.left = `${initialLeft}px`
    dragElement.style.top = `${initialTop}px`
    dragElement.style.zIndex = '9999'

    // Сохраняем оригинальный transition
    const oldTransition = dragElement.style.transition
    dragElement.style.transition = 'none'
    dragElement.dataset.oldTransition = oldTransition

    // Предотвращаем выделение текста при перетаскивании
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

    // Применяем новую позицию
    dragElement.style.left = `${newLeft}px`
    dragElement.style.top = `${newTop}px`
  }

  const onMouseUp = () => {
    if (!isDragging || !dragElement) return

    // Восстанавливаем transition
    if (dragElement.dataset.oldTransition !== undefined) {
      dragElement.style.transition = dragElement.dataset.oldTransition
    }

    isDragging = false
    dragElement = null
  }

  // Добавляем обработчики
  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)

  // Функция для очистки
  return () => {
    document.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
}

const cleanupDragWindow = ref<(() => void) | null>(null)

onMounted(() => {
  // Инициализируем перетаскивание
  cleanupDragWindow.value = dragWindow('.dialog-header', '.v-overlay__content')
})

onBeforeUnmount(() => {
  // Очищаем обработчики
  if (cleanupDragWindow.value) {
    cleanupDragWindow.value()
  }
})
</script>

<style scoped lang="scss">
.dialog-header {
  -webkit-app-region: no-drag;
  cursor: grab;
  background-color: rgba(150, 150, 150, 0.1);
  box-shadow: 0 2px 10px #0000002b;
  z-index: 1;

  .content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .headline {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    width: 100%;
  }
}

@media (max-width: 480px) {
  .dialog-header {
    .content {
      flex-direction: column;
    }

    .headline {
      margin-bottom: 0 !important;
    }

    .actions {
      justify-content: space-between;
    }
  }
}
</style>
