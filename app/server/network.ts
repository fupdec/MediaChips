import os from 'os'
import { isDockerLikeInterface, isLikelyContainerBridgeIp, isUsableLanAddress } from './publicHost'

type NetworkInterfaces = Record<string, import('os').NetworkInterfaceInfo[] | undefined>

function getBestLocalIp() {
  const interfaces = os.networkInterfaces() as NetworkInterfaces
  const preferredOrder = [
    'en0', 'eth0', 'wlan0',
    'en1', 'en2', 'en3',
    'bridge100', 'bridge0',
  ]

  const ipPriority = [
    '192.168.',
    '10.',
    '172.16.',
    '169.254.',
  ]

  const allIps = []
  for (const [name, ifaces] of Object.entries(interfaces)) {
    if (!ifaces) continue
    if (isDockerLikeInterface(name)) continue
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        allIps.push({
          address: iface.address,
          interface: name,
          mac: iface.mac,
          isLinkLocal: iface.address.startsWith('169.254.'),
          isContainerBridge: isLikelyContainerBridgeIp(iface.address),
        })
      }
    }
  }

  for (const ifaceName of preferredOrder) {
    const interfaceIp = allIps.find(ip =>
      ip.interface === ifaceName && !ip.isLinkLocal && !ip.isContainerBridge)
    if (interfaceIp) {
      console.log(`Selected IP ${interfaceIp.address} by interface priority ${ifaceName}`)
      return interfaceIp.address
    }
  }

  const lanIps = allIps.filter(ip => isUsableLanAddress(ip.address, ip.interface) && !ip.isContainerBridge)
  for (const prefix of ipPriority) {
    const matchingIp = lanIps.find(ip => ip.address.startsWith(prefix))
    if (matchingIp) {
      console.log(`Selected IP ${matchingIp.address} by prefix ${prefix}`)
      return matchingIp.address
    }
  }

  if (lanIps.length > 0) {
    console.log(`Selected first usable LAN IP: ${lanIps[0].address}`)
    return lanIps[0].address
  }

  // Last resort: docker bridge IP (still better than nothing for diagnostics).
  const anyUsable = allIps.filter(ip => isUsableLanAddress(ip.address, ip.interface))
  if (anyUsable.length > 0) {
    console.log(`Only container/bridge IPs available, selected: ${anyUsable[0].address}`)
    return anyUsable[0].address
  }

  if (allIps.length > 0) {
    console.log(`All IPs are link-local, selected: ${allIps[0].address}`)
    return allIps[0].address
  }

  console.log('No IP found, using localhost')
  return '127.0.0.1'
}

function getAllIps() {
  const interfaces = os.networkInterfaces() as NetworkInterfaces
  const ips = []

  for (const [name, ifaces] of Object.entries(interfaces)) {
    if (!ifaces) continue
    if (isDockerLikeInterface(name)) continue
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({
          address: iface.address,
          interface: name,
          mac: iface.mac,
          netmask: iface.netmask,
          cidr: iface.cidr ?? undefined,
        })
      }
    }
  }

  return ips
}

export { getBestLocalIp, getAllIps }
