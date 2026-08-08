#!/usr/bin/env node
/**
 * Scan chip-recipes/recipes/*.chiprecipe.json and write chip-recipes/index.json
 * from each file's embedded metadata (name, id, category, …).
 */
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', 'chip-recipes')
const recipesDir = path.join(root, 'recipes')
const indexPath = path.join(root, 'index.json')
const FORMAT = 'mediachips.chip-recipe'

function fail(message) {
  console.error(`[chip-recipes] ${message}`)
  process.exit(1)
}

if (!fs.existsSync(recipesDir)) {
  fail(`Missing recipes directory: ${recipesDir}`)
}

const files = fs.readdirSync(recipesDir)
  .filter((name) => name.endsWith('.chiprecipe.json'))
  .sort((a, b) => a.localeCompare(b))

const recipes = []

for (const file of files) {
  const fullPath = path.join(recipesDir, file)
  let data
  try {
    data = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  } catch (err) {
    fail(`Invalid JSON in ${file}: ${err instanceof Error ? err.message : err}`)
  }

  if (data?.format !== FORMAT) {
    fail(`${file}: expected format "${FORMAT}"`)
  }
  if (Number(data?.version) !== 1) {
    fail(`${file}: unsupported version ${data?.version}`)
  }
  if (!data?.id || !data?.name) {
    fail(`${file}: missing id or name`)
  }

  const expectedName = `${data.id}.chiprecipe.json`
  if (file !== expectedName) {
    console.warn(`[chip-recipes] warn: ${file} id is "${data.id}" (expected filename ${expectedName})`)
  }

  recipes.push({
    id: String(data.id),
    name: String(data.name),
    ...(data.description ? {description: String(data.description)} : {}),
    ...(data.author ? {author: String(data.author)} : {}),
    ...(data.category ? {category: String(data.category)} : {}),
    ...(typeof data.sfw === 'boolean' ? {sfw: data.sfw} : {}),
    version: Number(data.version) || 1,
    path: `recipes/${file}`,
  })
}

const index = {
  updatedAt: new Date().toISOString(),
  recipes,
}

fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(`[chip-recipes] wrote ${indexPath} (${recipes.length} recipes)`)
