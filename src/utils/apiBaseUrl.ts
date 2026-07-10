import type { AppConfig, ServerInfo } from '@/types/common'

const DEFAULT_PORT = import.meta.env.VITE_PORT || 12321

export function isViteDevProxyMode(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return false

  const vitePort = String(import.meta.env.VITE_DEV_SERVER_PORT || 3000)
  const currentPort = window.location.port
    || (window.location.protocol === 'https:' ? '443' : '80')

  return currentPort === vitePort
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
