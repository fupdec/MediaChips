import fs from 'fs'
import path from 'path'
import os from 'os'
import {createCipheriv, createDecipheriv, randomBytes, randomUUID} from 'crypto'
import {NasError} from './errors'

export type NasCredentials = {password?: string; privateKey?: string; passphrase?: string}

/** Host-local vault, deliberately outside libraries, backups and static assets. */
export function createNasCredentialStore(directory = path.join(
  process.env.MEDIA_CHIPS_DATA_DIR || process.app_folder || path.join(os.homedir(), '.mediachips'), 'nas-secrets',
)) {
  const ensureDirectory = () => fs.mkdirSync(directory, {recursive: true, mode: 0o700})
  const key = () => {
    ensureDirectory()
    const configured = process.env.MEDIA_CHIPS_NAS_SECRET_KEY
    if (configured) {
      const bytes = Buffer.from(configured, 'base64')
      if (bytes.length !== 32) throw new NasError('secret_store', 'NAS secret key must be 32 bytes encoded as base64.')
      return bytes
    }
    const filename = path.join(directory, 'master.key')
    if (!fs.existsSync(filename)) fs.writeFileSync(filename, randomBytes(32), {flag: 'wx', mode: 0o600})
    const bytes = fs.readFileSync(filename)
    if (bytes.length !== 32) throw new NasError('secret_store', 'NAS secret storage is unavailable.')
    return bytes
  }
  const filename = (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NasError('secret_store', 'Invalid credential reference.')
    return path.join(directory, `${id}.enc`)
  }
  return {
    get(id: string): NasCredentials {
      try {
        const content = fs.readFileSync(filename(id))
        const decipher = createDecipheriv('aes-256-gcm', key(), content.subarray(0, 12))
        decipher.setAuthTag(content.subarray(12, 28))
        return JSON.parse(Buffer.concat([decipher.update(content.subarray(28)), decipher.final()]).toString())
      } catch { throw new NasError('credentials_required', 'Re-enter the NAS password or SSH key on this computer.', 409) }
    },
    set(id: string, credentials: NasCredentials) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key(), iv)
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final()])
      const target = filename(id)
      const temporary = `${target}.${randomUUID()}.tmp`
      try {
        fs.writeFileSync(temporary, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {flag: 'wx', mode: 0o600})
        fs.renameSync(temporary, target)
      } finally { fs.rmSync(temporary, {force: true}) }
    },
    has(id: string): boolean { return fs.existsSync(filename(id)) },
    delete(id: string) { fs.rmSync(filename(id), {force: true}) },
  }
}
export type NasCredentialStore = ReturnType<typeof createNasCredentialStore>
