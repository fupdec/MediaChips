<template>
  <div
    v-if="isVisible"
    class="session-focus-bar"
    role="status"
  >
    <div class="session-focus-bar__inner">
      <div class="session-focus-bar__label">
        <v-icon size="18" class="mr-1">mdi-bullseye-arrow</v-icon>
        <span class="session-focus-bar__title">{{ t('session_focus.bar_label') }}</span>
        <button
          type="button"
          class="session-focus-bar__chip"
          :title="t('session_focus.open_tag')"
          @click="openFocusTagPage"
        >
          <v-icon
            v-if="focusStore.tag.icon"
            size="14"
            start
          >
            mdi-{{ focusStore.tag.icon }}
          </v-icon>
          {{ focusStore.tag.name }}
        </button>
        <ButtonDocumentation
          id="tags.session_focus"
          dense
        />
      </div>

      <div class="session-focus-bar__actions">
        <v-btn
          size="small"
          variant="tonal"
          rounded="xl"
          prepend-icon="mdi-filter-outline"
          @click="browseWithFocus()"
        >
          {{ t('session_focus.browse_with') }}
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          rounded="xl"
          prepend-icon="mdi-tag-plus-outline"
          @click="browseWithoutFocus()"
        >
          {{ t('session_focus.browse_without') }}
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          rounded="xl"
          icon="mdi-close"
          :title="t('session_focus.clear')"
          @click="clearFocus"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useSessionFocusStore} from '@/stores/sessionFocus'
import {useSessionFocusActions} from '@/composable/useSessionFocusActions'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'

/** Pages where session focus actions (browse / apply / open tag) are meaningful. */
const SESSION_FOCUS_ROUTE_NAMES = new Set([
  'Home',
  'Items',
  'Tag',
  'AllTags',
])

const {t} = useI18n()
const route = useRoute()
const focusStore = useSessionFocusStore()
const {
  clearFocus,
  browseWithFocus,
  browseWithoutFocus,
  openFocusTagPage,
} = useSessionFocusActions()

const isVisible = computed(() =>
  Boolean(focusStore.tag) && SESSION_FOCUS_ROUTE_NAMES.has(String(route.name || '')),
)
</script>

<style scoped>
.session-focus-bar {
  position: sticky;
  top: 0;
  z-index: 4;
  background: rgba(var(--v-theme-surface), 0.92);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  backdrop-filter: blur(8px);
}

.session-focus-bar__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  min-height: 40px;
}

.session-focus-bar__label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.session-focus-bar__title {
  font-size: 0.8rem;
  opacity: 0.75;
  white-space: nowrap;
}

.session-focus-bar__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: min(40vw, 280px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  border-radius: 999px;
  padding: 2px 10px;
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  cursor: pointer;
}

.session-focus-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
</style>
