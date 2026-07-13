import type { AppConfig, ServerInfo } from '@/types/common'

const DEFAULT_PORT = import.meta.env.VITE_PORT || 12321

export function isViteDevProxyMode(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return false

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

/** URL other devices should open. Never returns Electron's localhost origin. */
export function resolveLanShareUrl(config: LanShareConfig = {}): string | null {
  if (!isLanAccessEnabledInConfig(config)) return null

  const port = config.port || DEFAULT_PORT
  const webUrl = config.serverInfo?.webUrl?.replace(/\/$/, '')
  if (webUrl) {
    try {
      const host = new URL(webUrl).hostname
      if (!isLoopbackHost(host)) return webUrl
    } catch {
      // ignore invalid webUrl
    }
  }

  if (config.ip && !isLoopbackHost(config.ip)) {
    return `http://${config.ip}:${port}`
  }

  const lanIp = (config.ips || []).find((ip) => !isLoopbackHost(ip))
  if (lanIp) return `http://${lanIp}:${port}`

  return null
}

export function resolveApiBaseUrl(config: AppConfig = {}, serverInfo: ServerInfo | null = null): string {
  if (isViteDevProxyMode()) {
    return ''
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
