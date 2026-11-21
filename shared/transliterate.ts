const CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
  'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
}

/**
 * Transliterate Cyrillic characters to Latin.
 * Returns the original string with any Cyrillic parts converted.
 */
export function transliterateToLatin(text: string): string {
  let result = ''
  for (const char of text) {
    result += CYRILLIC_TO_LATIN[char] ?? char
  }
  return result
}

/**
 * Get the first English letter of a name string.
 * If it starts with a Latin letter, returns it as-is (uppercase).
 * If it starts with Cyrillic, transliterates and returns the first Latin letter.
 * Returns `null` if the first character is not a letter (A-Z or a-z).
 */
export function getTagFirstLetter(name: string): string | null {
  if (!name) return null
  const latin = transliterateToLatin(name)
  const firstChar = latin.charAt(0)
  if (/[a-zA-Z]/.test(firstChar)) return firstChar.toUpperCase()
  return null
}

/** Catch-all alphabet entry for names starting with a digit, a symbol or a script without its own letters here. */
export const TAG_LETTER_OTHER = '#'

/**
 * Alphabet key of a name: its real first letter, uppercased.
 * Latin and Greek lose diacritics (É, Ö, Ñ become E, O, N); Cyrillic keeps every letter as is (Ё, Й stay).
 * Digits, symbols and other scripts (Han, Kana, Hangul, …) share the `#` entry.
 */
export function getTagLetterKey(name: string | null | undefined): string {
  const first = Array.from(String(name ?? '').trim())[0]
  if (!first) return TAG_LETTER_OTHER

  if (/\p{Script=Cyrillic}/u.test(first)) {
    return first.toLocaleUpperCase('ru')
  }

  if (/[\p{Script=Latin}\p{Script=Greek}]/u.test(first)) {
    const base = first.normalize('NFD').replace(/\p{M}/gu, '')
    const letter = base.charAt(0)
    if (/\p{L}/u.test(letter)) return letter.toLocaleUpperCase('en')
  }

  return TAG_LETTER_OTHER
}

/** Sort key for the alphabet strip: Latin, then Greek, then Cyrillic, `#` last. */
export function compareTagLetterKeys(a: string, b: string): number {
  const rank = (letter: string) => {
    if (letter === TAG_LETTER_OTHER) return 3
    if (/\p{Script=Latin}/u.test(letter)) return 0
    if (/\p{Script=Greek}/u.test(letter)) return 1
    return 2
  }
  return rank(a) - rank(b) || a.localeCompare(b)
}
