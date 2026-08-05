/** Pack interleaved RGB (HWC) into NCHW float32 with mean/std normalization. */
export function packInterleavedRgbToNchw(
  rgb: ArrayLike<number>,
  width: number,
  height: number,
  mean: number,
  std: number,
): Float32Array {
  const plane = width * height
  const floatData = new Float32Array(1 * 3 * plane)
  for (let i = 0; i < plane; i++) {
    floatData[i] = (rgb[i * 3] - mean) / std
    floatData[plane + i] = (rgb[i * 3 + 1] - mean) / std
    floatData[2 * plane + i] = (rgb[i * 3 + 2] - mean) / std
  }
  return floatData
}

/** Convert RGBA bitmap pixels into interleaved RGB. */
export function rgbaBitmapToInterleavedRgb(
  data: ArrayLike<number>,
  pixelCount: number,
): Uint8Array {
  const rgb = new Uint8Array(pixelCount * 3)
  for (let i = 0; i < pixelCount; i++) {
    rgb[i * 3] = data[i * 4]
    rgb[i * 3 + 1] = data[i * 4 + 1]
    rgb[i * 3 + 2] = data[i * 4 + 2]
  }
  return rgb
}

/** Pack an RGBA bitmap directly into NCHW float32. */
export function packRgbaBitmapToNchw(
  data: ArrayLike<number>,
  width: number,
  height: number,
  mean: number,
  std: number,
): Float32Array {
  const plane = width * height
  const floatData = new Float32Array(1 * 3 * plane)
  for (let i = 0; i < plane; i++) {
    const src = i * 4
    floatData[i] = (data[src] - mean) / std
    floatData[plane + i] = (data[src + 1] - mean) / std
    floatData[2 * plane + i] = (data[src + 2] - mean) / std
  }
  return floatData
}
