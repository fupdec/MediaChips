const DEFAULT_MAX_DENOMINATOR = 100

/**
 * Approximate a float aspect ratio as integer width:height parts.
 * Uses continued fractions for a readable fraction within maxDenominator.
 */
export function approxAspectRatioParts(
  ratio: number,
  maxDenominator = DEFAULT_MAX_DENOMINATOR,
): {width: number; height: number} {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return {width: 1, height: 1}
  }

  let bestN = 1
  let bestD = 1
  let bestError = Math.abs(ratio - 1)

  let a0 = Math.floor(ratio)
  let n0 = 1
  let d0 = 0
  let n1 = a0
  let d1 = 1

  if (d1 > 0) {
    bestN = n1
    bestD = d1
    bestError = Math.abs(ratio - n1 / d1)
  }

  let x = ratio - a0
  for (let i = 0; i < 20 && x > 1e-12; i++) {
    x = 1 / x
    const a = Math.floor(x)
    const n = a * n1 + n0
    const d = a * d1 + d0
    if (d > maxDenominator) break

    const error = Math.abs(ratio - n / d)
    if (error < bestError - 1e-12 || (Math.abs(error - bestError) < 1e-12 && n + d < bestN + bestD)) {
      bestN = n
      bestD = d
      bestError = error
    }

    n0 = n1
    d0 = d1
    n1 = n
    d1 = d
    x = x - a
  }

  const gcd = (a: number, b: number): number => {
    let x = Math.abs(a)
    let y = Math.abs(b)
    while (y) {
      const t = y
      y = x % y
      x = t
    }
    return x || 1
  }

  const g = gcd(bestN, bestD)
  return {
    width: Math.max(1, Math.round(bestN / g)),
    height: Math.max(1, Math.round(bestD / g)),
  }
}
