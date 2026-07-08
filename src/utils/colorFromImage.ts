import { typedApi } from '@/services/typedApi'

export const DEFAULT_TAG_COLOR = '#777'

export function isDefaultTagColor(color: string | null | undefined): boolean {
  if (color == null || color === '') return true

  const normalized = color.trim().toLowerCase()
  return normalized === '#777' || normalized === '#777777'
}

export function isMainTagImagePath(imagePath: string): boolean {
  return /_main\.jpg$/i.test(imagePath)
}

export function parseLocalFilePathFromApiUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin)
    return parsed.searchParams.get('url')
  } catch {
    return null
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  let hue = 0
  let saturation = 0
  const lightness = (max + min) / 2

  if (max !== min) {
    const delta = max - min
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)

    switch (max) {
      case red:
        hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6
        break
      case green:
        hue = ((blue - red) / delta + 2) / 6
        break
      default:
        hue = ((red - green) / delta + 4) / 6
        break
    }
  }

  return [hue, saturation, lightness]
}

function isInformativePixel(r: number, g: number, b: number): boolean {
  const [, saturation, lightness] = rgbToHsl(r, g, b)

  if (lightness < 0.15 || lightness > 0.9) return false
  if (saturation < 0.12) return false

  return true
}

type ColorBin = {
  count: number
  r: number
  g: number
  b: number
}

function getBinVibrancyScore(bin: ColorBin, totalInformativePixels: number): number {
  const averageRed = bin.r / bin.count
  const averageGreen = bin.g / bin.count
  const averageBlue = bin.b / bin.count
  const [, saturation, lightness] = rgbToHsl(averageRed, averageGreen, averageBlue)

  // Prefer readable mid-tones over very dark or washed-out colors.
  const lightnessFactor = 1 - Math.abs(lightness - 0.42) * 0.85
  const clampedLightness = Math.max(0.2, Math.min(1, lightnessFactor))

  // Small but vivid accents can win; large dull areas should not dominate.
  const presence = Math.pow(bin.count / Math.max(totalInformativePixels, 1), 0.3)

  return saturation * saturation * clampedLightness * presence
}

export function extractColorFromImageData(
  data: Uint8ClampedArray,
): string {
  const bins = new Map<number, ColorBin>()
  let totalInformativePixels = 0

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const alpha = data[index + 3]

    if (alpha < 128) continue
    if (!isInformativePixel(r, g, b)) continue

    totalInformativePixels += 1

    const quantizedRed = r >> 4
    const quantizedGreen = g >> 4
    const quantizedBlue = b >> 4
    const key = (quantizedRed << 8) | (quantizedGreen << 4) | quantizedBlue
    const existing = bins.get(key)

    if (existing) {
      existing.count += 1
      existing.r += r
      existing.g += g
      existing.b += b
      continue
    }

    bins.set(key, {
      count: 1,
      r,
      g,
      b,
    })
  }

  if (bins.size === 0) {
    let totalRed = 0
    let totalGreen = 0
    let totalBlue = 0
    let pixelCount = 0

    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 128) continue

      totalRed += data[index]
      totalGreen += data[index + 1]
      totalBlue += data[index + 2]
      pixelCount += 1
    }

    if (pixelCount === 0) return DEFAULT_TAG_COLOR

    return rgbToHex(
      totalRed / pixelCount,
      totalGreen / pixelCount,
      totalBlue / pixelCount,
    )
  }

  let bestBin = [...bins.values()][0]
  let bestScore = getBinVibrancyScore(bestBin, totalInformativePixels)

  for (const bin of bins.values()) {
    const score = getBinVibrancyScore(bin, totalInformativePixels)

    if (score > bestScore) {
      bestScore = score
      bestBin = bin
    }
  }

  return rgbToHex(
    bestBin.r / bestBin.count,
    bestBin.g / bestBin.count,
    bestBin.b / bestBin.count,
  )
}

export function extractColorFromCanvas(canvas: HTMLCanvasElement): string {
  const maxSize = 64
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height))
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))
  const offscreen = document.createElement('canvas')

  offscreen.width = width
  offscreen.height = height

  const context = offscreen.getContext('2d')
  if (!context) return DEFAULT_TAG_COLOR

  context.drawImage(canvas, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)

  return extractColorFromImageData(imageData.data)
}

function extractColorFromLoadedImage(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d')
  if (!context) return DEFAULT_TAG_COLOR

  context.drawImage(image, 0, 0)
  return extractColorFromCanvas(canvas)
}

function loadImageElement(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    if (crossOrigin) {
      image.crossOrigin = 'anonymous'
    }

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = src
  })
}

async function extractColorFromObjectUrl(objectUrl: string): Promise<string> {
  try {
    const image = await loadImageElement(objectUrl)
    return extractColorFromLoadedImage(image)
  } catch {
    return DEFAULT_TAG_COLOR
  }
}

export async function extractColorFromBlob(blob: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(blob)

  try {
    return await extractColorFromObjectUrl(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function extractColorFromLocalFile(filePath: string): Promise<string> {
  try {
    const response = await typedApi.getFileBlob({ url: filePath })
    return await extractColorFromBlob(response.data)
  } catch {
    return DEFAULT_TAG_COLOR
  }
}

export async function extractColorFromImageUrl(url: string): Promise<string> {
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return extractColorFromObjectUrl(url)
  }

  const localFilePath = parseLocalFilePathFromApiUrl(url)
  if (localFilePath) {
    return extractColorFromLocalFile(localFilePath)
  }

  try {
    const image = await loadImageElement(url, true)
    return extractColorFromLoadedImage(image)
  } catch {
    return DEFAULT_TAG_COLOR
  }
}
