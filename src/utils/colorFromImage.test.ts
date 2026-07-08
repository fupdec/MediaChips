import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAG_COLOR,
  extractColorFromImageData,
  extractColorFromLocalFile,
  isDefaultTagColor,
  isMainTagImagePath,
  parseLocalFilePathFromApiUrl,
} from '@/utils/colorFromImage'

describe('colorFromImage', () => {
  it('detects default tag colors', () => {
    expect(isDefaultTagColor(null)).toBe(true)
    expect(isDefaultTagColor('')).toBe(true)
    expect(isDefaultTagColor('#777')).toBe(true)
    expect(isDefaultTagColor('#777777')).toBe(true)
    expect(isDefaultTagColor('#ff0000')).toBe(false)
  })

  it('detects main tag image paths', () => {
    expect(isMainTagImagePath('/db/meta/3/42_main.jpg')).toBe(true)
    expect(isMainTagImagePath('/db/meta/3/42_avatar.jpg')).toBe(false)
  })

  it('parses local file path from get-file API url', () => {
    expect(parseLocalFilePathFromApiUrl(
      'http://192.168.1.91:12321/api/get-file?url=%2Ftmp%2Fmeta%2F3%2F14_main.jpg',
    )).toBe('/tmp/meta/3/14_main.jpg')
  })

  it('extracts a saturated color from image data', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4)

    for (let index = 0; index < data.length; index += 4) {
      data[index] = 220
      data[index + 1] = 40
      data[index + 2] = 60
      data[index + 3] = 255
    }

    expect(extractColorFromImageData(data)).toBe('#dc283c')
  })

  it('falls back to default color for empty image data', () => {
    const data = new Uint8ClampedArray(0)
    expect(extractColorFromImageData(data)).toBe(DEFAULT_TAG_COLOR)
  })

  it('prefers a vibrant accent over a large dull background', () => {
    const data = new Uint8ClampedArray(16 * 4)

    for (let index = 0; index < data.length; index += 4) {
      if (index < 52) {
        data[index] = 180
        data[index + 1] = 170
        data[index + 2] = 160
      } else {
        data[index] = 220
        data[index + 1] = 40
        data[index + 2] = 60
      }

      data[index + 3] = 255
    }

    expect(extractColorFromImageData(data)).toBe('#dc283c')
  })
})
