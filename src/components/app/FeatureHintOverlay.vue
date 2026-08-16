<template>
  <Teleport to="body">
    <div
      v-if="tipVisible && activeHint"
      class="feature-hint-tip"
      :style="tipStyle"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="bodyId"
    >
      <div class="feature-hint-tip__title" :id="titleId">
        {{ t(activeHint.titleKey) }}
      </div>
      <div class="feature-hint-tip__body" :id="bodyId">
        {{ t(activeHint.bodyKey) }}
      </div>
      <div class="feature-hint-tip__actions">
        <v-btn
          color="primary"
          variant="flat"
          rounded
          size="small"
          @click="dismissActiveHint(true)"
        >
          {{ t('feature_hints.got_it') }}
        </v-btn>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {useFeatureHintState, useFeatureHints} from '@/composable/useFeatureHints'

const props = defineProps<{
  isPlayerWindow: boolean
  isShellReady: boolean
}>()

const {t} = useI18n()
const titleId = 'feature-hint-title'
const bodyId = 'feature-hint-body'

const {dismissActiveHint} = useFeatureHints({
  isPlayerWindow: toRef(props, 'isPlayerWindow'),
  isShellReady: toRef(props, 'isShellReady'),
})
const {activeHint, tipVisible, tipStyle} = useFeatureHintState()
</script>

<style scoped>
.feature-hint-tip {
  position: fixed;
  z-index: 35010;
  max-width: min(320px, calc(100vw - 32px));
  padding: 14px 16px 12px;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(var(--v-theme-on-surface), 0.08);
}

.feature-hint-tip__title {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 6px;
}

.feature-hint-tip__body {
  font-size: 0.85rem;
  line-height: 1.45;
  opacity: 0.88;
  margin-bottom: 12px;
}

.feature-hint-tip__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
