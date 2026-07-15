<template>
  <div class="auto-connect">
    <!-- Auto search -->
    <div v-if="status === 'searching'" class="searching">
      <div class="spinner"></div>
      <p>🔍 Searching for server in local network...</p>
      <p class="hint">Checking addresses: {{ currentSearchIp }}</p>
      <div class="progress">
        <div class="progress-bar" :style="{ width: scanProgress + '%' }"></div>
      </div>
      <p class="progress-text">{{ scannedCount }} of {{ totalToScan }} addresses</p>
    </div>

    <!-- Server found -->
    <div v-else-if="status === 'connected' && serverInfo" class="connected">
      <div class="success-message">
        <h3>✅ Connected to server</h3>
        <div class="server-info">
          <p><strong>Address:</strong> {{ serverInfo.ip }}</p>
          <p><strong>Response time:</strong> {{ serverInfo.responseTime }}ms</p>
          <p><strong>Status:</strong> {{ serverInfo.status }}</p>
        </div>
        <button @click="disconnect" class="btn-secondary">Disconnect</button>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="error">
      <h3>❌ Server not found</h3>
      <p>Could not detect server in local network.</p>

      <div class="suggestions">
        <h4>Possible solutions:</h4>
        <ul>
          <li>Make sure the server is running</li>
          <li>Check that the computer is on the same network</li>
        </ul>
      </div>

      <div class="actions">
        <button @click="startDiscovery" class="btn-primary">
          Retry search
        </button>
      </div>
    </div>

    <!-- Manual input -->
    <div v-else-if="status === 'manual'" class="manual">
      <h3>⚙️ Manual setup</h3>
      <div class="input-group">
        <label>Server IP address:</label>
        <input
          v-model="manualIp"
          placeholder="192.168.1.100"
          @keyup.enter="connectManual"
        />
      </div>
      <div class="input-group">
        <label>Port:</label>
        <input
          v-model="manualPort"
          type="number"
          value="12321"
          disabled
        />
        <small class="hint">Port is fixed (12321)</small>
      </div>

      <div class="actions">
        <button @click="connectManual" class="btn-primary">
          Connect
        </button>
        <button @click="startDiscovery" class="btn-secondary">
          Auto search
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import LanServerDiscovery from '../app/LanServerDiscovery';

const emit = defineEmits(['connected', 'manual-mode']);

const status = ref('searching'); // searching, connected, error, manual
interface ServerDiscoveryResult {
  success: boolean
  ip?: string
  url?: string
  apiUrl?: string
  responseTime?: number
  status?: string | number
  timestamp?: string
}

const serverInfo = ref<ServerDiscoveryResult | null>(null);
const currentSearchIp = ref('');
const scanProgress = ref(0);
const scannedCount = ref(0);
const totalToScan = ref(50); // Approximate count
const manualIp = ref('');
const manualPort = ref('12321');

// Start search on load
onMounted(() => {
  startDiscovery();
});

async function startDiscovery() {
  status.value = 'searching';
  scanProgress.value = 0;
  scannedCount.value = 0;

  // If Express already serves this page, connect immediately (Docker remap friendly).
  if (['http:', 'https:'].includes(window.location.protocol) && !import.meta.env.DEV) {
    try {
      const originUrl = window.location.origin
      const response = await fetch(`${originUrl}/api/ping`, {
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        const result = {
          success: true,
          ip: window.location.hostname || 'localhost',
          url: originUrl,
          apiUrl: `${originUrl}/api`,
          responseTime: 0,
          status: 'online',
          timestamp: new Date().toISOString(),
        }
        serverInfo.value = result
        status.value = 'connected'
        emit('connected', result)
        localStorage.setItem('lastServer', JSON.stringify(result))
        return
      }
    } catch {
      // fall through to LAN discovery
    }
  }

  // Progress simulation
  const progressInterval = setInterval(() => {
    if (scanProgress.value < 90) {
      scanProgress.value += 10;
    }
  }, 300);

  const scannedInterval = setInterval(() => {
    if (scannedCount.value < 50) {
      scannedCount.value += 1;
    }
  }, 60);

  try {
    const result = await LanServerDiscovery.discoverServer();

    clearInterval(progressInterval);
    clearInterval(scannedInterval);
    scanProgress.value = 100;
    scannedCount.value = 50;

    if (result.success) {
      serverInfo.value = result as ServerDiscoveryResult;
      status.value = 'connected';
      emit('connected', result);

      // Save to localStorage
      localStorage.setItem('lastServer', JSON.stringify(result));
    } else {
      status.value = 'error';
    }
  } catch (error) {
    console.error('Error searching for server:', error);
    status.value = 'error';
  }
}

async function connectManual() {
  if (!manualIp.value) return;

  status.value = 'searching';

  const result = await LanServerDiscovery.checkServer(manualIp.value);

  if (result.success) {
    serverInfo.value = result;
    status.value = 'connected';
    emit('connected', result);

    // Save manual settings
    localStorage.setItem('manualServer', JSON.stringify({
      ip: manualIp.value,
      port: manualPort.value,
      isManual: true
    }));
  } else {
    status.value = 'error';
  }
}

function disconnect() {
  status.value = 'searching';
  serverInfo.value = null;
  startDiscovery();
}

// Update current checking IP
// (Can extend LanServerDiscovery for callbacks)
</script>

<style scoped>
.auto-connect {
  max-width: 500px;
  margin: 40px auto;
  padding: 30px;
  border-radius: 12px;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.searching {
  text-align: center;
  padding: 20px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid #f3f3f3;
  border-top: 5px solid rgba(var(--v-theme-primary));
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.hint {
  color: #666;
  font-size: 14px;
  margin: 5px 0;
}

.progress {
  height: 10px;
  background: #f0f0f0;
  border-radius: 5px;
  margin: 20px 0;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2ecc71);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: #777;
}

.connected, .error, .manual {
  padding: 20px;
}

.server-info {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  margin: 15px 0;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  margin: 5px;
  transition: all 0.2s;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover {
  background: #2980b9;
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover {
  background: #7f8c8d;
}

.input-group {
  margin: 15px 0;
}

.input-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.input-group input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.suggestions {
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 6px;
  padding: 15px;
  margin: 20px 0;
}

.suggestions ul {
  margin: 10px 0 0 20px;
}

.actions {
  margin-top: 20px;
}
</style>