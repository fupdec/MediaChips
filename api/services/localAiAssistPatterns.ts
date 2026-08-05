/** Pure string/regex heuristics for Local AI regex assist. */

export function stripRegexDelimiters(pattern: string): string {
  const trimmed = String(pattern || '').trim()
  // Require flags so path fragments like `/Shows/` are preserved.
  const matched = trimmed.match(/^\/([\s\S]+)\/([gimsuy]+)$/)
  if (matched) return matched[1]
  return trimmed
}

export function asStringArray(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = String(item || '').trim()
    if (!text) continue
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

export function looksLikeFilesystemPath(pattern: string): boolean {
  if (/^(\/Users\/|\/home\/|[A-Za-z]:[\\/])/.test(pattern)) return true
  // Bare /Media/... path with no regex metacharacters is echoed context.
  return /^\/Media\//.test(pattern) && !/[\\^$*+?[\](){}|.]/.test(pattern)
}

/** True when pattern is basically an escaped copy of the sample path/text. */
export function looksLikeEchoedSample(pattern: string, sample: string): boolean {
  const rawPattern = String(pattern || '').trim()
  const rawSample = String(sample || '').trim()
  if (!rawPattern || !rawSample) return false
  if (rawPattern === rawSample) return true

  const unescaped = rawPattern.replace(/\\(.)/g, '$1')
  if (unescaped === rawSample) return true

  // Near-full-path echoes with light escaping, e.g. /Media/Library/\[Studio]\file\.mp4
  if (rawSample.length >= 12 && unescaped.length >= 12) {
    const sampleCore = rawSample.replace(/\\/g, '/').toLowerCase()
    const patternCore = unescaped.replace(/\\/g, '/').toLowerCase()
    if (patternCore === sampleCore) return true
    if (sampleCore.includes(patternCore) && patternCore.length / sampleCore.length > 0.7) return true
    if (patternCore.includes(sampleCore) && sampleCore.length / patternCore.length > 0.7) return true
  }
  return false
}

/**
 * True when the model returned a whole file-path template instead of a short regex,
 * e.g. /Media/Library/[Studio]title_(\d{4})\.mp4
 */
export function looksLikePathShapedPattern(pattern: string): boolean {
  const raw = String(pattern || '').trim()
  if (!raw) return false
  const unescaped = raw.replace(/\\(.)/g, '$1')
  if (/^(\/Users\/|\/home\/|\/Media\/|[A-Za-z]:[\\/])/.test(unescaped)) return true
  const slashCount = (unescaped.match(/\//g) || []).length
  if (slashCount >= 2 && (/\.[a-z0-9]{2,4}$/i.test(unescaped) || raw.includes('\\.'))) return true
  if (slashCount >= 3 && unescaped.length > 24) return true
  return false
}

/** First capturing group `(...)`, or null. Skips `(?:`, `(?=`, etc. */
export function extractPrimaryCaptureGroup(pattern: string): string | null {
  const raw = String(pattern || '')
  let depth = 0
  let start = -1
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '(') {
      const isSpecial = raw[i + 1] === '?'
      if (depth === 0 && !isSpecial) start = i
      depth += 1
      continue
    }
    if (ch === ')') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        const group = raw.slice(start, i + 1)
        return group.length > 2 ? group : null
      }
    }
  }
  return null
}

/** Prefer a short fragment over a full path template when the user asked in natural language. */
export function shrinkPathShapedPattern(pattern: string): string {
  const raw = String(pattern || '').trim()
  if (!looksLikePathShapedPattern(raw)) return raw
  const group = extractPrimaryCaptureGroup(raw)
  if (group && group.length + 8 < raw.length) return group
  return ''
}
