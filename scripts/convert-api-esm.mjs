import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'node:fs'

const root = process.cwd()

function convertRoute(filePath) {
  if (filePath.endsWith('types.ts')) return false

  const absolute = path.join(root, filePath)
  let content = fs.readFileSync(absolute, 'utf8')
  if (!content.includes('module.exports')) return false

  const extraImports = []

  if (content.includes("require('express')") || content.includes('require("express")')) {
    extraImports.push("import express from 'express'")
  }

  content = content.replace(
    /const \{([^}]+)\} = require\(['"]([^'"]+)['"]\)/g,
    (_, names, reqPath) => {
      extraImports.push(`import { ${names} } from '${reqPath}'`)
      return ''
    },
  )

  content = content.replace(
    /const (\w+) = require\(['"](\.\.?\/controllers\/[^'"]+)['"]\)\(db\)/g,
    (_, varName, reqPath) => {
      const factoryName = `create${varName.charAt(0).toUpperCase()}${varName.slice(1)}Controller`
      extraImports.push(`import ${factoryName} from '${reqPath}'`)
      return `const ${varName} = ${factoryName}(db)`
    },
  )

  content = content.replace(
    /const router = require\(['"]express['"]\)\.Router\(\)/g,
    'const router = express.Router()',
  )

  content = content.replace(
    /module\.exports = \(app: Express, db: ApiDb\) => \{/,
    'export default function registerRoutes(app: Express, db: ApiDb) {',
  )

  content = content.replace(/\};\s*$/, '}\n')

  const typeImportMatch = content.match(/^(import type[\s\S]*?\n\n)/)
  if (typeImportMatch) {
    content = content.replace(typeImportMatch[1], `${typeImportMatch[1]}${extraImports.join('\n')}\n\n`)
  } else {
    content = `${extraImports.join('\n')}\n\n${content}`
  }

  fs.writeFileSync(absolute, content)
  return true
}

let count = 0
for (const file of globSync('api/routes/**/*.ts')) {
  if (convertRoute(file)) count += 1
}

console.log(`Converted ${count} routes`)
