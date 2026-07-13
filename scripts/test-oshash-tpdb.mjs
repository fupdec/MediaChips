#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import axios from 'axios'
import Database from 'better-sqlite3'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const DEFAULT_DB = '/Users/vit/Library/Application Support/MediaChips/app_storage/19f42ca631d/db.sqlite'
const SAMPLE_SIZE = Number(process.argv[2] || 100)

dotenv.config({path: path.join(ROOT, '.env')})

const TPDB_GRAPHQL_URL = 'https://theporndb.net/graphql'
const apiKey = String(process.env.TPDB_API_KEY || '').trim()

const FIND_SCENES_BY_FINGERPRINTS_QUERY = `
  query FindScenesByFingerprints($fingerprints: [[FingerprintQueryInput!]!]) {
    findScenesBySceneFingerprints(fingerprints: $fingerprints) {
      id
      title
    }
  }
`

function resolveDbPath() {
  const configPath = '/Users/vit/Library/Application Support/MediaChips/config.json'
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const active = config.databases?.find((db) => db.active)
    if (active?.id) {
      return path.join('/Users/vit/Library/Application Support/MediaChips/app_storage', active.id, 'db.sqlite')
    }
  }
  return DEFAULT_DB
}

function flattenMatches(groups) {
  const seen = new Set()
  const scenes = []
  for (const group of groups || []) {
    for (const scene of group || []) {
      if (!scene?.id || seen.has(scene.id)) continue
      seen.add(scene.id)
      scenes.push(scene)
    }
  }
  return scenes
}

async function findByOshash(oshash) {
  const response = await axios.post(
    TPDB_GRAPHQL_URL,
    {
      query: FIND_SCENES_BY_FINGERPRINTS_QUERY,
      variables: {
        fingerprints: [[{
          hash: String(oshash).trim().toLowerCase(),
          algorithm: 'oshash',
        }]],
      },
    },
    {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    },
  )

  if (response.data?.errors?.length) {
    throw new Error(response.data.errors.map((item) => item.message).join('; '))
  }

  return flattenMatches(response.data?.data?.findScenesBySceneFingerprints)
}

async function main() {
  if (!apiKey) {
    console.error('TPDB_API_KEY is missing in .env')
    process.exit(1)
  }

  const dbPath = resolveDbPath()
  const db = new Database(dbPath, {readonly: true})

  const rows = db.prepare(`
    SELECT m.id, m.path, m.basename, m.oshash
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE mt.type = 'video'
      AND m.oshash IS NOT NULL
      AND m.oshash != ''
    ORDER BY m.id
    LIMIT ?
  `).all(SAMPLE_SIZE)

  console.log(`DB: ${dbPath}`)
  console.log(`Testing ${rows.length} videos against ThePornDB oshash API...\n`)

  let matched = 0
  let multi = 0
  let errors = 0
  const examples = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    process.stdout.write(`\r${index + 1}/${rows.length}`)

    try {
      const scenes = await findByOshash(row.oshash)
      if (scenes.length === 1) {
        matched += 1
        if (examples.length < 10) {
          examples.push({
            mediaId: row.id,
            basename: row.basename,
            oshash: row.oshash,
            sceneId: scenes[0].id,
            sceneTitle: scenes[0].title,
            count: 1,
          })
        }
      } else if (scenes.length > 1) {
        multi += 1
        if (examples.length < 10) {
          examples.push({
            mediaId: row.id,
            basename: row.basename,
            oshash: row.oshash,
            sceneId: scenes.map((scene) => scene.id).join(', '),
            sceneTitle: scenes.map((scene) => scene.title).join(' | '),
            count: scenes.length,
          })
        }
      }
    } catch (error) {
      errors += 1
      if (examples.length < 10) {
        examples.push({
          mediaId: row.id,
          basename: row.basename,
          oshash: row.oshash,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  console.log('\n')
  console.log('Results:')
  console.log(`  tested: ${rows.length}`)
  console.log(`  exact match (1 scene): ${matched}`)
  console.log(`  multiple matches: ${multi}`)
  console.log(`  no match: ${rows.length - matched - multi - errors}`)
  console.log(`  errors: ${errors}`)
  console.log(`  hit rate (any match): ${(((matched + multi) / rows.length) * 100).toFixed(1)}%`)

  if (examples.length) {
    console.log('\nSample rows:')
    for (const item of examples) {
      console.log(JSON.stringify(item))
    }
  }

  db.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
