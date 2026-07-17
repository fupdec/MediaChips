import type { CountryEntry } from '../assets/Countries'
import Countries from '../assets/Countries'

const countryList = Countries as CountryEntry[]

const COUNTRY_DELIMITER = '\x1E'
const countryNames = new Set(countryList.map((country) => country.name))

function parseCountries(stored: string | null | undefined): string[] {
  if (!stored) return []

  if (stored.includes(COUNTRY_DELIMITER)) {
    return stored.split(COUNTRY_DELIMITER).filter(Boolean)
  }

  const namesByLength = [...countryNames].sort((a, b) => b.length - a.length)
  const result: string[] = []
  let remaining = stored

  while (remaining.length > 0) {
    if (remaining.startsWith(',')) {
      remaining = remaining.slice(1)
      continue
    }

    let matched = false

    for (const name of namesByLength) {
      if (remaining === name || remaining.startsWith(`${name},`)) {
        result.push(name)
        remaining = remaining.slice(name.length)
        if (remaining.startsWith(',')) remaining = remaining.slice(1)
        matched = true
        break
      }
    }

    if (!matched) {
      const commaIndex = remaining.indexOf(',')
      if (commaIndex === -1) {
        result.push(remaining)
        break
      }
      result.push(remaining.slice(0, commaIndex))
      remaining = remaining.slice(commaIndex + 1)
    }
  }

  return result.filter(Boolean)
}

function serializeCountries(countries: string | string[] | null | undefined): string | null {
  if (countries == null) return null
  if (typeof countries === 'string') {
    const trimmed = countries.trim()
    return trimmed || null
  }
  if (!Array.isArray(countries) || !countries.length) return null
  return countries.map(String).filter(Boolean).join(COUNTRY_DELIMITER)
}

function getCountryCode(name: string): string {
  const country = countryList.find((item) => item.name === name)
  return country ? country.code : ''
}

export {
  COUNTRY_DELIMITER,
  parseCountries,
  serializeCountries,
  getCountryCode,
}

