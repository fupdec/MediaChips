#!/usr/bin/env node
import { writeFileSync } from 'fs'
import { extractChangelogSection } from './changelog-utils.mjs'

const version = process.argv[2]
const outputPath = process.argv[3]

if (!version) {
  console.error('Usage: node scripts/extract-changelog.mjs <version> [output-file]')
  process.exit(1)
}

const section = extractChangelogSection(version)

if (!section) {
  console.error(`No changelog section found for version ${version}`)
  process.exit(1)
}

if (outputPath) {
  writeFileSync(outputPath, `${section}\n`, 'utf8')
  console.log(`Wrote changelog for v${version.replace(/^v/, '')} to ${outputPath}`)
} else {
  process.stdout.write(`${section}\n`)
}
