// @vitest-environment node
import {it, expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createTokenStore} from './tokenStore'
it('migrates private legacy JSON to atomic encrypted storage and clears it on logout', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-token-migration-'))
  try {
    const file = path.join(directory, 'tokens.json')
    fs.writeFileSync(file, JSON.stringify({accessToken: 'test-access', refreshToken: 'test-refresh'}))
    const store = createTokenStore(file)
    expect(store.get()?.refreshToken).toBe('test-refresh')
    expect(fs.existsSync(file)).toBe(false)
    const encrypted = fs.readdirSync(`${file}.vault`).find(name => name.endsWith('.enc'))!
    expect(fs.readFileSync(path.join(`${file}.vault`, encrypted)).includes(Buffer.from('test-refresh'))).toBe(false)
    expect(createTokenStore(file).get()).toEqual(store.get())
    store.clear()
    expect(createTokenStore(file).get()).toBeNull()
  } finally { fs.rmSync(directory, {recursive: true, force: true}) }
})
