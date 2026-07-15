import type { NetworkIpInfo } from '../types/server'
import { isLoopbackHost } from './constants'

const DOCKER_IFACE = /^(docker\d*|br-|veth|cni|flannel|tunl|cbr|lxc|podman)/i

/** Docker default / compose bridges commonly land in 172.16–31. Prefer real LAN first. */
function isLikelyContainerBridgeIp(address: string): boolean {
  const match = /^172\.(\d+)\./.exec(address)
  if (!match) return false
  const second = Number(match[1])
  return second >= 16 && second <= 31
}

function isDockerLikeInterface(name: string): boolean {
  return DOCKER_IFACE.test(name)
}

export function isUsableLanAddress(address: string, ifaceName = ''): boolean {
  if (!address || isLoopbackHost(address)) return false
  if (ifaceName && isDockerLikeInterface(ifaceName)) return false
  if (address.startsWith('169.254.')) return false
  return true
}

export function pickPublicHost(
  helpers: {
    getBestLocalIp: () => string
    getAllIps: () => NetworkIpInfo[]
  },
  options: {
    requestHostname?: string | null
    envPublicHost?: string | null
  } = {},
): string {
  const fromEnv = (options.envPublicHost ?? process.env.MEDIA_CHIPS_PUBLIC_HOST ?? '').trim()
  if (fromEnv && !isLoopbackHost(fromEnv)) {
    return fromEnv.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
  }

  const requestHost = (options.requestHostname || '').trim()
  if (requestHost && !isLoopbackHost(requestHost) && !isLikelyContainerBridgeIp(requestHost)) {
    return requestHost
  }

  const ranked = helpers.getAllIps()
    .filter((entry) => isUsableLanAddress(entry.address, entry.interface))
    .sort((a, b) => scoreLanIp(a.address) - scoreLanIp(b.address))

  // Prefer classic home LAN over Docker-ish 172.x when both exist.
  const preferred = ranked.find((entry) => !isLikelyContainerBridgeIp(entry.address))
  if (preferred) return preferred.address

  if (ranked.length > 0) return ranked[0].address

  const fallback = helpers.getBestLocalIp()
  if (fallback && !isLoopbackHost(fallback) && !isLikelyContainerBridgeIp(fallback)) {
    return fallback
  }

  return requestHost || fallback || 'localhost'
}

function scoreLanIp(address: string): number {
  if (address.startsWith('192.168.')) return 0
  if (address.startsWith('10.')) return 1
  if (isLikelyContainerBridgeIp(address)) return 50
  return 10
}

export {
  isLikelyContainerBridgeIp,
  isDockerLikeInterface,
}
