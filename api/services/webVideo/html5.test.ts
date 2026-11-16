// @vitest-environment node
import {beforeEach, describe, expect, it, vi} from 'vitest'
import axios from 'axios'
import {extractHtml5Video, parseHtml5Video as parseDocument} from './html5'
const parseHtml5Video = (html: string, page: string) => parseDocument(`<html><head></head><body>${html}</body></html>`, page)
import {publicHttpsAgent} from './network'

vi.mock('axios', () => ({default: {get: vi.fn()}}))
beforeEach(() => vi.resetAllMocks())
const page = 'https://example.com/watch/player.html'
const html = '<title>Film &amp; trailer</title><video><source src="../movie.mp4?x=1&amp;y=2" type="video/mp4"><source src="https://cdn.example.com/mirror.mp4"></video>'

describe('static HTML5 extraction', () => {
  it('reads one player, relative URLs, entities, mirrors and the page referer', () => {
    expect(parseHtml5Video(html, page)).toMatchObject({title: 'Film & trailer',
      http_headers: {Referer: page}, formats: [
        {url: 'https://example.com/movie.mp4?x=1&y=2', protocol: 'https'},
        {url: 'https://cdn.example.com/mirror.mp4', protocol: 'https'},
      ]})
  })

  it('honours base and video src, and supports HLS without running scripts', () => {
    expect(parseHtml5Video('<base href="https://cdn.example.com/assets/"><video src="master.m3u8" poster="cover.jpg"><source src="unused.mp4"></video>', page))
      .toMatchObject({thumbnail: 'https://cdn.example.com/assets/cover.jpg', formats: [
        {url: 'https://cdn.example.com/assets/master.m3u8', protocol: 'm3u8_native'},
      ]})
    expect(parseHtml5Video('<script>const player = "<video src=\'fake.mp4\'></video>"</script>', page)).toBeNull()
  })

  it('ignores obsolete sources inside HTML comments, as on the W3C player', () => {
    expect(parseHtml5Video('<title>HTML5 Video</title><video controls preload="none"><!-- <source src="../missing.mp4" type="video/mp4"> --><source src="https://media.w3.org/2010/05/sintel/trailer.mp4" type="video/mp4"></video>', page))
      .toMatchObject({formats: [{url: 'https://media.w3.org/2010/05/sintel/trailer.mp4'}]})
  })

  it.each([
    '<video src="http://cdn.example.com/video.mp4"></video>',
    '<video src="https://127.0.0.1/video.mp4"></video>',
    '<video src="https://user:pass@cdn.example.com/video.mp4"></video>',
    '<video src="https://cdn.example.com:8443/video.mp4"></video>',
    '<video src="blob:123"></video>',
    '<video src="video.webm"></video>',
    '<video src="one.mp4"></video><video src="two.mp4"></video>',
    '<base href="http://cdn.example.com/"><video src="movie.mp4"></video>',
  ])('defers unsafe, ambiguous or unsupported pages: %s', value => {
    expect(parseHtml5Video(value, page)).toBeNull()
  })

  it('validates each redirect and resolves source URLs against the final page', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({status: 302, headers: {location: 'https://cdn.example.com/embed/player'}})
      .mockResolvedValueOnce({status: 200, headers: {'content-type': 'text/html; charset=utf-8'}, data: '<video src="movie.mp4"></video>'})
    expect(await extractHtml5Video(page)).toMatchObject({formats: [{url: 'https://cdn.example.com/embed/movie.mp4'}], http_headers: {Referer: 'https://cdn.example.com/embed/player'}})
    expect(axios.get).toHaveBeenLastCalledWith('https://cdn.example.com/embed/player', expect.objectContaining({
      httpsAgent: publicHttpsAgent, proxy: false, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024,
    }))
  })

  it.each(['http://example.com/private', 'https://127.0.0.1/private', 'https://example.com:8443/private'])('does not follow redirect to %s', async location => {
    vi.mocked(axios.get).mockResolvedValue({status: 302, headers: {location}})
    expect(await extractHtml5Video(page)).toBeNull()
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('does not interpret a challenge or a non-HTML response as a player', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({status: 403, headers: {'content-type': 'text/html'}, data: html})
      .mockResolvedValueOnce({status: 200, headers: {'content-type': 'text/plain'}, data: html})
    expect(await extractHtml5Video(page)).toBeNull()
    expect(await extractHtml5Video(page)).toBeNull()
  })

  it('propagates cancellation to the page request', async () => {
    const controller = new AbortController()
    vi.mocked(axios.get).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener!('abort', () => reject(controller.signal.reason), {once: true})
    }))
    const result = extractHtml5Video(page, controller.signal)
    const rejection = expect(result).rejects.toMatchObject({name: 'AbortError'})
    controller.abort()
    await rejection
  })
})
