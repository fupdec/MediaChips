import {sourceRetryAfter} from '../../../shared/sourceErrors'
import {cloudMediaMetadata} from './mediaMetadata'
import {downloadRemoteThumbnail} from '../remoteThumbnailDownload'
import axios from 'axios'
import {Readable} from 'stream'
import type {CloudProvider} from '../../../shared/cloudAccounts'
import {CloudKeySchema} from '../../../shared/cloudAccounts'
import {driveMediaContentType} from '../../../shared/cloudDrive'
import {mediaFileContentType} from '../../../shared/mediaFormats'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import type {SourceReadAdapter, SourceObject, SourceRead} from '../mediaSources/adapter'

export type CloudRequest = (url: string, options: {method?: string; data?: unknown; headers?: Record<string, string>; signal?: AbortSignal; stream?: boolean}) => Promise<{data: any; status: number; headers: Record<string, string | undefined>}>
const roots = {gdrive: 'https://www.googleapis.com/drive/v3', onedrive: 'https://graph.microsoft.com/v1.0/me/drive', dropbox: 'https://api.dropboxapi.com/2'}
const safePage = (url: string, prefix: string) => {
  const candidate = new URL(url), base = new URL(prefix)
  // Graph may canonicalize /me/drive to /drives/{id} in its opaque nextLink.
  if (candidate.origin !== base.origin || candidate.username || candidate.password || !candidate.pathname.startsWith('/v1.0/')
    || !/\/(?:children|root\/children)$/.test(candidate.pathname)) throw Object.assign(new Error('Invalid continuation.'), {status: 400})
  return candidate.href
}
const object = (provider: CloudProvider, item: any): SourceObject => {
  const folder = provider === 'gdrive' ? item.mimeType === 'application/vnd.google-apps.folder'
    : provider === 'onedrive' ? !!item.folder : item['.tag'] === 'folder'
  const name = String(item.name || '')
  const modified = item.modifiedTime || item.lastModifiedDateTime || item.server_modified
  return {resourceKey: CloudKeySchema.parse(item.id), name, size: Number(item.size || 0), isDirectory: folder,
    modifiedAt: modified ? Date.parse(modified) : undefined,
    contentType: folder ? 'inode/directory' : (item.mimeType || item.file?.mimeType) ? driveMediaContentType(name, item.mimeType || item.file.mimeType) : mediaFileContentType(name) || 'application/octet-stream',
    mediaMetadata: cloudMediaMetadata(provider, item),
    version: String(item.cTag || item.rev || item.etag || item.eTag || `${item.size || 0}:${modified || ''}`)}
}
export function createCloudAdapter(provider: CloudProvider, token: (signal?: AbortSignal) => Promise<string>, request?: CloudRequest): SourceReadAdapter {
  const call: CloudRequest = request || (async (url, options) => {
    const response = await axios({url, method: options.method || 'GET', data: options.data, headers: options.headers,
      signal: options.signal, responseType: options.stream ? 'stream' : 'json', timeout: 30_000, maxRedirects: 0})
    return {data: response.data, status: response.status, headers: response.headers as Record<string, string | undefined>}
  })
  const api = async (url: string, options: Parameters<CloudRequest>[1] = {}) => {
    const access = await token(options.signal)
    try { return await call(url, {...options, headers: {...options.headers, Authorization: `Bearer ${access}`}}) }
    catch (err) {
      const status = (err as {response?: {status?: number}})?.response?.status
      // Never return Axios request objects, bearer tokens or upstream response bodies.
      throw Object.assign(new Error(status === 401 ? 'Reconnect this cloud account.' : 'Cloud request failed.'),
        {status: status === 401 ? 409 : status || 502, retryAfter: status === 429 ? sourceRetryAfter(err) : undefined, code: status === 401 ? 'auth_required' : status === 429 ? 'rate_limited' : status === 403 ? 'permission_denied' : status === 404 ? 'not_found' : !status ? 'network_error' : 'cloud_request_failed'})
    }
  }
  const dropbox = (route: string, data: unknown, signal?: AbortSignal) => api(`${roots.dropbox}/${route}`, {method: 'POST', data, headers: {'Content-Type': 'application/json'}, signal})
  const itemUrl = (key: string) => `${roots.onedrive}/${key === 'root' ? 'root' : `items/${encodeURIComponent(CloudKeySchema.parse(key))}`}`
  const meta = async (key: string, signal?: AbortSignal) => {
    CloudKeySchema.parse(key)
    if (provider === 'dropbox') return (await dropbox('files/get_metadata', {path: key, include_media_info: true}, signal)).data
    return (await api(provider === 'onedrive' ? itemUrl(key) : `${roots.gdrive}/files/${encodeURIComponent(key)}?fields=id,name,mimeType,size,modifiedTime,version,md5Checksum,videoMediaMetadata,imageMediaMetadata(width,height)`, {signal})).data
  }
  return {provider, capabilities: READ_SOURCE_CAPABILITIES,
    async list(key, pageToken, signal) {
      CloudKeySchema.parse(key || 'root')
      let page: any
      if (provider === 'dropbox') page = (await dropbox(pageToken ? 'files/list_folder/continue' : 'files/list_folder',
        pageToken ? {cursor: pageToken} : {path: key === 'root' ? '' : key, limit: 200, include_media_info: true}, signal)).data
      else if (provider === 'onedrive') page = (await api(pageToken ? safePage(pageToken, roots.onedrive) : `${itemUrl(key || 'root')}/children?$top=200`, {signal})).data
      else {
        const query = new URLSearchParams({q: `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,videoMediaMetadata,imageMediaMetadata(width,height))', pageSize: '200'})
        if (pageToken) query.set('pageToken', pageToken)
        page = (await api(`${roots.gdrive}/files?${query}`, {signal})).data
      }
      return {entries: (page.entries || page.value || page.files || []).map((file: any) => object(provider, file)),
        nextPageToken: provider === 'dropbox' ? (page.has_more ? page.cursor : undefined) : page['@odata.nextLink'] || page.nextPageToken}
    },
    async thumbnail(key, signal) {
      CloudKeySchema.parse(key)
      if (provider === 'dropbox') {
        const arg = JSON.stringify({resource: {'.tag': 'path', path: key}, format: 'jpeg', size: 'w640h480', mode: 'strict'})
          .replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
        const result = await api('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
          method: 'POST', headers: {'Dropbox-API-Arg': arg, 'Content-Type': 'application/octet-stream'}, signal, stream: true,
        })
        const chunks: Buffer[] = []
        let size = 0
        try {
          for await (const chunk of Buffer.isBuffer(result.data) ? [result.data] : result.data) {
            const bytes = Buffer.from(chunk); size += bytes.length
            if (size > 8 * 1024 * 1024) throw new Error('Thumbnail too large.')
            chunks.push(bytes)
          }
          return Buffer.concat(chunks)
        } finally { result.data?.destroy?.() }
      }
      if (provider === 'onedrive') {
        const {data} = await api(`${itemUrl(key)}/thumbnails`, {signal})
        const url = data.value?.[0]?.large?.url || data.value?.[0]?.medium?.url
        return url ? downloadRemoteThumbnail(url, signal) : null
      }
      const {data} = await api(`${roots.gdrive}/files/${encodeURIComponent(key)}?fields=thumbnailLink`, {signal})
      if (!data.thumbnailLink) return null
      const url = new URL(data.thumbnailLink)
      if (!/(^|\.)(googleusercontent\.com|googleapis\.com|google\.com)$/.test(url.hostname)) throw new Error('Invalid Drive thumbnail URL.')
      return downloadRemoteThumbnail(url.href, signal, {Authorization: `Bearer ${await token(signal)}`})
    },
    async stat(key, signal) { return object(provider, await meta(key, signal)) },
    async read(key, rangeHeader, signal): Promise<SourceRead> {
      if (rangeHeader && !/^bytes=(?:\d+-\d*|-\d+)$/.test(rangeHeader)) throw Object.assign(new Error('Invalid Range.'), {status: 416})
      const headers: Record<string, string> = rangeHeader ? {Range: rangeHeader} : {}
      let result: Awaited<ReturnType<CloudRequest>>
      if (provider === 'onedrive') {
        const file = await meta(key, signal)
        const url = new URL(file['@microsoft.graph.downloadUrl'])
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid cloud download URL.')
        // Preauthenticated URL: never forward the Graph bearer token.
        result = await call(url.href, {headers, signal, stream: true})
      } else if (provider === 'dropbox') {
        // Dropbox headers use an ASCII JSON string (including Unicode filenames).
        const arg = JSON.stringify({path: CloudKeySchema.parse(key)}).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
        result = await api('https://content.dropboxapi.com/2/files/download', {method: 'POST', headers: {...headers, 'Dropbox-API-Arg': arg, 'Content-Type': 'application/octet-stream'}, signal, stream: true})
      } else result = await api(`${roots.gdrive}/files/${encodeURIComponent(CloudKeySchema.parse(key))}?alt=media`, {headers, signal, stream: true})
      if (![200, 206].includes(result.status)) { result.data?.destroy?.(); throw new Error('Cloud download failed.') }
      return {status: result.status, headers: result.headers, body: Buffer.isBuffer(result.data) || result.data instanceof Readable ? result.data : Readable.from(result.data)}
    }, close() {},
  }
}
