<template>
  <v-container class="drive-spike" max-width="960">
    <v-alert
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      rounded="lg"
    >
      <strong>Dev spike only</strong> — Phase 1 Google Drive (status / list / Range stream).
      Not a product UI. Hidden route: <code>/drive-spike</code>
    </v-alert>

    <SettingsTabHeader
      title="Google Drive spike"
      description="Mock or live Drive via the API Range proxy. Click a video to play with seek."
      icon="mdi-google-drive"
    />

    <SettingsGroupPanel
      title="Connection status"
      hint="Reloads from GET /api/drive/status"
      spaced
    >
      <div class="d-flex flex-wrap align-center ga-2 mb-3">
        <v-chip
          size="small"
          :color="status?.mock ? 'warning' : 'success'"
          variant="tonal"
        >
          {{ status?.mock ? 'mock' : 'live' }}
        </v-chip>
        <v-chip
          size="small"
          :color="status?.configured ? 'success' : 'error'"
          variant="tonal"
        >
          {{ status?.configured ? 'configured' : 'not configured' }}
        </v-chip>
        <v-chip
          size="small"
          :color="status?.authenticated ? 'success' : 'default'"
          variant="tonal"
        >
          {{ status?.authenticated ? 'authenticated' : 'not authenticated' }}
        </v-chip>
        <v-spacer/>
        <v-btn
          size="small"
          variant="tonal"
          :loading="statusLoading"
          @click="refreshStatus"
        >
          Refresh
        </v-btn>
      </div>

      <div
        v-if="status"
        class="text-caption text-medium-emphasis"
      >
        Approach: {{ status.approach || '—' }}
        <span v-if="status.redirectUri"> · redirect {{ status.redirectUri }}</span>
      </div>

      <div
        v-if="statusError"
        class="text-caption text-error mt-2"
      >
        {{ statusError }}
      </div>

      <div
        v-if="status && !status.mock && !status.authenticated"
        class="d-flex flex-wrap ga-2 mt-3"
      >
        <v-btn
          color="primary"
          size="small"
          rounded
          :loading="oauthLoading"
          @click="startOAuth"
        >
          Connect Google Drive
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          :disabled="!status.authenticated"
          @click="logoutDrive"
        >
          Disconnect
        </v-btn>
      </div>
    </SettingsGroupPanel>

    <SettingsGroupPanel
      title="Folder"
      :hint="`Listing ${folderId}`"
      spaced
    >
      <div class="d-flex flex-wrap align-center ga-2 mb-3">
        <v-btn
          size="small"
          variant="tonal"
          :disabled="folderStack.length === 0"
          @click="goUp"
        >
          <v-icon start size="18">mdi-arrow-up</v-icon>
          Up
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          @click="openFolder('root', true)"
        >
          Root
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          :loading="folderLoading"
          @click="openFolder(folderId)"
        >
          Reload
        </v-btn>
        <span class="text-caption text-medium-emphasis text-truncate">
          {{ breadcrumb }}
        </span>
      </div>

      <div
        v-if="folderError"
        class="text-caption text-error mb-2"
      >
        {{ folderError }}
      </div>

      <v-list
        v-if="files.length"
        density="compact"
        class="drive-spike__list rounded-lg"
      >
        <v-list-item
          v-for="file in files"
          :key="file.id"
          :title="file.name"
          :subtitle="fileSubtitle(file)"
          :prepend-icon="file.isFolder ? 'mdi-folder' : 'mdi-file-video'"
          @click="onFileClick(file)"
        >
          <template #append>
            <v-icon
              v-if="!file.isFolder"
              size="18"
              icon="mdi-play"
            />
          </template>
        </v-list-item>
      </v-list>

      <div
        v-else-if="!folderLoading"
        class="text-caption text-medium-emphasis"
      >
        No files in this folder.
      </div>
    </SettingsGroupPanel>

    <SettingsGroupPanel
      v-if="playing"
      :title="`Player — ${playing.name}`"
      :hint="streamUrl"
      spaced
    >
      <video
        ref="videoEl"
        class="drive-spike__video"
        controls
        playsinline
        :src="streamUrl"
        @error="onVideoError"
      />
      <div
        v-if="videoError"
        class="text-caption text-error mt-2"
      >
        {{ videoError }}
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        Mock mode serves zero-filled bytes (may not decode as real H.264). Use network tools to confirm Range/206 on seek. Live mode needs a real Drive video.
      </div>
    </SettingsGroupPanel>
  </v-container>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import SettingsTabHeader from '@/components/settings/SettingsTabHeader.vue'
import SettingsGroupPanel from '@/components/ui/SettingsGroupPanel.vue'
import {apiClient, buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import {
  apiDriveFileStream,
  apiDriveFolder,
  apiDriveOAuthStart,
  apiDriveStatus,
} from '@shared/api/routes'

type DriveStatus = {
  configured: boolean
  mock: boolean
  authenticated: boolean
  redirectUri?: string
  scopes?: string[]
  approach?: string
  note?: string
}

type DriveFileEntry = {
  id: string
  name: string
  mimeType: string
  size?: number
  modifiedTime?: string
  isFolder: boolean
}

type DriveListResult = {
  folderId: string
  files: DriveFileEntry[]
  nextPageToken?: string
  mock: boolean
}

const status = ref<DriveStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref('')
const oauthLoading = ref(false)

const folderId = ref('root')
const folderStack = ref<{id: string; name: string}[]>([])
const files = ref<DriveFileEntry[]>([])
const folderLoading = ref(false)
const folderError = ref('')

const playing = ref<DriveFileEntry | null>(null)
const videoError = ref('')
const videoEl = ref<HTMLVideoElement | null>(null)

const breadcrumb = computed(() => {
  if (folderStack.value.length === 0) return 'root'
  return ['root', ...folderStack.value.map((entry) => entry.name)].join(' / ')
})

const streamUrl = computed(() => {
  if (!playing.value) return ''
  const params = new URLSearchParams()
  const token = getAuthToken()
  if (token) params.set('token', token)
  const query = params.toString()
  const path = apiDriveFileStream(playing.value.id)
  return query ? `${buildApiUrl(path)}?${query}` : buildApiUrl(path)
})

function fileSubtitle(file: DriveFileEntry) {
  if (file.isFolder) return 'Folder'
  const bits = [file.mimeType]
  if (typeof file.size === 'number') bits.push(`${file.size} bytes`)
  return bits.join(' · ')
}

async function refreshStatus() {
  statusLoading.value = true
  statusError.value = ''
  try {
    const {data} = await apiClient.get<DriveStatus>(apiDriveStatus())
    status.value = data
  } catch (err: unknown) {
    status.value = null
    statusError.value = err instanceof Error ? err.message : String(err)
  } finally {
    statusLoading.value = false
  }
}

async function openFolder(id: string, resetStack = false) {
  folderLoading.value = true
  folderError.value = ''
  try {
    const {data} = await apiClient.get<DriveListResult>(apiDriveFolder(id))
    folderId.value = data.folderId || id
    files.value = data.files || []
    if (resetStack) folderStack.value = []
  } catch (err: unknown) {
    files.value = []
    folderError.value = err instanceof Error ? err.message : String(err)
  } finally {
    folderLoading.value = false
  }
}

function onFileClick(file: DriveFileEntry) {
  if (file.isFolder) {
    folderStack.value = [...folderStack.value, {id: folderId.value, name: file.name}]
    void openFolder(file.id)
    return
  }
  videoError.value = ''
  playing.value = file
}

function goUp() {
  const parent = folderStack.value[folderStack.value.length - 1]
  if (!parent) return
  folderStack.value = folderStack.value.slice(0, -1)
  void openFolder(parent.id)
}

async function startOAuth() {
  oauthLoading.value = true
  try {
    const {data} = await apiClient.get<{url: string}>(apiDriveOAuthStart())
    if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer')
  } catch (err: unknown) {
    statusError.value = err instanceof Error ? err.message : String(err)
  } finally {
    oauthLoading.value = false
  }
}

async function logoutDrive() {
  try {
    await apiClient.post('/api/drive/oauth/logout')
    await refreshStatus()
  } catch (err: unknown) {
    statusError.value = err instanceof Error ? err.message : String(err)
  }
}

function onVideoError() {
  videoError.value =
    'Video element failed to load. In mock mode that is expected for decode; check Network for 206 Range on seek. In live mode confirm auth and mime type.'
}

onMounted(async () => {
  await refreshStatus()
  await openFolder('root', true)
})
</script>

<style scoped>
.drive-spike__list {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.4);
}

.drive-spike__video {
  display: block;
  width: 100%;
  max-height: 420px;
  background: #111;
  border-radius: 12px;
}
</style>
