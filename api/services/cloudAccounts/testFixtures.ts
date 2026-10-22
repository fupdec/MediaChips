import {vi} from 'vitest'
import type {CloudRequest} from './providers'
import type {CloudProvider} from '../../../shared/cloudAccounts'
export function fixtureRequest(provider: CloudProvider, bytes = Buffer.from('0123456789')) {
  const key = provider === 'dropbox' ? 'id:opaque-文件' : 'opaque!123'
  const modified = '2026-10-01T12:00:00Z'
  const file = provider === 'gdrive' ? {id: key, name: 'sample.mp4', size: bytes.length, mimeType: 'video/mp4', modifiedTime: modified, videoMediaMetadata: {durationMillis: '2000', width: 640, height: 360}}
    : provider === 'onedrive' ? {id: key, name: 'sample.mp4', size: bytes.length, file: {mimeType: 'video/mp4'}, cTag: 'v1', lastModifiedDateTime: modified, video: {duration: 2000, width: 640, height: 360}, '@microsoft.graph.downloadUrl': 'https://download.example.test/video'}
    : {id: key, name: 'sample.mp4', size: bytes.length, '.tag': 'file', rev: 'v1', server_modified: modified, media_info: {metadata: {duration: 2000, dimensions: {width: 640, height: 360}}}}
  const folder = provider === 'gdrive' ? {id: 'folder', name: 'Folder', mimeType: 'application/vnd.google-apps.folder'} : provider === 'onedrive' ? {id: 'folder', name: 'Folder', folder: {}} : {id: 'folder', name: 'Folder', '.tag': 'folder'}
  const request = vi.fn<CloudRequest>(async (url, options) => {
    options.signal?.throwIfAborted()
    if (options.stream) {
      const range = options.headers?.Range
      const body = range ? bytes.subarray(2, 6) : bytes
      return {data: body, status: range ? 206 : 200, headers: {'content-length': String(body.length), ...(range ? {'content-range': `bytes 2-5/${bytes.length}`} : {})}}
    }
    if (url.includes('/children') || url.includes('/files?') || url.endsWith('list_folder') || url.endsWith('list_folder/continue')) {
      const more = url.includes('pageToken=next') || url.includes('$skiptoken=next') || url.endsWith('/continue')
      return {data: provider === 'gdrive' ? {files: more ? [file] : [folder, file], nextPageToken: more ? undefined : 'next'}
        : provider === 'onedrive' ? {value: more ? [file] : [folder, file], '@odata.nextLink': more ? undefined : 'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=next'}
        : {entries: more ? [file] : [folder, file], has_more: !more, cursor: 'next'}, status: 200, headers: {}}
    }
    return {data: file, status: 200, headers: {}}
  })
  return {key, file, request}
}
