<template>
  <AutoConnect
    v-if="!isConnected && !isDevBrowser"
    @connected="handleServerConnected"
    @manual-mode="showManual = true"
  ></AutoConnect>
  <div
    v-else-if="!isConfigLoaded"
    class="dev-connecting"
  >
    <v-progress-circular indeterminate size="64" width="2"/>
  </div>
  <app-preloader v-else/>
</template>

<script setup lang="ts">
import {ref, onMounted, provide, type Ref} from "vue"
import AppPreloader from "@/AppPreloader.vue"
import path from "path-browserify"
import {useAppStore} from "@/stores/app"
import AutoConnect from "@/AutoConnect.vue"
import {resolveApiBaseUrl} from "@/utils/apiBaseUrl"
import type {AppConfig, ServerConfigPayload, ServerInfo} from "@/types/common"

const isConfigLoaded = ref(false)
const app = useAppStore()

const isConnected = ref(false)
const currentServer: Ref<ServerInfo | null> = ref(null)
const showManual = ref(false)
const isDevBrowser = import.meta.env.DEV && !window.electronAPI
let connectInFlight: Promise<void> | null = null
let electronConfigListenerBound = false

// Dedicated player window is Electron-only.
const isPlayerWindow = ref(
  window.location.search.includes('player=true') && Boolean(window.electronAPI)
)

// Make current server available to all components
provide('currentServer', currentServer);

onMounted(() => {
  const currentOriginServer = getCurrentOriginServer()
  if (currentOriginServer) {
    console.log('🌐 Using current origin as server:', currentOriginServer.url);
    handleServerConnected(currentOriginServer);
    return;
  }

  // Vite dev server (port 3000) serves UI separately from the API backend.
  if (import.meta.env.DEV && !window.electronAPI) {
    tryConnectToDevBackend();
    return;
  }

  // If this is a player window, use simpler connection logic
  if (isPlayerWindow.value) {
    console.log('🔵 Player window: skipping auto-connect');
    // For player, use localhost immediately
    const serverInfo = {
      url: 'http://localhost:' + (import.meta.env.VITE_PORT || 12321),
      ip: 'localhost'
    };
    handleServerConnected(serverInfo);
    return;
  }

  restoreLastServerConnection()
});

function tryConnectToDevBackend() {
  const backendPort = import.meta.env.VITE_PORT || 12321
  const server = {
    url: `http://localhost:${backendPort}`,
    ip: 'localhost',
  }

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
    const server = JSON.parse(lastServer)
    checkServerAvailability(server).then((available) => {
      if (available) {
        handleServerConnected(server)
      }
    })
  } catch (e) {
    console.warn('Failed to restore connection:', e)
  }
}

function getCurrentOriginServer() {
  const fixedPort = String(import.meta.env.VITE_PORT || 12321)

  if (!['http:', 'https:'].includes(window.location.protocol)) {
    return null
  }

  // Vite dev server runs on a different port, so only accept the app server.
  if (window.location.port !== fixedPort) {
    return null
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
  const serverUrl = serverInfo?.url
    || `http://${serverInfo?.ip || 'localhost'}:${import.meta.env.VITE_PORT || 12321}`

  if (
    connectInFlight
    || (isConnected.value && currentServer.value?.url === serverUrl && isConfigLoaded.value)
  ) {
    return connectInFlight
  }

  connectInFlight = (async () => {
    currentServer.value = {...serverInfo, url: serverUrl}
    isConnected.value = true

    if (!isPlayerWindow.value) {
      localStorage.setItem('lastServer', JSON.stringify(currentServer.value))
    }

    await initializeApp(currentServer.value)
  })()

  return connectInFlight.finally(() => {
    connectInFlight = null
  })
}

async function initializeApp(server: ServerInfo) {
  console.log('🚀 Initializing app with server:', server.ip);

  if (isPlayerWindow.value) {
    app.localhost = resolveApiBaseUrl({}, server)
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
    console.log('⏳ Loading config from Electron...');

    if (!electronConfigListenerBound) {
      electronConfigListenerBound = true
      window.electronAPI?.on?.("config", (config: unknown) => {
        if (!isConfigLoaded.value || isPlayerWindow.value) {
          console.log('✅ Config received from Electron');
          applyConfig(config as ServerConfigPayload);
        }
      });
    }

    try {
      const config = await window.electronAPI?.invoke?.('get-config');
      if (config) {
        console.log('✅ Config received via get-config');
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
    console.log('🌐 Browser mode: loading config from server');
    await fetchConfigFromServer();
  }
}

async function fetchConfigFromServer() {
  if (isConfigLoaded.value) {
    return
  }

  try {
    console.log('🔄 Requesting config from server...');
    // Use current server URL or localhost for player
    const baseUrl = currentServer.value?.url || `http://localhost:${import.meta.env.VITE_PORT || 12321}`;
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

  app.localhost = resolveApiBaseUrl(config as AppConfig, currentServer.value)
  app.appVersion = config.appVersion ?? ''
  app.dbPath = config.path ?? ''
  app.mediaPath = path.join(config.path ?? '', 'media')
  app.databases = config.databases ?? []
  app.config = config

  if (!wasLoaded) {
    console.log('✅ Config applied:', config)
    isConfigLoaded.value = true
  }
}

// Periodic connection check (main window only)
if (!isPlayerWindow.value) {
  setInterval(() => {
    if (isConnected.value && currentServer.value) {
      checkServerAvailability(currentServer.value).then(available => {
        if (!available) {
          console.warn('⚠️ Connection to server lost');
          isConnected.value = false;
          // Attempt reconnection
          setTimeout(() => {
            const lastServer = localStorage.getItem('lastServer');
            if (lastServer) {
              try {
                const server = JSON.parse(lastServer);
                checkServerAvailability(server).then(available => {
                  if (available) {
                    handleServerConnected(server);
                  }
                });
              } catch (_e) {
                // Handle error
              }
            }
          }, 5000);
        }
      });
    }
  }, 30000);
}
</script>

<style scoped>
.dev-connecting {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}
</style>