import type { CountryEntry } from '../assets/Countries'
import Countries from '../assets/Countries'
import {
  COUNTRY_DELIMITER,
  parseCountries as parseCountriesShared,
  serializeCountries,
} from '../../shared/country'

const countryList = Countries as CountryEntry[]
const countryNames = new Set(countryList.map((country) => country.name))

function parseCountries(stored: string | null | undefined): string[] {
  return parseCountriesShared(stored, countryNames)
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
