<template>
  <v-dialog
    :model-value="dialogsStore.tmdbPersonScraper.show"
    max-width="760"
    scrollable
    @update:model-value="onToggle"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-account-search-outline</v-icon>
        TMDB person
        <v-spacer/>
        <v-btn icon variant="text" @click="close"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>

      <v-card-text>
        <div v-if="tag" class="text-body-2 mb-3 text-medium-emphasis">
          Tag: <strong class="text-high-emphasis">{{ tag.name }}</strong>
        </div>

        <v-text-field
          v-model="query"
          label="Search person name or TMDB id"
          variant="outlined"
          rounded
          hide-details
          class="mb-3"
          @keyup.enter="runSearch"
        />

        <v-btn
          color="primary"
          rounded
          class="mb-4"
          :loading="loading"
          :disabled="!query.trim()"
          @click="runSearch"
        >
          Search
        </v-btn>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-3" rounded="lg">
          {{ error }}
        </v-alert>

        <div v-if="searched && !loading && !hits.length && !extras" class="text-body-2 mb-3">
          No people found.
        </div>

        <v-list v-if="hits.length" density="compact" class="mb-4">
          <v-list-item
            v-for="hit in hits"
            :key="hit.id"
            @click="selectHit(hit)"
            rounded="lg"
            class="mb-1"
          >
            <template #prepend>
              <v-avatar size="40" rounded="lg">
                <v-img v-if="hit.profileUrl" :src="hit.profileUrl" cover/>
                <v-icon v-else>mdi-account</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title>{{ hit.name }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ [hit.knownForDepartment, hit.id].filter(Boolean).join(' · ') }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <div v-if="extras" class="mb-2">
          <div class="d-flex ga-3 mb-3" v-if="extras.image">
            <v-img :src="extras.image" max-width="120" max-height="180" cover rounded="lg"/>
            <div class="text-body-2 text-medium-emphasis">
              {{ extras.bio ? extras.bio.slice(0, 220) + (extras.bio.length > 220 ? '…' : '') : 'No biography' }}
            </div>
          </div>

          <div class="text-subtitle-2 mb-2">Apply fields</div>
          <v-checkbox
            v-for="field in fieldOptions"
            :key="field.key"
            v-model="selectedFields"
            :label="field.label"
            :value="field.key"
            :disabled="!field.enabled"
            density="compact"
            hide-details
          />
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="success"
          :loading="applying"
          :disabled="!extras || selectedFields.length === 0"
          @click="apply"
        >
          Apply
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useAppStore} from '@/stores/app'
import {useEventBus} from '@/utils/eventBus'
import {getTmdbPerson, searchTmdbPeople, type TmdbPersonSearchHit} from '../services/tmdbApi'
import {
  applyTmdbPersonExtrasToTag,
  type TmdbPersonApplyFieldKey,
  type TmdbPersonExtras,
} from '../services/tmdbPersonApply'

const emit = defineEmits<{close: []}>()
const dialogsStore = useDialogsStore()
const appStore = useAppStore()
const eventBus = useEventBus()

const query = ref('')
const loading = ref(false)
const applying = ref(false)
const searched = ref(false)
const error = ref('')
const hits = ref<TmdbPersonSearchHit[]>([])
const extras = ref<TmdbPersonExtras | null>(null)
const selectedFields = ref<TmdbPersonApplyFieldKey[]>([])

const tag = computed(() => dialogsStore.tmdbPersonScraper.tag)
const meta = computed(() => dialogsStore.tmdbPersonScraper.meta)

const fieldOptions = computed(() => {
  const data = extras.value
  if (!data) return []
  return [
    {key: 'name' as const, label: `Name: ${data.name || '—'}`, enabled: Boolean(data.name)},
    {key: 'synonyms' as const, label: `Also known as: ${data.synonyms || '—'}`, enabled: Boolean(data.synonyms)},
    {key: 'bio' as const, label: 'Biography', enabled: Boolean(data.bio)},
    {key: 'birthday' as const, label: `Birthday: ${data.birthday || '—'}`, enabled: Boolean(data.birthday)},
    {key: 'deathday' as const, label: `Deathday: ${data.deathday || '—'}`, enabled: Boolean(data.deathday)},
    {key: 'place_of_birth' as const, label: `Place of birth: ${data.place_of_birth || '—'}`, enabled: Boolean(data.place_of_birth)},
    {key: 'known_for' as const, label: `Known for: ${data.known_for || '—'}`, enabled: Boolean(data.known_for)},
    {key: 'gender' as const, label: `Gender: ${data.gender || '—'}`, enabled: Boolean(data.gender)},
    {key: 'image' as const, label: 'Profile photo', enabled: Boolean(data.image)},
  ]
})

function close() {
  dialogsStore.tmdbPersonScraper.show = false
  emit('close')
}

function onToggle(show: boolean) {
  if (!show) close()
}

function resetDialogState() {
  query.value = tag.value?.name || ''
  hits.value = []
  extras.value = null
  error.value = ''
  searched.value = false
  selectedFields.value = []
}

async function selectHit(hit: TmdbPersonSearchHit) {
  loading.value = true
  error.value = ''
  try {
    const response = await getTmdbPerson(hit.id)
    extras.value = response.extras
    selectedFields.value = fieldOptions.value.filter((field) => field.enabled).map((field) => field.key)
  } catch (err) {
    error.value = (err as {response?: {data?: {error?: string}}})?.response?.data?.error
      || (err instanceof Error ? err.message : String(err))
  } finally {
    loading.value = false
  }
}

async function runSearch() {
  loading.value = true
  error.value = ''
  searched.value = true
  hits.value = []
  extras.value = null
  try {
    const q = query.value.trim()
    if (/^\d+$/.test(q)) {
      const response = await getTmdbPerson(q)
      extras.value = response.extras
      selectedFields.value = fieldOptions.value.filter((field) => field.enabled).map((field) => field.key)
      return
    }
    const response = await searchTmdbPeople({query: q})
    hits.value = response.results || []
    if (hits.value.length === 1) await selectHit(hits.value[0])
  } catch (err) {
    error.value = (err as {response?: {data?: {error?: string}}})?.response?.data?.error
      || (err instanceof Error ? err.message : String(err))
  } finally {
    loading.value = false
  }
}

async function apply() {
  if (!tag.value || !meta.value || !extras.value) return
  applying.value = true
  error.value = ''
  try {
    const result = await applyTmdbPersonExtrasToTag({
      tag: tag.value,
      meta: meta.value,
      extras: extras.value,
      selectedFields: selectedFields.value,
      dbPath: appStore.dbPath,
    })
    if (!result.success) {
      error.value = result.error || 'Apply failed'
      return
    }

    if (extras.value.name && selectedFields.value.includes('name')) {
      dialogsStore.tagEditing.tag = {
        ...tag.value,
        name: extras.value.name,
      }
      dialogsStore.tmdbPersonScraper.tag = {
        ...tag.value,
        name: extras.value.name,
      }
    }

    eventBus.emit('getMeta')
    eventBus.emit('scraperGotImages')
    // Parent DialogTagEditing remounts editor when this dialog closes.

    if (result.imageFailed) {
      error.value = 'Person data applied, but profile photo download failed.'
      return
    }
    if (result.error) {
      error.value = result.error
      return
    }
    close()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    applying.value = false
  }
}

onMounted(resetDialogState)
watch(() => dialogsStore.tmdbPersonScraper.show, (show) => {
  if (show) resetDialogState()
})
</script>
