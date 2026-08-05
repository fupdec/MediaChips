import { Countries } from '../assets/Countries.js'
import {
  COUNTRY_DELIMITER,
  parseCountries as parseCountriesShared,
  serializeCountries as serializeCountriesShared,
} from '@shared/country'

const countryNames = new Set(Countries.map((country) => country.name))

export {COUNTRY_DELIMITER}

export function parseCountries(stored: string | null | undefined): string[] {
  return parseCountriesShared(stored, countryNames)
}

export function serializeCountries(countries: string[] | null | undefined): string | null {
  return serializeCountriesShared(countries)
}

export function getCountryCode(name: string): string {
  const country = Countries.find((item) => item.name === name)
  return country ? country.code : ''
}
