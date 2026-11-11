<template>
  <div
    ref="headerEl"
    class="dialog-header"
    @pointerdown="startDrag"
    @pointermove="moveDrag"
    @lostpointercapture="endDrag"
    :class="{
      'dialog-header--compact': isCompact,
      'dialog-header--scrolled': scrolled,
    }"
    :style="{'--dh-tone': `var(--v-theme-${tone})`}"
  >
    <div class="content">
      <div class="headline">
        <span
          v-if="icon"
          class="headline__icon"
          aria-hidden="true"
        >
          <v-icon
            :size="isCompact ? 18 : 20"
            :icon="`mdi-${icon}`"
          />
        </span>

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
          :variant="variantOf(btn)"
          :size="isCompact ? 'small' : undefined"
          :disabled="btn.disabled"
          :loading="btn.loading"
          :title="btn.title || btn.text"
          :aria-label="btn.title || btn.text"
          :class="{
            'dialog-header__action--icon-only': !!btn.icon,
            'dialog-header__action--quiet': kindOf(btn) === 'quiet' && !!btn.icon,
          }"
          @click="run(btn)"
        >
          <v-icon
            v-if="btn.icon"
            :icon="`mdi-${btn.icon}`"
            :size="isCompact ? 18 : undefined"
            start
          />
          <span
            v-if="btn.text"
            class="dialog-header__action-text"
          >{{ btn.text }}</span>
        </v-btn>
      </div>

      <span
        v-if="closable && buttonsOrdered.length"
        class="dialog-header__sep"
        aria-hidden="true"
      />

      <v-btn
        v-if="closable"
        class="dialog-header__close"
        icon
        variant="text"
        :size="isCompact ? 'small' : undefined"
        :disabled="closeDisabled"
        :aria-label="closeLabel || t('common.close')"
        :title="closeLabel || t('common.close')"
        @click="emit('close')"
      >
        <v-icon
          icon="mdi-close"
          :size="isCompact ? 18 : undefined"
        />
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import type { PropType } from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import sortBy from 'lodash/sortBy'
import {copyToClipboard} from '@/utils/copyToClipboard'

type DialogHeaderButtonKind = 'primary' | 'tonal' | 'quiet'
type DialogHeaderTone = 'primary' | 'error' | 'warning' | 'success' | 'info'

interface DialogHeaderButton {
  /** Visual weight. Auto when omitted: see kindOf(). */
  kind?: DialogHeaderButtonKind
  icon?: string
  text?: string
  title?: string
  color?: string
  outlined?: boolean
  disabled?: boolean
  loading?: boolean
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
  closeDisabled: Boolean,
  closeLabel: String,
  compact: Boolean,
  /** Accent for background tint and icon tile: error for destructive dialogs, warning for risky ones. */
  tone: {
    type: String as PropType<DialogHeaderTone>,
    default: 'primary',
  },
})

const {t} = useI18n()
const {xs} = useDisplay()
const isCompact = computed(() => props.compact && xs.value)

const buttonsOrdered = computed(() =>
  sortBy(props.buttons, 'order'),
)

/*
 * Auto hierarchy when several buttons share the header: only one stays filled
 * (the last non-destructive one, usually Save), destructive ones go quiet,
 * everything else becomes tonal. An explicit `kind` always wins.
 */
const mainButton = computed(() => {
  const candidates = buttonsOrdered.value.filter(b => !b.kind && b.color !== 'error')
  return candidates.filter(b => !b.outlined).at(-1) ?? candidates.at(-1)
})

const kindOf = (btn: DialogHeaderButton): DialogHeaderButtonKind => {
  if (btn.kind) return btn.kind
  if (props.buttons.length < 2) return btn.outlined ? 'tonal' : 'primary'
  if (btn.color === 'error') return 'quiet'
  return btn === mainButton.value ? 'primary' : 'tonal'
}

const variantOf = (btn: DialogHeaderButton) => {
  const kind = kindOf(btn)
  if (kind === 'quiet') return 'text'
  if (kind === 'tonal') return 'tonal'
  return 'flat'
}

/* Shadow only once content has scrolled under the header. */
const headerEl = ref<HTMLElement | null>(null)
const scrolled = ref(false)
const scrolledEls = new Set<Element>()
let scrollRoot: HTMLElement | null = null

function onContentScroll(event: Event) {
  const target = event.target
  if (!(target instanceof Element) || headerEl.value?.contains(target)) return
  if (target.scrollTop > 2) scrolledEls.add(target)
  else scrolledEls.delete(target)
  scrolled.value = scrolledEls.size > 0
}

onMounted(() => {
  scrollRoot = headerEl.value?.parentElement ?? null
  scrollRoot?.addEventListener('scroll', onContentScroll, {capture: true, passive: true})
})

onBeforeUnmount(() => {
  scrollRoot?.removeEventListener('scroll', onContentScroll, {capture: true})
  scrollRoot = null
  scrolledEls.clear()
})

const run = (btn: DialogHeaderButton) => {
  btn.function ? btn.function() : btn.action?.()
}

const copySubheader = () => {
  if (!props.subheaderCopyText) return
  void copyToClipboard(props.subheaderCopyText, {
    successText: t('common.copied'),
  })
}

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [contenteditable], [role="button"], .v-btn, .v-selection-control'

let content: HTMLElement | null = null
let overlay: HTMLElement | null = null
let observer: ResizeObserver | null = null
let originalTranslate = ''
let offsetX = 0
let offsetY = 0
let drag: {pointerId: number; x: number; y: number; offsetX: number; offsetY: number} | null = null

function positionDialog(x: number, y: number) {
  if (!content || !overlay || !content.getClientRects().length) return

  const rect = content.getBoundingClientRect()
  const bounds = overlay.getBoundingClientRect()
  const minX = Math.max(0, bounds.left) - (rect.left - offsetX)
  const minY = Math.max(0, bounds.top) - (rect.top - offsetY)
  const maxX = Math.min(window.innerWidth, bounds.right) - (rect.right - offsetX)
  const maxY = Math.min(window.innerHeight, bounds.bottom) - (rect.bottom - offsetY)

  offsetX = Math.max(minX, Math.min(x, maxX))
  offsetY = Math.max(minY, Math.min(y, maxY))
  content.style.translate = `${offsetX}px ${offsetY}px`
}

function constrainPosition() {
  positionDialog(offsetX, offsetY)
}

function resetPosition() {
  observer?.disconnect()
  observer = null
  window.removeEventListener('resize', constrainPosition)
  if (content) content.style.translate = originalTranslate
  content = null
  overlay = null
  offsetX = 0
  offsetY = 0
  drag = null
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || drag || !(event.target instanceof Element)) return
  if (event.target.closest(INTERACTIVE_SELECTOR)) return

  const header = event.currentTarget as HTMLElement
  const dialogContent = header.closest<HTMLElement>('.v-overlay__content')
  const dialogOverlay = dialogContent?.parentElement
  if (!dialogContent || !dialogOverlay?.matches('.v-overlay:not(.v-dialog--fullscreen)')) return

  if (content !== dialogContent) {
    resetPosition()
    content = dialogContent
    overlay = dialogOverlay
    originalTranslate = content.style.translate
    observer = new ResizeObserver(constrainPosition)
    observer.observe(content)
    observer.observe(overlay)
    window.addEventListener('resize', constrainPosition)
  }

  constrainPosition()
  drag = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX, offsetY}
  header.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function moveDrag(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId) return
  positionDialog(drag.offsetX + event.clientX - drag.x, drag.offsetY + event.clientY - drag.y)
}

function endDrag(event: PointerEvent) {
  if (drag?.pointerId === event.pointerId) drag = null
}

onBeforeUnmount(resetPosition)
</script>

<style scoped lang="scss">
.dialog-header {
  -webkit-app-region: no-drag;
  cursor: grab;
  touch-action: none;
  z-index: 1;
  --dh-tone: var(--v-theme-primary);
  background: linear-gradient(
    110deg,
    rgba(var(--dh-tone), 0.1),
    rgba(var(--dh-tone), 0.025)
  );
  box-shadow: 0 0 0 transparent;
  border-bottom: 1px solid transparent;
  transition: box-shadow .2s ease, border-color .2s ease;
  user-select: none;

  &--scrolled {
    box-shadow: 0 2px 10px #0000002b;
    border-bottom-color: rgba(var(--v-border-color), var(--v-border-opacity));
  }

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
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 11px;
      color: rgb(var(--dh-tone));
      background: rgba(var(--dh-tone), 0.14);
      box-shadow: inset 0 0 0 1px rgba(var(--dh-tone), 0.18);
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
    min-width: 0;
  }

  &__sep {
    flex: 0 0 auto;
    width: 1px;
    height: 24px;
    margin-inline: -2px;
    background: rgba(var(--v-border-color), var(--v-border-opacity));
  }

  &__action--quiet {
    min-width: 40px;
    padding-inline: 10px;

    :deep(.v-btn__content) {
      gap: 0;
    }

    :deep(.v-icon) {
      margin-inline: 0 !important;
    }

    .dialog-header__action-text {
      display: none;
    }
  }

  &__close {
    flex: 0 0 auto;

    &:hover {
      color: rgb(var(--v-theme-error));
    }
  }

  &--compact {
    .content {
      gap: 10px;
      padding: 10px 14px;
      min-height: 52px;
    }

    .headline {
      gap: 6px;

      &__icon {
        width: 32px;
        height: 32px;
        border-radius: 10px;
      }

      &__title {
        font-size: 1.125rem;
        line-height: 1.3;
      }

      &__subheader {
        font-size: 0.75rem;
      }
    }

    .actions {
      gap: 6px;
      min-height: var(--edit-deck-control-h, 40px);
    }

    .actions .v-btn {
      min-height: var(--edit-deck-control-h, 40px);
      font-size: 0.8125rem;
    }

    .dialog-header__close {
      width: var(--edit-deck-control-h, 40px);
      height: var(--edit-deck-control-h, 40px);
    }
  }
}

:global(.v-dialog--fullscreen .dialog-header) {
  cursor: default;
  touch-action: auto;
}

/* Narrow phones: title + close on first row, actions wrap on the second. */
@media (prefers-reduced-motion: reduce) {
  .dialog-header {
    transition: none;
  }
}

@media (max-width: 600px) {
  .dialog-header .content {
    flex-wrap: wrap;
    row-gap: 8px;
    padding: 10px 12px;
    gap: 8px;
  }

  .dialog-header .headline {
    order: 1;
    flex: 1 1 0;
    min-width: 0;
  }

  .dialog-header__close {
    order: 2;
  }

  .dialog-header__sep {
    display: none;
  }

  .dialog-header .actions {
    order: 3;
    flex: 1 1 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Prefer icon-only when an icon exists — keeps Delete / TPDB / TMDB / Save on one row. */
  .dialog-header .actions .dialog-header__action--icon-only {
    min-width: var(--edit-deck-control-h, 40px);
    padding-inline: 10px;

    :deep(.v-btn__content) {
      gap: 0;
    }

    :deep(.v-icon) {
      margin-inline: 0 !important;
    }

    .dialog-header__action-text {
      display: none;
    }
  }

  .dialog-header--compact .content {
    padding: 8px 12px;
    gap: 8px;
    min-height: 0;
  }
}
</style>
