<template>
  <div class="maintenance">
    <v-tabs
      :model-value="view"
      :aria-label="t('settingsLayout.maintenance')"
      class="maintenance__nav"
      @update:model-value="selectTab"
    >
      <v-tab
        v-for="item in views"
        :id="`maintenance-view-${item.id}`"
        :key="item.id"
        :value="item.id"
        :prepend-icon="item.icon"
        :aria-controls="`maintenance-panel-${item.id}`"
        hide-slider
      >{{ t(item.title) }}</v-tab>
    </v-tabs>

    <section v-show="view === 'overview'" id="maintenance-panel-overview" role="tabpanel" aria-labelledby="maintenance-view-overview">
      <SettingsList>
        <SettingsLibraryHealthGuide v-if="visited.has('overview')"/>

        <div class="maintenance__quicklinks" role="list">
          <v-btn
            v-for="item in overviewCards"
            :key="item.id"
            color="primary"
            variant="tonal"
            rounded="lg"
            :prepend-icon="item.icon"
            append-icon="mdi-arrow-right"
            class="maintenance__quicklink"
            @click="navigate(item.id, true)"
          >{{ t(item.action) }}</v-btn>
        </div>
      </SettingsList>
    </section>

    <section v-show="view === 'missing'" id="maintenance-panel-missing" role="tabpanel" aria-labelledby="maintenance-view-missing">
      <SettingsList v-if="visited.has('missing')">
        <SettingsFindMissingMedia/>

        <SettingsSection id="settings-bulk-paths">
          <SettingsBulkPathEditing/>
        </SettingsSection>
      </SettingsList>
    </section>

    <section v-show="view === 'duplicates'" id="maintenance-panel-duplicates" role="tabpanel" aria-labelledby="maintenance-view-duplicates">
      <SettingsFindDuplicates v-if="visited.has('duplicates')">
        <template #indexing>
          <SettingsBackfillTask :config="VISUAL_HASH_BACKFILL"/>

          <SettingsBackfillTask :config="FINGERPRINT_BACKFILL">
            <SettingsSwitch
              option="remoteOshashBackground"
              :title="t('settings_labels.database.remote_oshash_background')"
              :hint="t('settings_labels.database.remote_oshash_background_hint')"
              data-testid="remote-oshash-background"
            />
          </SettingsBackfillTask>
        </template>
      </SettingsFindDuplicates>
    </section>

    <section v-show="view === 'tools'" id="maintenance-panel-tools" role="tabpanel" aria-labelledby="maintenance-view-tools">
      <SettingsList v-if="visited.has('tools')">
        <SettingsGroupLabel :title="t('maintenanceView.previews')" icon="view-grid-outline" accent/>
        <SettingsGenerateVideoImages/>
        <SettingsTagImageAiUpscale/>

        <SettingsGroupLabel :title="t('settingsLayout.maintenance_media_data')" icon="file-document-outline" accent/>
        <SettingsBackfillTask :config="VIDEO_CODEC_BACKFILL"/>
        <SettingsBackfillTask :config="MEDIA_CREATED_BACKFILL"/>

        <SettingsGroupLabel :title="t('settingsLayout.maintenance_recognition')" icon="magnify-scan" accent/>
        <SettingsBackfillTask :config="CLIP_EMBEDDING_BACKFILL"/>
        <RouterLink
          class="maintenance__related"
          :to="{path: '/settings', query: {tab: 'maintenance', section: 'detect_faces'}}"
        >
          {{ t('maintenanceView.openFaces') }}
          <v-icon icon="mdi-arrow-right" size="16" aria-hidden="true"/>
        </RouterLink>

        <SettingsGroupLabel :title="t('settingsLayout.maintenance_cleanup')" icon="delete-sweep" accent/>
        <SettingsClearGeneratedImages/>
        <SettingsLibraryReset/>
      </SettingsList>
    </section>

    <section v-show="view === 'faces'" id="maintenance-panel-faces" role="tabpanel" aria-labelledby="maintenance-view-faces">
      <SettingsList v-if="visited.has('faces')">
        <SettingsDetectFaces/>
      </SettingsList>
    </section>
  </div>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, reactive, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import SettingsList from '@/components/ui/SettingsList.vue'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import SettingsGroupLabel from '@/components/settings/SettingsGroupLabel.vue'
import {
  CLIP_EMBEDDING_BACKFILL,
  FINGERPRINT_BACKFILL,
  MEDIA_CREATED_BACKFILL,
  VIDEO_CODEC_BACKFILL,
  VISUAL_HASH_BACKFILL,
} from '@/composable/useSettingsBackfillStream'

const SettingsLibraryHealthGuide = defineAsyncComponent(() => import('./SettingsLibraryHealthGuide.vue'))
const SettingsFindMissingMedia = defineAsyncComponent(() => import('./SettingsFindMissingMedia.vue'))
const SettingsBulkPathEditing = defineAsyncComponent(() => import('@/components/settings/files/SettingsBulkPathEditing.vue'))
const SettingsFindDuplicates = defineAsyncComponent(() => import('./SettingsFindDuplicates.vue'))
const SettingsBackfillTask = defineAsyncComponent(() => import('./SettingsBackfillTask.vue'))
const SettingsSwitch = defineAsyncComponent(() => import('@/components/ui/SettingsSwitch.vue'))
const SettingsGenerateVideoImages = defineAsyncComponent(() => import('./SettingsGenerateVideoImages.vue'))
const SettingsTagImageAiUpscale = defineAsyncComponent(() => import('./SettingsTagImageAiUpscale.vue'))
const SettingsDetectFaces = defineAsyncComponent(() => import('./SettingsDetectFaces.vue'))
const SettingsClearGeneratedImages = defineAsyncComponent(() => import('./SettingsClearGeneratedImages.vue'))
const SettingsLibraryReset = defineAsyncComponent(() => import('./SettingsLibraryReset.vue'))

const props = defineProps<{sectionId?: string}>()
const emit = defineEmits<{navigate: []}>()
const {t} = useI18n()
const route = useRoute()
const router = useRouter()

const views = [
  {id: 'overview', icon: 'mdi-view-dashboard-outline', title: 'maintenanceView.overview'},
  {id: 'missing', icon: 'mdi-folder-search-outline', title: 'maintenanceView.missing'},
  {id: 'duplicates', icon: 'mdi-content-duplicate', title: 'maintenanceView.duplicates'},
  {id: 'tools', icon: 'mdi-image-multiple-outline', title: 'maintenanceView.tools'},
  {id: 'faces', icon: 'mdi-face-recognition', title: 'maintenanceView.faces'},
] as const
type View = typeof views[number]['id']
const overviewCards = [
  {...views[1], action: 'maintenanceView.restorePaths'},
  {...views[2], action: 'maintenanceView.openDuplicates'},
  {...views[3], action: 'maintenanceView.openTools'},
]
const view = computed<View>(() => {
  const section = props.sectionId
  if (section === 'settings-library-health-guide') return 'overview'
  if (section === 'settings-find-missing-media' || section === 'settings-bulk-paths') return 'missing'
  if (section === 'settings-find-duplicates' || section === 'settings-copy-discovery' || section === 'settings-duplicate-options' || section === VISUAL_HASH_BACKFILL.elementId || section === FINGERPRINT_BACKFILL.elementId) return 'duplicates'
  if (section === 'settings-detect-faces') return 'faces'
  if (section) return 'tools'
  return views.find(item => item.id === route.query.maintenanceView)?.id ?? 'overview'
})

// Keep visited panels mounted so changing tabs preserves input, results and running tasks.
const visited = reactive(new Set<View>())
watch(view, value => visited.add(value), {immediate: true})

function selectTab(value: unknown) {
  const item = views.find(item => item.id === value)
  if (item) void navigate(item.id)
}

async function navigate(value: View, focusTab = false) {
  if (value !== view.value || props.sectionId) {
    await router.push({path: '/settings', query: {
      tab: 'maintenance',
      maintenanceView: value === 'overview' ? undefined : value,
    }})
    emit('navigate')
  }
  if (focusTab) {
    await nextTick()
    document.getElementById(`maintenance-view-${value}`)?.focus()
  }
}
</script>

<style scoped>
.maintenance {
  container: maintenance / inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.maintenance__nav.v-tabs.v-slide-group {
  margin-block: 0;
}

.maintenance__quicklinks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.maintenance__quicklink {
  letter-spacing: normal;
  text-transform: none;
}

.maintenance__related {
  justify-self: start;
  color: rgb(var(--v-theme-primary));
  font-size: .875rem;
  text-underline-offset: 3px;
}
</style>
