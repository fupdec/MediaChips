import axios from 'axios'
import {isPublicWebHostname} from '../../shared/webVideo'
import {publicHttpsAgent} from './webVideo/network'

/** Small public image downloads, with the same DNS restrictions as web playback. */
export async function downloadRemoteThumbnail(input: string, signal?: AbortSignal, headers: Record<string, string> = {}): Promise<Buffer> {
  let url = new URL(input)
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !isPublicWebHostname(url.hostname)) {
      throw new Error('Invalid thumbnail URL.')
    }
    const response = await axios.get(url.href, {
      responseType: 'arraybuffer', maxContentLength: 8 * 1024 * 1024,
      timeout: 15_000, signal, httpsAgent: publicHttpsAgent, proxy: false,
      maxRedirects: 0, headers,
      validateStatus: status => status >= 200 && status < 400,
    })
    if (response.status >= 300) {
      if (!response.headers.location) throw new Error('Invalid thumbnail redirect.')
      url = new URL(String(response.headers.location), url)
      // A redirected CDN must never receive the provider bearer token.
      headers = {}
      continue
    }
    return Buffer.from(response.data)
  }
  throw new Error('Too many thumbnail redirects.')
}
