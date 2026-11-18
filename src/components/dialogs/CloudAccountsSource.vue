<template>
  <div class="cloud-accounts-source">
    <v-alert v-if="error && !editing" type="error" variant="tonal" density="compact" rounded="lg" closable class="cloud-accounts-source__notice" @click:close="error = ''">{{ error }}</v-alert>
    <div v-if="authAttempt" class="cloud-accounts-source__waiting">
      <div class="cloud-accounts-source__waiting-status" role="status">
        <v-progress-circular indeterminate color="primary" size="14" width="2" aria-hidden="true" />
        <span>{{ authMessage || tr('Завершите вход в открывшемся окне.', 'Complete sign-in in the opened window.') }}</span>
      </div>
      <v-btn size="small" variant="tonal" color="primary" rounded="lg" @click="cancelSignIn">{{ tr('Отменить', 'Cancel') }}</v-btn>
    </div>
    <v-alert v-else-if="authMessage" :type="authOk ? 'success' : 'warning'" variant="tonal" density="compact" rounded="lg" closable
             class="cloud-accounts-source__notice" @click:close="authMessage = ''">{{ authMessage }}</v-alert>
    <GoogleMismatchHelp v-if="authAttempt && account?.provider === 'gdrive'" class="mb-2" @json="fixWithJson" />
    <OAuthPasteField v-if="authAttempt?.mode === 'paste'" class="mb-2" endpoint="/api/cloud-accounts/oauth/complete" @completed="checkSignInNow" />
    <v-select v-if="!unified" v-model="accountId" :items="visibleAccounts" item-title="name" item-value="id" :label="tr('Облачный аккаунт', 'Cloud account')" :disabled="busy" variant="outlined" density="compact" hide-details class="mb-3" @update:model-value="resetFolder" />
    <div v-if="!unified" class="d-flex flex-wrap ga-2 mb-4 account-toolbar">
      <v-btn v-if="!unified" @click="addAccount" :disabled="busy" prepend-icon="mdi-plus">{{ tr('Добавить аккаунт', 'Add account') }}</v-btn>
      <v-btn v-if="account" :disabled="busy" @click="editAccount">{{ tr('Настроить аккаунт', 'Configure account') }}</v-btn>
      <v-btn v-if="account" :disabled="busy" @click="connect()">{{ tr('Подключить / сменить вход', 'Connect / sign in again') }}</v-btn>
      <v-btn v-if="account" :disabled="busy" @click="removeAccount">{{ t('sources.remove_connection') }}</v-btn>
      <v-btn v-if="account?.authenticated" :disabled="busy" @click="logout">{{ tr('Отключить', 'Disconnect') }}</v-btn>
      <v-btn v-if="!unified" icon="mdi-refresh" variant="tonal" color="primary" rounded="lg" :disabled="busy" :aria-label="tr('Обновить', 'Refresh')" :title="tr('Обновить', 'Refresh')" @click="refresh" />
    </div>
    <DialogConfirm v-model:dialog="confirmRemoval" variant="delete" @confirm="deleteAccount">
      {{ t('sources.remove_connection_confirm', {name: account?.name || ''}) }}
    </DialogConfirm>
    <v-dialog v-model="editing" max-width="580" persistent scrollable>
      <v-card rounded="xl" class="account-dialog">
        <DialogHeader :header="editingId ? tr('Настройка аккаунта', 'Account settings') : tr('Новый облачный аккаунт', 'New cloud account')"
                      :icon="providerStyle(form.provider).icon.replace('mdi-', '')" :buttons="editorButtons" compact closable
                      :close-disabled="busy" :close-label="tr('Отмена', 'Cancel')" @close="closeEditor" />
        <v-card-text class="account-editor">
          <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-4">{{ error }}</v-alert>

          <section v-if="!editingId && !props.provider" class="account-editor__section">
            <h3 class="account-editor__label">{{ tr('Сервис', 'Service') }}</h3>
            <div class="account-editor__providers" role="radiogroup" :aria-label="tr('Сервис', 'Service')">
              <button v-for="item in providers" :key="item.value" type="button" role="radio" :aria-checked="form.provider === item.value"
                      class="account-editor__provider" :class="{'account-editor__provider--active': form.provider === item.value}"
                      :style="{'--provider-color': providerStyle(item.value).color}" :disabled="busy" @click="selectProvider(item.value)">
                <span class="account-editor__provider-icon"><v-icon :icon="providerStyle(item.value).icon" size="26" /></span>
                <span class="account-editor__provider-name">{{ item.title }}</span>
                <span v-if="item.beta" class="account-editor__provider-beta"
                      :title="tr('Проверено на тестах, приёмка на реальных аккаунтах не завершена', 'Covered by tests; live acceptance on real accounts is not finished')">beta</span>
                <v-icon v-if="form.provider === item.value" icon="mdi-check-circle" size="16" class="account-editor__provider-check" />
              </button>
            </div>
          </section>

          <section class="account-editor__section">
            <v-text-field v-model="form.name" :disabled="busy" :label="tr('Название', 'Name')" :placeholder="providerName(form.provider)"
                          variant="outlined" density="compact" rounded="lg" hide-details="auto" maxlength="120" prepend-inner-icon="mdi-label-outline" />
          </section>

          <section v-if="quickConnect" class="account-editor__managed">
            <v-icon :icon="sharedGoogle ? 'mdi-key-chain-variant' : 'mdi-lightning-bolt-outline'" size="20" />
            <div>
              <strong>{{ sharedGoogle ? tr('Ключи уже настроены', 'Keys are already set up') : tr('Быстрое подключение', 'Quick connect') }}</strong>
              <p>{{ sharedGoogle
                ? tr('Используется OAuth-клиент основного подключения Google Drive. Нажмите «Подключить» и выберите нужный Google-аккаунт.', 'Uses the OAuth client of the main Google Drive connection. Click "Connect" and pick the Google account.')
                : tr('Нажмите «Подключить» — откроется окно входа в аккаунт. Ничего настраивать не нужно.', 'Click "Connect" to open the sign-in window. Nothing else to set up.') }}</p>
            </div>
          </section>

          <component :is="quickConnect ? 'details' : 'section'" class="account-editor__oauth" :class="{'account-editor__oauth--collapsible': quickConnect}">
            <summary v-if="quickConnect">{{ sharedGoogle ? tr('Использовать другой OAuth-клиент', 'Use a different OAuth client') : t('sources.advanced_oauth') }}</summary>
            <header class="account-editor__oauth-head">
              <h3 class="account-editor__label">{{ tr('Своё OAuth-приложение', 'Your own OAuth app') }}</h3>
              <span class="account-editor__local"><v-icon icon="mdi-lock-outline" size="13" />{{ tr('Ключи хранятся только на этом компьютере', 'Keys stay on this computer') }}</span>
            </header>

            <ol class="account-editor__steps">
              <li v-for="(step, index) in setupSteps" :key="index">
                <span class="account-editor__step-index">{{ index + 1 }}</span>
                <span class="account-editor__step-text">{{ step.text }}
                  <a v-if="step.link" href="#" @click.prevent="openLink(step.link)">{{ step.linkText }}<v-icon icon="mdi-open-in-new" size="12" /></a>
                </span>
              </li>
            </ol>

            <div v-if="form.provider !== 'gdrive' || !googleDesktop" class="account-editor__callback">
              <span class="account-editor__callback-label">{{ tr('Адрес возврата (Redirect URI)', 'Redirect URI') }}</span>
              <div class="account-editor__callback-row">
                <code>{{ form.redirectUri || callbackUri }}</code>
                <v-btn size="x-small" variant="text" rounded="lg" :icon="copied ? 'mdi-check' : 'mdi-content-copy'" :color="copied ? 'success' : undefined"
                       :aria-label="tr('Копировать', 'Copy')" v-tooltip:top="tr('Копировать', 'Copy')" @click="copyCallback" />
              </div>
            </div>

            <div v-if="form.provider === 'gdrive'" class="account-editor__drop" :class="{'account-editor__drop--active': dragging}"
                 @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onGoogleDrop">
              <v-icon icon="mdi-file-key-outline" size="22" />
              <span>{{ googleJsonNotice || tr('Перетащите сюда JSON клиента из Google Cloud — поля заполнятся сами.', 'Drop the client JSON from Google Cloud here — fields fill in automatically.') }}</span>
              <v-btn size="small" variant="tonal" color="primary" rounded="lg" :disabled="busy" @click="googleJson?.click()">{{ t('drive.json_choose') }}</v-btn>
              <input ref="googleJson" type="file" accept=".json,application/json" hidden @change="onGoogleJson">
            </div>

            <v-form @submit.prevent="create()">
              <v-defaults-provider :defaults="{VTextField: {variant: 'outlined', density: 'compact', rounded: 'lg', hideDetails: 'auto'}}">
                <div class="account-editor__fields">
                  <v-text-field v-model="form.clientId" :disabled="busy" :label="form.provider === 'dropbox' ? 'App key' : 'Client ID'" required />
                  <v-text-field v-model="form.clientSecret" :disabled="busy" type="password" autocomplete="new-password"
                                :label="form.provider === 'dropbox' ? 'App secret' : 'Client secret'"
                                :placeholder="editingId ? tr('Без изменений', 'Unchanged') : undefined" />
                </div>
                <details class="account-editor__advanced">
                  <summary>{{ tr('Изменить адрес возврата', 'Change redirect URI') }}</summary>
                  <v-text-field v-model="form.redirectUri" class="account-editor__redirect mt-2" :disabled="busy" label="Redirect URI" required />
                </details>
              </v-defaults-provider>
              <button type="submit" hidden />
            </v-form>
          </component>

          <p v-if="!editingId && !quickConnect" class="account-editor__footnote">{{ t('sources.managed_oauth_unavailable') }}</p>
        </v-card-text>
      </v-card>
    </v-dialog>
    <div v-if="account && !account.authenticated && !authAttempt" class="cloud-accounts-source__empty">
      <v-icon :icon="providerStyle(account.provider).icon" size="20" />
      <span>{{ tr('Подключите аккаунт, чтобы открыть файлы.', 'Connect the account to browse files.') }}</span>
      <v-btn size="small" variant="flat" color="primary" rounded="lg" prepend-icon="mdi-login" :disabled="busy" @click="connect()">{{ t('sources.connect_account') }}</v-btn>
    </div>
    <template v-if="account?.authenticated">
      <MediaFolderBrowser ref="browser" v-model:path="browserPath" v-model:selected-paths="selectedPaths"
                          :extensions="extensions" :base-url="app.localhost || ''" :directory-loader="loadDirectory"
                          :path-titles="exclusionBrowser.pathTitles" :favorites-scope="exclusionBrowser.favoritesScope"
                          :error-message="exclusionBrowser.errorMessage" :disabled="busy"
                          :enable-folder-tags="false" select-addable-only>
        <template v-if="$slots['browser-footer']" #footerActions><slot name="browser-footer" :folder-browser="exclusionBrowser"/></template>
        <template #entryActions="{entry}">
          <v-btn v-if="!entry.isDirectory && entry.addable" size="x-small" variant="plain" :rounded="0" :ripple="false" icon
                 :href="preview(keyOfPath(entry.path))" target="_blank" rel="noopener" :aria-label="tr('Просмотр', 'View')" @click.stop>
            <v-icon size="16" icon="mdi-play-circle-outline" />
          </v-btn>
        </template>
      </MediaFolderBrowser>
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
import DialogConfirm from './DialogConfirm.vue'
import {remoteSourceErrorMessage} from '@/services/remoteSourceErrors'
import {computed, onMounted, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {listCloudDirectory, listCloudFolders} from '@/services/cloudFolderBrowse'
import {expandRemoteSelection} from '@/services/remoteImportSelection'
import type {BrowseDirectoryLoader} from '@/services/typedApi/browse'
import {apiClient, buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import {openExternal} from '@/services/shellService'
import {useAppStore} from '@/stores/app'
import {useFreeLibraryGate} from '@/composable/useFreeLibraryGate'
import {useRemoteMediaAddingProcess} from '@/composable/useRemoteMediaAddingProcess'
import {type CloudAccount, type CloudAccountInput, type CloudProvider} from '@shared/cloudAccounts'
import {mediaFileKind} from '@shared/mediaFormats'
import {googleClientRedirect, parseGoogleOAuthClientFile} from '@shared/googleOAuthClient'
import {importExtensionMatcher, remotePathExcluder, type RemoteImportOptions} from '@/services/remoteImportOptions'
import {parseAndAssignImportPathTags} from '@/services/importPathAutoTag'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useEventBus} from '@/utils/eventBus'
import RemoteProcessingPanel from './RemoteProcessingPanel.vue'
import OAuthPasteField from './OAuthPasteField.vue'
import GoogleMismatchHelp from './GoogleMismatchHelp.vue'
import {openOAuthUrl, prepareOAuthWindow, type OAuthLaunchMode} from '@/services/oauthWindow'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import MediaFolderBrowser from './MediaFolderBrowser.vue'
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
// The shared folder browser works with paths (`<root>/<encoded key>/...`), the cloud API with provider keys.
const selectedPaths = ref<string[]>([]), browserPath = ref('')
const browser = ref<InstanceType<typeof MediaFolderBrowser>>()
const nameByPath = new Map<string, string>(), directories = new Set<string>()
const scanning = ref(false)
const keyOfPath = (path: string) => decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
const imported = ref<Array<{id: number; title: string}>>([]), processingId = ref<number>()
const callbackUri = ref('')
const googleJson = ref<HTMLInputElement>(), googleJsonNotice = ref(''), googleDesktop = ref(false), dragging = ref(false), copied = ref(false)
async function readGoogleJson(file?: File | null) {
  const parsed = file && file.size < 64 * 1024 ? parseGoogleOAuthClientFile(await file.text()) : null
  if (!parsed) { googleJsonNotice.value = t('drive.json_invalid'); googleDesktop.value = false; return }
  const redirect = googleClientRedirect(parsed, callbackUri.value, '/api/cloud-accounts/oauth/callback')
  form.value = {...form.value, clientId: parsed.clientId, clientSecret: parsed.clientSecret, redirectUri: redirect.redirectUri || callbackUri.value}
  googleDesktop.value = parsed.type === 'installed'
  googleJsonNotice.value = parsed.type === 'installed' ? t('drive.json_desktop_ok') : redirect.registered ? t('drive.json_web_ok') : t('drive.json_web_missing')
}
async function onGoogleJson(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  await readGoogleJson(file)
}
function onGoogleDrop(event: DragEvent) { dragging.value = false; void readGoogleJson(event.dataTransfer?.files?.[0]) }
function openLink(url: string) { if (app.isElectron) void openExternal(url); else window.open(url, '_blank', 'noopener') }
async function copyCallback() {
  const value = form.value.redirectUri || callbackUri.value
  try { await navigator.clipboard.writeText(value); copied.value = true; setTimeout(() => { copied.value = false }, 1500) } catch { /* clipboard unavailable */ }
}
function selectProvider(provider: CloudProvider) {
  if (busy.value || form.value.provider === provider) return
  form.value = {...form.value, provider, clientId: '', clientSecret: '', redirectUri: callbackUri.value}
  googleJsonNotice.value = ''; googleDesktop.value = false; error.value = ''
}
const setupSteps = computed(() => {
  const provider = form.value.provider
  if (provider === 'onedrive') return [
    {text: tr('Зарегистрируйте приложение в Microsoft Entra.', 'Register an app in Microsoft Entra.'), link: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', linkText: tr('Открыть', 'Open')},
    {text: tr('В разделе «Authentication» добавьте платформу Web и вставьте адрес возврата ниже.', 'Under "Authentication" add a Web platform and paste the redirect URI below.')},
    {text: tr('Создайте секрет в «Certificates & secrets» и скопируйте Client ID и секрет сюда.', 'Create a secret in "Certificates & secrets", then copy the Client ID and secret here.')},
  ]
  if (provider === 'dropbox') return [
    {text: tr('Создайте приложение с доступом Full Dropbox.', 'Create an app with Full Dropbox access.'), link: 'https://www.dropbox.com/developers/apps/create', linkText: tr('Открыть', 'Open')},
    {text: tr('Во вкладке Permissions включите files.metadata.read и files.content.read.', 'On the Permissions tab enable files.metadata.read and files.content.read.')},
    {text: tr('Добавьте адрес возврата ниже в Redirect URIs и скопируйте App key и App secret.', 'Add the redirect URI below to Redirect URIs, then copy the App key and App secret.')},
  ]
  return [
    {text: tr('Включите Google Drive API в своём проекте.', 'Enable the Google Drive API in your project.'), link: 'https://console.cloud.google.com/apis/library/drive.googleapis.com', linkText: tr('Открыть', 'Open')},
    {text: tr('Создайте OAuth-клиент типа «Приложение для ПК» и скачайте JSON.', 'Create a "Desktop app" OAuth client and download its JSON.'), link: 'https://console.cloud.google.com/auth/clients/create', linkText: tr('Создать', 'Create')},
    {text: tr('Добавьте свой адрес Gmail в тестовые пользователи.', 'Add your Gmail address as a test user.'), link: 'https://console.cloud.google.com/auth/audience', linkText: tr('Открыть', 'Open')},
  ]
})
const managedProviders = ref<CloudProvider[]>([])
const authMessage = ref(''), authOk = ref(false)
const authAttempt = ref<{id: string; state: string; deadline: number; mode: OAuthLaunchMode}>()
const googleClient = ref(false)
let authPoll: ReturnType<typeof setTimeout> | undefined
const form = ref<CloudAccountInput>({provider: 'gdrive', name: '', clientId: '', clientSecret: '', redirectUri: callbackUri.value})
const providerStyle = (provider: string) => provider === 'onedrive'
  ? {icon: 'mdi-microsoft-onedrive', color: '#0078d4'}
  : provider === 'dropbox'
    ? {icon: 'mdi-dropbox', color: '#0061ff'}
    : {icon: 'mdi-google-drive', color: '#34a853'}
// OneDrive and Dropbox stay beta in 2.0.0: fixture-tested, live acceptance pending (docs/onedrive-dropbox-acceptance.md).
const providers: {title: string; value: CloudProvider; beta?: boolean}[] = [{title: 'Google Drive', value: 'gdrive'}, {title: 'Dropbox', value: 'dropbox', beta: true}, {title: 'OneDrive', value: 'onedrive', beta: true}]
const providerName = (provider: string) => providers.find(item => item.value === provider)?.title || provider
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
  await guarded(async () => {
    const {data: config} = await apiClient.get<{redirectUri: string; managed?: CloudProvider[]; googleClient?: boolean}>('/api/cloud-accounts/configuration', {signal: controller?.signal})
    callbackUri.value = config.redirectUri
    googleClient.value = !!config.googleClient
    managedProviders.value = config.managed || []
    accounts.value = (await apiClient.get<CloudAccount[]>('/api/cloud-accounts', {signal: controller?.signal})).data
    if (!visibleAccounts.value.some(a => a.id === accountId.value)) accountId.value = visibleAccounts.value[0]?.id || '' })
  if (account.value?.authenticated) browser.value?.refresh()
}
function closeEditor() { editing.value = false; form.value.clientSecret = '' }
const managedAvailable = computed(() => managedProviders.value.includes(form.value.provider))
/** Extra Google accounts reuse the main Drive OAuth client: no keys to enter. */
const sharedGoogle = computed(() => form.value.provider === 'gdrive' && googleClient.value)
const usesSharedGoogle = computed(() => sharedGoogle.value && !form.value.clientId.trim())
const quickConnect = computed(() => sharedGoogle.value || (!editingId.value && managedAvailable.value))
const canSaveManual = computed(() => !busy.value && (usesSharedGoogle.value || (!!form.value.clientId.trim() && !!form.value.redirectUri.trim())))
const editorButtons = computed(() => {
  if (editingId.value) return [
    {text: t('common.save'), icon: 'check', color: 'secondary', disabled: !canSaveManual.value, action: () => create(false)},
    {text: t('sources.save_and_connect'), icon: 'login', color: 'primary', loading: busy.value, disabled: !canSaveManual.value, action: () => create()},
  ]
  if (usesSharedGoogle.value) return [
    {text: t('sources.connect_account'), icon: 'login', color: 'primary', loading: busy.value, disabled: !canSaveManual.value, action: () => create()},
  ]
  if (managedAvailable.value && !form.value.clientId.trim()) return [
    {text: t('sources.connect_account'), icon: 'login', color: 'primary', loading: busy.value, disabled: busy.value, action: () => create(true, true)},
  ]
  return [{text: t('sources.save_and_connect'), icon: 'login', color: 'primary', loading: busy.value, disabled: !canSaveManual.value, action: () => create()}]
})
function addAccount() { error.value = ''; editingId.value = ''; editing.value = true; googleJsonNotice.value = ''; googleDesktop.value = false; form.value = {provider: props.provider || 'gdrive', name: '', clientId: '', clientSecret: '', redirectUri: callbackUri.value} }
function editAccount() { if (!account.value) return; googleJsonNotice.value = ''; googleDesktop.value = false; editingId.value = account.value.id; editing.value = true; form.value = {provider: account.value.provider, name: account.value.name, clientId: '', clientSecret: '', redirectUri: account.value.redirectUri || callbackUri.value} }
async function create(signIn = true, managed = false) {
  if (busy.value) return
  const input = {...form.value, name: form.value.name.trim() || providerName(form.value.provider)}
  if (managed ? !managedAvailable.value : !canSaveManual.value) return
  const popup = signIn ? openSignInWindow() : null
  let saved = false
  await guarded(async () => {
    const response = managed
      ? await apiClient.post<CloudAccount>('/api/cloud-accounts/managed', {provider: input.provider}, {signal: controller?.signal})
      : editingId.value
      ? await apiClient.put<CloudAccount>(`/api/cloud-accounts/${editingId.value}/configuration`, input, {signal: controller?.signal})
      : await apiClient.post<CloudAccount>('/api/cloud-accounts', input, {signal: controller?.signal})
    if (controller?.signal.aborted) return
    accountId.value = response.data.id; form.value.clientSecret = ''; editing.value = false
    resetFolder()
    accounts.value = [...accounts.value.filter(a => a.id !== response.data.id), response.data]
    saved = true
  })
  if (saved && signIn) await connect(popup)
  else popup?.close()
}
function stopAuthPoll() { if (authPoll) clearTimeout(authPoll); authPoll = undefined }
async function cancelSignIn() {
  const attempt = authAttempt.value
  if (!attempt) return
  await apiClient.post(`/api/cloud-accounts/${attempt.id}/oauth/cancel`)
  stopAuthPoll(); authAttempt.value = undefined
  authOk.value = false; authMessage.value = ''
}
async function pollSignIn() {
  const attempt = authAttempt.value
  if (!attempt) return
  try {
    const {data} = await apiClient.get<{result: string}>(`/api/cloud-accounts/${attempt.id}/oauth/status`, {params: {state: attempt.state}})
    if (authAttempt.value !== attempt) return
    if (data.result !== 'waiting' || Date.now() > attempt.deadline) {
      authAttempt.value = undefined; stopAuthPoll()
      authOk.value = data.result === 'connected'
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
/** redirect_uri_mismatch fix: stop the failed sign-in and open the account prefilled from the new client JSON. */
async function fixWithJson(file: File) {
  await cancelSignIn().catch(() => {})
  editAccount()
  if (editing.value) await readGoogleJson(file)
}
function openSignInWindow() { return prepareOAuthWindow('mediachips-cloud-account') }
/** The pasted redirect finished sign-in: report the result right away. */
function checkSignInNow() { stopAuthPoll(); void pollSignIn() }
async function connect(signInWindow?: Window | null) {
  if (busy.value) { signInWindow?.close(); return }
  const popup = signInWindow === undefined ? openSignInWindow() : signInWindow
  await guarded(async () => {
    try {
      await cancelSignIn()
      const {data} = await apiClient.post<{url: string; state: string; mode?: OAuthLaunchMode}>(`${base()}/oauth/start`, {}, {signal: controller?.signal})
      authAttempt.value = {id: accountId.value, state: data.state, deadline: Date.now() + 10 * 60_000, mode: data.mode || 'callback'}
      authOk.value = false; authMessage.value = ''
      authPoll = setTimeout(pollSignIn, 1500)
      await openOAuthUrl(popup, data.url)
    } catch (err) { popup?.close(); await cancelSignIn(); throw err }
  })
}
function removeAccount() {
  if (account.value && !busy.value) confirmRemoval.value = true
}
const confirmRemoval = ref(false)
async function deleteAccount() {
  const removed = account.value
  if (!removed || busy.value) return
  await guarded(async () => {
    await apiClient.delete(`/api/cloud-accounts/${removed.id}`, {signal: controller?.signal})
    if (controller?.signal.aborted) return
    if (authAttempt.value?.id === removed.id) { stopAuthPoll(); authAttempt.value = undefined }
    authMessage.value = ''
    accounts.value = accounts.value.filter(item => item.id !== removed.id)
    accountId.value = visibleAccounts.value[0]?.id || ''
    resetFolder()
  })
}
async function logout() { await guarded(async () => { await apiClient.post(`${base()}/logout`); selectedPaths.value = [] }); await refresh() }
function resetFolder() {
  selectedPaths.value = []; nameByPath.clear(); directories.clear(); browserPath.value = exclusionRoot.value
}
watch(() => accountId.value, resetFolder)
// Include the account and folder ancestry so identical names in different trees stay independent.
const exclusionRoot = computed(() => `/cloud-folders/${encodeURIComponent(accountId.value)}`)
const folderTitles = ref<Record<string, string>>({})
const loadExclusionDirectory: BrowseDirectoryLoader = async input => {
  const result = await listCloudFolders(accountId.value, exclusionRoot.value, input)
  for (const entry of result.entries) folderTitles.value[entry.path] = entry.name
  return result
}
const exclusionBrowser = computed(() => ({
  baseUrl: app.localhost || '',
  path: exclusionRoot.value,
  pathTitles: {...folderTitles.value, [exclusionRoot.value]: account.value?.name || ''},
  favoritesScope: JSON.stringify([app.dbPath, app.localhost, exclusionRoot.value]),
  directoryLoader: loadExclusionDirectory,
  errorMessage: (error: unknown) => remoteSourceErrorMessage(error, t),
}))
/** An excluded line removes its folder and everything below it, for this account only. */
function isExcludedPath(path: string) {
  const excluded = props.importOptions?.excluded
  if (!excluded) return false
  return excluded.split(/\r?\n/).some(line => {
    const excludedPath = line.trim()
    return (excludedPath === exclusionRoot.value || excludedPath.startsWith(`${exclusionRoot.value}/`))
      && (path === excludedPath || path.startsWith(`${excludedPath}/`))
  })
}
const excludesName = computed(() => props.importOptions && remotePathExcluder(props.importOptions))
const isAddableFile = (name: string, folderPath: string) => !isExcludedPath(folderPath) && !!mediaFileKind(name)
  && importExtensionMatcher(props.extensions)(name) && !excludesName.value?.(name)
function rememberEntries(result: {currentPath: string; entries: Array<{path: string; name: string; isDirectory: boolean}>}) {
  directories.add(result.currentPath)
  for (const entry of result.entries) {
    nameByPath.set(entry.path, entry.name); folderTitles.value[entry.path] = entry.name
    if (entry.isDirectory) directories.add(entry.path)
  }
}
const loadDirectory: BrowseDirectoryLoader = async input => {
  const result = await listCloudDirectory(accountId.value, exclusionRoot.value, input, {files: {addable: (file, folder) => isAddableFile(file.name, folder)}})
  rememberEntries(result)
  return result
}
// Exclusion and extension changes decide which files can be selected: reload the listing shortly after they settle.
let relistTimer: ReturnType<typeof setTimeout> | undefined
watch(() => props.importOptions, () => { clearTimeout(relistTimer); relistTimer = setTimeout(() => browser.value?.refresh(), 500) })
function preview(key: string) { const query = new URLSearchParams({key}); const token = getAuthToken(); if (token) query.set('token', token); return buildApiUrl(`${base()}/stream?${query}`) }
async function submit() {
  if (!selectedPaths.value.length) return
  const accountBase = base(), importAccountId = accountId.value
  await guarded(async () => {
    importing.value = true; stopping.value = false; scanning.value = true; processed.value = 0; total.value = selectedPaths.value.length; failures.value = []
    const run = addingProcess.begin({source: account.value?.name || 'Cloud', phase: 'importing', stop: () => { stopping.value = true }, retry: submit,
      readablePath: path => nameByPath.get(path) || keyOfPath(path),
      snapshot: () => ({scanning: scanning.value, stopped: stopping.value, processed: processed.value, total: total.value, found: total.value,
        skipped: 0, inLibrary: 0, remaining: selectedPaths.value.length, errors: failures.value})})
    if (!run) { importing.value = false; scanning.value = false; return }
    emit('started')
    try {
      // Selected folders are expanded first, so stopping during the scan keeps the selection retryable.
      const expanded = await expandRemoteSelection({
        paths: [...selectedPaths.value], directories,
        shouldStop: () => stopping.value || !!controller?.signal.aborted,
        isExcluded: isExcludedPath,
        acceptFile: path => { const name = nameByPath.get(path); return !name || isAddableFile(name, path.slice(0, path.lastIndexOf('/'))) },
        load: async path => {
          const result = await listCloudDirectory(importAccountId, exclusionRoot.value, {path},
            {files: {addable: (file, folder) => isAddableFile(file.name, folder)}, maxEntries: Infinity})
          rememberEntries(result)
          return result
        },
        onFolderError: (path, err) => failures.value.push({path, message: err instanceof Error && err.message === 'truncated' ? t('nas.truncated') : remoteSourceErrorMessage(err, t)}),
      })
      scanning.value = false
      if (expanded.stopped) return
      selectedPaths.value = [...expanded.paths, ...expanded.failedFolders]
      total.value = expanded.paths.length
      for (const path of expanded.paths) {
        if (stopping.value || !await gate.ensureCanImportMedia()) break
        controller?.signal.throwIfAborted()
        const key = keyOfPath(path)
        try {
          const {data} = await apiClient.post<{id: number; title: string; created: boolean}>(`${accountBase}/import`, {key}, {signal: controller?.signal, timeout: 40_000})
          controller?.signal.throwIfAborted()
          imported.value = [...imported.value.filter(v => v.id !== data.id), data]
          run.record(path, data.id, data.created)
          await gate.refreshLibraryCount()
          controller?.signal.throwIfAborted()
          if (props.importOptions?.parseTags) {
            run.phase('tagging')
            await parseAndAssignImportPathTags([{path: nameByPath.get(path) || key, mediaId: data.id}], {shouldStop: () => !!controller?.signal.aborted})
            run.phase('importing')
          }
          selectedPaths.value = selectedPaths.value.filter(v => v !== path)
        } catch (err) {
          if (controller?.signal.aborted) throw err
          failures.value.push({path, message: remoteSourceErrorMessage(err, t)})
        }
        processed.value++
      }
    } finally {
      importing.value = false; scanning.value = false; run.finish()
      sync.getItemsFromDb({ids: [], type: 'media'}); events.emit('library:nav-counts-changed')
    }
  })
}
function stop() { stopping.value = true; if (!importing.value) controller?.abort() }
watch([() => app.dbPath, () => app.localhost], () => {
  stopAuthPoll(); authAttempt.value = undefined; authMessage.value = ''
  controller?.abort(); managedProviders.value = []; callbackUri.value = ''; accounts.value = []; accountId.value = ''; selectedPaths.value = []; imported.value = []; processingId.value = undefined
  if (busy.value) reloadRequested = true; else void refresh()
})

watch(() => props.provider, async () => {
  editing.value = false; form.value.clientSecret = ''; accountId.value = visibleAccounts.value[0]?.id || ''
  resetFolder()
})
onMounted(refresh); onBeforeUnmount(() => { stopAuthPoll(); void cancelSignIn().catch(() => {}); stopping.value = true; clearTimeout(relistTimer); controller?.abort() })
async function selectAccount(id: string) {
  if (busy.value) return
  editing.value = false; form.value.clientSecret = ''; accountId.value = id
  resetFolder()
}
defineExpose({account, editAccount, connect, logout, removeAccount, accounts, accountId, editing, addAccount, selectAccount, refresh, busy, canSubmit: computed(() => !!selectedPaths.value.length && !busy.value), selectionCount: computed(() => selectedPaths.value.length), submit, stop, stopping, canStop: importing})
</script>

<style scoped>
.cloud-accounts-source__notice { margin-bottom: 8px; font-size: .8125rem; }
.cloud-accounts-source__waiting,
.cloud-accounts-source__empty {
  display: flex; align-items: center; gap: 10px; min-height: 48px; margin-bottom: 8px; padding: 8px 12px; border-radius: 10px;
  font-size: .8125rem; line-height: 1.4;
}
.cloud-accounts-source__waiting { justify-content: space-between; background: rgba(var(--v-theme-primary), .06); }
.cloud-accounts-source__waiting-status { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cloud-accounts-source__waiting-status .v-progress-circular { flex-shrink: 0; }
.cloud-accounts-source__empty { border: 1px dashed rgba(var(--v-theme-on-surface), .18); color: rgba(var(--v-theme-on-surface), .75); }
.cloud-accounts-source__empty > span { flex: 1; min-width: 0; }
.account-editor { display: grid; gap: 16px; padding: 14px 20px 20px !important; }
.account-editor > .v-alert { margin: 0 !important; }
.account-editor__section { display: grid; gap: 8px; }
.account-editor__label { margin: 0; font-size: .75rem; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: rgba(var(--v-theme-on-surface), .6); }

.account-editor__providers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.account-editor__provider {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 8px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), .12); border-radius: 14px; background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface)); font: inherit; cursor: pointer;
  transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.account-editor__provider:hover:not(:disabled) { border-color: rgba(var(--v-theme-on-surface), .28); transform: translateY(-1px); }
.account-editor__provider:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.account-editor__provider:disabled { opacity: .5; cursor: default; }
.account-editor__provider--active {
  border-color: var(--provider-color); background: color-mix(in srgb, var(--provider-color) 8%, rgb(var(--v-theme-surface)));
  box-shadow: 0 0 0 1px var(--provider-color) inset;
}
.account-editor__provider-icon {
  display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px;
  color: var(--provider-color); background: color-mix(in srgb, var(--provider-color) 12%, transparent);
}
.account-editor__provider-name { font-size: .8125rem; font-weight: 500; }
.account-editor__provider-check { position: absolute; top: 8px; right: 8px; color: var(--provider-color); }
.account-editor__provider-beta { position: absolute; top: 8px; left: 8px; padding: 0 6px; border-radius: 999px; font-size: .625rem; font-weight: 600; line-height: 16px; text-transform: uppercase; letter-spacing: .04em; color: rgba(var(--v-theme-on-surface), .7); background: rgba(var(--v-theme-on-surface), .08); }

.account-editor__managed {
  display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px;
  background: rgba(var(--v-theme-primary), .07); color: rgb(var(--v-theme-on-surface)); font-size: .8125rem;
}
.account-editor__managed .v-icon { color: rgb(var(--v-theme-primary)); margin-top: 1px; }
.account-editor__managed p { margin: 2px 0 0; color: rgba(var(--v-theme-on-surface), .7); }

.account-editor__oauth { display: grid; gap: 14px; padding: 14px; border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: 14px; }
.account-editor__oauth--collapsible:not([open]) { gap: 0; }
.account-editor__oauth > summary { cursor: pointer; font-size: .8125rem; font-weight: 500; color: rgb(var(--v-theme-primary)); }
.account-editor__oauth-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
.account-editor__local { display: inline-flex; align-items: center; gap: 4px; font-size: .6875rem; color: rgba(var(--v-theme-on-surface), .55); }

.account-editor__steps { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; font-size: .8125rem; line-height: 1.45; }
.account-editor__steps li { display: flex; gap: 10px; align-items: flex-start; }
.account-editor__step-index {
  flex: 0 0 auto; display: grid; place-items: center; width: 20px; height: 20px; margin-top: 1px; border-radius: 50%;
  font-size: .6875rem; font-weight: 600; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12);
}
.account-editor__step-text a { display: inline-flex; align-items: center; gap: 2px; margin-left: 4px; color: rgb(var(--v-theme-primary)); text-decoration: none; font-weight: 500; }
.account-editor__step-text a:hover { text-decoration: underline; }

.account-editor__callback { display: grid; gap: 4px; }
.account-editor__callback-label { font-size: .75rem; color: rgba(var(--v-theme-on-surface), .6); }
.account-editor__callback-row {
  display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 10px; border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), .05);
}
.account-editor__callback-row code { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: .75rem; background: none; user-select: all; }

.account-editor__drop {
  display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px dashed rgba(var(--v-theme-on-surface), .25);
  border-radius: 12px; font-size: .8125rem; transition: border-color .15s ease, background-color .15s ease;
}
.account-editor__drop > span { flex: 1; min-width: 0; }
.account-editor__drop--active { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .06); }

.account-editor__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.account-editor__advanced { margin-top: 10px; font-size: .75rem; }
.account-editor__advanced summary { cursor: pointer; width: fit-content; color: rgba(var(--v-theme-on-surface), .6); }
.account-editor__redirect :deep(input) { font-family: monospace; font-size: 12px; }
.account-editor__footnote { margin: 0; font-size: .75rem; color: rgba(var(--v-theme-on-surface), .55); }
.account-toolbar :deep(.v-btn) { box-shadow: none; font-size: 12px; }
@media (max-width: 480px) {
  .account-editor { padding-inline: 14px !important; }
  .account-editor__fields { grid-template-columns: minmax(0, 1fr); }
  .account-editor__provider { padding: 12px 4px 10px; }
  .account-editor__drop { flex-wrap: wrap; }
}
</style>
