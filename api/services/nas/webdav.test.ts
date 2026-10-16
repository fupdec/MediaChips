// @vitest-environment node
import https from 'https'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {execFileSync} from 'child_process'
import {beforeAll, afterAll, beforeEach, describe, expect, it} from 'vitest'
import type {NasConnectionInput} from '../../../shared/nas'
import {NasConnectionSchema} from '../../../shared/nas'
import {connectNas} from './transport'
import {nasFileVersion} from '../mediaSources/adapter'

const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz')
const root = '/remote.php/dav/files/reader/'
const name = 'Кино & 100% #?.mp4'
const escaped = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
let server: https.Server
let config: NasConnectionInput
let directory: string
let originalCA: typeof https.globalAgent.options.ca
let responseXml: string | undefined
let mode = ''
let requests: Array<{method?: string; url?: string; range?: string; ifMatch?: string}>
const entry = (href: string, folder = false, prefix = 'd') => `<${prefix}:response><${prefix}:href>${escaped(href)}</${prefix}:href><${prefix}:propstat><${prefix}:prop><${prefix}:resourcetype>${folder ? `<${prefix}:collection/>` : ''}</${prefix}:resourcetype><${prefix}:getcontentlength>${folder ? 0 : bytes.length}</${prefix}:getcontentlength><${prefix}:getlastmodified>Wed, 14 Oct 2026 10:00:00 GMT</${prefix}:getlastmodified><${prefix}:getetag>"revision-1"</${prefix}:getetag></${prefix}:prop><${prefix}:status>HTTP/1.1 200 OK</${prefix}:status></${prefix}:propstat></${prefix}:response>`
const multistatus = (items: string) => `<d:multistatus xmlns:d="DAV:" xmlns:x="DAV:">${items}</d:multistatus>`

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-webdav-tls-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', path.join(directory, 'key.pem'), '-out', path.join(directory, 'cert.pem')], {stdio: 'ignore'})
  const cert = fs.readFileSync(path.join(directory, 'cert.pem'))
  originalCA = https.globalAgent.options.ca
  https.globalAgent.options.ca = cert
  server = https.createServer({key: fs.readFileSync(path.join(directory, 'key.pem')), cert}, (req, res) => {
    requests.push({method: req.method, url: req.url, range: req.headers.range, ifMatch: req.headers['if-match']})
    if (req.headers.authorization !== `Basic ${Buffer.from('reader:secret').toString('base64')}`) { res.writeHead(401).end(); return }
    if (mode === 'denied') { res.writeHead(403).end(); return }
    if (mode === 'missing') { res.writeHead(404).end(); return }
    if (mode === 'redirect') { res.writeHead(302, {Location: 'http://localhost/leak'}).end(); return }
    if (mode === 'foreign') { res.writeHead(307, {Location: 'https://other.invalid/leak'}).end(); return }
    if (mode === 'outside') { res.writeHead(301, {Location: '/elsewhere/'}).end(); return }
    if (mode === 'loop') { res.writeHead(308, {Location: root}).end(); return }
    if (mode === 'slow') return
    if (req.method === 'PROPFIND') {
      if (responseXml) { res.writeHead(207).end(responseXml); return }
      const href = req.url!
      const folder = href === root || href === root + 'nested'
      res.writeHead(207, {'Content-Type': 'application/xml'}).end(multistatus(entry(href, folder) + (req.headers.depth === '1' ? entry(root + encodeURIComponent(name), false, 'x') + entry(root + 'nested/', true) : '')))
      return
    }
    if (req.method === 'GET') {
      if (mode === 'changed') { res.writeHead(412).end(); return }
      if (mode === 'ignore-range') { res.writeHead(200, {'Content-Length': bytes.length}).end(bytes); return }
      const [, start, end] = /bytes=(\d+)-(\d+)/.exec(req.headers.range!)!
      const data = bytes.subarray(Number(start), Number(end) + 1)
      res.writeHead(206, {'Content-Range': `bytes ${mode === 'bad-range' ? 0 : start}-${end}/${bytes.length}`, 'Content-Length': data.length})
      if (mode === 'slow-read') { res.flushHeaders(); return }
      res.end(data)
      return
    }
    res.writeHead(405).end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  config = {name: 'WebDAV', protocol: 'webdav', host: '127.0.0.1', port: (server.address() as {port: number}).port, username: 'reader', root}
})
afterAll(async () => {
  https.globalAgent.options.ca = originalCA
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  fs.rmSync(directory, {recursive: true, force: true})
})
beforeEach(() => { mode = ''; responseXml = undefined; requests = [] })
const connect = () => connectNas(config, {password: 'secret'})
const collect = async (body: AsyncIterable<Buffer>) => { const chunks = []; for await (const chunk of body) chunks.push(chunk); return Buffer.concat(chunks).toString() }

describe('WebDAV HTTPS transport', () => {
  it('lists namespace-independent multistatus, stats files and reads exact ranges with encoded names', async () => {
    const transport = await connect()
    try {
      expect(await transport.list('')).toEqual(expect.arrayContaining([expect.objectContaining({name, path: name, size: bytes.length}), expect.objectContaining({path: 'nested', isDirectory: true})]))
      const file = await transport.stat(name)
      expect(file).toMatchObject({size: bytes.length, isDirectory: false, etag: '"revision-1"'})
      expect(nasFileVersion(file)).toContain('revision-1')
      expect(await collect(await transport.read(name, 4, 9))).toBe('456789')
      expect(await collect(await transport.read(name, 0, bytes.length - 1))).toBe(bytes.toString())
      expect(requests[requests.length - 1]).toMatchObject({method: 'GET', url: root + encodeURIComponent(name), range: `bytes=0-${bytes.length - 1}`})
      expect(requests[requests.length - 1]?.ifMatch).toBe('"revision-1"')
    } finally { transport.close() }
  })
  it('accepts absolute hrefs and default DAV namespaces and ignores failed properties', async () => {
    const transport = await connect()
    try {
      responseXml = multistatus(entry(new URL(root, `https://127.0.0.1:${config.port}`).href, true) + entry(root + 'a.mp4').replace('<d:propstat>', '<d:propstat><d:prop><d:getcontentlength>9999</d:getcontentlength></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat><d:propstat>')).replace(/d:/g, '').replace('xmlns:d="DAV:"', 'xmlns="DAV:"')
      expect(await transport.list('')).toEqual([expect.objectContaining({path: 'a.mp4', size: bytes.length})])
    } finally { transport.close() }
  })
  it.each(['redirect', 'foreign', 'outside', 'loop'])('rejects unsafe or looping redirects: %s', async value => {
    mode = value
    await expect(connect()).rejects.toMatchObject({code: 'invalid_response'})
    expect(requests.length).toBeLessThanOrEqual(4)
  })
  it.each(['denied', 'missing'])('maps HTTP errors: %s', async value => {
    mode = value
    await expect(connect()).rejects.toMatchObject({code: value === 'denied' ? 'permission_denied' : 'not_found'})
  })
  it('maps bad credentials and rejects untrusted TLS certificates', async () => {
    await expect(connectNas(config, {password: 'wrong'})).rejects.toMatchObject({code: 'auth_required'})
    https.globalAgent.options.ca = undefined
    try { await expect(connect()).rejects.toMatchObject({code: 'tls_error'}) }
    finally { https.globalAgent.options.ca = fs.readFileSync(path.join(directory, 'cert.pem')) }
  })
  it.each([
    '<html>Login</html>',
    '<!DOCTYPE d [<!ENTITY evil SYSTEM "file:///etc/passwd">]><d:multistatus xmlns:d="DAV:"/>',
    multistatus(entry('/elsewhere/file.mp4')),
    multistatus(entry(root + 'a%2Fb.mp4')),
    multistatus(entry(root + 'a.mp4').replace(String(bytes.length), '-5')),
    '<d:multistatus xmlns:d="DAV:"><d:response></d:multistatus>',
  ])('rejects malformed or unsafe responses', async xml => {
    const transport = await connect()
    responseXml = xml
    try { await expect(transport.list('')).rejects.toMatchObject({code: 'invalid_response'}) }
    finally { transport.close() }
  })
  it.each(['ignore-range', 'bad-range'])('fails when requested ranges are not honored: %s', async value => {
    const transport = await connect(); mode = value
    try { await expect(transport.read(name, 4, 9)).rejects.toMatchObject({code: 'range_not_supported'}) }
    finally { transport.close() }
  })
  it('refuses a file changed between stat and GET, even at the same size and modification time', async () => {
    const transport = await connect()
    try {
      const before = await transport.stat(name)
      expect(nasFileVersion({...before, etag: '"revision-2"'})).not.toBe(nasFileVersion(before))
      mode = 'changed'
      await expect(transport.read(name, 0, 9)).rejects.toMatchObject({code: 'file_changed'})
    } finally { transport.close() }
  })
  it('cancels pending connections and active reads', async () => {
    const controller = new AbortController(); mode = 'slow'
    const connecting = connectNas(config, {password: 'secret'}, controller.signal)
    setTimeout(() => controller.abort(), 30)
    await expect(connecting).rejects.toMatchObject({code: 'cancelled'})
    mode = ''
    const readingController = new AbortController()
    const transport = await connectNas(config, {password: 'secret'}, readingController.signal)
    mode = 'slow-read'
    const reading = collect(await transport.read(name, 0, 9))
    setTimeout(() => readingController.abort(), 30)
    await expect(reading).rejects.toMatchObject({code: 'stream_failed'})
    transport.close()
  })
  it('validates WebDAV inputs and refuses traversal before requests', async () => {
    expect(NasConnectionSchema.safeParse(config).success).toBe(true)
    expect(NasConnectionSchema.safeParse({...config, username: 'a:b'}).success).toBe(false)
    expect(NasConnectionSchema.safeParse({...config, root: '/a/./b'}).success).toBe(false)
    const transport = await connect()
    try { await expect(transport.stat('../private')).rejects.toMatchObject({code: 'invalid_path'}) }
    finally { transport.close() }
  })
})
