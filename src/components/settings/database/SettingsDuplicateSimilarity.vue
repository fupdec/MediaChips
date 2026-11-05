<template>
  <v-card variant="flat" rounded="lg" class="similarity-settings">
    <div class="similarity-heading">
      <span class="similarity-heading__icon"><v-icon size="20">mdi-file-compare</v-icon></span>
      <div>
        <h3>{{ t('duplicateSimilarity.title') }}</h3>
        <p>{{ t('duplicateSimilarity.subtitle') }}</p>
      </div>
    </div>

    <div class="similarity-presets">
      <v-btn size="small" rounded="lg" :variant="presetMode === 'fingerprint' ? 'tonal' : 'text'" color="primary" prepend-icon="mdi-fingerprint" @click="preset('fingerprint')">{{ t('duplicateSimilarity.presetFingerprint') }}</v-btn>
      <v-btn size="small" rounded="lg" :variant="presetMode === 'visual' ? 'tonal' : 'text'" color="primary" prepend-icon="mdi-view-grid-outline" @click="preset('visual')">{{ t('duplicateSimilarity.presetVisual') }}</v-btn>
      <span v-if="!presetMode" class="similarity-presets__custom">{{ t('duplicateSimilarity.custom') }}</span>
    </div>

    <div class="similarity-threshold">
      <div class="similarity-threshold__heading">
        <label for="similarity-threshold">{{ t('duplicateSimilarity.thresholdLabel') }}</label>
        <span class="similarity-threshold__value">{{ draft.threshold }}<small>%</small></span>
      </div>
      <v-slider id="similarity-threshold" v-model="draft.threshold" :min="1" :max="100" :step="1" color="primary"
        :aria-label="t('duplicateSimilarity.threshold')" hide-details thumb-size="16" track-size="4" />
      <div class="similarity-threshold__scale"><span>{{ t('duplicateSimilarity.moreMatches') }}</span><span>{{ t('duplicateSimilarity.stricter') }}</span></div>
    </div>
    <p class="similarity-caption similarity-score-hint">{{ t('duplicateSimilarity.scoreHint') }}</p>

    <v-expansion-panels variant="accordion" class="similarity-signals" elevation="0">
      <v-expansion-panel elevation="0">
        <v-expansion-panel-title>
          <v-icon size="18" class="mr-2" color="primary">mdi-tune-variant</v-icon>
          <span>{{ t('duplicateSimilarity.signals') }}</span>
          <span class="similarity-signals__count">{{ enabledSignals }}/5</span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div v-for="signal in SIMILARITY_SIGNALS" :key="signal" class="signal-row" :class="{'signal-row--disabled': draft.weights[signal] === 0}">
            <div class="signal-row__description">
              <div class="signal-row__title">
                <span>{{ t(`duplicateSimilarity.${signal}`) }}</span>
                <span class="signal-strength" :class="`signal-strength--${signal}`">{{ t(`duplicateSimilarity.strength_${signal}`) }}</span>
              </div>
              <p class="similarity-caption">{{ t(`duplicateSimilarity.${signal}Hint`) }}</p>
            </div>
            <v-number-input v-model="draft.weights[signal]" :min="0" :max="100" :step="5" control-variant="hidden"
              :label="t('duplicateSimilarity.weight')" density="compact" variant="outlined" rounded="lg" hide-details />
            <v-checkbox v-model="draft.required" :value="signal" :label="t('duplicateSimilarity.required')" density="compact" hide-details color="primary" />
          </div>
          <p class="similarity-caption mt-3">{{ t('duplicateSimilarity.weightHint') }}</p>
          <div class="similarity-fields mt-4">
            <v-number-input v-model="draft.visualMinimum" :min="1" :max="100" control-variant="hidden"
              :label="t('duplicateSimilarity.visualMinimum')" density="compact" variant="outlined" rounded="lg" hide-details />
            <v-number-input v-model="draft.minimumFrames" :min="1" :max="9" control-variant="hidden"
              :label="t('duplicateSimilarity.minimumFrames')" density="compact" variant="outlined" rounded="lg" hide-details />
          </div>
          <div class="similarity-note mt-4"><v-icon size="17">mdi-shield-check-outline</v-icon><span>{{ t('duplicateSimilarity.guarantee') }}</span></div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <div class="similarity-outcome">
      <h4>{{ t('duplicateSimilarity.afterMerge') }}</h4>
      <div class="similarity-fields">
        <v-select v-model="draft.priority" :items="priorities" :label="t('duplicateSimilarity.original')"
          density="compact" variant="outlined" rounded="lg" hide-details />
        <v-select v-model="draft.files" :items="fileActions" :label="t('duplicateSimilarity.otherFiles')"
          density="compact" variant="outlined" rounded="lg" hide-details />
      </div>
      <p class="similarity-caption mt-2">{{ t('duplicateSimilarity.overrideShort') }}</p>
    </div>

    <div class="similarity-auto">
      <div><h4>{{ t('duplicateSimilarity.autoMerge') }}</h4><p class="similarity-caption">{{ t('duplicateSimilarity.autoHint') }}</p></div>
      <v-switch v-model="draft.autoMerge" :disabled="draft.files !== 'keep'" color="primary" inset hide-details
        :aria-label="t('duplicateSimilarity.autoMerge')" />
    </div>
    <v-alert v-if="error" type="error" density="compact" variant="tonal" class="mb-3">{{ error }}</v-alert>
    <div class="similarity-footer">
      <span class="similarity-footer__status" :class="{'similarity-footer__status--changed': changed}">
        <v-icon size="15">{{ changed ? 'mdi-circle-small' : 'mdi-check' }}</v-icon>
        {{ t(changed ? 'duplicateSimilarity.unsaved' : 'duplicateSimilarity.saved') }}
      </span>
      <span v-if="!valid" class="text-caption text-error">{{ t('duplicateSimilarity.invalid') }}</span>
      <v-btn color="primary" variant="flat" rounded="lg" size="small" :loading="saving" :disabled="!changed || !valid" @click="save">{{ t('duplicateSimilarity.save') }}</v-btn>
    </div>
  </v-card>
</template>
<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import {SIMILARITY_SIGNALS, parseDuplicatePolicy, defaultDuplicatePolicy} from '@shared/duplicateSimilarity'
const {t} = useI18n()
const settings = useSettingsStore()
const draft = ref(parseDuplicatePolicy(settings.duplicateSimilarityPolicy))
const saving = ref(false)
const error = ref('')
const stored = ref(JSON.stringify(draft.value))
watch(() => settings.duplicateSimilarityPolicy, value => {
  if (!saving.value) { draft.value = parseDuplicatePolicy(value); stored.value = JSON.stringify(draft.value) }
})
watch(() => draft.value.files, value => { if (value !== 'keep') draft.value.autoMerge = false })
const priorities = computed(() => ['quality', 'largest', 'smallest', 'oldest', 'newest'].map(value => ({value, title: t(`duplicateSimilarity.${value}`)})))
const fileActions = computed(() => ['keep', 'delete'].map(value => ({value, title: t(`duplicateSimilarity.${value}`)})))
const enabledSignals = computed(() => Object.values(draft.value.weights).filter(value => value > 0).length)
const presetMode = computed(() => JSON.stringify(draft.value.weights) === JSON.stringify(defaultDuplicatePolicy().weights) ? 'fingerprint'
  : draft.value.weights.visual === 100 && SIMILARITY_SIGNALS.every(key => key === 'visual' || draft.value.weights[key] === 0) ? 'visual' : null)
const changed = computed(() => JSON.stringify(draft.value) !== stored.value)
const valid = computed(() => Object.values(draft.value.weights).some(value => value > 0)
  && ['path', 'oshash', 'visual'].some(key => draft.value.weights[key as 'path' | 'oshash' | 'visual'] > 0))
function preset(mode: string) {
  const base = defaultDuplicatePolicy()
  draft.value.weights = mode === 'visual' ? {path: 0, name: 0, size: 0, oshash: 0, visual: 100} : base.weights
  draft.value.required = mode === 'visual' ? ['visual'] : ['oshash']
  draft.value.threshold = mode === 'visual' ? 90 : base.threshold
}
async function save(): Promise<boolean> {
  if (!valid.value) return false
  saving.value = true; error.value = ''
  const previous = settings.duplicateSimilarityPolicy
  try {
    const value = JSON.stringify(parseDuplicatePolicy(draft.value))
    await setOption(value, 'duplicateSimilarityPolicy')
    stored.value = value
    return true
  } catch {
    settings.duplicateSimilarityPolicy = previous
    error.value = t('duplicateSimilarity.saveFailed')
    return false
  } finally { saving.value = false }
}
defineExpose({save})
</script>
<style scoped>
.similarity-settings { padding: 20px; margin-bottom: 16px; border: 1px solid rgba(var(--v-theme-on-surface), .09); border-radius: 18px !important; overflow: visible; }
.similarity-heading { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.similarity-heading__icon { width: 36px; height: 36px; display: grid; place-items: center; flex-shrink: 0; border-radius: 11px; background: rgba(var(--v-theme-primary), .08); color: rgb(var(--v-theme-primary)); }
.similarity-heading h3 { font-size: .9375rem; font-weight: 600; line-height: 1.5; }
.similarity-heading p, .similarity-caption { font-size: .75rem; line-height: 1.6; color: rgba(var(--v-theme-on-surface), .6); margin: 0; }
.similarity-heading p { margin-top: 3px; font-size: .8125rem; }
.similarity-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 16px; }
.similarity-presets__custom { font-size: .6875rem; color: rgba(var(--v-theme-on-surface), .55); margin-left: auto; }
.similarity-threshold { background: rgba(var(--v-theme-primary), .045); border: 1px solid rgba(var(--v-theme-primary), .09); border-radius: 12px; padding: 12px 16px; }
.similarity-threshold__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: .8125rem; font-weight: 500; }
.similarity-threshold__value { font-size: 1.625rem; font-weight: 650; letter-spacing: -.04em; color: rgb(var(--v-theme-primary)); font-variant-numeric: tabular-nums; }
.similarity-threshold__value small { font-size: .8125rem; margin-left: 3px; }
.similarity-threshold :deep(.v-input) { margin: 2px 0; }
.similarity-threshold__scale { display: flex; justify-content: space-between; font-size: .6875rem; color: rgba(var(--v-theme-on-surface), .5); }
.similarity-score-hint { margin: 9px 0 16px; }
.similarity-signals { border: 1px solid rgba(var(--v-theme-on-surface), .09); border-radius: 12px; overflow: hidden; }
.similarity-signals :deep(.v-expansion-panel-title) { min-height: 48px; padding: 12px 16px; font-size: .8125rem; }
.similarity-signals :deep(.v-expansion-panel-text__wrapper) { padding: 0 16px 16px; }
.similarity-signals__count { margin-left: auto; padding-right: 12px; font-size: .6875rem; font-variant-numeric: tabular-nums; color: rgba(var(--v-theme-on-surface), .5); }
.signal-row { display: grid; grid-template-columns: minmax(0, 1fr) 92px 112px; gap: 12px; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .06); }
.signal-row :deep(.v-field-label) { font-size: .75rem; }
.signal-row__title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: .8125rem; font-weight: 500; margin-bottom: 3px; }
.signal-row--disabled .signal-row__description { opacity: .6; }
.signal-strength { font-size: .625rem; font-weight: 500; border-radius: 5px; padding: 1px 5px; color: rgba(var(--v-theme-on-surface), .6); background: rgba(var(--v-theme-on-surface), .05); }
.signal-strength--oshash, .signal-strength--path { color: rgb(var(--v-theme-success)); background: rgba(var(--v-theme-success), .08); }
.signal-strength--visual { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .08); }
.similarity-note { display: flex; align-items: flex-start; gap: 8px; font-size: .75rem; line-height: 1.6; color: rgba(var(--v-theme-on-surface), .65); }
.similarity-note .v-icon { margin-top: 2px; color: rgb(var(--v-theme-primary)); }
.similarity-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.similarity-outcome { margin-top: 20px; }
.similarity-outcome h4, .similarity-auto h4 { font-size: .8125rem; font-weight: 600; line-height: 1.5; margin: 0 0 12px; }
.similarity-auto { display: flex; align-items: center; gap: 16px; padding: 16px 0; margin-top: 16px; border-top: 1px solid rgba(var(--v-theme-on-surface), .07); }
.similarity-auto > div { flex: 1; min-width: 0; }
.similarity-auto h4 { margin-bottom: 3px; }
.similarity-auto > .v-input { flex: 0 0 auto; }
.similarity-footer { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding-top: 14px; border-top: 1px solid rgba(var(--v-theme-on-surface), .07); }
.similarity-footer > .v-btn { margin-left: auto; }
.similarity-footer__status { display: flex; align-items: center; gap: 5px; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .45); }
.similarity-footer__status--changed { color: rgb(var(--v-theme-primary)); }
@media (max-width: 600px) {
  .similarity-settings { padding: 16px; }
  .signal-row { grid-template-columns: minmax(0, 1fr) 70px; gap: 8px; }
  .signal-row > :last-child { grid-column: 1 / -1; }
  .similarity-fields { grid-template-columns: minmax(0, 1fr); }
}
</style>
