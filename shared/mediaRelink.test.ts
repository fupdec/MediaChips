import {describe, expect, it} from 'vitest'
import {remapMediaRoot} from './mediaRelink'

describe('remapMediaRoot', () => {
  it('matches entire directories and preserves relative paths', () => {
    expect(remapMediaRoot('/old/nested/clip.mp4', '/old/', '/new/')).toBe('/new/nested/clip.mp4')
    expect(remapMediaRoot('/older/clip.mp4', '/old', '/new')).toBeNull()
    expect(remapMediaRoot('/x/old/clip.mp4', '/old', '/new')).toBeNull()
  })
  it('handles Windows, UNC and drive roots on any host', () => {
    expect(remapMediaRoot('D:\\Videos\\sub\\clip.mp4', 'D:\\Videos', 'E:\\Media')).toBe('E:\\Media\\sub\\clip.mp4')
    expect(remapMediaRoot('D:\\clip.mp4', 'D:\\', 'E:\\')).toBe('E:\\clip.mp4')
    expect(remapMediaRoot('\\\\nas\\old\\clip.mp4', '\\\\nas\\old', '\\\\nas\\new')).toBe('\\\\nas\\new\\clip.mp4')
    expect(remapMediaRoot('/old/clip.mp4', '/old', '/')).toBe('/clip.mp4')
  })
})
