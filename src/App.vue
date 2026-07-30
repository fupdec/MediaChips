<template>
  <ConnectionStatusBanner
    :show="isServerUnavailable"
    :title="connectionBannerTitle"
    :subtitle="connectionBannerSubtitle"
    :show-restart="isElectronHost"
    :restart-label="t('systemBar.restart')"
    :restarting="isRelaunching"
    :show-cancel-auto-restart="isElectronHost && autoRelaunchSecondsLeft != null"
    :cancel-auto-restart-label="t('auto_connect.cancel_auto_restart')"
    @restart="relaunchApp"
    @cancel-auto-restart="cancelAutoRelaunch"
  />
  <AutoConnect
    v-if="!isConnected && !isDevBrowser && !isElectronHost"
    @connected="handleServerConnected"
    @manual-mode="showManual = true"
  ></AutoConnect>
  <div
    v-else-if="!isConnected || !isConfigLoaded"
    class="dev-connecting"
  >
    <v-progress-circular indeterminate size="64" width="2"/>
    <p v-if="reconnectHint" class="reconnect-hint">{{ reconnectHint }}</p>
  </div>
  <app-preloader v-else/>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, provide, type Ref} from "vue"
import {useI18n} from "vue-i18n"
import AppPreloader from "@/AppPreloader.vue"
import ConnectionStatusBanner from "@/components/app/ConnectionStatusBanner.vue"
import path from "path-browserify"
import {useAppStore} from "@/stores/app"
import AutoConnect from "@/AutoConnect.vue"
import {getLocalBackendUrl, resolveDirectBackendUrl} from "@/utils/apiBaseUrl"
import type {AppConfig, ServerConfigPayload, ServerInfo} from "@/types/common"
import {useStartupHealthNotifications} from "@/composable/useStartupHealthNotifications"

const FIXED_PORT = import.meta.env.VITE_PORT || 12321
const PING_INTERVAL_MS = 30000
const PING_FAILURES_BEFORE_DISCONNECT = 3
const RECONNECT_INTERVAL_MS = 2000
/** Auto-relaunch Electron app after this long of continuous server downtime. */
const AUTO_RELAUNCH_AFTER_MS = 5 * 60 * 1000
const AUTO_RELAUNCH_TICK_MS = 1000

const {t} = useI18n()
const isConfigLoaded = ref(false)
const app = useAppStore()
const {runStartupHealthCheck} = useStartupHealthNotifications()
let startupHealthTimer: ReturnType<typeof setTimeout> | null = null

const isDevBrowser = import.meta.env.DEV && !window.electronAPI
const isElectronHost = Boolean(window.electronAPI)

// Dedicated player window is Electron-only.
const isPlayerWindow = ref(
  window.location.search.includes('player=true') && Boolean(window.electronAPI)
)

// Resolve same-origin before first render so AutoConnect/LAN scan never mounts
// when Express already serves the page (Docker port remap included).
const initialOriginServer = !isElectronHost && !isPlayerWindow.value
  ? getCurrentOriginServer()
  : null

const isConnected = ref(Boolean(initialOriginServer) || isElectronHost || isPlayerWindow.value)
const currentServer: Ref<ServerInfo | null> = ref(
  initialOriginServer
    ? normalizeServerInfo(initialOriginServer)
    : (isElectronHost || isPlayerWindow.value ? getLocalServerInfo() : null),
)
const showManual = ref(false)
const reconnectHint = ref('')
const isServerUnavailable = ref(false)
const autoRelaunchSecondsLeft = ref<number | null>(null)
const isRelaunching = ref(false)
let connectInFlight: Promise<void> | null = null
let electronConfigListenerBound = false
let consecutivePingFailures = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let healthCheckTimer: ReturnType<typeof setInterval> | null = null
let autoRelaunchTimer: ReturnType<typeof setTimeout> | null = null
let autoRelaunchTickTimer: ReturnType<typeof setInterval> | null = null
let unavailableSinceMs: number | null = null
let autoRelaunchCancelled = false

const connectionBannerTitle = computed(() => t('auto_connect.connection_lost'))

const connectionBannerSubtitle = computed(() => {
  if (isRelaunching.value) {
    return t('auto_connect.restarting')
  }
  if (isElectronHost && autoRelaunchSecondsLeft.value != null) {
    return t('auto_connect.auto_restart_in', {seconds: autoRelaunchSecondsLeft.value})
  }
  return isElectronHost
    ? t('auto_connect.reconnecting_local')
    : t('auto_connect.reconnecting')
})

// Make current server available to all components
provide('currentServer', currentServer);

onMounted(() => {
  if (initialOriginServer) {
    handleServerConnected(normalizeServerInfo(initialOriginServer));
    return;
  }

  // Vite dev server (port 3000) serves UI separately from the API backend.
  if (import.meta.env.DEV && !window.electronAPI) {
    tryConnectToDevBackend();
    return;
  }

  // Electron host (and player window): always use loopback — never LAN discovery.
  if (isElectronHost || isPlayerWindow.value) {
    handleServerConnected(getLocalServerInfo())
    return
  }

  restoreLastServerConnection()
});

onBeforeUnmount(() => {
  if (healthCheckTimer) clearInterval(healthCheckTimer)
  if (startupHealthTimer) clearTimeout(startupHealthTimer)
  stopReconnectLoop()
  clearAutoRelaunchTimers()
})

function getLocalServerInfo(): ServerInfo {
  const port = app.config?.port || FIXED_PORT
  return {
    url: getLocalBackendUrl(port),
    ip: '127.0.0.1',
  }
}

function normalizeServerInfo(server: ServerInfo): ServerInfo {
  const url = server.url || `http://${server.ip || '127.0.0.1'}:${FIXED_PORT}`
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1'
      return {url: parsed.origin, ip: '127.0.0.1'}
    }
  } catch {
    // keep as-is
  }
  return {...server, url}
}

function tryConnectToDevBackend() {
  const server = getLocalServerInfo()

  checkServerAvailability(server).then((available) => {
    if (available) {
      handleServerConnected(server)
      return
    }

    restoreLastServerConnection()
  })
}

function restoreLastServerConnection() {
  const lastServer = localStorage.getItem('lastServer')
  if (!lastServer) return

  try {
    const server = normalizeServerInfo(JSON.parse(lastServer))
    // Remote clients may have cached a LAN IP; Electron must prefer loopback.
    if (isElectronHost) {
      handleServerConnected(getLocalServerInfo())
      return
    }
    checkServerAvailability(server).then((available) => {
      if (available) {
        handleServerConnected(server)
      }
    })
  } catch (e) {
    console.warn('Failed to restore connection:', e)
  }
}

function getCurrentOriginServer(): ServerInfo | null {
  if (typeof window === 'undefined') {
    return null
  }

  if (!['http:', 'https:'].includes(window.location.protocol)) {
    return null
  }

  // Vite DEV serves UI on another port (e.g. 3000); only trust same-origin there
  // when it already matches the backend port. Production Express (including Docker
  // published on a remapped host port like 12322→12321) always serves API + UI
  // from the current origin.
  if (import.meta.env.DEV) {
    const fixedPort = String(FIXED_PORT)
    if (window.location.port && window.location.port !== fixedPort) {
      return null
    }
  }

  return {
    url: window.location.origin,
    ip: window.location.hostname || 'localhost'
  }
}

async function checkServerAvailability(server: ServerInfo) {
  try {
    const response = await fetch(`${server.url}/api/ping`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch (error) {
    console.warn('Server unavailable:', error);
    return false;
  }
}

function clearAutoRelaunchTimers() {
  if (autoRelaunchTimer) {
    clearTimeout(autoRelaunchTimer)
    autoRelaunchTimer = null
  }
  if (autoRelaunchTickTimer) {
    clearInterval(autoRelaunchTickTimer)
    autoRelaunchTickTimer = null
  }
  autoRelaunchSecondsLeft.value = null
  unavailableSinceMs = null
}

function cancelAutoRelaunch() {
  autoRelaunchCancelled = true
  clearAutoRelaunchTimers()
}

function scheduleAutoRelaunch() {
  if (!isElectronHost || autoRelaunchCancelled || autoRelaunchTimer) return

  unavailableSinceMs = Date.now()
  autoRelaunchSecondsLeft.value = Math.ceil(AUTO_RELAUNCH_AFTER_MS / 1000)

  autoRelaunchTickTimer = setInterval(() => {
    if (unavailableSinceMs == null) return
    const left = Math.max(
      0,
      Math.ceil((AUTO_RELAUNCH_AFTER_MS - (Date.now() - unavailableSinceMs)) / 1000),
    )
    autoRelaunchSecondsLeft.value = left
  }, AUTO_RELAUNCH_TICK_MS)

  autoRelaunchTimer = setTimeout(() => {
    void relaunchApp()
  }, AUTO_RELAUNCH_AFTER_MS)
}

async function relaunchApp() {
  if (!isElectronHost || isRelaunching.value) return
  if (!window.electronAPI?.invoke) return

  isRelaunching.value = true
  clearAutoRelaunchTimers()
  try {
    await window.electronAPI.invoke('relaunch')
  } catch (error) {
    console.error('Failed to relaunch application:', error)
    isRelaunching.value = false
  }
}

function markServerAvailable() {
  consecutivePingFailures = 0
  if (!isServerUnavailable.value && !reconnectHint.value) return

  isServerUnavailable.value = false
  reconnectHint.value = ''
  autoRelaunchCancelled = false
  clearAutoRelaunchTimers()
  stopReconnectLoop()
}

function markServerUnavailable() {
  if (isServerUnavailable.value) return

  isServerUnavailable.value = true
  reconnectHint.value = isElectronHost
    ? t('auto_connect.reconnecting_local')
    : t('auto_connect.reconnecting')
  scheduleAutoRelaunch()
}

function handleServerConnected(serverInfo: ServerInfo) {
  const normalized = normalizeServerInfo(serverInfo)
  const serverUrl = normalized.url
    || `http://${normalized.ip || '127.0.0.1'}:${FIXED_PORT}`

  markServerAvailable()

  if (
    connectInFlight
    || (isConnected.value && currentServer.value?.url === serverUrl && isConfigLoaded.value)
  ) {
    return connectInFlight
  }

  connectInFlight = (async () => {
    currentServer.value = {...normalized, url: serverUrl}
    isConnected.value = true

    if (!isPlayerWindow.value && !isElectronHost) {
      localStorage.setItem('lastServer', JSON.stringify(currentServer.value))
    }

    await initializeApp(currentServer.value)
  })()

  return connectInFlight.finally(() => {
    connectInFlight = null
  })
}

async function initializeApp(server: ServerInfo) {
  if (isPlayerWindow.value) {
    app.localhost = resolveDirectBackendUrl({}, server)
    await loadConfig()
    if (!isConfigLoaded.value) {
      await fetchConfigFromServer()
    }
    return
  }

  await loadConfig()
}

async function loadConfig() {
  // --- Electron mode ---
  if (window.electronAPI) {
    if (!electronConfigListenerBound) {
      electronConfigListenerBound = true
      window.electronAPI?.on?.("config", (config: unknown) => {
        if (!isConfigLoaded.value || isPlayerWindow.value) {
          applyConfig(config as ServerConfigPayload);
        }
      });
    }

    try {
      const config = await window.electronAPI?.invoke?.('get-config');
      if (config) {
        applyConfig(config as ServerConfigPayload);
        return;
      }
    } catch (error) {
      console.warn('⚠️ Failed to load config via get-config:', error);
    }

    if (!isConfigLoaded.value) {
      setTimeout(() => {
        if (!isConfigLoaded.value) {
          console.warn('⚠️ Config not received via IPC, falling back to HTTP');
          fetchConfigFromServer();
        }
      }, 1500);
    }

    // --- Browser mode ---
  } else {
    await fetchConfigFromServer();
  }
}

async function fetchConfigFromServer() {
  if (isConfigLoaded.value) {
    return
  }

  try {
    // Use current server URL or localhost for player
    const baseUrl = currentServer.value?.url || getLocalBackendUrl(FIXED_PORT);
    const response = await fetch(`${baseUrl}/api/config`);

    if (response.ok) {
      const config = await response.json();
      applyConfig(config);
    } else {
      console.error('❌ Error getting config');
      // For player, try again after 2 seconds
      if (isPlayerWindow.value) {
        setTimeout(fetchConfigFromServer, 2000);
      }
    }
  } catch (error) {
    console.error('❌ Network error while getting config:', error);
    // Retry for player
    if (isPlayerWindow.value) {
      setTimeout(fetchConfigFromServer, 2000);
    }
  }
}

function applyConfig(config: ServerConfigPayload) {
  const wasLoaded = isConfigLoaded.value

  app.localhost = resolveDirectBackendUrl(config as AppConfig, currentServer.value)
  app.appVersion = config.appVersion ?? ''
  app.dbPath = config.path ?? ''
  app.mediaPath = path.join(config.path ?? '', 'media')
  app.databases = config.databases ?? []
  app.config = config

  const port = config.port
  if (isElectronHost && (typeof port === 'number' || typeof port === 'string') && port !== '') {
    currentServer.value = {
      url: getLocalBackendUrl(port),
      ip: '127.0.0.1',
    }
  }

  if (!wasLoaded) {
    isConfigLoaded.value = true
    if (!isPlayerWindow.value) {
      if (startupHealthTimer) clearTimeout(startupHealthTimer)
      startupHealthTimer = setTimeout(() => {
        startupHealthTimer = null
        void runStartupHealthCheck(app.config?.id ?? null)
      }, 2500)
    }
  }
}

function stopReconnectLoop() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function startReconnectLoop() {
  if (reconnectTimer) return

  const attempt = async () => {
    if (!isServerUnavailable.value && isConnected.value) {
      reconnectTimer = null
      return
    }

    reconnectHint.value = isElectronHost
      ? t('auto_connect.reconnecting_local')
      : t('auto_connect.reconnecting')

    const candidates: ServerInfo[] = isElectronHost
      ? [getLocalServerInfo()]
      : [
          getLocalServerInfo(),
          currentServer.value,
          (() => {
            try {
              const raw = localStorage.getItem('lastServer')
              return raw ? normalizeServerInfo(JSON.parse(raw)) : null
            } catch {
              return null
            }
          })(),
        ].filter(Boolean) as ServerInfo[]

    for (const server of candidates) {
      if (await checkServerAvailability(server)) {
        await handleServerConnected(server)
        return
      }
    }

    reconnectTimer = setTimeout(attempt, RECONNECT_INTERVAL_MS)
  }

  void attempt()
}

function handleServerUnavailable() {
  consecutivePingFailures += 1
  if (consecutivePingFailures < PING_FAILURES_BEFORE_DISCONNECT) {
    console.warn(`⚠️ Server ping failed (${consecutivePingFailures}/${PING_FAILURES_BEFORE_DISCONNECT})`)
    return
  }

  console.warn('⚠️ Connection to server lost')
  markServerUnavailable()

  // Electron hosts the API in-process. Keep the UI mounted and reconnect in the
  // background (e.g. transient downtime during LAN bind restart).
  if (isElectronHost) {
    startReconnectLoop()
    return
  }

  isConnected.value = false
  startReconnectLoop()
}

// Periodic connection check (main window only)
if (!isPlayerWindow.value) {
  healthCheckTimer = setInterval(() => {
    if (!currentServer.value) return
    // While disconnected in browser mode, reconnect loop owns recovery.
    if (!isConnected.value && !isElectronHost) return

    checkServerAvailability(currentServer.value).then(available => {
      if (available) {
        if (isServerUnavailable.value) {
          void handleServerConnected(currentServer.value!)
        } else {
          consecutivePingFailures = 0
        }
        return
      }
      handleServerUnavailable()
    })
  }, PING_INTERVAL_MS)
}
</script>

<style scoped>
.dev-connecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 100vh;
}

.reconnect-hint {
  margin: 0;
  color: rgba(0, 0, 0, 0.6);
  font-size: 14px;
}
</style>
