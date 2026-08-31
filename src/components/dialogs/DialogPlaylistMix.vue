<template>
  <v-dialog
    v-if="dialog"
    v-model="dialogLocal"
    :fullscreen="smAndDown"
    scrollable
    width="640"
  >
    <v-card rounded="xl">
      <DialogHeader
        @close="close"
        :header="t('playlists.mix_title')"
        :subheader="t('playlists.mix_hint')"
        icon="playlist-music"
        closable
      />

      <v-card-text class="pa-4 pt-2">
        <div class="d-flex align-center flex-wrap ga-2 playlist-mix-dialog__row">
          <v-text-field
            v-model="mixPhrase"
            :placeholder="t('playlists.mix_placeholder')"
            :aria-label="t('playlists.mix_title')"
            density="compact"
            hide-details
            clearable
            rounded="xl"
            variant="outlined"
            prepend-inner-icon="mdi-magnify"
            single-line
            class="playlist-mix-dialog__field"
            :disabled="mixBusy"
            autofocus
            @update:model-value="onMixPhraseInput"
            @keyup.enter="runMixPlay"
          />
          <v-btn
            color="primary"
            rounded="xl"
            variant="flat"
            size="small"
            :loading="mixBusy"
            :disabled="!mixPhrase.trim() || mixBusy"
            @click="runMixPlay"
          >
            <v-icon start size="18">mdi-play</v-icon>
            {{ t('playlists.mix_play') }}
          </v-btn>
          <v-btn
            color="primary"
            rounded="xl"
            variant="tonal"
            size="small"
            :loading="mixSaving"
            :disabled="!canSaveMix"
            @click="runMixSave"
          >
            <v-icon start size="18">mdi-content-save-outline</v-icon>
            <span v-if="!smAndDown">{{ t('playlists.mix_save') }}</span>
          </v-btn>
        </div>

        <div class="d-flex flex-wrap align-center ga-2 mt-3">
          <v-chip
            v-for="example in mixExamples"
            :key="example"
            size="small"
            variant="tonal"
            color="primary"
            :disabled="mixBusy"
            @click="applyMixExample(example)"
          >
            {{ example }}
          </v-chip>
          <template v-if="lastMix && lastMix.ids.length">
            <v-chip size="small" variant="tonal" color="secondary">
              {{ mixSourceText(lastMix.source) }}
            </v-chip>
            <span class="text-caption text-medium-emphasis">
              {{ t('playlists.mix_count', {count: lastMix.ids.length}) }}
            </span>
          </template>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch, onBeforeUnmount} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {useAppStore} from '@/stores/app'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {setNotification} from '@/services/notificationService'
import {
  formatNlMixSeekTime,
  nlMixSourceMessageKey,
  playNlPlaylistMix,
  resolveNlPlaylistMix,
  saveNlPlaylistMix,
  type NlPlaylistMixResult,
} from '@/services/nlPlaylistMix'
import {useOpenMediaList} from '@/utils/openMediaList'
import {getDefaultMediaTypeId, isVideoMediaType} from '@/utils/mediaType'

const props = defineProps({
  dialog: Boolean,
})

const emit = defineEmits<{
  close: []
  saved: [kind: 'smart' | 'static']
}>()

const {t} = useI18n()
const {smAndDown} = useDisplay()
const appStore = useAppStore()
const {openMediaList} = useOpenMediaList()

const dialogLocal = ref(props.dialog)
const mixPhrase = ref('')
const mixBusy = ref(false)
const mixSaving = ref(false)
const lastMix = ref<NlPlaylistMixResult | null>(null)
let mixAbort: AbortController | null = null

const videoMediaType = computed(() => appStore.mediaTypes?.find(isVideoMediaType) ?? null)

const mixExamples = computed(() => [
  t('playlists.mix_example_unwatched'),
  t('playlists.mix_example_favorites'),
  t('playlists.mix_example_vibe'),
])

const canSaveMix = computed(() => (
  Boolean(lastMix.value?.ids.length)
  && !mixBusy.value
  && !mixSaving.value
))

const mixSourceText = (source: NlPlaylistMixResult['source']) =>
  t(`playlists.${nlMixSourceMessageKey(source)}`)

watch(() => props.dialog, (open) => {
  dialogLocal.value = open
  if (open) {
    mixPhrase.value = ''
    lastMix.value = null
  } else {
    mixAbort?.abort()
    mixAbort = null
  }
})

watch(dialogLocal, (open) => {
  if (!open) close()
})

onBeforeUnmount(() => {
  mixAbort?.abort()
  mixAbort = null
})

const close = () => {
  emit('close')
}

const onMixPhraseInput = () => {
  if (lastMix.value) lastMix.value = null
}

const applyMixExample = (example: string) => {
  mixPhrase.value = example
  lastMix.value = null
  void runMixPlay()
}

const runMixPlay = async () => {
  const phrase = mixPhrase.value.trim()
  if (!phrase || mixBusy.value) return

  mixAbort?.abort()
  const controller = new AbortController()
  mixAbort = controller
  mixBusy.value = true
  lastMix.value = null
  try {
    const mix = await resolveNlPlaylistMix(phrase, {
      mediaTypeId: videoMediaType.value?.id ?? getDefaultMediaTypeId(appStore.mediaTypes),
      signal: controller.signal,
    })
    if (controller.signal.aborted) return
    lastMix.value = mix

    if (!mix.videos.length) {
      setNotification({
        type: 'info',
        title: t('playlists.mix_title'),
        text: t('playlists.mix_empty'),
      })
      return
    }

    const {played, seekTime} = await playNlPlaylistMix(mix)
    if (controller.signal.aborted) return
    if (!played) {
      setNotification({
        type: 'error',
        title: t('playlists.mix_title'),
        text: t('playlists.preparing_playback_failed'),
      })
      return
    }

    setNotification({
      type: 'success',
      title: t('playlists.mix_play'),
      text: [
        mixSourceText(mix.source),
        seekTime > 0
          ? t('playlists.mix_playing_at', {count: mix.videos.length, time: formatNlMixSeekTime(seekTime)})
          : t('playlists.mix_playing', {count: mix.videos.length}),
      ].join(' · '),
      actions: [
        {
          id: 'nl-mix-show-list',
          text: t('playlists.mix_show_list'),
          icon: 'view-grid-outline',
          action: () => {
            void openMediaList({
              mediaTypeId: videoMediaType.value?.id ?? undefined,
              ids: mix.ids,
              filters: mix.filters.length ? mix.filters : undefined,
              scope: {
                kind: 'semantic',
                label: mix.phrase,
              },
            })
          },
          hide: true,
        },
        {
          id: 'nl-mix-save',
          text: t('playlists.mix_save'),
          icon: 'content-save-outline',
          action: () => {
            void runMixSave()
          },
          hide: true,
        },
      ],
    })
  } catch (error) {
    if (controller.signal.aborted) return
    console.error('NL mix failed:', error)
    setNotification({
      type: 'error',
      title: t('playlists.mix_title'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (mixAbort === controller) mixAbort = null
    mixBusy.value = false
  }
}

const runMixSave = async () => {
  if (!lastMix.value?.ids.length || mixSaving.value) return
  mixSaving.value = true
  try {
    const saved = await saveNlPlaylistMix(lastMix.value, mixPhrase.value.trim() || lastMix.value.phrase)
    setNotification({
      type: 'success',
      title: t('playlists.mix_save'),
      text: saved.kind === 'smart'
        ? t('playlists.mix_saved_smart', {name: saved.name})
        : t('playlists.mix_saved_static', {name: saved.name}),
    })
    emit('saved', saved.kind)
    close()
  } catch (error) {
    console.error('NL mix save failed:', error)
    setNotification({
      type: 'error',
      title: t('playlists.mix_save'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    mixSaving.value = false
  }
}
</script>

<style scoped>
.playlist-mix-dialog__row {
  min-width: 0;
}

.playlist-mix-dialog__field {
  flex: 1 1 240px;
  min-width: 180px;
  margin-inline: 0 !important;
}

.playlist-mix-dialog__field :deep(.v-field) {
  --v-input-control-height: 40px;
  height: 40px !important;
  min-height: 40px !important;
  font-size: 0.875rem;
}

.playlist-mix-dialog__field :deep(.v-field__input) {
  min-height: 40px !important;
  max-height: 40px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  align-items: center;
}
</style>
