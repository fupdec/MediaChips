import {describe, expect, it} from 'vitest'
import {
  isLikelyContainerBridgeIp,
  isUsableLanAddress,
  pickPublicHost,
} from './publicHost'

describe('publicHost', () => {
  it('detects docker-style bridge addresses', () => {
    expect(isLikelyContainerBridgeIp('172.19.0.2')).toBe(true)
    expect(isLikelyContainerBridgeIp('192.168.1.50')).toBe(false)
  })

  it('skips docker interface names', () => {
    expect(isUsableLanAddress('172.19.0.2', 'eth0')).toBe(true)
    expect(isUsableLanAddress('172.19.0.2', 'br-1234abcd')).toBe(false)
    expect(isUsableLanAddress('10.0.0.5', 'docker0')).toBe(false)
  })

  it('prefers MEDIA_CHIPS_PUBLIC_HOST over request/docker ips', () => {
    const host = pickPublicHost({
      getBestLocalIp: () => '172.19.0.2',
      getAllIps: () => [{address: '172.19.0.2', interface: 'eth0', mac: ''}],
    }, {
      requestHostname: 'localhost',
      envPublicHost: '192.168.1.80',
    })
    expect(host).toBe('192.168.1.80')
  })

  it('prefers 192.168 over docker bridge when listing interfaces', () => {
    const host = pickPublicHost({
      getBestLocalIp: () => '172.19.0.2',
      getAllIps: () => [
        {address: '172.19.0.2', interface: 'eth0', mac: ''},
        {address: '192.168.1.50', interface: 'eth1', mac: ''},
      ],
    }, {
      requestHostname: 'localhost',
      envPublicHost: '',
    })
    expect(host).toBe('192.168.1.50')
  })

  it('uses non-loopback request hostname when present', () => {
    const host = pickPublicHost({
      getBestLocalIp: () => '172.19.0.2',
      getAllIps: () => [{address: '172.19.0.2', interface: 'eth0', mac: ''}],
    }, {
      requestHostname: '192.168.1.10',
      envPublicHost: '',
    })
    expect(host).toBe('192.168.1.10')
  })
})
