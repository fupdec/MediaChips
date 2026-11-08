<template>
  <div class="cloud-accounts-source">
    <v-alert v-if="error" type="error" closable @click:close="error = ''" class="mb-3">{{ error }}</v-alert>
    <v-alert v-if="authMessage" type="info" class="mb-3">{{ authMessage }}</v-alert>
    <v-btn v-if="authAttempt" @click="cancelSignIn">{{ tr('Отменить вход', 'Cancel sign-in') }}</v-btn>
    <v-select v-if="!unified" v-model="accountId" :items="visibleAccounts" item-title="name" item-value="id" :label="tr('Облачный аккаунт', 'Cloud account')" :disabled="busy" variant="outlined" density="compact" hide-details class="mb-3" @update:model-value="resetFolder" />
    <div v-if="!unified" class="d-flex flex-wrap ga-2 mb-4 account-toolbar">
      <v-btn v-if="!unified" @click="addAccount" :disabled="busy" prepend-icon="mdi-plus">{{ tr('Добавить аккаунт', 'Add account') }}</v-btn>
      <v-btn v-if="account" :disabled="busy" @click="editAccount">{{ tr('Настроить аккаунт', 'Configure account') }}</v-btn>
      <v-btn v-if="account" :disabled="busy" @click="connect">{{ tr('Подключить / сменить вход', 'Connect / sign in again') }}</v-btn>
      <v-btn v-if="account?.authenticated" :disabled="busy" @click="logout">{{ tr('Отключить', 'Disconnect') }}</v-btn>
      <v-btn v-if="!unified" icon="mdi-refresh" variant="tonal" color="primary" rounded="lg" :disabled="busy" :aria-label="tr('Обновить', 'Refresh')" :title="tr('Обновить', 'Refresh')" @click="refresh" />
    </div>
    <v-dialog v-model="editing" max-width="560" persistent scrollable>
      <v-card rounded="xl">
        <DialogHeader :header="editingId ? tr('Настройка аккаунта', 'Account settings') : tr('Новый облачный аккаунт', 'New cloud account')"
                      :icon="providerStyle(form.provider).icon.replace('mdi-', '')" :buttons="editorButtons" compact />
        <v-card-text class="account-editor">
          <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">{{ error }}</v-alert>
          <p class="account-editor__description">{{ tr('Ключи приложения хранятся только на этом компьютере.', 'App credentials stay on this computer.') }}</p>
          <v-form @submit.prevent="create">
            <v-defaults-provider :defaults="{VTextField: {variant: 'outlined', density: 'compact', rounded: 'lg', hideDetails: 'auto'}, VSelect: {variant: 'outlined', density: 'compact', rounded: 'lg', hideDetails: 'auto'}}">
              <div class="account-editor__fields">
                <v-select v-if="!props.provider" v-model="form.provider" :disabled="busy || !!editingId" :items="providers" item-title="title" item-value="value" :label="tr('Провайдер', 'Provider')">
                  <template #prepend-inner><v-icon :icon="providerStyle(form.provider).icon" color="primary" /></template>
                  <template #item="{props: itemProps, item}">
                    <v-list-item v-bind="itemProps">
                      <template #prepend><v-icon :icon="providerStyle(item.raw.value).icon" color="primary" /></template>
                    </v-list-item>
                  </template>
                </v-select>
                <v-text-field v-model="form.name" :disabled="busy" :label="tr('Название аккаунта', 'Account name')" required maxlength="120" />
                <v-text-field v-model="form.clientId" :disabled="busy" label="OAuth Client ID / App key" required />
                <v-text-field v-model="form.clientSecret" :disabled="busy" type="password" :label="tr('Секрет приложения (если требуется)', 'Client secret (if required)')" autocomplete="new-password" />
                <v-text-field v-model="form.redirectUri" class="account-editor__redirect" :disabled="busy" label="OAuth Redirect URI" required />
              </div>
            </v-defaults-provider>
            <details class="account-editor__help">
              <summary>{{ tr('Как настроить OAuth', 'OAuth setup help') }}</summary>
              <p>{{ tr('Создайте OAuth-приложение у провайдера и зарегистрируйте callback API (не dev-сервера):', 'Create an OAuth app with your provider and register the API callback (not the dev server):') }}</p>
              <code>{{ callbackUri }}</code>
              <p v-if="form.provider === 'gdrive'">{{ tr('Google Drive подключается отдельно, только для чтения. Существующее подключение сохраняется.', 'Google Drive connects as a separate read-only account. Your existing connection is retained.') }}</p>
            </details>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>
    <v-alert v-if="account && !account.authenticated" type="info" class="mb-3">{{ tr('Подключите аккаунт. После входа нажмите «Обновить».', 'Connect the account. After signing in, click Refresh.') }}</v-alert>
    <template v-if="account?.authenticated">
      <div class="d-flex ga-2 mb-2">
        <v-btn :disabled="busy || !history.length" @click="back" icon="mdi-arrow-up" :aria-label="tr('Назад', 'Back')" />
        <v-btn :disabled="busy" @click="selectFiles">{{ tr('Выбрать файлы', 'Select files') }}</v-btn>
        <v-btn :disabled="busy" @click="resetFolder">{{ tr('В корень', 'Root') }}</v-btn>
      </div>
      <v-list>
        <v-list-item v-for="entry in entries" :key="entry.resourceKey" :title="entry.name" :subtitle="entry.isDirectory ? '' : `${entry.size} bytes · ${entry.contentType}`" @click="entry.isDirectory ? openFolder(entry.resourceKey) : toggle(entry.resourceKey)">
          <template #prepend>
            <v-icon v-if="entry.isDirectory" icon="mdi-folder-outline" class="mr-3" />
            <v-checkbox-btn v-else :model-value="selected.includes(entry.resourceKey)" :disabled="busy || !eligible(entry)" @click.stop="toggle(entry.resourceKey)" />
          </template>
          <template #append>
            <v-btn v-if="!entry.isDirectory && eligible(entry)" icon="mdi-play" variant="text" :href="preview(entry.resourceKey)" target="_blank" rel="noopener" :aria-label="tr('Просмотр', 'View')" />
          </template>
        </v-list-item>
      </v-list>
      <v-btn v-if="nextPageToken" :disabled="busy" @click="load(true)">{{ tr('Ещё', 'More') }}</v-btn>
      <footer v-if="$slots['browser-footer']" class="d-flex align-center justify-end flex-wrap ga-2 mt-1"><slot name="browser-footer" :folder-browser="exclusionBrowser"/></footer>
    </template>
    <v-progress-linear v-if="busy" indeterminate class="my-3" />
    <v-list v-if="imported.length">
      <v-list-item v-for="item in imported" :key="item.id" :title="item.title" :subtitle="`ID ${item.id}`">
        <template #append><v-btn variant="text" @click="processingId = item.id">{{ tr('Обработка', 'Process') }}</v-btn></template>
      </v-list-item>
    </v-list>
    <RemoteProcessingPanel v-model:media-id="processingId" />
  </div>
</template>
<script setup lang="ts">
import {remoteSourceErrorMessage} from '@/services/remoteSourceErrors'
import {computed, onMounted, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {collectRemoteDirectoryPages} from '@/services/remoteDirectoryPages'
import type {BrowseDirectoryLoader} from '@/services/typedApi/browse'
import {apiClient, buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import {openExternal} from '@/services/shellService'
import {useAppStore} from '@/stores/app'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useRemoteMediaAddingProcess} from '@/composable/useRemoteMediaAddingProcess'
import {type CloudAccount, type CloudAccountInput} from '@shared/cloudAccounts'
import {mediaFileKind} from '@shared/mediaFormats'
import {importExtensionMatcher, remotePathExcluder, type RemoteImportOptions} from '@/services/remoteImportOptions'
import {parseAndAssignImportPathTags} from '@/services/importPathAutoTag'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useEventBus} from '@/utils/eventBus'
import RemoteProcessingPanel from './RemoteProcessingPanel.vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'
type Entry = {resourceKey: string; name: string; size: number; isDirectory: boolean; contentType: string}
const props = defineProps<{extensions?: string; importOptions?: RemoteImportOptions; provider?: CloudAccountInput['provider']; unified?: boolean}>()
const sync = useItemsListSync(), events = useEventBus()
const emit = defineEmits<{started: []}>()
const {locale, t} = useI18n(), tr = (ru: string, en: string) => locale.value.startsWith('ru') ? ru : en
const app = useAppStore(), gate = useFreeLibraryGate(), addingProcess = useRemoteMediaAddingProcess(t)
const importing = ref(false), processed = ref(0), total = ref(0), failures = ref<Array<{path: string; message: string}>>([])
const accounts = ref<CloudAccount[]>([]), accountId = ref(''), account = computed(() => accounts.value.find(a => a.id === accountId.value))
const visibleAccounts = computed(() => accounts.value.filter(a => !props.provider || a.provider === props.provider))
const editingId = ref('')
const busy = ref(false), stopping = ref(false), editing = ref(false), error = ref('')
const entries = ref<Entry[]>([]), selected = ref<string[]>([]), folder = ref('root'), history = ref<string[]>([]), nextPageToken = ref<string>()
const imported = ref<Array<{id: number; title: string}>>([]), processingId = ref<number>()
const callbackUri = ref('')
const authMessage = ref('')
const authAttempt = ref<{id: string; state: string; deadline: number}>()
let authPoll: ReturnType<typeof setTimeout> | undefined
const form = ref<CloudAccountInput>({provider: 'onedrive', name: '', clientId: '', clientSecret: '', redirectUri: callbackUri.value})
const providerStyle = (provider: string) => provider === 'onedrive'
  ? {icon: 'mdi-microsoft-onedrive'}
  : provider === 'dropbox'
    ? {icon: 'mdi-dropbox'}
    : {icon: 'mdi-google-drive'}
const providers = [{title: 'OneDrive', value: 'onedrive'}, {title: 'Dropbox', value: 'dropbox'}, {title: 'Google Drive', value: 'gdrive'}]
let controller: AbortController | undefined
let reloadRequested = false
const guarded = async (action: () => Promise<void>) => {
  if (busy.value) return
  busy.value = true; error.value = ''; controller = new AbortController()
  try { await action() } catch (err) { if (!controller.signal.aborted) error.value = (err as {response?: {data?: {code?: string}}}).response?.data?.code === 'redirect_uri_mismatch' ? tr('Callback указывает на другой порт. Укажите адрес API из настроек подключения и зарегистрируйте его у провайдера.', 'Callback points to a different port. Use the API callback from connection settings and register it with the provider.') : remoteSourceErrorMessage(err, (key, params) => t(key, params || {})) }
  finally { busy.value = false; stopping.value = false; controller = undefined; if (reloadRequested) { reloadRequested = false; void refresh() } }
}
const base = () => `/api/cloud-accounts/${accountId.value}`
async function refresh() {
  await guarded(async () => { callbackUri.value = (await apiClient.get<{redirectUri: string}>('/api/cloud-accounts/configuration', {signal: controller?.signal})).data.redirectUri
    accounts.value = (await apiClient.get<CloudAccount[]>('/api/cloud-accounts', {signal: controller?.signal})).data
    if (!visibleAccounts.value.some(a => a.id === accountId.value)) accountId.value = visibleAccounts.value[0]?.id || '' })
  if (account.value?.authenticated) await load()
}
function closeEditor() { editing.value = false; form.value.clientSecret = '' }
const editorButtons = computed(() => [
  {text: tr('Отмена', 'Cancel'), icon: 'close', outlined: true, disabled: busy.value, action: closeEditor},
  {text: tr('Сохранить аккаунт', 'Save account'), icon: 'check', color: 'primary', loading: busy.value, disabled: busy.value, action: create},
])
function addAccount() { error.value = ''; editingId.value = ''; editing.value = true; form.value = {provider: props.provider || 'onedrive', name: '', clientId: '', clientSecret: '', redirectUri: callbackUri.value} }
function editAccount() { if (!account.value) return; editingId.value = account.value.id; editing.value = true; form.value = {provider: account.value.provider, name: account.value.name, clientId: '', clientSecret: '', redirectUri: account.value.redirectUri || callbackUri.value} }
async function create() { await guarded(async () => {
  const response = editingId.value ? await apiClient.put<CloudAccount>(`/api/cloud-accounts/${editingId.value}/configuration`, form.value, {signal: controller?.signal}) : await apiClient.post<CloudAccount>('/api/cloud-accounts', form.value, {signal: controller?.signal})
  accountId.value = response.data.id; form.value.clientSecret = ''; editing.value = false
  entries.value = []; selected.value = []; history.value = []; folder.value = 'root'
  accounts.value = [...accounts.value.filter(a => a.id !== response.data.id), response.data]
}) }
function stopAuthPoll() { if (authPoll) clearTimeout(authPoll); authPoll = undefined }
async function cancelSignIn() {
  const attempt = authAttempt.value
  if (!attempt) return
  await apiClient.post(`/api/cloud-accounts/${attempt.id}/oauth/cancel`)
  stopAuthPoll(); authAttempt.value = undefined
  authMessage.value = tr('Вход отменён. Можно начать заново.', 'Sign-in cancelled. You can try again.')
}
async function pollSignIn() {
  const attempt = authAttempt.value
  if (!attempt) return
  try {
    const {data} = await apiClient.get<{result: string}>(`/api/cloud-accounts/${attempt.id}/oauth/status`, {params: {state: attempt.state}})
    if (authAttempt.value !== attempt) return
    if (data.result !== 'waiting' || Date.now() > attempt.deadline) {
      authAttempt.value = undefined; stopAuthPoll()
      authMessage.value = data.result === 'connected' ? tr('Аккаунт подключён.', 'Account connected.')
        : data.result === 'invalid_client' ? tr('Провайдер отклонил Client ID или secret. Проверьте настройки аккаунта.', 'Provider rejected the Client ID or secret. Check account settings.')
        : data.result === 'redirect_uri_mismatch' ? tr('Проверьте точное совпадение callback в MediaChips и консоли провайдера.', 'Check that the callback matches exactly in MediaChips and the provider console.')
        : data.result === 'network_error' ? tr('Не удалось завершить обмен токена. Проверьте сеть и начните вход заново.', 'Token exchange failed. Check the network and start sign-in again.')
        : data.result === 'oauth_denied' ? tr('Доступ не предоставлен. Начните вход заново.', 'Access denied. Start sign-in again.')
        : tr('Вход отменён, завершился ошибкой или истёк. Проверьте настройки OAuth и начните заново.', 'Sign-in cancelled, failed or expired. Check OAuth settings and try again.')
      await refresh(); return
    }
  } catch {
    if (Date.now() > attempt.deadline) { authAttempt.value = undefined; authMessage.value = tr('Вход истёк. Начните заново.', 'Sign-in expired. Try again.'); return }
    authMessage.value = tr('Нет связи с MediaChips. Ожидаем восстановления соединения…', 'Cannot reach MediaChips. Waiting to reconnect…')
  }
  if (authAttempt.value === attempt) authPoll = setTimeout(pollSignIn, 1500)
}
async function connect() {
  if (busy.value) return
  // Open synchronously so browsers retain the user's popup permission.
  const popup = useAppStore().isElectron ? null : window.open('about:blank', '_blank', 'popup,width=600,height=760')
  await guarded(async () => {
    try {
      await cancelSignIn()
      const {data} = await apiClient.post<{url: string; state: string}>(`${base()}/oauth/start`, {}, {signal: controller?.signal})
      authAttempt.value = {id: accountId.value, state: data.state, deadline: Date.now() + 10 * 60_000}
      authMessage.value = tr('Завершите вход во внешнем браузере или нажмите «Отменить вход».', 'Complete sign-in in your browser or cancel sign-in.')
      authPoll = setTimeout(pollSignIn, 1500)
      if (popup) { popup.opener = null; popup.location.href = data.url } else await openExternal(data.url)
    } catch (err) { popup?.close(); await cancelSignIn(); throw err }
  })
}
async function logout() { await guarded(async () => { await apiClient.post(`${base()}/logout`); entries.value = []; selected.value = [] }); await refresh() }
async function load(more = false) { if (!account.value?.authenticated) return; await guarded(async () => {
  if (!more) { entries.value = []; nextPageToken.value = undefined }
  const {data} = await apiClient.get<{entries: Entry[]; nextPageToken?: string}>(`${base()}/files`, {params: {key: folder.value, pageToken: more ? nextPageToken.value : undefined}, signal: controller?.signal})
  entries.value = more ? [...entries.value, ...data.entries] : data.entries; nextPageToken.value = data.nextPageToken
}) }
async function resetFolder() { entries.value = []; selected.value = []; history.value = []; folder.value = 'root'; nextPageToken.value = undefined; await load() }
async function openFolder(key: string) { if (busy.value) return; history.value.push(folder.value); folder.value = key; selected.value = []; await load() }
async function back() { folder.value = history.value.pop() || 'root'; selected.value = []; await load() }
// Include the account and folder ancestry so identical names in different trees stay independent.
const exclusionRoot = computed(() => `/cloud-folders/${encodeURIComponent(accountId.value)}`)
const folderTitles = ref<Record<string, string>>({})
const loadExclusionDirectory: BrowseDirectoryLoader = async ({path, showHidden}) => {
  const rootPath = exclusionRoot.value
  if (path !== rootPath && !path.startsWith(`${rootPath}/`)) throw new Error('Folder belongs to a different cloud account')
  const accountBase = base()
  const parentPath = path === rootPath ? null : path.slice(0, path.lastIndexOf('/'))
  const key = parentPath === null ? 'root' : decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
  const {entries: children, truncated} = await collectRemoteDirectoryPages({
    load: async pageToken => {
      const {data} = await apiClient.get<{entries: Entry[]; nextPageToken?: string}>(`${accountBase}/files`, {params: {key, pageToken}})
      return data
    },
  })
  const folders = children.filter(entry => entry.isDirectory && (showHidden || !entry.name.startsWith('.'))).map(entry => ({
    path: `${path}/${encodeURIComponent(entry.resourceKey)}`,
    name: entry.name,
    isDirectory: true,
    size: null,
    mtimeMs: null,
    extension: null,
    inLibrary: false,
    mediaId: null,
    addable: false,
  }))
  for (const entry of folders) folderTitles.value[entry.path] = entry.name
  return {currentPath: path, rootPath, parentPath, entries: folders, truncated, platform: 'linux'}
}
const exclusionBrowser = computed(() => ({
  baseUrl: app.localhost || '',
  path: exclusionRoot.value,
  pathTitles: {...folderTitles.value, [exclusionRoot.value]: account.value?.name || ''},
  favoritesScope: JSON.stringify([app.dbPath, app.localhost, exclusionRoot.value]),
  directoryLoader: loadExclusionDirectory,
  errorMessage: (error: unknown) => remoteSourceErrorMessage(error, t),
}))
const folderIsExcluded = computed(() => {
  if (!props.importOptions?.excluded) return false
  const currentPath = [exclusionRoot.value, ...[...history.value, folder.value].slice(1).map(encodeURIComponent)].join('/')
  return props.importOptions.excluded.split(/\r?\n/).some(line => {
    const path = line.trim()
    return (path === exclusionRoot.value || path.startsWith(`${exclusionRoot.value}/`))
      && (currentPath === path || currentPath.startsWith(`${path}/`))
  })
})
const excludesName = computed(() => props.importOptions && remotePathExcluder(props.importOptions))
const eligible = (entry: Entry) => !folderIsExcluded.value && !entry.isDirectory && !!mediaFileKind(entry.name)
  && importExtensionMatcher(props.extensions)(entry.name) && !excludesName.value?.(entry.name)
watch(() => props.importOptions, () => {
  const allowed = new Set(entries.value.filter(eligible).map(entry => entry.resourceKey))
  selected.value = selected.value.filter(key => allowed.has(key))
})
function toggle(key: string) { if (busy.value || !entries.value.some(e => e.resourceKey === key && eligible(e))) return
  selected.value = selected.value.includes(key) ? selected.value.filter(v => v !== key) : [...selected.value, key] }
function selectFiles() { selected.value = entries.value.filter(eligible).map(e => e.resourceKey) }
function preview(key: string) { const query = new URLSearchParams({key}); const token = getAuthToken(); if (token) query.set('token', token); return buildApiUrl(`${base()}/stream?${query}`) }
async function submit() {
  const allowed = new Set(entries.value.filter(eligible).map(entry => entry.resourceKey))
  const keys = selected.value.filter(key => allowed.has(key))
  if (!keys.length) return
  const accountBase = base()
  await guarded(async () => {
    importing.value = true; stopping.value = false; processed.value = 0; total.value = keys.length; failures.value = []
    const run = addingProcess.begin({source: account.value?.name || 'Cloud', phase: 'importing', stop: () => { stopping.value = true }, retry: submit,
      readablePath: key => entries.value.find(e => e.resourceKey === key)?.name || key,
      snapshot: () => ({scanning: false, stopped: stopping.value, processed: processed.value, total: total.value, found: total.value,
        skipped: 0, inLibrary: 0, remaining: selected.value.length, errors: failures.value})})
    if (!run) { importing.value = false; return }
    emit('started')
    try {
      for (const key of keys) {
        if (stopping.value || !await gate.ensureCanImportMedia()) break
        controller?.signal.throwIfAborted()
        try {
          const {data} = await apiClient.post<{id: number; title: string; created: boolean}>(`${accountBase}/import`, {key}, {signal: controller?.signal, timeout: 40_000})
          controller?.signal.throwIfAborted()
          imported.value = [...imported.value.filter(v => v.id !== data.id), data]
          run.record(key, data.id, data.created)
          await gate.refreshLibraryCount()
          controller?.signal.throwIfAborted()
          if (props.importOptions?.parseTags) {
            run.phase('tagging')
            await parseAndAssignImportPathTags([{path: entries.value.find(e => e.resourceKey === key)?.name || key, mediaId: data.id}], {shouldStop: () => !!controller?.signal.aborted})
            run.phase('importing')
          }
          selected.value = selected.value.filter(v => v !== key)
        } catch (err) {
          if (controller?.signal.aborted) throw err
          failures.value.push({path: key, message: remoteSourceErrorMessage(err, t)})
        }
        processed.value++
      }
    } finally {
      importing.value = false; run.finish()
      sync.getItemsFromDb({ids: [], type: 'media'}); events.emit('library:nav-counts-changed')
    }
  })
}
function stop() { stopping.value = true; if (!importing.value) controller?.abort() }
watch([() => app.dbPath, () => app.localhost], () => {
  stopAuthPoll(); authAttempt.value = undefined; authMessage.value = ''
  controller?.abort(); accounts.value = []; accountId.value = ''; entries.value = []; selected.value = []; imported.value = []; processingId.value = undefined
  if (busy.value) reloadRequested = true; else void refresh()
})

watch(() => props.provider, async () => {
  editing.value = false; form.value.clientSecret = ''; accountId.value = visibleAccounts.value[0]?.id || ''
  await resetFolder()
})
onMounted(refresh); onBeforeUnmount(() => { stopAuthPoll(); void cancelSignIn().catch(() => {}); stopping.value = true; controller?.abort() })
async function selectAccount(id: string) {
  if (busy.value) return
  editing.value = false; form.value.clientSecret = ''; accountId.value = id
  await resetFolder()
}
defineExpose({account, editAccount, connect, logout, accounts, accountId, editing, addAccount, selectAccount, refresh, busy, canSubmit: computed(() => !!selected.value.length && !busy.value), selectionCount: computed(() => selected.value.length), submit, stop, stopping, canStop: importing})
</script>

<style scoped>
.account-editor { padding: 12px 20px 16px !important; }
.account-editor__description { margin-bottom: 20px; font-size: 12px; color: rgba(var(--v-theme-on-surface), .65); }
.account-editor__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 12px; }
.account-editor__redirect { grid-column: 1 / -1; }
.account-editor__redirect :deep(input) { font-family: monospace; font-size: 12px; }
.account-editor__help { margin-top: 14px; font-size: 12px; color: rgba(var(--v-theme-on-surface), .7); }
.account-editor__help summary { cursor: pointer; color: rgb(var(--v-theme-primary)); width: fit-content; }
.account-editor__help p { margin: 10px 0 6px; }
.account-editor__help code { display: block; overflow-wrap: anywhere; user-select: all; }
.account-toolbar :deep(.v-btn) { box-shadow: none; font-size: 12px; }
@media (max-width: 600px) {
  .account-editor { padding: 16px; }
  .account-editor__fields { grid-template-columns: minmax(0, 1fr); }
}
</style>
