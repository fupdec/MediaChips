import type { AppConfig, ServerInfo } from '@/types/common'

const DEFAULT_PORT = import.meta.env.VITE_PORT || 12321

export function isViteDevProxyMode(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return false

  // Electron serves the UI from Vite but the API runs on the backend listen port
  // from config.json (possibly changed after a "port in use" prompt). The Vite
  // proxy target is fixed at startup, so Electron must call the backend directly.
  if (window.electronAPI) return false

  const vitePort = String(import.meta.env.VITE_DEV_SERVER_PORT || 3000)
  const currentPort = window.location.port
    || (window.location.protocol === 'https:' ? '443' : '80')

  return currentPort === vitePort
}

export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return true
  const normalized = String(host).trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '0.0.0.0'
}

export function getLocalBackendUrl(port: number | string = DEFAULT_PORT): string {
  return `http://127.0.0.1:${port}`
}

type LanShareConfig = AppConfig & {
  allowLanAccess?: boolean | string | number
  ips?: string[]
  serverInfo?: { webUrl?: string }
}

function isLanAccessEnabledInConfig(config: LanShareConfig): boolean {
  const value = config.allowLanAccess
  return value === true
    || value === 1
    || value === '1'
    || value === 'true'
}

function isLikelyContainerBridgeIp(address: string): boolean {
  const match = /^172\.(\d+)\./.exec(address)
  if (!match) return false
  const second = Number(match[1])
  return second >= 16 && second <= 31
}

function isShareableLanHost(host: string | null | undefined): boolean {
  if (!host || isLoopbackHost(host)) return false
  return !isLikelyContainerBridgeIp(host)
}

/** URL other devices should open. Never returns Electron's localhost origin. */
export function resolveLanShareUrl(config: LanShareConfig = {}): string | null {
  if (!isLanAccessEnabledInConfig(config)) return null

  const port = config.port || DEFAULT_PORT
  const webUrl = config.serverInfo?.webUrl?.replace(/\/$/, '')
  if (webUrl) {
    try {
      const host = new URL(webUrl).hostname
      if (isShareableLanHost(host)) return webUrl
    } catch {
      // ignore invalid webUrl
    }
  }

  if (isShareableLanHost(config.ip)) {
    return `http://${config.ip}:${port}`
  }

  const lanIp = (config.ips || []).find((ip) => isShareableLanHost(ip))
  if (lanIp) return `http://${lanIp}:${port}`

  // Browser opened via real LAN IP — reuse it for the share banner.
  if (typeof window !== 'undefined' && isShareableLanHost(window.location.hostname)) {
    return window.location.origin.replace(/\/$/, '')
  }

  return null
}

export function resolveApiBaseUrl(config: AppConfig = {}, serverInfo: ServerInfo | null = null): string {
  if (isViteDevProxyMode()) {
    return ''
  }

  // Electron always reaches the embedded backend over loopback, even when the UI
  // is loaded from the Vite dev server on another port.
  if (typeof window !== 'undefined' && window.electronAPI) {
    return getLocalBackendUrl(config.port || DEFAULT_PORT)
  }

  if (serverInfo?.url) {
    return serverInfo.url.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined') {
    const { protocol, port, origin } = window.location
    const appPort = String(config.port || DEFAULT_PORT)

    if (['http:', 'https:'].includes(protocol) && port === appPort) {
      return origin.replace(/\/$/, '')
    }

    // Docker/Synology often publish the container on a host port that differs from
    // the in-container FIXED_PORT written into config.json. Prefer the page origin.
    if (!import.meta.env.DEV && ['http:', 'https:'].includes(protocol)) {
      return origin.replace(/\/$/, '')
    }
  }

  const ip = config.ip || 'localhost'
  const port = config.port || DEFAULT_PORT
  return `http://${ip}:${port}`
}

export function resolveDirectBackendUrl(
  config: AppConfig = {},
  serverInfo: ServerInfo | null = null,
): string {
  if (isViteDevProxyMode()) {
    const port = config.port || DEFAULT_PORT
    return `http://localhost:${port}`
  }

  return resolveApiBaseUrl(config, serverInfo)
}
