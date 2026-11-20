import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { renameLegacyCountryNames, renameStoredCountries } from './countryRename'

const SEP = '\x1E'

describe('renameStoredCountries', () => {
  it('renames a single value and keeps others', () => {
    expect(renameStoredCountries('Serbia and Montenegro')).toBe('Serbia')
    expect(renameStoredCountries('Montenegro')).toBe('Montenegro')
    expect(renameStoredCountries('Serbia')).toBe('Serbia')
  })

  it('handles delimiter-separated and legacy comma-joined lists', () => {
    expect(renameStoredCountries(`France${SEP}Serbia and Montenegro${SEP}Spain`))
      .toBe(`France${SEP}Serbia${SEP}Spain`)
    expect(renameStoredCountries('France,Serbia and Montenegro,Spain')).toBe('France,Serbia,Spain')
  })
})

describe('renameLegacyCountryNames', () => {
  it('rewrites tags and country filters, leaves other filters alone, and is idempotent', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT, country TEXT);
      CREATE TABLE filterRows (id INTEGER PRIMARY KEY, param TEXT, val TEXT);
      INSERT INTO tags (name, country) VALUES ('a', 'Serbia and Montenegro'), ('b', 'France'), ('c', NULL);
      INSERT INTO filterRows (param, val) VALUES ('country', 'Serbia and Montenegro'), ('name', 'Serbia and Montenegro');
    `)

    expect(renameLegacyCountryNames(sqlite)).toBe(2)
    expect(sqlite.prepare('SELECT country FROM tags ORDER BY id').all())
      .toEqual([{country: 'Serbia'}, {country: 'France'}, {country: null}])
    expect(sqlite.prepare('SELECT val FROM filterRows ORDER BY id').all())
      .toEqual([{val: 'Serbia'}, {val: 'Serbia and Montenegro'}])
    expect(renameLegacyCountryNames(sqlite)).toBe(0)
    sqlite.close()
  })

  it('does nothing when the tables are missing', () => {
    const sqlite = new Database(':memory:')
    expect(renameLegacyCountryNames(sqlite)).toBe(0)
    sqlite.close()
  })
})
