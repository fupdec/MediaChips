import { describe, expect, it } from 'vitest'
import { buildSceneSearchQueryFromFilename } from '@/utils/sceneSearchQuery'

describe('buildSceneSearchQueryFromFilename', () => {
  it('strips extension and normalizes separators', () => {
    expect(buildSceneSearchQueryFromFilename('Studio.Name - Scene Title [1080p].mp4'))
      .toBe('Studio Name Scene Title')
  })

  it('uses basename from path', () => {
    expect(buildSceneSearchQueryFromFilename('/videos/folder/my_scene-name.webm'))
      .toBe('my scene name')
  })

  it('removes common quality tokens', () => {
    expect(buildSceneSearchQueryFromFilename('title.2160p.x265.mkv'))
      .toBe('title')
  })

  it('returns empty string for blank input', () => {
    expect(buildSceneSearchQueryFromFilename('')).toBe('')
  })
})
