/** Pure image display / crop geometry (no Jimp or filesystem). */

export function getDisplayDimensions(
  width: number,
  height: number,
  orientation: number,
): {width: number; height: number} {
  if ([5, 6, 7, 8].includes(orientation)) {
    return {width: height, height: width}
  }

  return {width, height}
}

export function getCenterCropRect(
  width: number,
  height: number,
  targetAspectRatio: number,
): {x: number; y: number; w: number; h: number} {
  const aspectRatio = width / height

  let cropWidth: number
  let cropHeight: number

  if (aspectRatio > targetAspectRatio) {
    cropHeight = height
    cropWidth = height * targetAspectRatio
  } else {
    cropWidth = width
    cropHeight = width / targetAspectRatio
  }

  cropWidth = Math.min(cropWidth, width)
  cropHeight = Math.min(cropHeight, height)

  const x = Math.max(0, (width - cropWidth) / 2)
  const y = Math.max(0, (height - cropHeight) / 2)
  const flooredX = Math.floor(x)
  const flooredY = Math.floor(y)

  return {
    x: flooredX,
    y: flooredY,
    w: Math.min(Math.floor(cropWidth), width - flooredX),
    h: Math.min(Math.floor(cropHeight), height - flooredY),
  }
}
