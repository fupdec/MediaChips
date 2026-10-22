// @vitest-environment node
import net, {type Socket} from 'net'
import {createHash, generateKeyPairSync} from 'crypto'
import {Server as SshServer, utils} from 'ssh2'
import {afterEach, describe, expect, it} from 'vitest'
import {connectNas} from './transport'
import {Readable} from 'stream'
import type {NasConnectionInput} from '../../../shared/nas'

const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz')
const privateKey = generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey.export({type: 'pkcs1', format: 'pem'}).toString()
const publicKey = utils.parseKey(privateKey)
if (publicKey instanceof Error || Array.isArray(publicKey)) throw new Error('Invalid test key')
const fingerprint = `SHA256:${createHash('sha256').update(publicKey.getPublicSSH()).digest('base64').replace(/=+$/, '')}`
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function collect(stream: NodeJS.ReadableStream) {
  const result: Buffer[] = []
  for await (const chunk of stream) result.push(Buffer.from(chunk))
  return Buffer.concat(result)
}
async function sftpServer() {
  const files = new Map<string, Buffer | null>([['/videos', null], ['/videos/video 1.mp4', bytes], ['/videos/Кино', null]])
  const clients = new Set<{end(): void}>()
  const reads: number[] = []
  let authentications = 0
  const attrs = (folder = false) => ({size: folder ? 0 : bytes.length, uid: 0, gid: 0, mode: folder ? 0o040755 : 0o100644, atime: 1, mtime: 1})
  const server = new SshServer({hostKeys: [privateKey]}, client => {
    clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client))
    client.on('authentication', ctx => { authentications++; ctx.method === 'password' && ctx.username === 'reader' && ctx.password === 'secret' ? ctx.accept() : ctx.reject() })
    client.on('ready', () => client.on('session', accept => accept().on('sftp', acceptSftp => {
      const channel = acceptSftp()
      let listed = false
      channel.on('REALPATH', (id, input) => {
        const remote = input.includes('escape') ? '/outside/file.mp4' : input
        channel.name(id, [{filename: remote, longname: remote, attrs: attrs(remote === '/videos')}])
      })
      channel.on('STAT', (id, remote) => files.has(remote) ? channel.attrs(id, {...attrs(files.get(remote) === null), size: files.get(remote)?.length || 0}) : channel.status(id, utils.sftp.STATUS_CODE.NO_SUCH_FILE))
      channel.on('LSTAT', (id, remote) => remote.endsWith('/escape') ? channel.attrs(id, {...attrs(), mode: 0o120777}) : files.has(remote) ? channel.attrs(id, {...attrs(files.get(remote) === null), size: files.get(remote)?.length || 0}) : channel.status(id, utils.sftp.STATUS_CODE.NO_SUCH_FILE))
      channel.on('FSTAT', (id, handle) => channel.attrs(id, {...attrs(), size: files.get(handle.toString())?.length || 0}))
      channel.on('FSETSTAT', (id, handle, attributes) => {
        const remote = handle.toString(), old = files.get(remote) || Buffer.alloc(0)
        files.set(remote, old.subarray(0, attributes.size)); channel.status(id, utils.sftp.STATUS_CODE.OK)
      })
      channel.on('OPENDIR', id => { listed = false; channel.handle(id, Buffer.from('dir')) })
      channel.on('READDIR', id => {
        if (listed) { channel.status(id, utils.sftp.STATUS_CODE.EOF); return }
        listed = true
        channel.name(id, [
          {filename: 'video 1.mp4', longname: '', attrs: attrs()},
          {filename: 'Кино', longname: '', attrs: attrs(true)},
          {filename: 'escape', longname: '', attrs: {...attrs(), mode: 0o120777}},
        ])
      })
      channel.on('OPEN', (id, remote, flags) => {
        if ((flags & 32) && files.has(remote)) { channel.status(id, utils.sftp.STATUS_CODE.FAILURE); return }
        if (flags & 8) files.set(remote, Buffer.alloc(0))
        channel.handle(id, Buffer.from(remote))
      })
      channel.on('WRITE', (id, handle, offset, chunk) => {
        const remote = handle.toString(), old = files.get(remote) || Buffer.alloc(0)
        const next = Buffer.alloc(Math.max(old.length, offset + chunk.length)); old.copy(next); chunk.copy(next, offset); files.set(remote, next)
        channel.status(id, utils.sftp.STATUS_CODE.OK)
      })
      channel.on('READ', (id, handle, offset, length) => {
        reads.push(offset)
        const payload = files.get(handle.toString()) || bytes
        if (offset >= payload.length) channel.status(id, utils.sftp.STATUS_CODE.EOF)
        else channel.data(id, payload.subarray(offset, offset + length))
      })
      channel.on('MKDIR', (id, remote) => { if (files.has(remote)) channel.status(id, utils.sftp.STATUS_CODE.FAILURE); else { files.set(remote, null); channel.status(id, utils.sftp.STATUS_CODE.OK) } })
      channel.on('RENAME', (id, from, to) => { if (!files.has(from) || files.has(to)) channel.status(id, utils.sftp.STATUS_CODE.FAILURE); else { files.set(to, files.get(from)!); files.delete(from); channel.status(id, utils.sftp.STATUS_CODE.OK) } })
      channel.on('REMOVE', (id, remote) => { if (files.delete(remote)) channel.status(id, utils.sftp.STATUS_CODE.OK); else channel.status(id, utils.sftp.STATUS_CODE.NO_SUCH_FILE) })
      channel.on('CLOSE', id => channel.status(id, utils.sftp.STATUS_CODE.OK))
    })))
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  cleanups.push(async () => { clients.forEach(client => client.end()); await new Promise<void>(resolve => server.close(() => resolve())) })
  return {port: (server.address() as net.AddressInfo).port, reads, authentications: () => authentications}
}

async function ftpServer() {
  const files = new Map<string, Buffer | null>([['/videos/video 1.mp4', bytes], ['/videos/Кино', null]])
  const sockets = new Set<Socket>()
  const dataServers = new Set<net.Server>()
  const restOffsets: number[] = []
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket))
    socket.write('220 Test NAS\r\n')
    let input = ''; let offset = 0; let renameFrom = ''
    let dataConnection: Promise<Socket>
    const send = (message: string) => socket.write(`${message}\r\n`)
    socket.on('data', chunk => {
      input += chunk.toString()
      while (input.includes('\r\n')) {
        const index = input.indexOf('\r\n'); const line = input.slice(0, index); input = input.slice(index + 2)
        const split = line.indexOf(' '); const command = (split < 0 ? line : line.slice(0, split)).toUpperCase(); const argument = split < 0 ? '' : line.slice(split + 1)
        if (command === 'USER') send('331 Password required')
        else if (command === 'PASS') send(argument === 'secret' ? '230 Logged in' : '530 Incorrect password')
        else if (command === 'FEAT') send('211-Features\r\n MLST type*;size*;modify*;\r\n REST STREAM\r\n211 End')
        else if (command === 'PWD') send('257 "/videos"')
        else if (command === 'CWD') send('250 Directory changed')
        else if (['TYPE', 'STRU', 'OPTS'].includes(command)) send('200 OK')
        else if (command === 'EPSV') {
          const ds = net.createServer(); dataServers.add(ds)
          dataConnection = new Promise(resolve => ds.once('connection', data => {
            sockets.add(data); data.on('error', () => {}); data.on('close', () => { sockets.delete(data); ds.close(); dataServers.delete(ds) }); resolve(data)
          }))
          ds.listen(0, '127.0.0.1', () => send(`229 Entering Extended Passive Mode (|||${(ds.address() as net.AddressInfo).port}|)`))
        } else if (command === 'REST') { offset = Number(argument); restOffsets.push(offset); send('350 Restart accepted') }
        else if (command === 'MLSD' || command === 'LIST' || command === 'RETR' || command === 'STOR') {
          send('150 Opening data connection')
          void dataConnection.then(data => {
            if (command === 'STOR') {
              const chunks: Buffer[] = []
              data.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))); data.on('end', () => { files.set(argument, Buffer.concat(chunks)); data.end(); send('226 Transfer complete') })
              return
            }
            const content = command === 'RETR' ? (files.get(argument) || bytes).subarray(offset)
              : Buffer.from([...files.entries()].filter(([key]) => key.slice(0, key.lastIndexOf('/')) === argument).map(([key, payload]) => payload === null
                ? `type=dir;modify=20260101000000; ${key.split('/').pop()}\r\n` : `type=file;size=${payload.length};modify=20260101000000; ${key.split('/').pop()}\r\n`).join('') + (argument === '/videos' ? 'type=OS.unix=slink:/outside;modify=20260101000000; escape\r\n' : ''))
            data.end(content, () => { if (!socket.destroyed) send('226 Transfer complete') })
          })
        } else if (command === 'MKD') { files.set(argument, null); send('257 Directory created') }
        else if (command === 'RNFR') { renameFrom = argument; send(files.has(argument) ? '350 Ready' : '550 Not found') }
        else if (command === 'RNTO') { if (files.has(argument)) send('550 Destination exists'); else { files.set(argument, files.get(renameFrom)!); files.delete(renameFrom); send('250 Renamed') } }
        else if (command === 'DELE') { send(files.delete(argument) ? '250 Deleted' : '550 Not found') }
        else if (command === 'QUIT') { send('221 Bye'); socket.end() }
        else send('502 Unsupported')
      }
    })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  cleanups.push(async () => {
    sockets.forEach(socket => socket.destroy()); dataServers.forEach(ds => ds.close())
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  return {port: (server.address() as net.AddressInfo).port, restOffsets}
}
const config = (port: number, protocol: NasConnectionInput['protocol']): NasConnectionInput => ({name: 'NAS', protocol, host: '127.0.0.1', port, username: 'reader', root: '/videos', hostFingerprint: fingerprint})

describe('SFTP and FTP socket transports', () => {
  it('resumes an SFTP staging file at the verified offset and truncates an unconfirmed tail', async () => {
    const server = await sftpServer()
    const transport = await connectNas(config(server.port, 'sftp'), {password: 'secret'})
    try {
      await transport.write!('staged.part', Readable.from(['upload-extra']), 12)
      await transport.resumeWrite!('staged.part', Readable.from(['loaded']), 8, 2)
      expect((await transport.stat('staged.part')).size).toBe(8)
      expect((await collect(await transport.read('staged.part', 0, 7))).toString()).toBe('uploaded')
      await expect(transport.resumeWrite!('staged.part', Readable.from(['x']), 10, 9)).rejects.toMatchObject({code: 'size_mismatch'})
      await expect(transport.resumeWrite!('escape', Readable.from(['x']), 1, 0)).rejects.toMatchObject({code: 'invalid_file'})
    } finally { transport.close() }
  })
  it.each(['sftp', 'ftp'] as const)('%s writes folders and staged files, refuses conflicts, then moves and removes files', async protocol => {
    const server = protocol === 'sftp' ? await sftpServer() : await ftpServer()
    const transport = await connectNas(config(server.port, protocol), {password: 'secret'})
    try {
      await transport.mkdir!('folder')
      expect((await transport.stat('folder')).isDirectory).toBe(true)
      await expect(transport.mkdir!('folder')).rejects.toMatchObject({code: 'conflict'})
      await transport.write!('folder/upload.mp4', Readable.from(['up', 'load']), 6)
      expect((await transport.stat('folder/upload.mp4')).size).toBe(6)
      await expect(transport.write!('folder/upload.mp4', Readable.from(['other']), 5)).rejects.toMatchObject({code: 'conflict'})
      await transport.move!('folder/upload.mp4', 'folder/renamed.mp4')
      expect((await transport.stat('folder/renamed.mp4')).size).toBe(6)
      await transport.remove!('folder/renamed.mp4')
      await expect(transport.stat('folder/renamed.mp4')).rejects.toBeTruthy()
      await expect(transport.remove!('../private')).rejects.toMatchObject({code: 'invalid_path'})
      if (protocol === 'sftp') await expect(transport.remove!('escape')).rejects.toMatchObject({code: 'invalid_file'})
    } finally { transport.close() }
  })
  it('requires explicit SSH key trust before sending a password and rejects a changed host key', async () => {
    const server = await sftpServer()
    await expect(connectNas({...config(server.port, 'sftp'), hostFingerprint: undefined}, {password: 'secret'})).rejects.toMatchObject({code: 'host_key_required', fingerprint})
    expect(server.authentications()).toBe(0)
    await expect(connectNas({...config(server.port, 'sftp'), hostFingerprint: `SHA256:${'A'.repeat(43)}`}, {password: 'secret'})).rejects.toMatchObject({code: 'host_key_changed'})
    expect(server.authentications()).toBe(0)
  })
  it('logs in over SFTP, lists folders and Unicode names, rejects a symlink escape and reads only the range', async () => {
    const server = await sftpServer()
    const transport = await connectNas(config(server.port, 'sftp'), {password: 'secret'})
    try {
      const entries = await transport.list('')
      expect(entries.map(e => e.name)).toEqual(['video 1.mp4', 'Кино'])
      expect((await transport.stat('video 1.mp4')).size).toBe(bytes.length)
      await expect(transport.stat('escape')).rejects.toMatchObject({code: 'outside_root'})
      expect(await collect(await transport.read('video 1.mp4', 4, 9))).toEqual(bytes.subarray(4, 10))
      expect(server.reads[0]).toBe(4)
    } finally { transport.close() }
  })
  it('reports a failed SFTP login without exposing the password', async () => {
    const server = await sftpServer()
    await expect(connectNas(config(server.port, 'sftp'), {password: 'wrong-secret'})).rejects.toMatchObject({code: 'auth_required'})
  })
  it('lists FTP folders, filters symlinks and implements start and end bounds using REST', async () => {
    const server = await ftpServer()
    const transport = await connectNas(config(server.port, 'ftp'), {password: 'secret'})
    try {
      expect((await transport.list('')).map(e => e.name)).toEqual(['video 1.mp4', 'Кино'])
      expect((await transport.stat('video 1.mp4')).size).toBe(bytes.length)
      await expect(transport.stat('escape')).rejects.toMatchObject({code: 'not_found'})
      expect(await collect(await transport.read('video 1.mp4', 5, 10))).toEqual(bytes.subarray(5, 11))
      expect(server.restOffsets).toContain(5)
    } finally { transport.close() }
  })
  it('never silently falls back from FTPS to unencrypted FTP', async () => {
    const server = await ftpServer()
    await expect(connectNas(config(server.port, 'ftps'), {password: 'secret'})).rejects.toThrow()
  })
})
