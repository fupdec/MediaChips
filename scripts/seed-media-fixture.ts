#!/usr/bin/env node
/**
 * Build a profiling SQLite DB with 10k / 50k / 100k thin media rows.
 *
 * Usage:
 *   npm run bench:media-fixture -- --count 10000
 *   npm run bench:media-fixture -- --count 50000 --db /tmp/mc-50k.sqlite
 *   npm run bench:media-fixture -- --count 100000 --with-files
 */
import path from 'path'
import {
  MEDIA_FIXTURE_COUNTS,
  seedMediaFixture,
  timeMediaListPage,
  explainMediaListPage,
  hasBareTableScan,
} from '../api/db/testUtils/seedMediaFixture'

function parseArgs(argv: string[]) {
  const args = {
    count: 10_000,
    db: '' as string,
    withFiles: false,
    filesDir: '' as string,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--count' && argv[i + 1]) {
      args.count = Number(argv[++i])
    } else if (arg === '--db' && argv[i + 1]) {
      args.db = path.resolve(argv[++i])
    } else if (arg === '--with-files') {
      args.withFiles = true
    } else if (arg === '--files-dir' && argv[i + 1]) {
      args.filesDir = path.resolve(argv[++i])
      args.withFiles = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return args
}

function printHelp() {
  console.log(`seed-media-fixture — profiling DB for scale work (A5)

Options:
  --count N          Rows to insert (typical: ${MEDIA_FIXTURE_COUNTS.join(' / ')})
  --db PATH          Output sqlite path (default: temp file)
  --with-files       Write tiny JPEGs and use real paths
  --files-dir PATH   Directory for JPEG files (implies --with-files)

Prints seed + list-page timings and an EXPLAIN plan for page-1.
`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!Number.isFinite(args.count) || args.count < 1) {
    console.error('Invalid --count')
    process.exit(1)
  }

  console.log(`Seeding ${args.count.toLocaleString()} media rows…`)
  const fixture = seedMediaFixture({
    count: args.count,
    dbPath: args.db || undefined,
    withFiles: args.withFiles,
    filesDir: args.filesDir || undefined,
  })

  const page1 = timeMediaListPage(fixture.sqlite, fixture.mediaTypeId, 1, 60)
  const deepPage = timeMediaListPage(fixture.sqlite, fixture.mediaTypeId, 450, 60)
  const plan = explainMediaListPage(fixture.sqlite, fixture.mediaTypeId, 60, 0)

  console.log(JSON.stringify({
    dbPath: fixture.dbPath,
    filesDir: fixture.filesDir,
    mediaTypeId: fixture.mediaTypeId,
    count: fixture.count,
    seedMs: fixture.seedMs,
    listPage1Ms: page1.ms,
    listDeepOffsetMs: deepPage.ms,
    deepOffset: deepPage.offset,
    bareMediaScan: hasBareTableScan(plan, 'media'),
    explainPage1: plan,
  }, null, 2))

  fixture.sqlite.close()
}

main()
