<template>
  <div v-if="pages > 1" class="items-pagination pagination-container">
    <div class="items-pagination__pill">
      <v-btn
        v-if="page > 1"
        icon="mdi-page-first"
        variant="text"
        size="x-small"
        aria-label="First page"
        title="First page"
        @click="go(1)"
      />
      <v-btn
        icon="mdi-chevron-left"
        variant="text"
        size="x-small"
        :disabled="page <= 1"
        aria-label="Previous page"
        title="PageUp (Shift: −10)"
        @click="go(page - 1)"
      />

      <template v-for="n in visiblePages" :key="n">
        <form
          v-if="n === page"
          class="items-pagination__counter"
          @submit.prevent="submit"
        >
          <input
            ref="inputRef"
            v-model="draft"
            class="items-pagination__input"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :style="{ width: digits + 'ch' }"
            :aria-label="`Page ${page} of ${pages}`"
            @focus="inputRef?.select()"
            @blur="reset"
            @input="draft = draft.replace(/\D+/g, '')"
            @keydown.up.prevent="step(1, $event)"
            @keydown.down.prevent="step(-1, $event)"
            @keydown.esc.prevent="inputRef?.blur()"
          />
        </form>
        <button
          v-else
          type="button"
          class="items-pagination__page"
          @click="go(n)"
        >
          {{ n }}
        </button>
      </template>

      <span class="items-pagination__total">/ {{ pages }}</span>

      <v-btn
        icon="mdi-chevron-right"
        variant="text"
        size="x-small"
        :disabled="page >= pages"
        aria-label="Next page"
        title="PageDown (Shift: +10)"
        @click="go(page + 1)"
      />
      <v-btn
        v-if="page < pages"
        icon="mdi-page-last"
        variant="text"
        size="x-small"
        aria-label="Last page"
        title="Last page"
        @click="go(pages)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isBlockingOverlayOpen, isTypingTarget } from '@/utils/keyboardTarget'

const props = defineProps({
  page: { type: Number, required: true },
  jumpPage: { type: Number, default: null },
  pages: { type: Number, required: true },
  // how many page numbers to show around the current one (settings)
  totalVisible: { type: Number, default: 7 },
  // global hotkeys: PageUp / PageDown (Shift ±10). Enable on one instance only.
  keyboard: { type: Boolean, default: false },
})

const emit = defineEmits(['update:page', 'update:jumpPage', 'change', 'jump'])

const inputRef = ref<HTMLInputElement | null>(null)
const draft = ref(String(props.page))
const digits = computed(() => Math.max(String(props.pages).length, 1))

// Window of nearest pages centered on the current one.
const visiblePages = computed(() => {
  const size = Math.min(Math.max(Math.trunc(props.totalVisible) || 1, 1), props.pages)
  const half = Math.floor((size - 1) / 2)
  const start = Math.min(Math.max(props.page - half, 1), props.pages - size + 1)
  return Array.from({ length: size }, (_, i) => start + i)
})

const reset = () => {
  draft.value = String(props.page)
}

watch(
  () => props.page,
  () => {
    if (document.activeElement !== inputRef.value) reset()
  },
)

const clamp = (value: number) => Math.min(Math.max(Math.trunc(value), 1), props.pages)

const go = (value: number) => {
  const target = clamp(value)
  if (target === props.page) return
  emit('update:page', target)
  emit('change', target)
}

// ↑/↓ in the input only change the draft; blur restores the current page, Enter commits.
const step = (dir: 1 | -1, e: KeyboardEvent) => {
  const base = draft.value ? Number(draft.value) : props.page
  draft.value = String(clamp(base + dir * (e.shiftKey ? 10 : 1)))
  inputRef.value?.select()
}

const submit = () => {
  if (!draft.value || Number(draft.value) < 1) return reset()
  const target = clamp(Number(draft.value))
  emit('update:jumpPage', target)
  emit('jump', target)
  draft.value = String(target)
  inputRef.value?.blur()
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || props.pages <= 1) return
  if (e.code !== 'PageUp' && e.code !== 'PageDown') return
  if (isTypingTarget(e.target) || isBlockingOverlayOpen()) return

  e.preventDefault()
  go(props.page + (e.code === 'PageDown' ? 1 : -1) * (e.shiftKey ? 10 : 1))
}

onMounted(() => props.keyboard && window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<style lang="scss" scoped>
.items-pagination {
  display: flex;
  justify-content: center;

  &__pill {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 2px 4px;
    border-radius: 999px;
    background: rgba(var(--v-theme-on-surface), 0.05);
    box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.07);
  }

  &__page {
    min-width: 28px;
    padding: 2px 6px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), 0.65);
    font-size: 0.85rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &:hover {
      background: rgba(var(--v-theme-primary), 0.12);
      color: rgb(var(--v-theme-primary));
    }
  }

  &__counter {
    display: inline-flex;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(var(--v-theme-primary), 0.14);
    font-size: 0.95rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: text;
    transition: box-shadow 0.15s;

    &:focus-within {
      box-shadow: 0 0 0 1.5px rgb(var(--v-theme-primary));
    }
  }

  &__input {
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: rgb(var(--v-theme-primary));
    font: inherit;
    text-align: center;
  }

  &__total {
    margin: 0 4px 0 6px;
    color: rgba(var(--v-theme-on-surface), 0.45);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
}
</style>
