import {describe, expect, it} from 'vitest'
import {
  TAG_AI_UPSCALE_TYPES,
  TAG_AVATAR_SAVE_WIDTH,
  TAG_IMAGE_SAVE_WIDTH,
  getTagAiUpscaleTargetWidth,
  isTagAiUpscaleType,
  parseTagImageFileName,
} from './tagImages'

describe('tagImages', () => {
  it('exposes save widths for posters and avatars', () => {
    expect(TAG_IMAGE_SAVE_WIDTH).toBe(600)
    expect(TAG_AVATAR_SAVE_WIDTH).toBe(328)
    expect(TAG_AI_UPSCALE_TYPES).toEqual(['main', 'alt', 'custom1', 'custom2', 'avatar'])
  })

  it('resolves AI upscale targets by slot', () => {
    expect(getTagAiUpscaleTargetWidth('main')).toBe(600)
    expect(getTagAiUpscaleTargetWidth('avatar')).toBe(328)
    expect(getTagAiUpscaleTargetWidth('header')).toBeNull()
  })

  it('parses tag image filenames', () => {
    expect(parseTagImageFileName('12_main.jpg')).toEqual({tagId: '12', type: 'main'})
    expect(parseTagImageFileName('3_avatar.JPEG')).toEqual({tagId: '3', type: 'avatar'})
    expect(parseTagImageFileName('readme.txt')).toBeNull()
    expect(isTagAiUpscaleType('main')).toBe(true)
    expect(isTagAiUpscaleType('header')).toBe(false)
  })
})
