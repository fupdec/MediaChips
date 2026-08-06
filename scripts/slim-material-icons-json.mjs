#!/usr/bin/env node
/**
 * Reduce DialogIcons metadata to name + tags (drops codepoint/aliases/author/…).
 * Usage: node scripts/slim-material-icons-json.mjs [input.json] [output.json]
 */
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputPath = path.resolve(root, process.argv[2] || 'src/assets/material-icons.json')
const outputPath = path.resolve(root, process.argv[3] || 'src/assets/material-icons.json')

const icons = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
if (!Array.isArray(icons)) {
  throw new Error(`Expected array in ${inputPath}`)
}

const slim = icons.map((icon) => ({
  name: String(icon.name || ''),
  tags: Array.isArray(icon.tags) ? icon.tags.map(String) : [],
})).filter((icon) => icon.name)

const before = fs.statSync(inputPath).size
const json = `${JSON.stringify(slim)}\n`
const after = Buffer.byteLength(json)
fs.writeFileSync(outputPath, json)
console.log(
  `[slim-material-icons] ${icons.length} icons → ${slim.length}; `
  + `${(before / 1024 / 1024).toFixed(2)}MB → ${(after / 1024 / 1024).toFixed(2)}MB`,
)
