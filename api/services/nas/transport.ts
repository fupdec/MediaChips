import path from 'path'
import {createHash} from 'crypto'
import {PassThrough, type Readable} from 'stream'
import {pipeline} from 'stream/promises'
import {Client as SshClient, type SFTPWrapper} from 'ssh2'
import {Client as FtpClient} from 'basic-ftp'
import type {NasConnectionInput, NasEntry} from '../../../shared/nas'
import type {NasCredentials} from './credentials'
import {NasError, normalizeNasError} from './errors'
import {connectWebDav} from './webdav'

export type NasFile = {size: number; modifiedAt?: number; isDirectory: boolean; etag?: string}
export type NasTransport = {
  list(relativePath: string): Promise<NasEntry[]>
  stat(relativePath: string): Promise<NasFile>
  read(relativePath: string, start: number, end: number): Promise<Readable>
  mkdir?(relativePath: string): Promise<void>
  write?(relativePath: string, input: Readable, size: number): Promise<void>
  move?(from: string, to: string): Promise<void>
  remove?(relativePath: string): Promise<void>
  close(): void
}

export function normalizeNasRelativePath(value: string): string {
  if (value.length > 2048 || /[\\\x00-\x1f\x7f]/.test(value) || value.startsWith('/')
    || value.split('/').some(p => p === '..' || p === '.')) throw new NasError('invalid_path', 'Invalid remote path.', 400)
  return value.split('/').filter(Boolean).join('/')
}
function insideRoot(root: string, remote: string) {
  if (remote !== root && !remote.startsWith(root === '/' ? '/' : `${root}/`)) {
    throw new NasError('outside_root', 'This path is outside the selected NAS folder.', 403)
  }
}

function safeName(name: string): boolean {
  return name !== '.' && name !== '..' && !/[\/\\\x00-\x1f\x7f]/.test(name)
}

export async function connectNas(config: NasConnectionInput, credentials: NasCredentials, signal?: AbortSignal): Promise<NasTransport> {
  if (signal?.aborted) throw new NasError('cancelled', 'Request cancelled.', 499)
  if (config.protocol === 'webdav') return connectWebDav(config, credentials, signal)
  return config.protocol === 'sftp' ? connectSftp(config, credentials, signal) : connectFtp(config, credentials, signal)
}

async function connectSftp(config: NasConnectionInput, credentials: NasCredentials, signal?: AbortSignal): Promise<NasTransport> {
  const client = new SshClient()
  let sftp: SFTPWrapper
  let root: string
  let hostError: NasError | undefined
  const close = () => client.destroy()
  signal?.addEventListener('abort', close, {once: true})
  client.on('close', () => signal?.removeEventListener('abort', close))
  // Keep an error listener after login too: socket failures must not crash the API.
  client.on('error', () => {})
  try {
    await new Promise<void>((resolve, reject) => {
      client.once('ready', resolve)
      client.once('error', err => reject(hostError || normalizeNasError(err)))
      client.once('close', () => reject(hostError || new NasError('connection_closed', 'SFTP connection closed.', 502)))
      client.connect({
        host: config.host.replace(/^\[|\]$/g, ''), port: config.port, username: config.username,
        password: credentials.password, privateKey: credentials.privateKey, passphrase: credentials.passphrase,
        readyTimeout: 15_000, keepaliveInterval: 10_000, keepaliveCountMax: 3,
        hostVerifier(raw: Buffer) {
          const fingerprint = `SHA256:${createHash('sha256').update(raw).digest('base64').replace(/=+$/, '')}`
          if (config.hostFingerprint !== fingerprint) {
            hostError = new NasError(config.hostFingerprint ? 'host_key_changed' : 'host_key_required',
              config.hostFingerprint ? 'The NAS SSH key changed. Verify its fingerprint before reconnecting.' : 'Verify and trust the NAS SSH fingerprint.', 409, fingerprint)
            return false
          }
          return true
        },
      })
    })
    sftp = await new Promise<SFTPWrapper>((resolve, reject) => client.sftp((err, channel) => err ? reject(err) : resolve(channel)))
    sftp.on('error', () => {})
    root = await new Promise<string>((resolve, reject) => sftp.realpath(config.root, (err, result) => err ? reject(err) : resolve(result)))
    root = path.posix.normalize(root)
    const realPath = async (relative: string) => {
      const remote = path.posix.join(root, normalizeNasRelativePath(relative))
      const canonical = await new Promise<string>((resolve, reject) => sftp.realpath(remote, (err, result) => err ? reject(err) : resolve(result)))
      insideRoot(root, canonical)
      return canonical
    }
    const rootStats = await new Promise<NasFile>((resolve, reject) => sftp.stat(root, (err, st) => err ? reject(err) : resolve({size: st.size, isDirectory: st.isDirectory(), modifiedAt: st.mtime * 1000})))
    if (!rootStats.isDirectory) throw new NasError('not_directory', 'The selected NAS root is not a folder.')
    const mutablePath = async (relative: string) => {
      let remote = root
      for (const part of normalizeNasRelativePath(relative).split('/').filter(Boolean)) {
        remote = path.posix.join(remote, part)
        const stat = await new Promise<import('ssh2').Stats>((resolve, reject) => sftp.lstat(remote, (err, result) => err ? reject(err) : resolve(result)))
        if (stat.isSymbolicLink()) throw new NasError('invalid_file', 'Original writes cannot follow symbolic links.', 400)
      }
      return realPath(relative)
    }
    const destination = async (relative: string) => {
      relative = normalizeNasRelativePath(relative)
      if (!relative) throw new NasError('invalid_path', 'Select a file below the root.', 400)
      const parent = await mutablePath(path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative))
      const remote = path.posix.join(parent, path.posix.basename(relative))
      const existing = await new Promise<boolean>((resolve, reject) => sftp.lstat(remote, (err) => {
        if (!err) resolve(true)
        else if ((err as NodeJS.ErrnoException).code === 'ENOENT' || Number((err as NodeJS.ErrnoException).code) === 2) resolve(false)
        else reject(err)
      }))
      if (existing) throw new NasError('conflict', 'Destination already exists.', 409)
      return remote
    }
    return {
      async list(relative) {
        const folder = await realPath(relative)
        const files = await new Promise<Awaited<ReturnType<NasTransport['list']>>>((resolve, reject) => sftp.readdir(folder, (err, entries) => {
          if (err) { reject(err); return }
          resolve(entries.filter(e => safeName(e.filename) && !e.attrs.isSymbolicLink()
            && (e.attrs.isDirectory() || e.attrs.isFile())).map(e => ({
            name: e.filename, path: [normalizeNasRelativePath(relative), e.filename].filter(Boolean).join('/'),
            isDirectory: e.attrs.isDirectory(), size: e.attrs.size, modifiedAt: e.attrs.mtime * 1000,
          })))
        }))
        return files
      },
      async stat(relative) {
        const remote = await realPath(relative)
        return new Promise((resolve, reject) => sftp.stat(remote, (err, st) => {
          if (err) { reject(err); return }
          if (!st.isFile() && !st.isDirectory()) { reject(new NasError('invalid_file', 'Select a regular video file.')); return }
          resolve({size: st.size, modifiedAt: st.mtime * 1000, isDirectory: st.isDirectory()})
        }))
      },
      async read(relative, start, end) {
        const remote = await realPath(relative)
        const stream = sftp.createReadStream(remote, {start, end, autoClose: true})
        // autoClose can receive a late error after EOF when a cancelled SSH
        // connection closes. Active consumers still receive stream errors.
        stream.on('error', () => {})
        return stream
      },
      async mkdir(relative) {
        const remote = await destination(relative)
        await new Promise<void>((resolve, reject) => sftp.mkdir(remote, err => err ? reject(err) : resolve()))
      },
      async write(relative, input) { await pipeline(input, sftp.createWriteStream(await destination(relative), {flags: 'wx'})) },
      async move(from, to) {
        const remote = await mutablePath(from)
        const target = await destination(to)
        // Standard SFTP rename refuses an existing target; do not use posix-rename.
        await new Promise<void>((resolve, reject) => sftp.rename(remote, target, err => err ? reject(err) : resolve()))
      },
      async remove(relative) {
        const remote = await mutablePath(relative)
        await new Promise<void>((resolve, reject) => sftp.unlink(remote, err => err ? reject(err) : resolve()))
      },
      close,
    }
  } catch (err) { close(); throw hostError || err }
}

async function connectFtp(config: NasConnectionInput, credentials: NasCredentials, signal?: AbortSignal): Promise<NasTransport> {
  const client = new FtpClient(15_000)
  const close = () => { signal?.removeEventListener('abort', close); client.close() }
  signal?.addEventListener('abort', close, {once: true})
  try {
    await client.access({host: config.host.replace(/^\[|\]$/g, ''), port: config.port,
      user: config.username, password: credentials.password || '', secure: config.protocol === 'ftps',
      secureOptions: {rejectUnauthorized: true}})
    // Canonical root as reported by the server. Symlinks below it are excluded.
    await client.cd(config.root)
    const root = await client.pwd()
    const resolveEntry = async (relative: string) => {
      const parts = normalizeNasRelativePath(relative).split('/').filter(Boolean)
      let folder = root
      let entry: Awaited<ReturnType<typeof client.list>>[number] | undefined
      for (const part of parts) {
        entry = (await client.list(folder)).find(e => e.name === part)
        if (!entry || entry.isSymbolicLink) throw new NasError('not_found', 'Remote file or folder is unavailable.', 404)
        folder = path.posix.join(folder, part)
        insideRoot(root, folder)
      }
      return {remote: folder, entry}
    }
    const destination = async (relative: string) => {
      relative = normalizeNasRelativePath(relative)
      if (!relative) throw new NasError('invalid_path', 'Select a file below the root.', 400)
      const parentKey = path.posix.dirname(relative)
      const {remote: parent, entry} = await resolveEntry(parentKey === '.' ? '' : parentKey)
      if (entry && !entry.isDirectory) throw new NasError('not_directory', 'Destination parent is not a folder.', 400)
      if ((await client.list(parent)).some(file => file.name === path.posix.basename(relative))) throw new NasError('conflict', 'Destination already exists.', 409)
      return path.posix.join(parent, path.posix.basename(relative))
    }
    return {
      async list(relative) {
        const {remote, entry} = await resolveEntry(relative)
        if (entry && !entry.isDirectory) throw new NasError('not_directory', 'Remote path is not a folder.')
        return (await client.list(remote)).filter(e => safeName(e.name) && !e.isSymbolicLink && (e.isDirectory || e.isFile)).map(e => ({
          name: e.name, path: [normalizeNasRelativePath(relative), e.name].filter(Boolean).join('/'),
          size: e.size, isDirectory: e.isDirectory, modifiedAt: e.modifiedAt?.getTime(),
        }))
      },
      async stat(relative) {
        const {entry} = await resolveEntry(relative)
        return entry ? {size: entry.size, modifiedAt: entry.modifiedAt?.getTime(), isDirectory: entry.isDirectory}
          : {size: 0, isDirectory: true}
      },
      async read(relative, start, end) {
        const {remote} = await resolveEntry(relative)
        const stream = new PassThrough()
        let remaining = end - start + 1
        const destination = new PassThrough()
        destination.on('data', (chunk: Buffer) => {
          if (remaining <= 0) return
          const bytes = chunk.subarray(0, remaining)
          remaining -= bytes.length
          if (!stream.write(bytes)) destination.pause()
          if (remaining === 0) { stream.end(); close() }
        })
        stream.on('drain', () => destination.resume())
        stream.once('close', () => { destination.destroy(); close() })
        destination.on('error', err => stream.destroy(err))
        void client.downloadTo(destination, remote, start).then(() => {
          if (remaining > 0) stream.destroy(new NasError('incomplete_stream', 'The NAS file ended unexpectedly.', 502))
        }).catch(() => {
          if (remaining > 0 && !stream.destroyed) stream.destroy(new NasError('stream_failed', 'FTP stream interrupted. Reconnect and retry.', 502))
        })
        return stream
      },
      async mkdir(relative) {
        const remote = await destination(relative)
        await client.send(`MKD ${remote}`)
      },
      async write(relative, input) { await client.uploadFrom(input, await destination(relative)) },
      async move(from, to) { const {remote} = await resolveEntry(from); await client.rename(remote, await destination(to)) },
      async remove(relative) { const {remote, entry} = await resolveEntry(relative); if (!entry?.isFile) throw new NasError('invalid_file', 'Select a regular file.', 400); await client.remove(remote, false) },
      close,
    }
  } catch (err) { close(); throw err }
}
