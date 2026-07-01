#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const controllersDir = path.join(root, 'api/controllers')

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

const repoRequireRe =
  /^const \{(\w+)\} = require\('(\.\.\/)+db\/repositories\/(\w+)'\)\s*$/gm

let changed = 0
for (const file of walk(controllersDir)) {
  const content = fs.readFileSync(file, 'utf8')
  const imports = []
  const cleaned = content.replace(repoRequireRe, (match, fn, _dots, repoFile, offset) => {
    const before = content.slice(0, offset)
    if (/import\s+type\s+\{[^}]*$/.test(before.split('\n').slice(-5).join('\n'))) {
      return match
    }
    const rel = path.relative(path.dirname(file), path.join(root, 'api/db/repositories', `${repoFile}.ts`))
    const importPath = rel.replace(/\\/g, '/').replace(/\.ts$/, '')
    imports.push(`import { ${fn} } from '${importPath.startsWith('.') ? importPath : './' + importPath}'`)
    return ''
  })

  if (imports.length === 0) continue

  const uniqueImports = [...new Set(imports)]
  const lines = cleaned.split('\n')
  let insertAt = 0
  while (insertAt < lines.length && /^import /.test(lines[insertAt])) insertAt++
  while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++

  const body = [...lines.slice(0, insertAt), ...uniqueImports, ...lines.slice(insertAt)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  fs.writeFileSync(file, body)
  changed++
  console.log('updated', path.relative(root, file), `(${uniqueImports.length} imports)`)
}

console.log(`Done. ${changed} files updated.`)
