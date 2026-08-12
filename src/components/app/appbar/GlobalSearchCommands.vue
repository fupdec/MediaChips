<template>
  <div class="global-search-commands">
    <div v-if="!flatItems.length" class="global-search-commands__empty text-medium-emphasis">
      {{ t('commandPalette.empty') }}
    </div>

    <div v-else class="global-search-commands__list" role="listbox">
      <div
        v-for="group in grouped"
        :key="group.id"
        class="global-search-commands__group"
      >
        <div class="global-search-commands__group-title">{{ group.title }}</div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="global-search-commands__item"
          :class="{'global-search-commands__item--active': isActive(item.id)}"
          role="option"
          :aria-selected="isActive(item.id)"
          @mouseenter="setActiveById(item.id)"
          @click="runCommand(item)"
        >
          <v-icon size="18" class="global-search-commands__item-icon">{{ item.icon }}</v-icon>
          <div class="global-search-commands__item-body">
            <div class="global-search-commands__item-title">{{ item.title }}</div>
            <div
              v-if="item.subtitle"
              class="global-search-commands__item-subtitle text-medium-emphasis"
            >
              {{ item.subtitle }}
            </div>
          </div>
          <v-hotkey
            v-if="item.shortcut"
            class="global-search-commands__item-shortcut"
            :keys="item.shortcut"
            variant="flat"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useCommandPaletteCommands} from '@/composable/useCommandPalette'
import {
  COMMAND_PALETTE_GROUP_ORDER,
  type CommandPaletteCommand,
  type CommandPaletteGroup,
} from '@/composable/commandPaletteCommands'

const props = defineProps<{
  query: string
}>()

const emit = defineEmits<{
  run: [command: CommandPaletteCommand]
}>()

const {t} = useI18n()
const {matchCommands} = useCommandPaletteCommands({excludeSearchAction: true})
const activeIndex = ref(0)

const filtered = computed(() => matchCommands(props.query))

const grouped = computed(() => {
  const groups: Array<{id: CommandPaletteGroup, title: string, items: CommandPaletteCommand[]}> = []
  for (const groupId of COMMAND_PALETTE_GROUP_ORDER) {
    const items = filtered.value.filter((item) => item.group === groupId)
    if (!items.length) continue
    groups.push({
      id: groupId,
      title: t(`commandPalette.groups.${groupId}`),
      items,
    })
  }
  return groups
})

const flatItems = computed(() => filtered.value)

watch(filtered, () => {
  activeIndex.value = 0
})

function isActive(id: string) {
  return flatItems.value[activeIndex.value]?.id === id
}

function setActiveById(id: string) {
  const index = flatItems.value.findIndex((item) => item.id === id)
  if (index >= 0) activeIndex.value = index
}

function moveActive(delta: number) {
  const total = flatItems.value.length
  if (!total) return
  activeIndex.value = (activeIndex.value + delta + total) % total
}

async function runActive() {
  const command = flatItems.value[activeIndex.value]
  if (!command) return
  emit('run', command)
}

async function runCommand(command: CommandPaletteCommand) {
  emit('run', command)
}

defineExpose({
  moveActive,
  runActive,
  resetActive: () => { activeIndex.value = 0 },
})
</script>

<style scoped lang="scss">
.global-search-commands__empty {
  padding: 28px 16px;
  text-align: center;
}

.global-search-commands__list {
  max-height: min(52vh, 420px);
  overflow: auto;
  padding: 8px;
}

.global-search-commands__group + .global-search-commands__group {
  margin-top: 6px;
}

.global-search-commands__group-title {
  padding: 6px 10px 4px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.global-search-commands__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.global-search-commands__item--active,
.global-search-commands__item:hover {
  background: rgba(var(--v-theme-primary), 0.12);
}

.global-search-commands__item-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.global-search-commands__item-body {
  flex: 1 1 auto;
  min-width: 0;
}

.global-search-commands__item-title {
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.25;
}

.global-search-commands__item-subtitle {
  margin-top: 1px;
  font-size: 0.72rem;
  line-height: 1.3;
}

.global-search-commands__item-shortcut {
  flex: 0 0 auto;
  opacity: 0.75;
}
</style>
