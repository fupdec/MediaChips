import axios from 'axios'
import {DOMParser} from '@xmldom/xmldom'
import {isPublicWebHostname} from '../../../shared/webVideo'
import {publicHttpsAgent} from './network'

function publicUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' && !url.port && !url.username && !url.password
      && isPublicWebHostname(url.hostname) ? url.href : null
  } catch { return null }
}

/** Read a single static HTML5 player without executing scripts or fetching its resources. */
export function parseHtml5Video(html: string, page: string) {
  let malformed = false
  const doc = new DOMParser({errorHandler: {warning: () => {}, error: () => { malformed = true }, fatalError: () => { malformed = true }}})
    .parseFromString(html, 'text/html')
  if (malformed) return null
  const videos = doc.getElementsByTagName('video')
  if (videos.length !== 1) return null
  const video = videos[0]
  const base = publicUrl(doc.getElementsByTagName('base')[0]?.getAttribute('href') || page, page)
  if (!base) return null
  const candidates = video.getAttribute('src') ? [video] : Array.from(video.childNodes)
    .filter((node): node is Element => node.nodeType === 1 && node.nodeName.toLowerCase() === 'source')
  const formats = candidates.flatMap(node => {
    const src = node.getAttribute('src')
    const url = src && publicUrl(src, base)
    if (!url) return []
    const type = (node.getAttribute('type') || '').split(';')[0].trim().toLowerCase()
    const pathname = new URL(url).pathname
    const hls = ['application/vnd.apple.mpegurl', 'application/x-mpegurl'].includes(type) || /\.m3u8$/i.test(pathname)
    if (!hls && type !== 'video/mp4' && !/\.mp4$/i.test(pathname)) return []
    return [{url, ext: 'mp4', protocol: hls ? 'm3u8_native' : 'https'}]
  })
  if (!formats.length) return null
  const title = video.getAttribute('title') || doc.getElementsByTagName('title')[0]?.textContent?.trim() || new URL(page).hostname
  const poster = video.getAttribute('poster')
  return {title, formats, thumbnail: poster ? publicUrl(poster, base) : null, http_headers: {Referer: page}}
}

/** Follow only validated public HTTPS redirects; DNS is checked again at every connection. */
export async function extractHtml5Video(page: string, signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(10_000)
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
  let url = page
  for (let redirect = 0; redirect < 5; redirect++) {
    const response = await axios.get<string>(url, {
      httpsAgent: publicHttpsAgent, proxy: false, maxRedirects: 0, signal: requestSignal,
      timeout: 10_000, maxContentLength: 2 * 1024 * 1024, responseType: 'text',
      headers: {Accept: 'text/html,application/xhtml+xml'}, validateStatus: () => true,
    })
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      const next = publicUrl(String(response.headers.location), url)
      if (!next) return null
      url = next
      continue
    }
    if (response.status !== 200 || !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(String(response.headers['content-type'] || ''))) return null
    return parseHtml5Video(response.data, url)
  }
  return null
}
