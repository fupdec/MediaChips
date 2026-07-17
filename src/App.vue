<template>
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
    <p v-if="isElectronHost && reconnectHint" class="reconnect-hint">{{ reconnectHint }}</p>
  </div>
  <app-preloader v-else/>
</template>

<script setup lang="ts">
import {ref, onMounted, onBeforeUnmount, provide, type Ref} from "vue"
import AppPreloader from "@/AppPreloader.vue"
import path from "path-browserify"
import {useAppStore} from "@/stores/app"
import AutoConnect from "@/AutoConnect.vue"
import {getLocalBackendUrl, resolveDirectBackendUrl} from "@/utils/apiBaseUrl"
import type {AppConfig, ServerConfigPayload, ServerInfo} from "@/types/common"

const FIXED_PORT = import.meta.env.VITE_PORT || 12321
const PING_INTERVAL_MS = 30000
const PING_FAILURES_BEFORE_DISCONNECT = 3
const RECONNECT_INTERVAL_MS = 2000

const isConfigLoaded = ref(false)
const app = useAppStore()

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
let connectInFlight: Promise<void> | null = null
let electronConfigListenerBound = false
let consecutivePingFailures = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let healthCheckTimer: ReturnType<typeof setInterval> | null = null

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
  stopReconnectLoop()
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

function handleServerConnected(serverInfo: ServerInfo) {
  const normalized = normalizeServerInfo(serverInfo)
  const serverUrl = normalized.url
    || `http://${normalized.ip || '127.0.0.1'}:${FIXED_PORT}`

  if (
    connectInFlight
    || (isConnected.value && currentServer.value?.url === serverUrl && isConfigLoaded.value)
  ) {
    return connectInFlight
  }

  stopReconnectLoop()
  consecutivePingFailures = 0
  reconnectHint.value = ''

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
    reconnectHint.value = isElectronHost
      ? 'Reconnecting to local server…'
      : 'Reconnecting…'

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

  // Electron hosts the API in-process. Never swap to LAN AutoConnect / white screen —
  // keep the UI mounted and wait for the next successful ping after transient downtime
  // (e.g. LAN bind restart).
  if (isElectronHost) {
    reconnectHint.value = ''
    return
  }

  isConnected.value = false
  startReconnectLoop()
}

// Periodic connection check (main window only)
if (!isPlayerWindow.value) {
  healthCheckTimer = setInterval(() => {
    if (!isConnected.value || !currentServer.value) return

    checkServerAvailability(currentServer.value).then(available => {
      if (available) {
        consecutivePingFailures = 0
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
