<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1040"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="shortcuts-dialog" rounded="xl">
      <DialogHeader
        :header="t('keyboard_shortcuts.title')"
        icon="keyboard"
        closable
        @close="emit('update:modelValue', false)"
      />

      <v-card-text class="shortcuts-content">
        <div class="shortcuts-grid">
          <section
            v-for="section in sections"
            :key="section.id"
            :class="['shortcut-section', {'shortcut-section--browser': section.id === 'browser'}]"
            :aria-labelledby="`shortcuts-${section.id}`"
          >
            <div class="shortcut-section__heading">
              <span class="shortcut-section__icon">
                <v-icon :icon="section.icon" size="19" />
              </span>
              <h3 :id="`shortcuts-${section.id}`">{{ section.title }}</h3>
            </div>
            <dl class="shortcut-list">
              <div
                v-for="row in section.rows"
                :key="`${row.keys}:${row.label}`"
                class="shortcut-row"
              >
                <dt>{{ row.label }}</dt>
                <dd>
                  <v-hotkey
                    v-for="keys in row.keys.split(' ')"
                    :key="keys"
                    :keys="keys"
                    variant="contained"
                  />
                </dd>
              </div>
            </dl>
          </section>

          <section class="shortcut-section shortcut-section--player" aria-labelledby="shortcuts-player">
            <div class="shortcut-section__heading">
              <span class="shortcut-section__icon">
                <v-icon icon="mdi-play-circle-outline" size="19" />
              </span>
              <h3 id="shortcuts-player">{{ t('keyboard_shortcuts.player') }}</h3>
            </div>
            <p class="shortcut-section__description">
              {{ t('keyboard_shortcuts.see_player_docs') }}
            </p>
            <v-btn
              class="shortcut-section__docs"
              color="primary"
              variant="tonal"
              rounded="lg"
              append-icon="mdi-arrow-top-right"
              @click="emit('open-player-docs')"
            >
              {{ t('systemBar.keyboard_shortcuts') }}
            </v-btn>
          </section>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useBrowserLayout} from '@/composable/useBrowserLayout'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'open-player-docs': []
}>()

const {t} = useI18n()
const {useBrowserLayout: browserLayoutActive} = useBrowserLayout()

const appRows = computed(() => [
  {keys: 'meta+k', label: t('keyboard_shortcuts.command_palette')},
  {keys: 'slash', label: t('keyboard_shortcuts.search')},
  {keys: 'a', label: t('keyboard_shortcuts.add_media')},
  {keys: 'f', label: t('keyboard_shortcuts.filters')},
  {keys: 's', label: t('keyboard_shortcuts.toggle_select')},
  {keys: 'shift+slash', label: t('keyboard_shortcuts.shortcuts')},
])

const browserRows = computed(() => [
  {keys: 'b', label: t('keyboard_shortcuts.toggle_sidebar')},
  {keys: 'i', label: t('keyboard_shortcuts.toggle_inspector')},
  {keys: 'arrowup arrowdown arrowleft arrowright', label: t('keyboard_shortcuts.browser_navigate')},
  {keys: 'j k', label: t('keyboard_shortcuts.browser_jk')},
  {keys: 'home end', label: t('keyboard_shortcuts.browser_ends')},
  {keys: 'enter', label: t('keyboard_shortcuts.browser_edit')},
  {keys: 'e', label: t('keyboard_shortcuts.browser_edit')},
  {keys: 'space', label: t('keyboard_shortcuts.browser_play')},
  {keys: 'x', label: t('keyboard_shortcuts.browser_select')},
  {keys: 'shift+arrowup shift+arrowdown shift+arrowleft shift+arrowright', label: t('keyboard_shortcuts.browser_select_range')},
  {keys: 't', label: t('keyboard_shortcuts.browser_tags')},
  {keys: 't', label: t('keyboard_shortcuts.session_focus_apply')},
  {keys: 'shift+t', label: t('keyboard_shortcuts.session_focus_remove')},
  {keys: 'r', label: t('keyboard_shortcuts.review_mode')},
  {keys: 'delete', label: t('keyboard_shortcuts.browser_delete')},
  {keys: 'esc', label: t('keyboard_shortcuts.browser_clear')},
])

const selectRows = computed(() => [
  {keys: 'arrowup arrowdown arrowleft arrowright', label: t('keyboard_shortcuts.select_navigate')},
  {keys: 'j k', label: t('keyboard_shortcuts.select_jk')},
  {keys: 'space', label: t('keyboard_shortcuts.select_toggle')},
  {keys: 'shift+arrowup shift+arrowdown shift+arrowleft shift+arrowright', label: t('keyboard_shortcuts.select_range')},
  {keys: 'ctrl+a', label: t('keyboard_shortcuts.select_visible')},
  {keys: 'e', label: t('keyboard_shortcuts.bulk_edit')},
  {keys: 'delete', label: t('keyboard_shortcuts.delete')},
  {keys: 'esc', label: t('keyboard_shortcuts.exit_select')},
])

const sections = computed(() => [
  {id: 'app', title: t('keyboard_shortcuts.app'), icon: 'mdi-apps', rows: appRows.value},
  ...(browserLayoutActive.value
    ? [{id: 'browser', title: t('keyboard_shortcuts.browser'), icon: 'mdi-view-dashboard-outline', rows: browserRows.value}]
    : []),
  {id: 'select', title: t('keyboard_shortcuts.select'), icon: 'mdi-checkbox-multiple-marked-outline', rows: selectRows.value},
])
</script>

<style scoped>
.shortcuts-dialog {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.shortcuts-content {
  padding: 8px 24px 24px !important;
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
}

.shortcut-section {
  min-width: 0;
  padding: 18px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 18px;
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.shortcut-section__heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.shortcut-section__heading h3 {
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.4;
}

.shortcut-section__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.shortcut-list {
  margin: 0;
}

.shortcut-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
}

.shortcut-row + .shortcut-row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.shortcut-row dt {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.shortcut-row dd {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
  max-width: 180px;
  margin: 0;
}

.shortcut-row :deep(.v-kbd) {
  min-width: 26px;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-bottom-width: 2px;
  border-radius: 6px;
  font-size: 0.75rem;
}

.shortcut-section--browser {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.shortcut-section--player {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.07), rgba(var(--v-theme-primary), 0.02));
}

.shortcut-section__description {
  margin: 0 0 18px;
  font-size: 0.8125rem;
  line-height: 1.65;
  color: rgba(var(--v-theme-on-surface), 0.65);
}

.shortcut-section__docs {
  max-width: 100%;
  letter-spacing: normal;
  text-transform: none;
}

.shortcut-section__docs :deep(.v-btn__content) {
  white-space: normal;
}

@media (max-width: 760px) {
  .shortcuts-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .shortcuts-content {
    padding: 4px 12px 16px !important;
  }

  .shortcut-section--browser {
    grid-column: auto;
    grid-row: auto;
  }

  .shortcut-section {
    padding: 14px;
  }

  .shortcut-row dd {
    max-width: 140px;
  }
}
</style>
