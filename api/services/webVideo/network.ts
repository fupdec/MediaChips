import {lookup} from 'dns/promises'
import {BlockList, connect, isIP, type LookupFunction, type Socket} from 'net'
import http from 'http'
import https from 'https'
import {isPublicWebHostname} from '../../../shared/webVideo'

const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) blocked.addSubnet(address, prefix, 'ipv4')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
blocked.addSubnet('2001::', 23, 'ipv6')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
blocked.addSubnet('2002::', 16, 'ipv6')
blocked.addSubnet('3fff::', 20, 'ipv6')

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6')
}

export async function resolvePublicHost(host: string) {
  if (!isPublicWebHostname(host)) throw new Error('Only public web hosts are supported.')
  const addresses = await lookup(host, {all: true, verbatim: true})
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new Error('Private or reserved web addresses are not supported.')
  }
  return addresses
}

/** Validate DNS at connection time and use that exact answer (including every redirect). */
export const publicLookup: LookupFunction = (host, options, callback) => {
  resolvePublicHost(host).then(addresses => {
    const candidates = options.family ? addresses.filter(item => item.family === options.family) : addresses
    if (!candidates.length) { callback(new Error('No public address for this family.'), '', 4); return }
    if (options.all) callback(null, candidates)
    else callback(null, candidates[0].address, candidates[0].family)
  }, error => callback(error, '', 4))
}

export const publicHttpsAgent = new https.Agent({lookup: publicLookup})

/** yt-dlp follows embeds and redirects itself; constrain those connections as well. */
export async function startExtractionProxy() {
  const sockets = new Set<Socket>()
  const track = (socket: Socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.setTimeout(30_000, () => socket.destroy())
    return socket
  }
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '')
      if (url.protocol !== 'http:' || url.port || url.username || url.password || !isPublicWebHostname(url.hostname)) {
        res.writeHead(403).end(); return
      }
      // Never forward credentials or connection-specific proxy headers.
      const headers: http.OutgoingHttpHeaders = {...req.headers, host: url.host}
      delete headers['proxy-authorization']
      delete headers['proxy-connection']
      delete headers.connection
      const upstream = http.request(url, {method: req.method, headers, lookup: publicLookup, agent: false}, response => {
        res.writeHead(response.statusCode || 502, response.headers)
        response.pipe(res)
      })
      upstream.on('socket', track)
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
      res.on('close', () => upstream.destroy())
      req.pipe(upstream)
    } catch { res.writeHead(403).end() }
  })
  server.on('connection', track)
  server.on('connect', (req, client, head) => {
    client.on('error', () => client.destroy())
    try {
      const target = new URL(`https://${req.url}`)
      if (target.port || target.username || target.password || target.pathname !== '/' || target.search || target.hash
        || !isPublicWebHostname(target.hostname)) {
        throw new Error('Invalid tunnel destination.')
      }
      const upstream = track(connect({host: target.hostname, port: 443, lookup: publicLookup, autoSelectFamily: true}))
      upstream.on('error', () => client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'))
      client.on('error', () => upstream.destroy())
      client.on('close', () => upstream.destroy())
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        client.pipe(upstream).pipe(client)
      })
    } catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n') }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as {port: number}
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      server.close()
      for (const socket of sockets) socket.destroy()
    },
  }
}
