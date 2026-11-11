<template>
  <div class="similarity-settings">
    <div v-if="!valid || error" class="similarity-toolbar">
      <div class="similarity-status similarity-status--error" role="status" aria-live="polite">
        <template v-if="!valid"><v-icon size="15">mdi-alert-circle-outline</v-icon>{{ t('duplicateSimilarity.invalid') }}</template>
        <template v-else-if="error"><v-icon size="15">mdi-alert-circle-outline</v-icon>{{ error }}
          <button type="button" class="similarity-status__retry" @click="save">{{ t('duplicateSimilarity.retry') }}</button></template>
      </div>
    </div>
    <SettingsGroupLabel id="similarity-criteria-label" :title="t('duplicateSimilarity.criteriaTitle')" icon="tune-variant" accent />
    <div class="similarity-feature">
      <v-switch v-model="searchSimilarVideos" color="primary" inset hide-details
        class="mt-0 settings-switch settings-switch--with-description similarity-feature__switch"
        data-testid="similarity-search-videos">
        <template #label>
          <div class="d-flex flex-column ml-4">
            <div class="text-body-1 text-high-emphasis">{{ t('duplicateSimilarity.searchSimilarVideos') }}</div>
            <div class="text-caption text-medium-emphasis mt-1">{{ t('duplicateSimilarity.searchSimilarVideosHint') }}</div>
          </div>
        </template>
      </v-switch>
    </div>


    <div class="similarity-search">
      <div class="similarity-search__bar">
        <div class="similarity-search__title">
          <span class="similarity-tile similarity-tile--sm" aria-hidden="true"><v-icon size="18">mdi-file-search-outline</v-icon></span>
          <h4 id="similarity-presets-label">{{ t('duplicateSimilarity.presetLabel') }}</h4>
        </div>
        <div class="similarity-presets" role="group" aria-labelledby="similarity-presets-label">
          <v-chip v-for="item in presets" :key="item.key" size="small" color="primary" :prepend-icon="item.icon"
            :variant="presetMode === item.key ? 'flat' : 'outlined'" class="similarity-preset"
            :aria-pressed="presetMode === item.key" @click="preset(item.key)">{{ t(item.label) }}</v-chip>
          <v-chip v-if="!presetMode" size="small" variant="tonal" prepend-icon="mdi-pencil-outline" class="similarity-preset similarity-preset--custom">
            {{ t('duplicateSimilarity.custom') }}
          </v-chip>
        </div>
      </div>

      <ul class="signal-list">
        <li class="signal-list__head" aria-hidden="true">
          <span />
          <span />
          <span>{{ t('duplicateSimilarity.weight') }}</span>
          <span class="signal-list__head-required">{{ t('duplicateSimilarity.required') }}</span>
        </li>
        <li v-for="signal in SIMILARITY_SIGNALS" :key="signal" class="signal-row"
          :class="{'signal-row--off': draft.weights[signal] === 0, 'signal-row--required': draft.required.includes(signal)}">
          <v-icon :icon="signalIcons[signal]" size="18" class="signal-row__icon" aria-hidden="true" />
          <div class="signal-row__name">
            <span class="signal-row__title">{{ t(`duplicateSimilarity.${signal}`) }}</span>
            <span class="signal-strength" :class="`signal-strength--${signal}`">{{ t(`duplicateSimilarity.strength_${signal}`) }}</span>
            <v-tooltip :text="t(`duplicateSimilarity.${signal}Hint`)" location="top" max-width="280">
              <template #activator="{props: tip}">
                <v-icon v-bind="tip" size="14" class="signal-row__info" tabindex="0" role="img"
                  :aria-label="t(`duplicateSimilarity.${signal}Hint`)">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <v-slider v-model="draft.weights[signal]" :min="0" :max="100" :step="5" class="signal-row__slider"
            :aria-label="`${t(`duplicateSimilarity.${signal}`)}: ${t('duplicateSimilarity.weight')}`"
            color="primary" hide-details thumb-size="14" track-size="4" />
          <output class="signal-row__value">{{ draft.weights[signal] }}</output>
          <button v-ripple type="button" class="signal-required" :aria-pressed="draft.required.includes(signal)"
            :title="t('duplicateSimilarity.required')"
            :aria-label="`${t(`duplicateSimilarity.${signal}`)}: ${t('duplicateSimilarity.required')}`" @click="toggleRequired(signal)">
            <v-icon size="16">{{ draft.required.includes(signal) ? 'mdi-lock' : 'mdi-lock-open-variant-outline' }}</v-icon>
          </button>
        </li>
      </ul>
      <p class="similarity-search__hint similarity-caption">{{ t('duplicateSimilarity.weightHint') }}</p>
    </div>


    <v-expansion-panels variant="accordion" class="similarity-advanced" elevation="0">
      <v-expansion-panel elevation="0">
        <v-expansion-panel-title>
          <span class="similarity-tile similarity-tile--sm mr-3" aria-hidden="true"><v-icon size="18">mdi-tune-variant</v-icon></span>
          <span class="similarity-advanced__title">{{ t('duplicateSimilarity.advancedTitle') }}</span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="similarity-fields mt-1">
            <div class="similarity-slider">
              <div class="similarity-slider__heading">
                <span>{{ t('duplicateSimilarity.visualMinimum') }}</span>
                <output class="similarity-pill">{{ draft.visualMinimum }}%</output>
              </div>
              <v-slider v-model="draft.visualMinimum" :min="1" :max="100" :step="1"
                :aria-label="t('duplicateSimilarity.visualMinimum')" color="primary"
                hide-details thumb-size="16" track-size="4" />
            </div>
            <div class="similarity-slider">
              <div class="similarity-slider__heading">
                <span>{{ t('duplicateSimilarity.minimumFrames') }}</span>
                <output class="similarity-pill">{{ draft.minimumFrames }}/9</output>
              </div>
              <v-slider v-model="draft.minimumFrames" :min="1" :max="9" :step="1"
                :aria-label="t('duplicateSimilarity.minimumFrames')" color="primary"
                hide-details show-ticks="always" thumb-size="16" track-size="4" />
            </div>
          </div>
          <div class="similarity-note mt-2"><v-icon size="17">mdi-shield-check-outline</v-icon><span>{{ t('duplicateSimilarity.guarantee') }}</span></div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <SettingsGroupLabel id="similarity-preview-label" :title="t('duplicateSimilarity.preview.title')" icon="flask-outline" accent />
    <section class="similarity-preview" aria-labelledby="similarity-preview-label">
      <p class="similarity-caption">{{ t('duplicateSimilarity.scoreHint') }}</p>

      <v-chip-group v-model="selectedExample" :aria-label="t('duplicateSimilarity.preview.title')" mandatory column class="similarity-examples">
        <v-chip v-for="example in examples" :key="example.key" :value="example.key" size="small" color="primary"
          :variant="selectedExample === example.key ? 'flat' : 'outlined'" class="similarity-example">
          {{ t(`duplicateSimilarity.preview.${example.key}`) }}
        </v-chip>
      </v-chip-group>

      <div class="similarity-verdict" :class="preview.eligible ? 'similarity-verdict--pass' : 'similarity-verdict--fail'">
        <div class="similarity-verdict__result" aria-live="polite">
          <v-progress-circular :model-value="preview.score" :size="68" :width="6" bg-color="rgba(var(--v-theme-on-surface), .08)"
            :color="preview.eligible ? 'success' : 'warning'" :aria-label="t('duplicateSimilarity.preview.score', {score: formatScore(preview.score)})">
            <span class="similarity-verdict__score">{{ Math.round(preview.score) }}</span>
          </v-progress-circular>
          <div class="similarity-verdict__text">
            <span class="similarity-verdict__badge">
              <v-icon size="16">{{ preview.eligible ? 'mdi-check-circle' : 'mdi-alert-circle' }}</v-icon>
              {{ t(preview.eligible ? 'duplicateSimilarity.preview.passed' : 'duplicateSimilarity.preview.rejected') }}
            </span>
            <p class="similarity-caption">
              <strong class="similarity-verdict__exact">{{ t('duplicateSimilarity.preview.score', {score: formatScore(preview.score)}) }}</strong>
              <template v-if="!preview.eligible"> · {{ previewReason }}</template>
            </p>
          </div>
        </div>
        <div class="similarity-verdict__threshold">
          <div class="similarity-slider__heading">
            <label id="similarity-threshold-label">{{ t('duplicateSimilarity.thresholdLabel') }}</label>
            <output class="similarity-pill">{{ draft.threshold }}</output>
          </div>
          <v-slider v-model="draft.threshold" :min="1" :max="100" :step="1" color="primary"
            :style="{'--similarity-score': Math.max(0, (preview.score - 1) / 99 * 100) + '%'}"
            aria-labelledby="similarity-threshold-label" hide-details thumb-size="18" track-size="6" />
          <div class="similarity-verdict__scale" aria-hidden="true">
            <span>{{ t('duplicateSimilarity.moreMatches') }}</span>
            <span>{{ t('duplicateSimilarity.stricter') }}</span>
          </div>
        </div>
      </div>

      <ul class="similarity-results" aria-live="polite">
        <li v-for="signal in SIMILARITY_SIGNALS" :key="signal" class="similarity-result" :class="`similarity-result--${signalState(preview.signals[signal])}`">
          <div class="similarity-result__top">
            <span class="similarity-result__icon" aria-hidden="true"><v-icon :icon="signalIcons[signal]" size="18" /></span>
            <strong class="similarity-result__points">+{{ formatScore(preview.contributions[signal]) }}</strong>
          </div>
          <span class="similarity-result__title">{{ t(`duplicateSimilarity.${signal}`) }}</span>
          <small class="similarity-result__status">
            <v-icon v-bind="signalStatusIcon(preview.signals[signal])" size="14" aria-hidden="true" />
            <span>{{ signalStatus(preview.signals[signal]) }}<template v-if="draft.weights[signal] === 0 && !(signal === 'visual' && searchSimilarVideos)"> · {{ t('duplicateSimilarity.preview.zeroWeight') }}</template></span>
          </small>
        </li>
      </ul>
    </section>

    <SettingsGroupLabel id="similarity-merge-label" :title="t('duplicateSimilarity.afterMerge')" icon="call-merge" accent />
    <section class="similarity-panel" aria-labelledby="similarity-merge-label">
      <div class="similarity-outcome">
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
    </section>
  </div>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import SettingsGroupLabel from '@/components/settings/SettingsGroupLabel.vue'
import {SIMILARITY_SIGNALS, parseDuplicatePolicy, defaultDuplicatePolicy, compareSimilarity, type SimilarityItem} from '@shared/duplicateSimilarity'
const {t, locale} = useI18n()
const settings = useSettingsStore()
const draft = ref(parseDuplicatePolicy(settings.duplicateSimilarityPolicy))
const searchSimilarVideos = computed({
  get: () => draft.value.searchSimilarVideos ?? (draft.value.weights.visual > 0),
  set: (enabled: boolean) => {
    draft.value.searchSimilarVideos = enabled
    if (!enabled && draft.value.weights.oshash === 0 && draft.value.weights.path === 0) {
      draft.value.weights.oshash = defaultDuplicatePolicy().weights.oshash
    }
  },
})
const frame = '0000000000000000'
const original: SimilarityItem = {
  id: 1, path: '/original/Video.mp4', filesize: 1000, oshash: 'original', visualHash: frame,
  visualHashTiles: Array(9).fill(frame).join(':'),
}
const examples: {key: string; item: SimilarityItem}[] = [
  {key: 'renamed', item: {...original, id: 2, path: '/copies/Renamed.mp4'}},
  {key: 'differentDrive', item: {...original, id: 5, path: '/other-drive/Video.mp4'}},
  {key: 'transcoded', item: {
    id: 3, path: '/encoded/Video.mp4', filesize: 700, oshash: 'encoded',
    visualHashTiles: [...Array(8).fill('000000000000000f'), '000000000000ffff'].join(':'),
  }},
  {key: 'nameAndSize', item: {id: 4, path: '/other/Video.mp4', filesize: 1000, oshash: 'other'}},
  {key: 'sameFile', item: {...original, id: 6}},
  {key: 'replaced', item: {id: 7, path: original.path, filesize: 1400, oshash: 'replacement', visualHash: 'ffffffffffffffff'}},
  {key: 'missingData', item: {id: 8, path: '/offline/Video.mp4'}},
  {key: 'differentFiles', item: {id: 9, path: '/other/Unrelated.mp4', filesize: 2000, oshash: 'unrelated', visualHash: 'ffffffffffffffff'}},
]
const signalIcons = {
  path: 'mdi-folder-outline',
  name: 'mdi-text-box-outline',
  size: 'mdi-harddisk',
  oshash: 'mdi-fingerprint',
  visual: 'mdi-image-outline',
}
const selectedExample = ref(examples[0].key)
const preview = computed(() => {
  const example = examples.find(example => example.key === selectedExample.value) ?? examples[0]
  return compareSimilarity(original, example.item, draft.value, true)
})
const previewReason = computed(() => {
  const result = preview.value
  if (result.noWeights) return t('duplicateSimilarity.preview.noWeights')
  if (result.requiredFailures.length) {
    return result.requiredFailures.map(signal => t(
      result.signals[signal] == null ? 'duplicateSimilarity.preview.requiredUnavailable' : 'duplicateSimilarity.preview.requiredMismatch',
      {signal: t(`duplicateSimilarity.${signal}`)},
    )).join(' · ')
  }
  if (result.noStrongMatch) return t('duplicateSimilarity.preview.noStrongMatch')
  return t('duplicateSimilarity.preview.belowThreshold', {threshold: draft.value.threshold})
})
const scoreFormatter = computed(() => new Intl.NumberFormat(locale.value, {maximumFractionDigits: 1}))
const formatScore = (value: number) => scoreFormatter.value.format(value)
function signalStatusIcon(value: number | null) {
  if (value == null) return {icon: 'mdi-help-circle-outline'}
  if (value === 0) return {icon: 'mdi-close-circle-outline', color: 'error'}
  if (value === 100) return {icon: 'mdi-check-circle-outline', color: 'success'}
  return {icon: 'mdi-circle-half-full', color: 'primary'}
}
function signalState(value: number | null) {
  if (value == null) return 'unknown'
  if (value === 0) return 'mismatch'
  if (value === 100) return 'matched'
  return 'partial'
}
function toggleRequired(signal: typeof SIMILARITY_SIGNALS[number]) {
  const index = draft.value.required.indexOf(signal)
  if (index < 0) draft.value.required.push(signal)
  else draft.value.required.splice(index, 1)
}
const presets = [
  {key: 'fingerprint', icon: 'mdi-fingerprint', label: 'duplicateSimilarity.presetFingerprint'},
  {key: 'visual', icon: 'mdi-view-grid-outline', label: 'duplicateSimilarity.presetVisual'},
]
function signalStatus(value: number | null) {
  if (value == null) return t('duplicateSimilarity.preview.unavailable')
  if (value === 0) return t('duplicateSimilarity.preview.mismatch')
  if (value === 100) return t('duplicateSimilarity.preview.matched')
  return t('duplicateSimilarity.preview.partialMatch', {score: formatScore(value)})
}
const saving = ref(false)
const error = ref('')
const stored = ref(JSON.stringify(draft.value))
watch(() => settings.duplicateSimilarityPolicy, value => {
  if (!saving.value) { draft.value = parseDuplicatePolicy(value); stored.value = JSON.stringify(draft.value) }
})
watch(() => draft.value.files, value => { if (value !== 'keep') draft.value.autoMerge = false })
const priorities = computed(() => ['quality', 'largest', 'smallest', 'oldest', 'newest'].map(value => ({value, title: t(`duplicateSimilarity.${value}`)})))
const fileActions = computed(() => ['keep', 'delete'].map(value => ({value, title: t(`duplicateSimilarity.${value}`)})))
const presetMode = computed(() => JSON.stringify(draft.value.weights) === JSON.stringify(defaultDuplicatePolicy().weights) ? 'fingerprint'
  : draft.value.weights.visual === 100 && SIMILARITY_SIGNALS.every(key => key === 'visual' || draft.value.weights[key] === 0) ? 'visual' : null)
const changed = computed(() => JSON.stringify(draft.value) !== stored.value)
const valid = computed(() => searchSimilarVideos.value || draft.value.weights.path > 0 || draft.value.weights.oshash > 0)
function preset(mode: string) {
  const base = defaultDuplicatePolicy()
  draft.value.weights = mode === 'visual' ? {path: 0, name: 0, size: 0, oshash: 0, visual: 100} : base.weights
  draft.value.searchSimilarVideos = mode === 'visual'
  draft.value.required = mode === 'visual' ? ['visual'] : []
  draft.value.threshold = mode === 'visual' ? 90 : base.threshold
}
async function save(): Promise<boolean> {
  clearTimeout(autosaveTimer)
  if (!valid.value) return false
  if (!changed.value) return true
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
let autosaveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleAutosave(delay = 600) {
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    if (saving.value) return scheduleAutosave(300)
    if (changed.value && valid.value) void save()
  }, delay)
}
watch(draft, () => { if (changed.value) { error.value = ''; scheduleAutosave() } }, {deep: true})
onBeforeUnmount(() => {
  clearTimeout(autosaveTimer)
  if (changed.value && valid.value && !saving.value) void save()
})
defineExpose({save})
</script>
<style scoped>
.similarity-settings { container-type: inline-size; display: flex; flex-direction: column; gap: var(--settings-block-gap, 16px); }
.similarity-settings > .settings-group-label { margin-block: 12px; }
.similarity-settings > .settings-group-label:first-child, .similarity-toolbar + .settings-group-label { margin-top: 0; }
/* standalone panels — same surface as other settings panels */
.similarity-feature, .similarity-preview, .similarity-search, .similarity-advanced, .similarity-panel { border: 1px solid rgba(var(--v-theme-on-surface), .09); border-radius: 18px; background: rgb(var(--v-theme-surface)); }
.similarity-panel { padding: var(--settings-card-padding, 20px); }
.similarity-settings h4 { margin: 0; font-size: .9375rem; font-weight: 600; line-height: 1.45; }
.similarity-caption { font-size: .8125rem; line-height: 1.55; color: rgba(var(--v-theme-on-surface), .6); margin: 0; }

/* shared */
.similarity-tile { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 11px; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .09); transition: background-color .2s ease, color .2s ease; }
.similarity-tile--sm { width: 32px; height: 32px; border-radius: 10px; }
.similarity-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; padding: 1px 8px; border-radius: 999px; font-size: .75rem; font-weight: 700; font-variant-numeric: tabular-nums; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .1); }
.similarity-heading { display: flex; align-items: flex-start; gap: 12px; }
.similarity-heading p { margin-top: 2px; }

/* feature toggle */
.similarity-feature { padding: 10px 20px; }
.similarity-feature__switch :deep(.v-selection-control) { align-items: flex-start; }
.similarity-feature__switch :deep(.v-label) { background-color: transparent !important; opacity: 1; margin-left: 8px !important; }
.settings-switch--with-description { padding-block: 6px; }

/* preview */
.similarity-preview { display: flex; flex-direction: column; gap: 14px; padding: var(--settings-card-padding, 20px); }
.similarity-examples { padding: 0; }
.similarity-examples :deep(.v-slide-group__content) { gap: 6px; margin: 0; }
.similarity-example.v-chip { margin: 0; font-weight: 500; }
.similarity-example.v-chip--variant-outlined { border-color: rgba(var(--v-theme-primary), .25); }

.similarity-verdict { display: grid; align-items: center; gap: 16px 28px; padding: 14px 18px; border-radius: 14px; background: rgba(var(--v-theme-on-surface), .015); border: 1px solid rgba(var(--v-theme-on-surface), .07); box-shadow: 0 1px 2px rgba(0, 0, 0, .04); }
.similarity-verdict__result { display: flex; align-items: center; gap: 14px; min-width: 0; }
.similarity-verdict__result > .v-progress-circular { flex: 0 0 auto; }
.similarity-verdict__score { font-size: 1.0625rem; font-weight: 700; font-variant-numeric: tabular-nums; color: rgb(var(--v-theme-on-surface)); }
.similarity-verdict__text { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.similarity-verdict__badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 8px; border-radius: 999px; font-size: .8125rem; font-weight: 600; }
.similarity-verdict--pass .similarity-verdict__badge { color: rgb(var(--v-theme-success)); background: rgba(var(--v-theme-success), .12); }
.similarity-verdict--fail .similarity-verdict__badge { color: rgb(var(--v-theme-warning)); background: rgba(var(--v-theme-warning), .14); }
.similarity-verdict__exact { font-weight: 600; color: rgba(var(--v-theme-on-surface), .8); font-variant-numeric: tabular-nums; }
.similarity-verdict__threshold { min-width: 0; }
.similarity-verdict__threshold label { font-size: .8125rem; font-weight: 600; }
.similarity-verdict__threshold :deep(.v-slider) { margin-inline: 6px; }
.similarity-verdict__threshold :deep(.v-slider .v-input__control) { min-height: 30px; }
.similarity-verdict__threshold :deep(.v-slider-track) { position: relative; border-radius: 999px; background: rgba(var(--v-theme-primary), .14); }
.similarity-verdict__threshold :deep(.v-slider-track)::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; inline-size: var(--similarity-score); border-radius: inherit; background: linear-gradient(90deg, rgba(var(--v-theme-primary), .55), rgb(var(--v-theme-primary))); transition: inline-size .3s ease; }
.similarity-verdict__threshold :deep(.v-slider-track__background),
.similarity-verdict__threshold :deep(.v-slider-track__fill) { visibility: hidden; }
.similarity-verdict__threshold :deep(.v-slider-thumb__surface) { box-shadow: 0 0 0 3px rgb(var(--v-theme-surface)), 0 1px 4px rgba(0, 0, 0, .25); }
.similarity-verdict__scale { display: flex; justify-content: space-between; gap: 8px; margin-inline: 6px; font-size: .6875rem; color: rgba(var(--v-theme-on-surface), .5); }

.similarity-results { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.similarity-result { --tone: var(--v-theme-on-surface); position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 12px; overflow: hidden; border-radius: 12px; border: 1px solid rgba(var(--v-theme-on-surface), .07); background: rgb(var(--v-theme-surface)); transition: border-color .2s ease; }
.similarity-result::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: rgba(var(--tone), .55); }
.similarity-result--matched { --tone: var(--v-theme-success); }
.similarity-result--mismatch { --tone: var(--v-theme-error); }
.similarity-result--partial { --tone: var(--v-theme-primary); }
.similarity-result--unknown::before { background: rgba(var(--v-theme-on-surface), .12); }
.similarity-result__top { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px; }
.similarity-result__icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: rgb(var(--tone)); background: rgba(var(--tone), .1); }
.similarity-result--unknown .similarity-result__icon { color: rgba(var(--v-theme-on-surface), .45); background: rgba(var(--v-theme-on-surface), .06); }
.similarity-result__points { font-size: 1.0625rem; font-weight: 700; font-variant-numeric: tabular-nums; color: rgb(var(--tone)); }
.similarity-result--unknown .similarity-result__points, .similarity-result--mismatch .similarity-result__points { color: rgba(var(--v-theme-on-surface), .4); }
.similarity-result__title { font-size: .8125rem; font-weight: 600; overflow-wrap: anywhere; }
.similarity-result__status { display: flex; align-items: center; gap: 4px; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .62); }

/* search presets + signals */
.similarity-search { overflow: hidden; }
.similarity-search__bar { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px 14px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .07); background: rgba(var(--v-theme-on-surface), .02); }
.similarity-search__title { display: flex; align-items: center; gap: 10px; }
.similarity-search__bar h4 { font-size: .875rem !important; }
.similarity-presets { display: flex; flex-wrap: wrap; gap: 6px; }
.similarity-preset.v-chip { margin: 0; font-weight: 500; }
.similarity-preset.v-chip--variant-outlined { border-color: rgba(var(--v-theme-primary), .25); }
.similarity-preset--custom.v-chip { cursor: default; }
.similarity-search__hint { margin: 0; padding: 10px 16px 12px; border-top: 1px solid rgba(var(--v-theme-on-surface), .07); font-size: .75rem; }
.signal-list { margin: 0; padding: 0 0 4px; list-style: none; }
.signal-list__head, .signal-row { display: grid; grid-template-columns: 20px minmax(170px, 230px) minmax(0, 1fr) 36px 30px; align-items: center; gap: 0 14px; padding: 0 14px 0 16px; }
.signal-list__head { min-height: 32px; padding-block: 8px 0; font-size: .6875rem; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: rgba(var(--v-theme-on-surface), .45); }
.signal-list__head > :nth-child(3) { padding-inline-start: 6px; }
.signal-list__head-required { grid-column: 4 / 6; justify-self: end; white-space: nowrap; }
.signal-row { min-height: 44px; transition: background-color .15s ease; }
.signal-row + .signal-row { border-top: 1px solid rgba(var(--v-theme-on-surface), .05); }
.signal-row:hover { background: rgba(var(--v-theme-primary), .03); }
.signal-row__icon { color: rgb(var(--v-theme-primary)); }
.signal-row__name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.signal-row__title { font-size: .875rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.signal-row__info { color: rgba(var(--v-theme-on-surface), .35); cursor: help; flex-shrink: 0; }
.signal-row__info:hover, .signal-row__info:focus-visible { color: rgb(var(--v-theme-primary)); outline: none; }
.signal-row__slider { margin: 0 6px !important; }
.signal-row__slider :deep(.v-input__control) { min-height: 32px; }
.signal-row__value { justify-self: end; font-size: .8125rem; font-weight: 700; font-variant-numeric: tabular-nums; color: rgb(var(--v-theme-primary)); }
.signal-row--off .signal-row__icon, .signal-row--off .signal-row__title { color: rgba(var(--v-theme-on-surface), .4); }
.signal-row--off .signal-strength { opacity: .55; }
.signal-row--off .signal-row__value { color: rgba(var(--v-theme-on-surface), .35); }
.signal-row--required { background: rgba(var(--v-theme-primary), .05); box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary)); }

.signal-required { display: grid; place-items: center; width: 30px; height: 30px; justify-self: end; border: 0; border-radius: 8px; background: transparent; color: rgba(var(--v-theme-on-surface), .4); cursor: pointer; position: relative; overflow: hidden; transition: background-color .15s ease, color .15s ease; }
.signal-required:hover { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .08); }
.signal-required:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
.signal-required[aria-pressed="true"] { color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); }

.signal-strength { flex-shrink: 0; font-size: .625rem; font-weight: 600; border-radius: 5px; padding: 1px 6px; color: rgba(var(--v-theme-on-surface), .65); background: rgba(var(--v-theme-on-surface), .06); }
.signal-strength--oshash, .signal-strength--path { color: rgb(var(--v-theme-success)); background: rgba(var(--v-theme-success), .1); }
.signal-strength--visual { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .1); }

/* sliders */
.similarity-slider { min-width: 0; }
.similarity-slider__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: .8125rem; line-height: 1.5; color: rgba(var(--v-theme-on-surface), .75); }
.similarity-slider :deep(.v-slider) { margin: 0 6px; }
.similarity-slider :deep(.v-slider .v-input__control) { min-height: 30px; }

/* advanced + rest */
.similarity-note { padding: 10px 12px; border-radius: 12px; background: rgba(var(--v-theme-primary), .05); display: flex; align-items: flex-start; gap: 8px; font-size: .75rem; line-height: 1.6; color: rgba(var(--v-theme-on-surface), .68); }
.similarity-note .v-icon { flex-shrink: 0; margin-top: 2px; color: rgb(var(--v-theme-primary)); }
.similarity-settings > .similarity-note { margin-top: -6px !important; }
.similarity-advanced { overflow: hidden; }
.similarity-advanced :deep(.v-expansion-panel) { background: transparent; }
.similarity-advanced :deep(.v-expansion-panel-title) { min-height: 56px; padding: 10px 16px; font-size: .875rem; }
.similarity-advanced :deep(.v-expansion-panel-title--active) { min-height: 56px; }
.similarity-advanced :deep(.v-expansion-panel-text__wrapper) { padding: 4px 16px 14px; }
.similarity-advanced__title { flex: 1; font-weight: 600; }
.similarity-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 20px; }
.similarity-settings :deep(.v-field__input) { font-size: .8125rem; line-height: 1.5; font-variant-numeric: tabular-nums; }
.similarity-settings :deep(.v-field-label) { font-size: .75rem; }
.similarity-settings :deep(.v-label.v-field-label--floating) { font-size: .6875rem; }
.similarity-outcome h4 { margin-bottom: 12px; }
.similarity-auto { display: flex; align-items: center; gap: 16px; padding-top: 14px; border-top: 1px solid rgba(var(--v-theme-on-surface), .07); }
.similarity-auto > div { flex: 1; min-width: 0; }
.similarity-auto h4 { margin-bottom: 2px; }
.similarity-auto > .v-input { flex: 0 0 auto; }
.similarity-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 8px 12px; flex-wrap: wrap; margin-bottom: -6px; }
.similarity-status { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-height: 20px; margin-left: auto; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .5); }
.similarity-status .v-icon { color: rgb(var(--v-theme-success)); }
.similarity-status--saving { color: rgb(var(--v-theme-primary)); }
.similarity-status--error, .similarity-status--error .v-icon { color: rgb(var(--v-theme-error)); }
.similarity-status__retry { margin-left: 4px; padding: 0; border: 0; background: none; font: inherit; font-weight: 600; color: rgb(var(--v-theme-primary)); text-decoration: underline; cursor: pointer; }
@container (min-width: 720px) {
  .similarity-verdict { grid-template-columns: minmax(0, 1.25fr) minmax(240px, 1fr); }
}
@container (max-width: 560px) {
  .signal-list__head { display: none; }
  .signal-row { grid-template-columns: 20px minmax(0, 1fr) 32px 32px; padding-block: 6px 0; }
  .signal-row__slider { grid-column: 1 / -1; grid-row: 2; }
  .similarity-fields { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .similarity-settings *, .similarity-settings *::before { transition: none !important; animation: none !important; }
}
</style>
