/**
 * Shared path-token noise used by pathParser and api pathTokenizer.
 * Keep tokenizer extras separate — image/http tokens are suggestion-only.
 */

/** Codec / resolution / container / year noise shared by both tokenizers. */
export const PATH_NOISE_PATTERNS_SHARED: RegExp[] = [
  /^(?:19|20)\d{2}$/,
  /^\d{3,4}p$/,
  /^\d+k$/,
  /^x26[45]$/,
  /^h26[45]$/,
  /^hevc$/,
  /^avc$/,
  /^aac$/,
  /^mp[34]$/,
  /^mkv$/,
  /^mov$/,
  /^webm$/,
]

/** Extra noise for tag-suggestion pathTokenizer (not used by pathParser matching). */
export const PATH_NOISE_PATTERNS_TOKENIZER_EXTRA: RegExp[] = [
  /^avi$/,
  /^jpg$/,
  /^jpeg$/,
  /^png$/,
  /^gif$/,
  /^web$/,
  /^www$/,
  /^http$/,
  /^https$/,
]

export const PATH_NOISE_PATTERNS_TOKENIZER: RegExp[] = [
  ...PATH_NOISE_PATTERNS_SHARED,
  ...PATH_NOISE_PATTERNS_TOKENIZER_EXTRA,
]

export function matchesPathNoise(
  token: string,
  patterns: RegExp[] = PATH_NOISE_PATTERNS_SHARED,
): boolean {
  return patterns.some((pattern) => pattern.test(token))
}
