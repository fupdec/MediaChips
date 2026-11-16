import https from 'https'
import type {ClientRequest, IncomingMessage} from 'http'
import {Transform, type Readable} from 'stream'
import {DOMParser} from '@xmldom/xmldom'
import type {NasConnectionInput, NasEntry} from '../../../shared/nas'
import type {NasCredentials} from './credentials'
import type {NasFile, NasTransport} from './transport'
import {normalizeNasRelativePath} from './transport'
import {NasError, normalizeNasError} from './errors'

const invalidResponse = () => new NasError('invalid_response', 'Invalid WebDAV server response.', 502)
const props = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop></d:propfind>'
const children = (element: Element, name: string): Element[] => Array.from(element.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && (node as Element).namespaceURI === 'DAV:' && (node as Element).localName === name)
const text = (element: Element, name: string) => children(element, name)[0]?.textContent?.trim() || ''
const success = (status: string) => /^HTTP\/\d(?:\.\d)? 2\d\d(?:\s|$)/.test(status)

/** HTTPS only. Credentials never leave this origin; redirects must stay below the configured root. */
export async function connectWebDav(config: NasConnectionInput, credentials: NasCredentials, signal?: AbortSignal): Promise<NasTransport> {
  const host = config.host.includes(':') && !config.host.startsWith('[') ? `[${config.host}]` : config.host
  const origin = new URL(`https://${host}:${config.port}`)
  const root = '/' + config.root.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  const rootPath = root === '/' ? '/' : `${root}/`
  const pending = new Set<ClientRequest>()
  const validators = new Map<string, string>()
  let closed = false
  const close = () => {
    closed = true
    signal?.removeEventListener('abort', close)
    for (const req of pending) req.destroy(new NasError('cancelled', 'WebDAV request cancelled.', 499))
    pending.clear()
  }
  signal?.addEventListener('abort', close, {once: true})
  if (signal?.aborted) close()
  const urlFor = (key: string) => new URL(rootPath + normalizeNasRelativePath(key).split('/').filter(Boolean).map(encodeURIComponent).join('/'), origin)
  // Decode once, reject encoded separators/traversal, and compare path segments rather than URL prefixes.
  const keyFor = (href: string, requested: URL): string => {
    let url: URL
    try { url = new URL(href, requested) } catch { throw invalidResponse() }
    if (url.origin !== origin.origin || url.username || url.password || url.search || url.hash) throw invalidResponse()
    const decode = (value: string) => value.split('/').filter(Boolean).map(part => {
      let decoded: string
      try { decoded = decodeURIComponent(part) } catch { throw invalidResponse() }
      if (!decoded || decoded === '.' || decoded === '..' || /[\/\\\x00-\x1f\x7f]/.test(decoded)) throw invalidResponse()
      return decoded
    })
    const parts = decode(url.pathname)
    const base = decode(rootPath)
    if (base.some((part, i) => parts[i] !== part) || parts.length < base.length) throw invalidResponse()
    return normalizeNasRelativePath(parts.slice(base.length).join('/'))
  }
  const request = async (url: URL, method: string, headers: Record<string, string>, body?: string | Readable, redirects = 0): Promise<IncomingMessage> => {
    if (closed) throw new NasError('cancelled', 'WebDAV request cancelled.', 499)
    let response: IncomingMessage
    try {
      response = await new Promise<IncomingMessage>((resolve, reject) => {
        const req = https.request(url, {method, rejectUnauthorized: true, headers: {...headers,
          Authorization: `Basic ${Buffer.from(`${config.username}:${credentials.password || ''}`).toString('base64')}`}}, resolve)
        pending.add(req)
        req.on('close', () => pending.delete(req))
        req.on('error', reject)
        req.setTimeout(15_000, () => req.destroy(new NasError('network_error', 'WebDAV server timed out.', 502)))
        if (body && typeof body !== 'string') {
          body.on('error', err => req.destroy(err))
          req.once('close', () => body.destroy())
          body.pipe(req)
        } else req.end(body)
      })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code || ''
      if (/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) throw new NasError('tls_error', 'WebDAV TLS certificate verification failed. Configure a trusted server certificate.', 502)
      throw normalizeNasError(err)
    }
    if ([301, 302, 307, 308].includes(response.statusCode || 0)) {
      response.destroy()
      if (redirects >= 3 || !response.headers.location || !['GET', 'PROPFIND'].includes(method)) throw invalidResponse()
      keyFor(response.headers.location, url)
      return request(new URL(response.headers.location, url), method, headers, body, redirects + 1)
    }
    if (![200, 201, 204, 206, 207].includes(response.statusCode || 0)) {
      response.destroy()
      const status = response.statusCode
      if (status === 401) throw new NasError('auth_required', 'WebDAV sign-in is required. Check the username and app password.', 409)
      if (status === 403) throw new NasError('permission_denied', 'The WebDAV account cannot read this folder.', 403)
      if (status === 404) throw new NasError('not_found', 'WebDAV file or folder is unavailable.', 404)
      if (status === 412 && ['PUT', 'MKCOL'].includes(method)) throw new NasError('conflict', 'Destination already exists.', 409)
      if (status === 412) throw new NasError('file_changed', 'The WebDAV file changed. Open the new version.', 409)
      if (status === 409 || status === 405) throw new NasError('conflict', 'Destination exists or its parent is unavailable.', 409)
      if (status === 416) throw new NasError('invalid_range', 'Invalid WebDAV byte range.', 416)
      throw new NasError('connection_failed', 'The WebDAV request failed.', 502)
    }
    return response
  }
  const propfind = async (key: string, depth: '0' | '1'): Promise<NasEntry[]> => {
    key = normalizeNasRelativePath(key)
    const url = urlFor(key)
    const response = await request(url, 'PROPFIND', {Depth: depth, 'Content-Type': 'application/xml; charset=utf-8', 'Content-Length': String(Buffer.byteLength(props))}, props)
    if (response.statusCode !== 207) { response.destroy(); throw invalidResponse() }
    let length = 0
    const chunks: Buffer[] = []
    for await (const chunk of response) {
      length += chunk.length
      if (length > 16 * 1024 * 1024) { response.destroy(); throw invalidResponse() }
      chunks.push(Buffer.from(chunk))
    }
    const xml = Buffer.concat(chunks).toString('utf8')
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalidResponse()
    let malformed = false
    const doc = new DOMParser({errorHandler: {warning: () => { malformed = true }, error: () => { malformed = true }, fatalError: () => { malformed = true }}}).parseFromString(xml, 'application/xml')
    if (malformed || doc.documentElement?.localName !== 'multistatus' || doc.documentElement.namespaceURI !== 'DAV:') throw invalidResponse()
    const entries: NasEntry[] = []
    const seen = new Set<string>()
    for (const item of children(doc.documentElement, 'response')) {
      const href = text(item, 'href')
      if (!href) throw invalidResponse()
      const resourceKey = keyFor(href, url)
      if (resourceKey !== key && (depth === '0' || (resourceKey.includes('/') ? resourceKey.slice(0, resourceKey.lastIndexOf('/')) : '') !== key)) continue
      const status = text(item, 'status')
      if (status && !success(status)) continue
      const properties = children(item, 'propstat').filter(item => success(text(item, 'status'))).flatMap(item => children(item, 'prop'))
      const property = (name: string) => properties.flatMap(item => children(item, name))[0]
      const type = property('resourcetype')
      if (!type) continue
      const isDirectory = children(type, 'collection').length > 0
      const rawSize = property('getcontentlength')?.textContent?.trim()
      const size = isDirectory ? 0 : rawSize && /^\d+$/.test(rawSize) ? Number(rawSize) : NaN
      if (!Number.isSafeInteger(size) || size < 0) throw invalidResponse()
      const modified = Date.parse(property('getlastmodified')?.textContent || '')
      const etag = property('getetag')?.textContent?.trim() || undefined
      if (seen.has(resourceKey)) throw invalidResponse()
      seen.add(resourceKey)
      entries.push({name: resourceKey.split('/').pop() || '', path: resourceKey, isDirectory, size,
        modifiedAt: Number.isFinite(modified) ? modified : undefined, etag})
    }
    return entries
  }
  const stat = async (key: string): Promise<NasFile> => {
    key = normalizeNasRelativePath(key)
    const entry = (await propfind(key, '0')).find(entry => entry.path === key)
    if (!entry) throw new NasError('not_found', 'WebDAV file or folder is unavailable.', 404)
    if (entry.etag && !entry.etag.startsWith('W/')) validators.set(key, entry.etag)
    return entry
  }
  try {
    if (!(await stat('')).isDirectory) throw new NasError('not_directory', 'The selected WebDAV root is not a folder.')
    return {
      async list(key) {
        key = normalizeNasRelativePath(key)
        const entries = await propfind(key, '1')
        const folder = entries.find(entry => entry.path === key)
        if (!folder?.isDirectory) throw new NasError('not_directory', 'The WebDAV path is not a folder.')
        return entries.filter(entry => entry.path !== key)
      }, stat,
      async read(key, start, end) {
        key = normalizeNasRelativePath(key)
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) throw new NasError('invalid_range', 'Invalid WebDAV byte range.', 416)
        const etag = validators.get(key)
        const response = await request(urlFor(key), 'GET', {Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity', ...(etag ? {'If-Match': etag} : {})})
        // Do not silently download the whole file when a server ignores Range.
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers['content-range'] || '')
        const expected = end - start + 1
        const validRange = response.statusCode === 206 && match && Number(match[1]) === start && Number(match[2]) === end && Number(match[3]) > end
        const fullFile = response.statusCode === 200 && start === 0 && Number(response.headers['content-length']) === expected
        if ((!validRange && !fullFile) || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
          response.destroy(); throw new NasError('range_not_supported', 'The WebDAV server did not return the requested byte range.', 502)
        }
        let received = 0
        const stream = new Transform({transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length
          callback(received > expected ? invalidResponse() : null, chunk)
        }, flush(callback) { callback(received === expected ? null : new NasError('incomplete_stream', 'The WebDAV file ended unexpectedly.', 502)) }})
        response.on('error', () => stream.destroy(new NasError('stream_failed', 'WebDAV stream interrupted.', 502)))
        stream.on('error', () => {})
        stream.once('close', () => response.destroy())
        response.pipe(stream)
        return stream
      },
      async mkdir(key) {
        if (!normalizeNasRelativePath(key)) throw new NasError('invalid_path', 'Cannot change the NAS root.', 400)
        const response = await request(urlFor(key), 'MKCOL', {'If-None-Match': '*'})
        response.resume()
      },
      async write(key, input, size) {
        if (!normalizeNasRelativePath(key)) throw new NasError('invalid_path', 'Cannot change the NAS root.', 400)
        const response = await request(urlFor(key), 'PUT', {'If-None-Match': '*', 'Content-Type': 'application/octet-stream', 'Content-Length': String(size)}, input)
        response.resume()
      },
      async move(from, to) {
        if (!normalizeNasRelativePath(from) || !normalizeNasRelativePath(to)) throw new NasError('invalid_path', 'Cannot change the NAS root.', 400)
        const etag = validators.get(from)
        try {
          const response = await request(urlFor(from), 'MOVE', {Destination: urlFor(to).href, Overwrite: 'F', ...(etag ? {'If-Match': etag} : {})})
          response.resume()
        } catch (err) {
          if (err instanceof NasError && err.code === 'file_changed') {
            let exists = false
            try { await stat(to); exists = true } catch { /* Keep the original conditional error if the target is inaccessible. */ }
            if (exists) throw new NasError('conflict', 'Destination already exists.', 409)
          }
          throw err
        }
      },
      async remove(key) {
        if (!normalizeNasRelativePath(key)) throw new NasError('invalid_path', 'Cannot change the NAS root.', 400)
        const etag = validators.get(key)
        const response = await request(urlFor(key), 'DELETE', {...(etag ? {'If-Match': etag} : {})})
        response.resume()
      }, close,
    }
  } catch (err) { close(); throw err }
}
