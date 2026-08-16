<template>
  <div
    ref="hostRef"
    class="mark-inspector"
    data-ignore-player-hotkeys
    @keydown.escape="onEscape"
    @dblclick.stop
  >
    <div
      ref="dockRef"
      class="mark-inspector__dock"
      :style="dockStyle"
    >
      <span
        class="mark-inspector__caret"
        :style="{'--mark-caret': `${caret}px`, '--mark-accent': accentColor}"
      />
      <MarkAddingForm compact @addMark="emit('saveMark', $event)"/>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialogsStore} from '@/stores/dialogs'
import {usePlayerStore} from '@/stores/player'
import {clampInspectorDock} from '@/utils/playerMarkStudio'
import MarkAddingForm from '@/components/dialogs/MarkAddingForm.vue'

const emit = defineEmits<{
  saveMark: [data: Record<string, unknown>]
  escape: []
}>()

const playerStore = usePlayerStore()
const dialogsStore = useDialogsStore()
const hostRef = ref<HTMLElement | null>(null)
const dockRef = ref<HTMLElement | null>(null)
const shift = ref(0)
const caret = ref(220)

const accentColor = computed(() => dialogsStore.markAdding.color || '#f44336')

const anchorRatio = computed(() => {
  const duration = playerStore.duration || 0
  if (!duration) return 0.5
  const adding = dialogsStore.markAdding
  const start = Number(adding.time) || 0
  const end = adding.is_end_time_active && adding.end != null ? Number(adding.end) : start
  return Math.min(1, Math.max(0, ((start + end) / 2) / duration))
})

const dockStyle = computed(() => ({
  left: `${shift.value}px`,
}))

const layout = () => {
  const host = hostRef.value
  const dock = dockRef.value
  if (!host || !dock) return
  const next = clampInspectorDock({
    hostWidth: host.clientWidth,
    dockWidth: dock.offsetWidth,
    anchorRatio: anchorRatio.value,
    edge: 0,
    caretInset: 18,
  })
  shift.value = next.shift
  caret.value = next.caret
}

let hostObserver: ResizeObserver | null = null

const onEscape = (event: KeyboardEvent) => {
  const target = event.target
  if (target instanceof HTMLElement && (
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  )) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  emit('escape')
}

onMounted(async () => {
  await nextTick()
  layout()
  if (!hostRef.value || typeof ResizeObserver === 'undefined') return
  hostObserver = new ResizeObserver(() => layout())
  hostObserver.observe(hostRef.value)
  if (dockRef.value) hostObserver.observe(dockRef.value)
})

onBeforeUnmount(() => {
  hostObserver?.disconnect()
  hostObserver = null
})

watch(
  () => [
    anchorRatio.value,
    dialogsStore.markAdding.formKey,
    dialogsStore.markAdding.is_end_time_active,
    playerStore.studioMode,
  ],
  () => {
    void nextTick(layout)
  },
)
</script>
