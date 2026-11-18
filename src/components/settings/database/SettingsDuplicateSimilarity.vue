<template>
  <div class="similarity-settings">
    <Teleport to="#duplicates-search-option" defer>
      <v-switch v-if="similarityMode" v-model="draft.searchSimilarVideos" color="primary" inset hide-details
        class="mt-0 settings-switch settings-switch--with-description similarity-feature"
        data-testid="similarity-search-videos">
        <template #label>
          <div class="d-flex flex-column ml-4">
            <div class="text-body-1 text-high-emphasis">{{ t('duplicateSimilarity.searchSimilarVideos') }}</div>
            <i18n-t keypath="duplicateSimilarity.searchSimilarVideosHint" tag="div" scope="global" class="text-caption text-medium-emphasis mt-1">
              <template #visualIndex>
                <button type="button" class="similarity-ref" @click.stop="revealTarget('index')">
                  <v-icon size="12">mdi-image-search-outline</v-icon>{{ t('duplicateSimilarity.visualIndexLink') }}</button>
              </template>
            </i18n-t>
          </div>
        </template>
      </v-switch>
    </Teleport>
    <div v-if="error" class="similarity-toolbar">
      <div class="similarity-status similarity-status--error" role="status" aria-live="polite">
        <v-icon size="15">mdi-alert-circle-outline</v-icon>{{ error }}
        <v-btn size="x-small" variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-refresh" class="similarity-status__retry" @click="save">{{ t('duplicateSimilarity.retry') }}</v-btn>
      </div>
    </div>
    <SettingsGroupLabel id="similarity-criteria-label" :title="t('duplicateSimilarity.levelsTitle')" icon="layers-outline" accent />
    <section class="similarity-levels" aria-labelledby="similarity-criteria-label">
      <ul class="level-list">
        <li v-for="level in levels" :key="level.key" class="level-row"
          :class="[`level-row--${level.key}`, {'level-row--off': level.off}]">
          <span class="level-row__icon" aria-hidden="true"><v-icon size="18">{{ level.icon }}</v-icon></span>
          <div class="level-row__text">
            <span class="level-row__title">{{ t(`duplicateSimilarity.level_${level.key}`) }}</span>
            <span class="similarity-caption">{{ level.hint }}</span>
          </div>
          <span class="level-row__action">{{ level.off ? t('duplicateSimilarity.level_versionOff') : t(`duplicateSimilarity.level_${level.key}Action`) }}</span>
        </li>
      </ul>
      <p class="similarity-caption level-note">
        <v-icon size="15" aria-hidden="true">{{ levelIcons.none }}</v-icon><span>{{ t('duplicateSimilarity.level_noneHint') }}</span>
      </p>
      <div v-if="draft.searchSimilarVideos" class="similarity-strictness">
        <span class="level-row__icon" aria-hidden="true"><v-icon size="18">mdi-tune-variant</v-icon></span>
        <div class="similarity-strictness__text">
          <h4 id="similarity-strictness-label">{{ t('duplicateSimilarity.strictness') }}</h4>
          <p class="similarity-caption">{{ t('duplicateSimilarity.strictnessHint') }}</p>
        </div>
        <v-btn-toggle v-model="draft.visualStrictness" mandatory divided density="compact" color="primary" variant="outlined"
          rounded="lg" class="similarity-strictness__toggle" aria-labelledby="similarity-strictness-label">
          <v-btn v-for="value in strictnessValues" :key="value" :value="value" size="small">{{ t(strictnessLabels[value]) }}</v-btn>
        </v-btn-toggle>
      </div>
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
        <div v-if="draft.files === 'delete'" class="similarity-note mt-2">
          <v-icon size="17">mdi-shield-check-outline</v-icon><span>{{ t('duplicateSimilarity.deleteVerified') }}</span>
        </div>
      </div>

      <div class="similarity-auto">
        <div><h4>{{ t('duplicateSimilarity.autoMerge') }}</h4><p class="similarity-caption">{{ t('duplicateSimilarity.autoExactHint') }}</p></div>
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
import {VISUAL_STRICTNESS, parseDuplicatePolicy, type SimilarityLevel, type VisualStrictness} from '@shared/duplicateSimilarity'
withDefaults(defineProps<{similarityMode?: boolean}>(), {similarityMode: true})
const {t, locale} = useI18n()
const settings = useSettingsStore()
const draft = ref(parseDuplicatePolicy(settings.duplicateSimilarityPolicy))
/** Scrolls to a related control (marked with data-duplicate-target) and briefly highlights it. */
function revealTarget(name: 'index') {
  const el = document.querySelector<HTMLElement>(`[data-duplicate-target="${name}"]`)
  if (!el) return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'center'})
  el.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')?.focus({preventScroll: true})
  if (!reduced) {
    el.animate([
      {boxShadow: '0 0 0 0 rgba(var(--v-theme-primary), 0)'},
      {boxShadow: '0 0 0 4px rgba(var(--v-theme-primary), .35)', offset: .25},
      {boxShadow: '0 0 0 0 rgba(var(--v-theme-primary), 0)'},
    ], {duration: 1400, delay: 250, easing: 'ease-out'})
  }
}
const strictnessValues = Object.keys(VISUAL_STRICTNESS) as VisualStrictness[]
const strictnessLabels: Record<VisualStrictness, string> = {
  loose: 'duplicateSimilarity.moreMatches', balanced: 'duplicateSimilarity.balanced', strict: 'duplicateSimilarity.stricter',
}
const levelIcons: Record<SimilarityLevel, string> = {
  exact: 'mdi-check-decagram-outline', pending: 'mdi-timer-sand', version: 'mdi-image-multiple-outline', none: 'mdi-close-circle-outline',
}
const bytesFormatter = computed(() => new Intl.NumberFormat(locale.value, {maximumFractionDigits: 1}))
const candidateSize = computed(() => {
  const bytes = draft.value.sizeCandidateMinBytes
  return bytes >= 1024 ** 3 ? `${bytesFormatter.value.format(bytes / 1024 ** 3)} GB` : `${bytesFormatter.value.format(bytes / 1024 ** 2)} MB`
})
const levelHint = (level: SimilarityLevel) => t(`duplicateSimilarity.level_${level}Hint`, {size: candidateSize.value})
const levels = computed(() => (['exact', 'pending', 'version'] as const)
  .filter(key => key !== 'pending' || draft.value.sizeCandidateMinBytes > 0)
  .map(key => ({key, icon: levelIcons[key], hint: levelHint(key), off: key === 'version' && !draft.value.searchSimilarVideos})))
const saving = ref(false)
const error = ref('')
const stored = ref(JSON.stringify(draft.value))
watch(() => settings.duplicateSimilarityPolicy, value => {
  if (!saving.value) { draft.value = parseDuplicatePolicy(value); stored.value = JSON.stringify(draft.value) }
})
watch(() => draft.value.files, value => { if (value !== 'keep') draft.value.autoMerge = false })
const priorities = computed(() => ['quality', 'largest', 'smallest', 'oldest', 'newest'].map(value => ({value, title: t(`duplicateSimilarity.${value}`)})))
const fileActions = computed(() => ['keep', 'delete'].map(value => ({value, title: t(`duplicateSimilarity.${value}`)})))
const changed = computed(() => JSON.stringify(draft.value) !== stored.value)
async function save(): Promise<boolean> {
  clearTimeout(autosaveTimer)
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
    if (changed.value) void save()
  }, delay)
}
watch(draft, () => { if (changed.value) { error.value = ''; scheduleAutosave() } }, {deep: true})
onBeforeUnmount(() => {
  clearTimeout(autosaveTimer)
  if (changed.value && !saving.value) void save()
})
defineExpose({save})
</script>
<style scoped>
.similarity-settings { container-type: inline-size; display: flex; flex-direction: column; gap: var(--settings-block-gap, 16px); }
.similarity-settings > .settings-group-label { margin-block: 12px; }
.similarity-settings > .settings-group-label:first-child, .similarity-toolbar + .settings-group-label { margin-top: 0; }
/* standalone panels — same surface as other settings panels */
.similarity-levels, .similarity-panel { border: 1px solid rgba(var(--v-theme-on-surface), .09); border-radius: 18px; background: rgb(var(--v-theme-surface)); }
.similarity-panel { padding: var(--settings-card-padding, 20px); }
.similarity-settings h4 { margin: 0; font-size: .9375rem; font-weight: 600; line-height: 1.45; }
.similarity-caption { font-size: .8125rem; line-height: 1.55; color: rgba(var(--v-theme-on-surface), .6); margin: 0; }

/* feature toggle — same look as SettingsSwitch; rendered in the "Search the library" panel via Teleport */
.similarity-feature.settings-switch--with-description { padding-block: 6px; }
.similarity-feature :deep(.v-label) { background-color: transparent !important; opacity: 1; margin-left: 8px !important; }
.similarity-ref { display: inline-flex; align-items: center; gap: 3px; padding: 0 6px; margin-inline: 1px; border-radius: 5px; font: inherit; font-weight: 500; line-height: 1.45; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .08); border: 1px solid rgba(var(--v-theme-primary), .16); vertical-align: baseline; cursor: pointer; transition: background-color .15s ease, border-color .15s ease; }
.similarity-ref:hover { background: rgba(var(--v-theme-primary), .15); border-color: rgba(var(--v-theme-primary), .32); }
.similarity-ref:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }

/* merge outcome */
.similarity-note { padding: 10px 12px; border-radius: 12px; background: rgba(var(--v-theme-primary), .05); display: flex; align-items: flex-start; gap: 8px; font-size: .75rem; line-height: 1.6; color: rgba(var(--v-theme-on-surface), .68); }
.similarity-note .v-icon { flex-shrink: 0; margin-top: 2px; color: rgb(var(--v-theme-primary)); }
.similarity-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 20px; }
.similarity-settings :deep(.v-field__input) { font-size: .8125rem; line-height: 1.5; font-variant-numeric: tabular-nums; }
.similarity-settings :deep(.v-field-label) { font-size: .75rem; }
.similarity-settings :deep(.v-label.v-field-label--floating) { font-size: .6875rem; }
.similarity-auto { display: flex; align-items: center; gap: 16px; padding-top: 14px; border-top: 1px solid rgba(var(--v-theme-on-surface), .07); }
.similarity-auto > div { flex: 1; min-width: 0; }
.similarity-auto h4 { margin-bottom: 2px; }
.similarity-auto > .v-input { flex: 0 0 auto; }
.similarity-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 8px 12px; flex-wrap: wrap; margin-bottom: -6px; }
.similarity-status { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-height: 20px; margin-left: auto; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .5); }
.similarity-status .v-icon { color: rgb(var(--v-theme-success)); }
.similarity-status--saving { color: rgb(var(--v-theme-primary)); }
.similarity-status--error, .similarity-status--error .v-icon { color: rgb(var(--v-theme-error)); }
.similarity-status__retry { margin-left: 4px; letter-spacing: normal; text-transform: none; }
@container (max-width: 560px) {
  .similarity-fields { grid-template-columns: minmax(0, 1fr); }
}
/* evidence levels */
.similarity-levels { --level-pad: 12px 16px; --level-divider: 1px solid rgba(var(--v-theme-on-surface), .07); overflow: hidden; }
.level-list { margin: 0; padding: 0; list-style: none; }
.level-row { --tone: var(--v-theme-primary); display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 4px 14px; padding: var(--level-pad); }
.level-row + .level-row, .level-note, .similarity-strictness { border-top: var(--level-divider); }
.level-row--exact { --tone: var(--v-theme-success); }
.level-row--pending { --tone: var(--v-theme-warning); }
.level-row__icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: rgb(var(--tone)); background: rgba(var(--tone), .1); }
.level-row__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.level-row__title { font-size: .875rem; font-weight: 600; line-height: 1.45; }
/* same columns as a level row: the icon sits in the 32px column, the text lines up with level descriptions */
.level-note { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: 0 14px; padding: var(--level-pad); }
.level-note .v-icon { justify-self: center; color: rgba(var(--v-theme-on-surface), .45); }
.level-row__action { justify-self: end; padding: 2px 8px; border-radius: 6px; font-size: .6875rem; font-weight: 600; white-space: nowrap; color: rgb(var(--tone)); background: rgba(var(--tone), .1); }
.level-row--off .level-row__icon, .level-row--off .level-row__title { opacity: .45; }
.level-row--off .level-row__action { color: rgba(var(--v-theme-on-surface), .55); background: rgba(var(--v-theme-on-surface), .06); }
/* same grid as a level row: icon column, text column, control where the level badge sits */
.similarity-strictness { --tone: var(--v-theme-primary); display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 4px 14px; padding: var(--level-pad); background: rgba(var(--v-theme-on-surface), .02); }
.similarity-strictness__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.similarity-strictness h4 { font-size: .875rem; }
.similarity-strictness__toggle .v-btn { letter-spacing: normal; text-transform: none; }

@container (max-width: 560px) {
  .level-row { grid-template-columns: 32px minmax(0, 1fr); }
  .level-row__action { grid-column: 2; justify-self: start; }
  .similarity-strictness { grid-template-columns: 32px minmax(0, 1fr); }
  .similarity-strictness__toggle { grid-column: 2; justify-self: start; }
}
@media (prefers-reduced-motion: reduce) {
  .similarity-settings *, .similarity-settings *::before { transition: none !important; animation: none !important; }
}
</style>
